'use client';

import { useState, useCallback, useEffect } from 'react';
import UploadZone from '@/components/UploadZone';
import { parseCSV } from '@/lib/parse-csv';
import { detectReportType } from '@/lib/detect-report-type';
import { dedupeRows } from '@/lib/dedupe';
import { nanoid } from '@/lib/nanoid';
import {
  mapKeyword,
  mapKeywordGap,
  mapCompetitorPage,
  mapBacklink,
  mapReferringDomain,
  mapAnchorText,
  isGarbageKeyword,
} from '@/lib/map-rows';
import * as db from '@/lib/db';
import type { ReportType, UploadRecord, DedupeReport, ProjectRecord } from '@/lib/types';
import { getSelectedProjectId, getStore, setSelectedProjectId as setStorageSelectedProjectId } from '@/lib/storage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FileResult {
  id: string;
  filename: string;
  headers: string[];
  rows: Record<string, string>[];
  detectedType: ReportType;
  selectedType: ReportType;
  /** pending = not yet committed; imported = stored; error = parse failed */
  status: 'pending' | 'imported' | 'error';
  // Set after a successful import
  uploadId?: string;
  totalRows?: number;
  cleanedRows?: number;
  duplicatesRemoved?: number;
  issues?: string[];
  // Error state
  error?: string;
  // UI toggles
  showColumns: boolean;
  showReimport: boolean;
  // Health check review data (for keyword reports before storing)
  health?: {
    totalRows: number;
    duplicateCount: number;
    missingKeywordCount: number;
    hermesCoverage: Record<string, number>; // % of rows with field present (0-100)
    hasCluster: boolean;
    hasPageTarget: boolean;
    preview: Record<string, string>[];
  };
}

const REPORT_LABELS: Record<ReportType, string> = {
  keyword: 'Keyword Report',
  keyword_gap: 'Keyword Gap Report',
  competitor_pages: 'Competitor Top Pages',
  backlink: 'Backlink Report',
  referring_domain: 'Referring Domains',
  anchor_text: 'Anchor Text Report',
  organic_positions: 'Organic Positions',
  unknown: 'Unknown — select manually',
};

const ALL_TYPES: ReportType[] = [
  'keyword',
  'keyword_gap',
  'competitor_pages',
  'backlink',
  'referring_domain',
  'anchor_text',
  'organic_positions',
];

// ---------------------------------------------------------------------------
// Import logic — async, writes to Supabase + localStorage cache
// ---------------------------------------------------------------------------

