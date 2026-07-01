'use client';

import { useState, useEffect } from 'react';
import { clearStore, getStore } from '@/lib/storage';
import type { AppStore } from '@/lib/types';
import * as db from '@/lib/db';
import { supabaseEnabled, getSupabase } from '@/lib/supabase/client';
import {
  signInWithEmail,
  signUpWithEmail,
  signOut,
  subscribeAuthState,
  isAuthAvailable,
  getCurrentUserId
} from '@/lib/supabase/auth';
import type { Session } from '@supabase/supabase-js';
import Card from '@/components/Card';
import { buildMigrationSummary } from '@/lib/migration-summary';
import { getMergedOpportunityWorkflowMap } from '@/lib/opportunity-workflow';
import { getMergedContentBriefWorkflowMap } from '@/lib/content-brief-workflow';
import { getActionPlanMetadataMap } from '@/lib/action-plan-metadata';
import { getExportHistory } from '@/lib/export-history';
import { buildExportManifestAndFiles, createZip } from '@/lib/all-data-export';

interface BackupFile {
  appName: string;
  schemaVersion: string;
  exportedAt: string;
  data: Record<string, unknown>;
}

const BACKUP_STORAGE_KEYS = [
  'serpvault_data',
  'serpvault_opportunity_workflow',
  'serpvault_action_plan_metadata',
  'serpvault_content_brief_workflow',
  'serpvault_export_history',
  'serpvault_theme',
  'serpvault_selected_project_id'
] as const;

