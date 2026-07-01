'use client';

import { useState, useEffect } from 'react';
import { clearStore } from '@/lib/storage';
import * as db from '@/lib/db';
import { supabaseEnabled } from '@/lib/supabase/client';
import {
  signInWithEmail,
  signUpWithEmail,
  signOut,
  subscribeAuthState,
  isAuthAvailable
} from '@/lib/supabase/auth';
import { Session } from '@supabase/supabase-js';
import Card from '@/components/Card';

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

  // Backup & Restore states
  const [restoreData, setRestoreData] = useState<BackupFile | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);

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
    if (!isAuthAvailable) return;
    const unsubscribe = subscribeAuthState((newSession) => {
      setSession(newSession);
      loadCounts();
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const storageSize = (() => {
    try {
      let totalBytes = 0;
      for (const key of BACKUP_STORAGE_KEYS) {
        const raw = localStorage.getItem(key) ?? '';
        totalBytes += new Blob([raw]).size;
      }
      return totalBytes > 1024 * 1024
        ? `${(totalBytes / 1024 / 1024).toFixed(2)} MB`
        : `${(totalBytes / 1024).toFixed(1)} KB`;
    } catch {
      return 'Unknown';
    }
  })();

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
        flash(`Connected ✓  — ${result.latencyMs}ms`, 'success');
      } else {
        flash(`Connection failed: ${result.error}`, 'error');
      }
    } catch (e) {
      flash(`Error: ${String(e)}`, 'error');
    }
    setTesting(false);
  }

  async function handleMigrate() {
    setMigrating(true);
    try {
      const result = await db.migrateLocalToSupabase();
      flash(`Migrated ${result.rows.toLocaleString()} rows to Supabase: ${result.tables.join(', ')}`, 'success');
      loadCounts();
    } catch (e) {
      flash(`Migration failed: ${String(e)}`, 'error');
    }
    setMigrating(false);
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
          {supabaseEnabled ? (
            <>
              <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '1rem' }}>
                Project: <code style={{ background: 'rgba(99,102,241,0.1)', padding: '0.1rem 0.3rem', borderRadius: '3px', fontSize: '0.78rem' }}>
                  {process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('https://', '').split('.')[0]}
                </code>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testing}
                  style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '7px', padding: '0.5rem 1.25rem', cursor: testing ? 'wait' : 'pointer', fontWeight: 600, fontSize: '0.85rem', opacity: testing ? 0.6 : 1 }}
                >
                  {testing ? 'Testing…' : 'Test Connection'}
                </button>
                <button
                  type="button"
                  onClick={handleMigrate}
                  disabled={migrating || !session}
                  title={!session ? 'Sign in to sync local data to Supabase' : 'Migrate all local storage data to Supabase'}
                  style={{ background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', borderRadius: '7px', padding: '0.5rem 1.25rem', cursor: migrating || !session ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.85rem', opacity: migrating || !session ? 0.4 : 1 }}
                >
                  {migrating ? 'Migrating…' : 'Migrate Local → Supabase'}
                </button>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.75rem' }}>
                "Migrate" uploads all localStorage data to Supabase. Safe to run multiple times — uses upsert. Requires sign-in first.
              </p>

              {/* Auth / Sync Section */}
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
            </>
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