async function commitToStore(
  rows: Record<string, string>[],
  reportType: ReportType,
  filename: string,
  projectId?: string
): Promise<{
  uploadId: string;
  totalRows: number;
  cleanedRows: number;
  duplicatesRemoved: number;
  issues: string[];
}> {
  const uploadId = nanoid();
  const { cleaned, report } = dedupeRows(rows, reportType, uploadId, filename);

  const dedupeReport: DedupeReport = { ...report, uploadId, filename };
  const upload: UploadRecord = {
    id: uploadId, filename, reportType,
    uploadedAt: new Date().toISOString(),
    rowCount: rows.length,
    cleanedRowCount: cleaned.length,
    dedupeReportId: dedupeReport.id,
    projectId,
  };

  // Persist upload + dedupe report
  await db.saveUpload(upload);
  await db.saveDedupeReport(dedupeReport);

  // Persist rows by type
  if (reportType === 'keyword' || reportType === 'organic_positions') {
    const mapped = cleaned.map((r) => mapKeyword(r, uploadId)).filter((k) => !isGarbageKeyword(k.keyword));
    await db.saveKeywords(mapped);
  } else if (reportType === 'keyword_gap') {
    await db.saveKeywordGaps(cleaned.map((r) => mapKeywordGap(r, uploadId)));
  } else if (reportType === 'competitor_pages') {
    await db.saveCompetitorPages(cleaned.map((r) => mapCompetitorPage(r, uploadId)));
  } else if (reportType === 'backlink') {
    await db.saveBacklinks(cleaned.map((r) => mapBacklink(r, uploadId)));
  } else if (reportType === 'referring_domain') {
    await db.saveReferringDomains(cleaned.map((r) => mapReferringDomain(r, uploadId)));
  } else if (reportType === 'anchor_text') {
    await db.saveAnchorTexts(cleaned.map((r) => mapAnchorText(r, uploadId)));
  }

  return {
    uploadId,
    totalRows: rows.length,
    cleanedRows: cleaned.length,
    duplicatesRemoved: report.duplicatesRemoved,
    issues: report.issues,
  };
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function UploadPage() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<FileResult[]>([]);

  // Project selection & creation states
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedProjectName, setSelectedProjectName] = useState<string>('');
  const [projects, setProjects] = useState<ProjectRecord[]>([]);

  // Form states for new project
  const [newName, setNewName] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newNiche, setNewNiche] = useState('');
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  const refreshProjects = async () => {
    const projs = await db.getProjects();
    setProjects(projs);
    const projId = getSelectedProjectId();
    setSelectedProjectId(projId);
    const proj = projs.find(p => p.id === projId);
    setSelectedProjectName(proj ? proj.name : '');
  };

  useEffect(() => {
    refreshProjects();
  }, []);

  const handleSelectProject = (id: string) => {
    setSelectedProjectId(id);
    setStorageSelectedProjectId(id);
    window.location.reload();
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newDomain.trim()) return;

    setIsCreatingProject(true);
    try {
      const projectId = 'proj_' + nanoid();
      let cleanedDomain = newDomain.trim().toLowerCase();
      cleanedDomain = cleanedDomain.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0].split(':')[0];

      const newProject: ProjectRecord = {
        id: projectId,
        name: newName.trim(),
        domain: cleanedDomain,
        location: newLocation.trim() || undefined,
        niche: newNiche.trim() || undefined,
        createdAt: new Date().toISOString(),
      };

      await db.saveProject(newProject, []);

      setNewName('');
      setNewDomain('');
      setNewLocation('');
      setNewNiche('');

      // Select the new project
      setSelectedProjectId(projectId);
      setStorageSelectedProjectId(projectId);
      window.location.reload();
    } catch (err) {
      console.error('Error creating project:', err);
    } finally {
      setIsCreatingProject(false);
    }
  };

  const updateResult = useCallback(
    (id: string, patch: Partial<FileResult>) =>
      setResults((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r))),
    []
  );

  // ---- Parse files, auto-import known types, hold unknown as pending ----
  const processFiles = useCallback(
    async (files: File[]) => {
      setLoading(true);
      const newResults: FileResult[] = [];
      const currentProjectId = getSelectedProjectId();

      for (const file of files) {
        const baseResult: Omit<FileResult, 'status' | 'detectedType' | 'selectedType'> = {
          id: nanoid(),
          filename: file.name,
          headers: [],
          rows: [],
          showColumns: false,
          showReimport: false,
        };

        try {
          const { headers, rows, error } = await parseCSV(file);

          if (error || rows.length === 0) {
            newResults.push({
              ...baseResult,
              headers: headers ?? [],
              rows: [],
              detectedType: 'unknown',
              selectedType: 'unknown',
              status: 'error',
              error: error ?? 'File is empty or could not be parsed',
            });
            continue;
          }

          const detectedType = detectReportType(file.name, headers);
          const result: FileResult = {
            ...baseResult,
            headers,
            rows,
            detectedType,
            selectedType: detectedType,
            status: 'pending',
            // Expand columns for unknown so user sees them immediately
            showColumns: detectedType === 'unknown',
          };

          if (detectedType !== 'unknown' && detectedType !== 'keyword') {
            // Auto-import known types (except keyword which gets health-check review)
            const imported = await commitToStore(rows, detectedType, file.name, currentProjectId || undefined);
            newResults.push({ ...result, status: 'imported', ...imported });
          } else if (detectedType === 'keyword') {
            // Compute health checks for keyword report review before storing
            const { cleaned, report } = dedupeRows(rows, detectedType, nanoid(), file.name);
            const duplicateCount = report.duplicatesRemoved;
            const sampleKeys = Object.keys(rows[0] || {});
            const kwCol = sampleKeys.find(k =>
              ['keyword','search term','query','keywords'].some(p => k.toLowerCase().includes(p))
            ) || sampleKeys[0] || 'keyword';
            const missingKeywordCount = rows.filter(r => !r[kwCol] || r[kwCol].trim() === '').length;

            const hermesFields = ['cluster','page_target','priority','serpvault_tag','intent','domain','location','niche'];
            const hermesCoverage: Record<string, number> = {};
            hermesFields.forEach(f => {
              const present = rows.filter(r => {
                const val = r[f] ?? r[f.replace('_',' ')] ?? r[f.charAt(0).toUpperCase() + f.slice(1)] ?? r[f.toUpperCase()] ?? '';
                return val && val.trim() !== '';
              }).length;
              hermesCoverage[f] = rows.length ? Math.round((present / rows.length) * 100) : 0;
            });
            const preview = rows.slice(0, 5);

            newResults.push({
              ...result,
              health: {
                totalRows: rows.length,
                duplicateCount,
                missingKeywordCount,
                hermesCoverage,
                hasCluster: hermesCoverage.cluster > 0,
                hasPageTarget: hermesCoverage.page_target > 0 || sampleKeys.some(h => /page.?target/i.test(h)),
                preview,
              }
            });
          } else {
            newResults.push(result);
          }
        } catch (err) {
          newResults.push({
            ...baseResult,
            detectedType: 'unknown',
            selectedType: 'unknown',
            status: 'error',
            error: String(err),
          });
        }
      }

      setResults((prev) => [...newResults, ...prev]);
      setLoading(false);
    },
    []
  );

  // ---- Manually import a pending (unknown) file ----
  const handleImport = useCallback(
    async (id: string) => {
      const result = results.find((r) => r.id === id);
      if (!result || result.selectedType === 'unknown') return;
      const currentProjectId = getSelectedProjectId();
      const imported = await commitToStore(result.rows, result.selectedType, result.filename, currentProjectId || undefined);
      updateResult(id, {
        status: 'imported',
        detectedType: result.selectedType,
        showColumns: false,
        showReimport: false,
        ...imported,
      });
    },
    [results, updateResult]
  );

  // ---- Re-import an already-imported file with a new type ----
  const handleReimport = useCallback(
    async (id: string, newType: ReportType) => {
      const result = results.find((r) => r.id === id);
      if (!result || !result.uploadId || newType === 'unknown') return;

      // Preserve project association
      const store = getStore();
      const oldUpload = store.uploads.find((u) => u.id === result.uploadId);
      const projectId = oldUpload?.projectId;

      await db.deleteUpload(result.uploadId);
      const imported = await commitToStore(result.rows, newType, result.filename, projectId);
      updateResult(id, {
        status: 'imported',
        selectedType: newType,
        detectedType: newType,
        showReimport: false,
        ...imported,
      });
    },
    [results, updateResult]
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.3rem' }}>Upload CSVs</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>
          Drop CSV exports from SEMrush, Ahrefs, Moz, or any SEO tool. Report type is auto-detected
          from filename and column headers. Unknown files stay pending until you select the type.
        </p>
      </div>

      <div style={{ margin: '1rem 0', padding: '0.75rem 1rem', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '8px', fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--accent)' }}>Tip:</strong> If files were previously imported with the wrong type detected (e.g. numbers showing as keywords), go to{' '}
        <a href="/settings" style={{ color: 'var(--accent)' }}>Settings → Clear All Data</a>, then re-upload here.
        Competitor top pages, keyword, organic position, backlink, and gap reports are now all auto-detected from column headers.
      </div>

      {!selectedProjectId ? (
        <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '1.75rem', marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--accent)' }}>Project Required</h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', lineHeight: '1.4' }}>
              Before uploading CSV files, you must associate them with a Project. Please select an existing project or create a new one below.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: projects.length > 0 ? '1fr 1fr' : '1fr', gap: '2rem' }}>
            {projects.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', borderRight: '1px dashed var(--card-border)', paddingRight: '2rem' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600 }}>Select Existing Project</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <select
                    onChange={(e) => {
                      if (e.target.value) handleSelectProject(e.target.value);
                    }}
                    defaultValue=""
                    style={{
                      fontSize: '0.82rem',
                      padding: '0.45rem 0.6rem',
                      border: '1px solid var(--card-border)',
                      borderRadius: '6px',
                      background: 'var(--background)',
                      color: 'var(--foreground)',
                      cursor: 'pointer',
                      width: '100%',
                    }}
                  >
                    <option value="" disabled>— Select project —</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.domain})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <form onSubmit={handleCreateProject} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600 }}>Create a New Project</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--muted)' }}>Project Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Acme Corp Web"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  style={{
                    fontSize: '0.8rem',
                    padding: '0.45rem 0.6rem',
                    border: '1px solid var(--card-border)',
                    borderRadius: '6px',
                    background: 'var(--background)',
                    color: 'var(--foreground)',
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--muted)' }}>Owned Domain *</label>
                <input
                  type="text"
                  placeholder="e.g. acme.com"
                  required
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  style={{
                    fontSize: '0.8rem',
                    padding: '0.45rem 0.6rem',
                    border: '1px solid var(--card-border)',
                    borderRadius: '6px',
                    background: 'var(--background)',
                    color: 'var(--foreground)',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--muted)' }}>Location (Opt.)</label>
                  <input
                    type="text"
                    placeholder="e.g. US"
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    style={{
                      fontSize: '0.8rem',
                      padding: '0.45rem 0.6rem',
                      border: '1px solid var(--card-border)',
                      borderRadius: '6px',
                      background: 'var(--background)',
                      color: 'var(--foreground)',
                    }}
                  />
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--muted)' }}>Niche (Opt.)</label>
                  <input
                    type="text"
                    placeholder="e.g. SaaS"
                    value={newNiche}
                    onChange={(e) => setNewNiche(e.target.value)}
                    style={{
                      fontSize: '0.8rem',
                      padding: '0.45rem 0.6rem',
                      border: '1px solid var(--card-border)',
                      borderRadius: '6px',
                      background: 'var(--background)',
                      color: 'var(--foreground)',
                    }}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isCreatingProject || !newName.trim() || !newDomain.trim()}
                style={{
                  fontSize: '0.82rem',
                  padding: '0.5rem',
                  background: isCreatingProject ? 'var(--card-border)' : 'var(--accent)',
                  color: isCreatingProject ? 'var(--muted)' : '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: isCreatingProject ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  marginTop: '0.5rem',
                }}
              >
                {isCreatingProject ? 'Creating...' : 'Create & Select Project'}
              </button>
            </form>
          </div>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: '1rem', fontSize: '0.85rem', color: 'var(--muted)', background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '6px', padding: '0.5rem 0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Uploading to project: <strong style={{ color: 'var(--accent)' }}>{selectedProjectName}</strong></span>
            <button
              onClick={() => {
                setSelectedProjectId(null);
                setStorageSelectedProjectId(null);
                window.location.reload();
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent)',
                cursor: 'pointer',
                fontSize: '0.75rem',
                textDecoration: 'underline',
                padding: 0,
              }}
            >
              Change Project
            </button>
          </div>
          <UploadZone onFiles={processFiles} loading={loading} />
        </>
      )}

      {results.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Import Results</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {results.map((r) => (
              <ResultCard
                key={r.id}
                result={r}
                onTypeChange={(t) => updateResult(r.id, { selectedType: t })}
                onImport={() => handleImport(r.id)}
                onReimport={(t) => handleReimport(r.id, t)}
                onToggleColumns={() => updateResult(r.id, { showColumns: !r.showColumns })}
                onToggleReimport={() => updateResult(r.id, { showReimport: !r.showReimport })}
              />
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: '2rem', background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '1.25rem' }}>
        <h2 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Supported Report Types
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem 1.5rem' }}>
          {ALL_TYPES.map((key) => (
            <div key={key} style={{ fontSize: '0.82rem', color: 'var(--muted)', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <span style={{ color: 'var(--success)' }}>✓</span>
              {REPORT_LABELS[key]}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result card sub-component
// ---------------------------------------------------------------------------

interface ResultCardProps {
  result: FileResult;
  onTypeChange: (t: ReportType) => void;
  onImport: () => void;
  onReimport: (t: ReportType) => void;
  onToggleColumns: () => void;
  onToggleReimport: () => void;
}

function ResultCard({
  result,
  onTypeChange,
  onImport,
  onReimport,
  onToggleColumns,
  onToggleReimport,
}: ResultCardProps) {
  const { status, detectedType, selectedType, filename, headers, showColumns, showReimport } = result;

  const borderColor =
    status === 'error'
      ? 'var(--danger)'
      : status === 'pending'
      ? 'var(--warning)'
      : 'var(--success)';

  const [reimportSelected, setReimportSelected] = useState<ReportType>(detectedType === 'unknown' ? 'keyword' : detectedType);

  return (
    <div
      style={{
        background: 'var(--card)',
        border: `1px solid ${borderColor}44`,
        borderLeft: `3px solid ${borderColor}`,
        borderRadius: '8px',
        padding: '1rem 1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.6rem',
      }}
    >
      {/* Row 1: filename + status icon */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontWeight: 600, fontSize: '0.9rem', wordBreak: 'break-all' }}>{filename}</div>
        <div style={{ fontSize: '1.1rem', flexShrink: 0, marginLeft: '0.75rem' }}>
          {status === 'imported' ? '✓' : status === 'error' ? '✗' : '⏳'}
        </div>
      </div>

      {/* Row 2: status line */}
      {status === 'error' && (
        <div style={{ fontSize: '0.82rem', color: 'var(--danger)' }}>
          Error: {result.error}
        </div>
      )}

      {status === 'imported' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.78rem', background: 'rgba(99,102,241,0.15)', color: 'var(--accent)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 600 }}>
            {REPORT_LABELS[detectedType]}
          </span>
          <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
            {result.totalRows?.toLocaleString()} rows →{' '}
            <span style={{ color: 'var(--success)' }}>{result.cleanedRows?.toLocaleString()} stored</span>
            {(result.duplicatesRemoved ?? 0) > 0 && (
              <span style={{ color: 'var(--warning)', marginLeft: '0.4rem' }}>
                ({result.duplicatesRemoved?.toLocaleString()} dupes removed)
              </span>
            )}
          </span>
        </div>
      )}

      {status === 'pending' && detectedType !== 'unknown' && !result.health && (
        <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
          Auto-importing as{' '}
          <span style={{ color: 'var(--accent)' }}>{REPORT_LABELS[detectedType]}</span>…
        </div>
      )}

      {status === 'pending' && detectedType === 'unknown' && (
        <div style={{ fontSize: '0.82rem', color: 'var(--warning)', fontWeight: 500 }}>
          ⚠ Could not detect report type — select one below and click Import.
        </div>
      )}

      {/* Upload Health Check Review Panel for Keyword Reports */}
      {status === 'pending' && result.health && (
        <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '6px', padding: '0.75rem', marginTop: '0.25rem' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent)', marginBottom: '0.5rem' }}>
            📋 Upload Health Check — Review before storing
          </div>
          <div style={{ fontSize: '0.78rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem 1rem', color: 'var(--muted)' }}>
            <div><strong>Detected:</strong> {REPORT_LABELS[detectedType]}</div>
            <div><strong>Total rows:</strong> {result.health.totalRows.toLocaleString()}</div>
            <div><strong>Duplicates:</strong> {result.health.duplicateCount.toLocaleString()}</div>
            <div><strong>Missing keyword:</strong> {result.health.missingKeywordCount.toLocaleString()}</div>
          </div>

          <div style={{ marginTop: '0.5rem', fontSize: '0.78rem' }}>
            <strong>Hermes field coverage:</strong>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.25rem' }}>
              {Object.entries(result.health.hermesCoverage).map(([f, pct]) => (
                <span key={f} style={{ background: pct > 30 ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)', color: pct > 30 ? 'var(--success)' : 'var(--warning)', padding: '0.1rem 0.4rem', borderRadius: '3px', fontSize: '0.72rem' }}>
                  {f}: {pct}%
                </span>
              ))}
            </div>
          </div>

          {( !result.health.hasCluster || !result.health.hasPageTarget ) && (
            <div style={{ marginTop: '0.4rem', fontSize: '0.78rem', color: 'var(--danger)' }}>
              ⚠ Warning: Missing cluster or page_target in data. Hermes features may be limited.
            </div>
          )}

          <div style={{ marginTop: '0.5rem' }}>
            <button
              onClick={onImport}
              style={{
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '0.3rem 0.9rem',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Confirm &amp; Store
            </button>
            <span style={{ marginLeft: '0.75rem', fontSize: '0.72rem', color: 'var(--muted)' }}>Preview of first 5 rows below (columns shown if toggled)</span>
          </div>

          {/* Preview first 5 rows */}
          <div style={{ marginTop: '0.5rem', fontSize: '0.7rem', background: 'var(--code-bg)', padding: '0.4rem', borderRadius: '4px', overflowX: 'auto', color: 'var(--foreground)' }}>
            <pre style={{ margin: 0, whiteSpace: 'pre' }}>{JSON.stringify(result.health.preview, null, 2)}</pre>
          </div>
        </div>
      )}

      {/* Issues */}
      {(result.issues ?? []).length > 0 && (
        <div>
          {result.issues!.map((issue, i) => (
            <div key={i} style={{ fontSize: '0.75rem', color: 'var(--warning)', marginTop: '0.1rem' }}>
              ⚠ {issue}
            </div>
          ))}
        </div>
      )}

      {/* Detected columns toggle */}
      {headers.length > 0 && (
        <div>
          <button
            onClick={onToggleColumns}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--muted)',
              fontSize: '0.78rem',
              cursor: 'pointer',
              padding: 0,
              textDecoration: 'underline',
            }}
          >
            {showColumns ? '▲ Hide' : '▼ Show'} detected columns ({headers.length})
          </button>
          {showColumns && (
            <div
              style={{
                marginTop: '0.5rem',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.35rem',
              }}
            >
              {headers.map((h, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: '0.72rem',
                    background: 'rgba(99,102,241,0.1)',
                    color: 'var(--accent)',
                    padding: '0.15rem 0.45rem',
                    borderRadius: '4px',
                    fontFamily: 'monospace',
                    border: '1px solid rgba(99,102,241,0.2)',
                  }}
                >
                  {h}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Manual type selector — shown for pending unknown files */}
      {status === 'pending' && detectedType === 'unknown' && (
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.82rem', color: 'var(--muted)', flexShrink: 0 }}>
            Select report type:
          </label>
          <select
            value={selectedType === 'unknown' ? '' : selectedType}
            onChange={(e) => onTypeChange(e.target.value as ReportType)}
            style={{
              background: 'var(--card)',
              border: '1px solid var(--card-border)',
              borderRadius: '6px',
              padding: '0.35rem 0.6rem',
              color: 'var(--foreground)',
              fontSize: '0.82rem',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="">— Choose type —</option>
            {ALL_TYPES.map((t) => (
              <option key={t} value={t}>
                {REPORT_LABELS[t]}
              </option>
            ))}
          </select>
          <button
            onClick={onImport}
            disabled={!selectedType || selectedType === 'unknown'}
            style={{
              background: selectedType && selectedType !== 'unknown' ? 'var(--accent)' : 'var(--card-border)',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              padding: '0.35rem 1rem',
              fontWeight: 600,
              fontSize: '0.82rem',
              cursor: selectedType && selectedType !== 'unknown' ? 'pointer' : 'not-allowed',
              opacity: selectedType && selectedType !== 'unknown' ? 1 : 0.5,
            }}
          >
            Import
          </button>
        </div>
      )}

      {/* Re-import override — shown for already-imported files */}
      {status === 'imported' && result.rows.length > 0 && (
        <div>
          <button
            onClick={onToggleReimport}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--muted)',
              fontSize: '0.78rem',
              cursor: 'pointer',
              padding: 0,
              textDecoration: 'underline',
            }}
          >
            {showReimport ? '▲ Cancel' : '↺ Re-import as different type'}
          </button>

          {showReimport && (
            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value={reimportSelected}
                onChange={(e) => setReimportSelected(e.target.value as ReportType)}
                style={{
                  background: 'var(--card)',
                  border: '1px solid var(--card-border)',
                  borderRadius: '6px',
                  padding: '0.35rem 0.6rem',
                  color: 'var(--foreground)',
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                {ALL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {REPORT_LABELS[t]}
                  </option>
                ))}
              </select>
              <button
                onClick={() => onReimport(reimportSelected)}
                disabled={reimportSelected === detectedType}
                style={{
                  background: reimportSelected !== detectedType ? 'var(--warning)' : 'var(--card-border)',
                  color: reimportSelected !== detectedType ? '#000' : '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '0.35rem 1rem',
                  fontWeight: 600,
                  fontSize: '0.82rem',
                  cursor: reimportSelected !== detectedType ? 'pointer' : 'not-allowed',
                  opacity: reimportSelected !== detectedType ? 1 : 0.5,
                }}
              >
                Re-import (removes old data)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