export default function SettingsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [counts, setCounts] = useState({
    uploads: 0,
    projects: 0,
    competitors: 0,
    keywords: 0,
    keywordGaps: 0,
    competitorPages: 0,
    backlinks: 0,
    referringDomains: 0,
    anchorTexts: 0,
    dedupeReports: 0,
  });

  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmClearWorkflow, setConfirmClearWorkflow] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [testing, setTesting] = useState(false);
  const [migrating, setMigrating] = useState(false);

  // Preflight summary states
  const [localStore, setLocalStore] = useState<AppStore | null>(null);
  const [confirmMigration, setConfirmMigration] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [migrationMessage, setMigrationMessage] = useState<string | null>(null);

  // Backup & Restore states
  const [restoreData, setRestoreData] = useState<BackupFile | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);

  const loadCounts = () => {
    Promise.all([
      db.getUploads(),
      db.getProjects(),
      db.getCompetitors(),
      db.getKeywords(),
      db.getKeywordGaps(),
      db.getCompetitorPages(),
      db.getBacklinks(),
      db.getReferringDomains(),
      db.getAnchorTexts(),
      db.getDedupeReports(),
    ]).then(([ups, projs, comps, kws, gaps, pages, bls, refs, anchors, dedupes]) => {
      setCounts({
        uploads: ups?.length || 0,
        projects: projs?.length || 0,
        competitors: comps?.length || 0,
        keywords: kws?.length || 0,
        keywordGaps: gaps?.length || 0,
        competitorPages: pages?.length || 0,
        backlinks: bls?.length || 0,
        referringDomains: refs?.length || 0,
        anchorTexts: anchors?.length || 0,
        dedupeReports: dedupes?.length || 0,
      });
    }).catch(err => {
      console.error('Failed to load settings counts:', err);
    });
  };

  useEffect(() => {
    loadCounts();
  }, []);

  useEffect(() => {
    setLocalStore(getStore());
  }, [counts]);

  useEffect(() => {
    if (!isAuthAvailable) return;
    const unsubscribe = subscribeAuthState((newSession) => {
      setSession(newSession);
      loadCounts();
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const storageSizeInBytes = (() => {
    try {
      let totalBytes = 0;
      for (const key of BACKUP_STORAGE_KEYS) {
        const raw = localStorage.getItem(key) ?? '';
        totalBytes += new Blob([raw]).size;
      }
      return totalBytes;
    } catch {
      return undefined;
    }
  })();

  const storageSize = storageSizeInBytes !== undefined
    ? (storageSizeInBytes > 1024 * 1024
        ? `${(storageSizeInBytes / 1024 / 1024).toFixed(2)} MB`
        : `${(storageSizeInBytes / 1024).toFixed(1)} KB`)
    : 'Unknown';

  const summary = localStore
    ? buildMigrationSummary(localStore, supabaseEnabled, !!session, storageSizeInBytes)
    : null;

  function flash(text: string, type: 'success' | 'error' | 'info' = 'success') {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  }

  function handleClear() {
    clearStore();
    setCounts({
      uploads: 0,
      projects: 0,
      competitors: 0,
      keywords: 0,
      keywordGaps: 0,
      competitorPages: 0,
      backlinks: 0,
      referringDomains: 0,
      anchorTexts: 0,
      dedupeReports: 0,
    });
    setConfirmClear(false);
    flash('All local data cleared.');
  }

  function handleClearWorkflow() {
    const keys = [
      'serpvault_opportunity_workflow',
      'serpvault_action_plan_metadata',
      'serpvault_content_brief_workflow',
      'serpvault_export_history'
    ];
    for (const key of keys) {
      localStorage.removeItem(key);
    }
    setConfirmClearWorkflow(false);
    flash('Workflow and editorial local state cleared.', 'success');
    loadCounts();
  }

  async function handleTestConnection() {
    setTesting(true);
    try {
      const result = await db.testConnection();
      if (result.ok) {
        flash(`Connected [OK] — ${result.latencyMs}ms`, 'success');
      } else {
        flash(`Connection failed: ${result.error}`, 'error');
      }
    } catch (e) {
      flash(`Error: ${String(e)}`, 'error');
    }
    setTesting(false);
  }

  async function handleMigrateWithGuard() {
    if (!summary) return;
    setMigrationStatus('running');
    setMigrationMessage(null);
    setMigrating(true);

    try {
      if (summary.totalRows === 0) {
        // Zero-row migration gracefully handled
        setMigrationStatus('success');
        setMigrationMessage('No local data to migrate. Zero-row migration completed successfully [OK]');
        flash('Zero-row migration completed successfully.', 'success');
        setConfirmMigration(false);
      } else {
        const result = await db.migrateLocalToSupabase();
        setMigrationStatus('success');
        let msg = `Successfully migrated ${result.rows.toLocaleString()} rows across ${result.tables.length} tables to Supabase [OK]`;
        if (result.projectSummaries && result.projectSummaries.length > 0) {
          msg += `\n\nMerged existing projects:\n${result.projectSummaries.map(s => `- ${s}`).join('\n')}`;
        }
        setMigrationMessage(msg);
        flash(`Migrated ${result.rows.toLocaleString()} rows to Supabase: ${result.tables.join(', ')}`, 'success');
        setConfirmMigration(false);
        loadCounts();
      }
    } catch (e) {
      setMigrationStatus('error');
      setMigrationMessage(String(e));
      flash(`Migration failed: ${String(e)}`, 'error');
    } finally {
      setMigrating(false);
    }
  }

  async function handleSignIn() {
    if (!email || !password) {
      setAuthError('Please enter both email and password.');
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    try {
      await signInWithEmail(email, password);
      flash('Signed in successfully.', 'success');
      setEmail('');
      setPassword('');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignUp() {
    if (!email || !password) {
      setAuthError('Please enter both email and password.');
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    try {
      await signUpWithEmail(email, password);
      flash('Signed up successfully. Check your email for confirmation.', 'success');
      setEmail('');
      setPassword('');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignOut() {
    setAuthLoading(true);
    setAuthError(null);
    try {
      await signOut();
      flash('Signed out successfully.', 'success');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err));
    } finally {
      setAuthLoading(false);
    }
  }

  // Backup & Restore logic
  const handleExportBackup = () => {
    const backupData: Record<string, unknown> = {};
    for (const key of BACKUP_STORAGE_KEYS) {
      const val = localStorage.getItem(key);
      if (val !== null) {
        try {
          backupData[key] = JSON.parse(val);
        } catch {
          backupData[key] = val;
        }
      }
    }

    const backupFile = {
      appName: 'SERPVault',
      schemaVersion: '1.0',
      exportedAt: new Date().toISOString(),
      data: backupData
    };

    const blob = new Blob([JSON.stringify(backupFile, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `serpvault-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    flash('Backup exported successfully.', 'success');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);

        // Validate shape
        if (!parsed || typeof parsed !== 'object') {
          flash('Invalid backup file: Must be a JSON object.', 'error');
          return;
        }
        if (parsed.appName !== 'SERPVault') {
          flash('Invalid backup file: App name mismatch (expected "SERPVault").', 'error');
          return;
        }
        if (!parsed.data || typeof parsed.data !== 'object') {
          flash('Invalid backup file: Missing "data" key.', 'error');
          return;
        }

        // Check if data has at least one serpvault_* key
        const keys = Object.keys(parsed.data);
        const hasExpectedKey = keys.some(k => (BACKUP_STORAGE_KEYS as readonly string[]).includes(k));
        if (!hasExpectedKey) {
          flash('Invalid backup file: No recognizable SERPVault data keys found.', 'error');
          return;
        }

        // Set state and show confirmation modal
        setRestoreData(parsed);
        setShowRestoreConfirm(true);
      } catch (err) {
        flash(`Failed to parse backup file: ${err instanceof Error ? err.message : 'Invalid JSON'}`, 'error');
      } finally {
        e.target.value = '';
      }
    };

    reader.readAsText(file);
  };

  const executeRestore = () => {
    if (!restoreData || !restoreData.data) return;

    try {
      for (const [key, val] of Object.entries(restoreData.data)) {
        if (!(BACKUP_STORAGE_KEYS as readonly string[]).includes(key)) {
          continue;
        }
        if (val === null || val === undefined) {
          localStorage.removeItem(key);
        } else if (typeof val === 'object') {
          localStorage.setItem(key, JSON.stringify(val));
        } else {
          localStorage.setItem(key, String(val));
        }
      }

      flash('Backup restored successfully!', 'success');
      setShowRestoreConfirm(false);
      setRestoreData(null);
      loadCounts();
    } catch (err) {
      flash(`Restore failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  const handleDownloadAllData = async () => {
    setExportingAll(true);
    try {
      const [
        projects,
        competitors,
        uploads,
        keywords,
        keywordGaps,
        competitorPages,
        backlinks,
        referringDomains,
        anchorTexts,
        dedupeReports,
        opportunityWorkflowMap,
        contentBriefWorkflowMap,
      ] = await Promise.all([
        db.getProjects(),
        db.getCompetitors(),
        db.getUploads(),
        db.getKeywords(),
        db.getKeywordGaps(),
        db.getCompetitorPages(),
        db.getBacklinks(),
        db.getReferringDomains(),
        db.getAnchorTexts(),
        db.getDedupeReports(),
        getMergedOpportunityWorkflowMap(),
        getMergedContentBriefWorkflowMap(),
      ]);

      const actionPlanMetadataMap = getActionPlanMetadataMap();
      const exportHistory = getExportHistory();

      const sb = getSupabase();
      const userId = sb ? await getCurrentUserId() : null;
      const sourceMode = (sb && userId) ? 'supabase' : 'local';

      const { files } = buildExportManifestAndFiles({
        projects,
        competitors,
        uploads,
        keywords,
        keywordGaps,
        competitorPages,
        backlinks,
        referringDomains,
        anchorTexts,
        dedupeReports,
        opportunityWorkflowMap,
        contentBriefWorkflowMap,
        actionPlanMetadataMap,
        exportHistory,
        sourceMode,
      });

      const zipData = createZip(files);
      const blob = new Blob([zipData as BlobPart], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `serpvault-all-data-export-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      flash('All data exported to ZIP successfully.', 'success');
    } catch (err) {
      console.error('All data export failed:', err);
      flash(`Export failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setExportingAll(false);
    }
  };

  const msgColor = message?.type === 'error' ? '#ef444420' : message?.type === 'info' ? 'rgba(99,102,241,0.1)' : '#10b98120';
  const msgBorder = message?.type === 'error' ? '#ef444450' : message?.type === 'info' ? 'rgba(99,102,241,0.3)' : '#10b98150';
  const msgText = message?.type === 'error' ? 'var(--danger)' : message?.type === 'info' ? 'var(--accent)' : 'var(--success)';

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto', paddingBottom: '3rem' }}>
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.3rem' }}>Settings</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>Manage your SEO data storage, backups, and active workflows.</p>
      </div>

      {message && (
        <div style={{ background: msgColor, border: `1px solid ${msgBorder}`, borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1.25rem', fontSize: '0.875rem', color: msgText }}>
          {message.text}
        </div>
      )}

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <Card title="Supabase Status" value={supabaseEnabled ? 'Connected' : 'Not configured'} accent={supabaseEnabled} />
        <Card title="Local Cache" value={storageSize} />
        <Card title="Projects" value={counts.projects} />
        <Card title="Keywords" value={counts.keywords} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

        {/* Data Library Statistics */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>Data Library Statistics</h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '1.25rem' }}>
            Detailed breakdown of records currently loaded in this session.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.75rem' }}>
            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '0.75rem 1rem' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Uploads</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '0.2rem' }}>{counts.uploads}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '0.75rem 1rem' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Projects</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '0.2rem' }}>{counts.projects}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '0.75rem 1rem' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Competitors</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '0.2rem' }}>{counts.competitors}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '0.75rem 1rem' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Keywords</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '0.2rem' }}>{counts.keywords}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '0.75rem 1rem' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Keyword Gaps</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '0.2rem' }}>{counts.keywordGaps}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '0.75rem 1rem' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Competitor Pages</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '0.2rem' }}>{counts.competitorPages}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '0.75rem 1rem' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Backlinks</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '0.2rem' }}>{counts.backlinks}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '0.75rem 1rem' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Referring Domains</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '0.2rem' }}>{counts.referringDomains}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '0.75rem 1rem' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Anchor Texts</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '0.2rem' }}>{counts.anchorTexts}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '0.75rem 1rem' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Dedupe Reports</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '0.2rem' }}>{counts.dedupeReports}</div>
            </div>
          </div>
        </div>

        {/* Supabase Status & Auth */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>Supabase Connection</h2>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: '999px', background: supabaseEnabled ? '#10b98122' : '#ef444422', color: supabaseEnabled ? 'var(--success)' : 'var(--danger)' }}>
              {supabaseEnabled ? '● Connected' : '○ Not configured'}
            </span>
          </div>

          {supabaseEnabled && (
            <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '1rem' }}>
              Project: <code style={{ background: 'rgba(99,102,241,0.1)', padding: '0.1rem 0.3rem', borderRadius: '3px', fontSize: '0.78rem' }}>
                {process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('https://', '').split('.')[0]}
              </code>
            </div>
          )}

          {supabaseEnabled && (
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing}
                style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '7px', padding: '0.5rem 1.25rem', cursor: testing ? 'wait' : 'pointer', fontWeight: 600, fontSize: '0.85rem', opacity: testing ? 0.6 : 1 }}
              >
                {testing ? 'Testing…' : 'Test Connection'}
              </button>
            </div>
          )}

          {/* Cloud Migration Preflight Summary */}
          {summary && (
            <div style={{
              background: 'rgba(255,255,255,0.01)',
              border: '1px solid var(--card-border)',
              borderRadius: '8px',
              padding: '1rem',
              marginTop: '1rem',
              marginBottom: '1rem'
            }}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                Cloud Migration Preflight Summary
              </h3>

              {/* Local CSV Upload Notice */}
              <div style={{
                background: 'rgba(99, 102, 241, 0.05)',
                borderLeft: '3px solid var(--accent)',
                padding: '0.6rem 0.8rem',
                borderRadius: '4px',
                fontSize: '0.78rem',
                color: 'var(--muted)',
                marginBottom: '1rem',
                lineHeight: '1.4'
              }}>
                <strong>Notice:</strong> Your local CSV uploads can remain local. You do not need a cloud project to analyze your data; it will continue to work perfectly in your browser cache.
              </div>

              {/* Statistics */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--card-border)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>Total Local Rows</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: '0.1rem' }}>{summary.totalRows.toLocaleString()}</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--card-border)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>Estimated Local Size</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: '0.1rem' }}>{summary.estimatedStorage}</div>
                </div>
              </div>

              {/* Table breakdown */}
              {summary.totalRows > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.4rem', fontWeight: 500 }}>Per-Table Breakdown:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    {Object.entries(summary.perTableCounts).map(([table, count]) => {
                      if (count === 0) return null;
                      return (
                        <span key={table} style={{
                          fontSize: '0.72rem',
                          padding: '0.15rem 0.4rem',
                          borderRadius: '4px',
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid var(--card-border)',
                          color: 'var(--foreground)',
                        }}>
                          {table}: <strong>{count}</strong>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Checklist Status */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '1rem', fontSize: '0.78rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ color: summary.supabaseAvailable ? 'var(--success)' : 'var(--danger)' }}>
                    {summary.supabaseAvailable ? '[OK]' : '[X]'}
                  </span>
                  <span style={{ color: 'var(--muted)' }}>Supabase configured:</span>
                  <span style={{ fontWeight: 500 }}>{summary.supabaseAvailable ? 'Available' : 'Missing env variables'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ color: summary.userSignedIn ? 'var(--success)' : 'var(--danger)' }}>
                    {summary.userSignedIn ? '[OK]' : '[X]'}
                  </span>
                  <span style={{ color: 'var(--muted)' }}>User signed in:</span>
                  <span style={{ fontWeight: 500 }}>{summary.userSignedIn ? 'Signed In' : 'Not Signed In'}</span>
                </div>
              </div>

              {/* Warnings */}
              {summary.warnings.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem' }}>
                  {summary.warnings.map((warn, i) => (
                    <div key={i} style={{
                      fontSize: '0.75rem',
                      color: 'var(--warning)',
                      background: 'rgba(245, 158, 11, 0.05)',
                      border: '1px solid rgba(245, 158, 11, 0.2)',
                      padding: '0.4rem 0.6rem',
                      borderRadius: '6px',
                      lineHeight: '1.4'
                    }}>
                      [!] {warn}
                    </div>
                  ))}
                </div>
              )}

              {/* Migration Controls */}
              {summary.canMigrate && (
                <div style={{ borderTop: '1px solid var(--card-border)', paddingTop: '1rem', marginTop: '1rem' }}>
                  {migrationStatus === 'success' && (
                    <div style={{
                      background: 'rgba(16, 185, 129, 0.08)',
                      border: '1px solid var(--success)',
                      color: 'var(--success)',
                      borderRadius: '6px',
                      padding: '0.6rem 0.8rem',
                      fontSize: '0.8rem',
                      marginBottom: '1rem',
                      lineHeight: '1.4',
                      whiteSpace: 'pre-line'
                    }}>
                      {migrationMessage}
                    </div>
                  )}
                  {migrationStatus === 'error' && (
                    <div style={{
                      background: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid var(--danger)',
                      color: 'var(--danger)',
                      borderRadius: '6px',
                      padding: '0.6rem 0.8rem',
                      fontSize: '0.8rem',
                      marginBottom: '1rem',
                      lineHeight: '1.4'
                    }}>
                      Migration Error: {migrationMessage}
                    </div>
                  )}

                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer', marginBottom: '1rem', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={confirmMigration}
                      onChange={(e) => setConfirmMigration(e.target.checked)}
                      disabled={migrationStatus === 'running'}
                      style={{ marginTop: '0.2rem', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '0.78rem', color: 'var(--foreground)', lineHeight: '1.4' }}>
                      I understand that migrating will write my local projects and datasets to the cloud database under my account.
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={handleMigrateWithGuard}
                    disabled={!confirmMigration || migrationStatus === 'running'}
                    style={{
                      background: 'var(--accent)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '7px',
                      padding: '0.5rem 1.25rem',
                      cursor: (!confirmMigration || migrationStatus === 'running') ? 'not-allowed' : 'pointer',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      opacity: (!confirmMigration || migrationStatus === 'running') ? 0.5 : 1,
                      transition: 'opacity 0.2s',
                    }}
                  >
                    {migrationStatus === 'running' ? 'Syncing to Cloud...' : 'Confirm & Start Migration'}
                  </button>
                </div>
              )}
            </div>
          )}

          {supabaseEnabled ? (
            <div style={{ borderTop: '1px solid var(--card-border)', paddingTop: '1.25rem', marginTop: '1.25rem' }}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                Authentication & Sync
              </h3>
              {session ? (
                <div>
                  <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>
                    Signed in as <strong style={{ color: 'var(--foreground)' }}>{session.user?.email}</strong>. Data will automatically sync with your production account.
                  </p>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={authLoading}
                    style={{ background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: '7px', padding: '0.4rem 1rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem', opacity: authLoading ? 0.6 : 1 }}
                  >
                    {authLoading ? 'Signing out...' : 'Sign Out'}
                  </button>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '1rem' }}>
                    Local mode remains available. Sign in to sync data to the production database.
                  </p>
                  {authError && (
                    <div style={{ color: 'var(--danger)', fontSize: '0.78rem', marginBottom: '0.75rem' }}>
                      {authError}
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: '320px', marginBottom: '1rem' }}>
                    <input
                      type="email"
                      placeholder="Email Address"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      style={{ background: 'var(--card-input, rgba(255,255,255,0.03))', border: '1px solid var(--card-border)', borderRadius: '6px', padding: '0.4rem 0.75rem', color: 'var(--foreground)', fontSize: '0.85rem' }}
                    />
                    <input
                      type="password"
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      style={{ background: 'var(--card-input, rgba(255,255,255,0.03))', border: '1px solid var(--card-border)', borderRadius: '6px', padding: '0.4rem 0.75rem', color: 'var(--foreground)', fontSize: '0.85rem' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={handleSignIn}
                      disabled={authLoading}
                      style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '7px', padding: '0.45rem 1.1rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem', opacity: authLoading ? 0.6 : 1 }}
                    >
                      {authLoading ? 'Loading...' : 'Sign In'}
                    </button>
                    <button
                      type="button"
                      onClick={handleSignUp}
                      disabled={authLoading}
                      style={{ background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', borderRadius: '7px', padding: '0.45rem 1.1rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem', opacity: authLoading ? 0.6 : 1 }}
                    >
                      Sign Up
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
              Add <code style={{ fontSize: '0.78rem' }}>NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
              <code style={{ fontSize: '0.78rem' }}>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to{' '}
              <code style={{ fontSize: '0.78rem' }}>.env.local</code> and restart the dev server.
            </p>
          )}
        </div>

        {/* Backup & Restore Panel */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Backup &amp; Restore Center</h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '1.25rem' }}>
            Export all datasets and workspace configs as a JSON file, or restore them.
          </p>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              onClick={handleExportBackup}
              style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '7px', padding: '0.5rem 1.25rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
            >
              Export Backup (JSON)
            </button>

            <button
              type="button"
              onClick={handleDownloadAllData}
              disabled={exportingAll}
              style={{
                background: 'var(--success)',
                color: '#fff',
                border: 'none',
                borderRadius: '7px',
                padding: '0.5rem 1.25rem',
                cursor: exportingAll ? 'wait' : 'pointer',
                fontWeight: 600,
                fontSize: '0.85rem',
                opacity: exportingAll ? 0.6 : 1
              }}
            >
              {exportingAll ? 'Exporting All...' : 'Download All Data (ZIP)'}
            </button>

            <input
              type="file"
              id="restore-file-input"
              accept=".json"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />

            <button
              type="button"
              onClick={() => document.getElementById('restore-file-input')?.click()}
              style={{ background: 'transparent', border: '1px solid var(--card-border)', color: 'var(--foreground)', borderRadius: '7px', padding: '0.5rem 1.25rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
            >
              Import Backup File...
            </button>
          </div>
        </div>

        {/* Local Storage Controls */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Safer Local Storage Controls</h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '1.25rem' }}>
            Independently manage cached datasets or clear editorial workflow states.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Clear Local Cache */}
            <div style={{ borderBottom: '1px solid rgba(45, 49, 72, 0.4)', paddingBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>Clear Cache Datasets</h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>
                Deletes all local copies of keywords, gaps, competitor pages, backlinks, referring domains, anchor texts, and projects from local storage. This does <strong>not</strong> delete data from Supabase.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {!confirmClear ? (
                  <button
                    type="button"
                    onClick={() => setConfirmClear(true)}
                    style={{ background: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)', borderRadius: '7px', padding: '0.5rem 1.25rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
                  >
                    Clear Local Cache
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleClear}
                      style={{ background: 'var(--danger)', border: 'none', color: '#fff', borderRadius: '7px', padding: '0.5rem 1.25rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
                    >
                      Yes, Clear Local Cache
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClear(false)}
                      style={{ background: 'var(--card)', border: '1px solid var(--card-border)', color: 'var(--muted)', borderRadius: '7px', padding: '0.5rem 1.25rem', cursor: 'pointer', fontSize: '0.85rem' }}
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Clear Editorial Workflow State */}
            <div>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>Clear Editorial &amp; Workflow State Only</h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>
                Deletes opportunity workflow state, action plan metadata, content brief workflow, and export history without deleting your imported dataset tables.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {!confirmClearWorkflow ? (
                  <button
                    type="button"
                    onClick={() => setConfirmClearWorkflow(true)}
                    style={{ background: 'transparent', border: '1px solid var(--warning)', color: 'var(--warning)', borderRadius: '7px', padding: '0.5rem 1.25rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
                  >
                    Clear Workflow State
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleClearWorkflow}
                      style={{ background: 'var(--warning)', border: 'none', color: '#fff', borderRadius: '7px', padding: '0.5rem 1.25rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
                    >
                      Yes, Clear Workflow State
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClearWorkflow(false)}
                      style={{ background: 'var(--card)', border: '1px solid var(--card-border)', color: 'var(--muted)', borderRadius: '7px', padding: '0.5rem 1.25rem', cursor: 'pointer', fontSize: '0.85rem' }}
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* About Card */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>About SERPVault</h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>Version 1.0 — Next.js · TypeScript · Tailwind · Supabase</p>
        </div>
      </div>

      {/* Restore Confirmation Overlay Modal */}
      {showRestoreConfirm && restoreData && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'var(--overlay)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem',
        }}>
          <div style={{
            background: 'var(--card)',
            border: '1px solid var(--card-border)',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '500px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4)',
            overflow: 'hidden',
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--card-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--foreground)' }}>
                Confirm Backup Import
              </h3>
              <button
                type="button"
                onClick={() => { setShowRestoreConfirm(false); setRestoreData(null); }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                  fontSize: '1.25rem',
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: 0 }}>
                You are importing a backup. This will <strong style={{ color: 'var(--danger)' }}>overwrite</strong> all matching local project datasets and workflow states in this browser.
              </p>

              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.82rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>Source App</span>
                  <span style={{ fontWeight: 600 }}>{restoreData.appName}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>Schema Version</span>
                  <span style={{ fontWeight: 600 }}>{restoreData.schemaVersion}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>Exported At</span>
                  <span style={{ fontWeight: 600 }}>{new Date(restoreData.exportedAt).toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--card-border)', paddingTop: '0.5rem', marginTop: '0.25rem' }}>
                  <span style={{ color: 'var(--muted)' }}>Data Keys Included</span>
                  <span style={{ fontWeight: 600, color: 'var(--accent)', fontSize: '0.75rem', maxWidth: '280px', wordBreak: 'break-all', textAlign: 'right' }}>
                    {Object.keys(restoreData.data).join(', ')}
                  </span>
                </div>
              </div>

              <p style={{ fontSize: '0.82rem', color: 'var(--warning)', margin: 0, fontWeight: 500 }}>
                ● Note: Local imports will not affect Supabase automatically. You can choose to migrate restored datasets to Supabase later.
              </p>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '1rem 1.5rem',
              background: 'rgba(255,255,255,0.01)',
              borderTop: '1px solid var(--card-border)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.75rem',
            }}>
              <button
                type="button"
                onClick={() => { setShowRestoreConfirm(false); setRestoreData(null); }}
                style={{
                  background: 'var(--card)',
                  border: '1px solid var(--card-border)',
                  color: 'var(--muted)',
                  borderRadius: '7px',
                  padding: '0.5rem 1.25rem',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeRestore}
                style={{
                  background: 'var(--success)',
                  border: 'none',
                  color: '#fff',
                  borderRadius: '7px',
                  padding: '0.5rem 1.25rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                }}
              >
                Import &amp; Overwrite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
