'use client';

import { useState, useCallback, useEffect } from 'react';
import UploadZone from '@/components/UploadZone';
import { parseCSV } from '@/lib/parse-csv';
import { detectReportType, detectWithScores } from '@/lib/detect-report-type';
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
import { getSelectedProjectId, getStore, setSelectedProjectId as setStorageSelectedProjectId, subscribeProjectScopeChange } from '@/lib/storage';
import { getCurrentUserId } from '@/lib/supabase/auth';
import { saveSelectedProjectSetting } from '@/lib/supabase/user-settings';
import { resolveImportScope } from '@/lib/import-scope';
import { saveUploadAuditLog } from '@/lib/upload-audit';

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
  isImporting?: boolean;
  successMessage?: string;
  // Health check review data
  health?: {
    totalRows: number;
    duplicateCount: number;
    cleanedCount: number;
    requiredFields: {
      field: string;
      label: string;
      coverage: number; // % of rows with field present (0-100)
      present: boolean;
    }[];
    warnings: string[];
    preview: Record<string, unknown>[];
    confidence: string;
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

const REQUIRED_FIELDS_BY_TYPE: Record<ReportType, { field: string; label: string; candidates: string[] }[]> = {
  keyword: [
    { field: 'keyword', label: 'Keyword', candidates: ['keyword', 'search term', 'query', 'search query', 'keywords'] }
  ],
  keyword_gap: [
    { field: 'keyword', label: 'Keyword', candidates: ['keyword', 'search term', 'query'] }
  ],
  competitor_pages: [
    { field: 'url', label: 'URL', candidates: ['url', 'page url', 'landing page', 'landing url', 'page', 'top pages'] }
  ],
  backlink: [
    { field: 'sourceUrl', label: 'Source URL', candidates: ['source url', 'from url', 'referring url', 'referring page', 'source page', 'source', 'from', 'backlink url'] },
    { field: 'targetUrl', label: 'Target URL', candidates: ['target url', 'to url', 'destination url', 'target page', 'target', 'to'] }
  ],
  referring_domain: [
    { field: 'referringDomain', label: 'Referring Domain', candidates: ['referring domain', 'source domain', 'ref domain', 'root domain', 'domain'] }
  ],
  anchor_text: [
    { field: 'anchorText', label: 'Anchor Text', candidates: ['anchor text', 'anchor and target', 'anchor'] }
  ],
  organic_positions: [
    { field: 'keyword', label: 'Keyword', candidates: ['keyword', 'search term', 'query', 'search query', 'keywords'] }
  ],
  unknown: []
};

function findColumn(headers: string[], ...aliases: string[]): string {
  const normHeaders = headers.map(h => h.toLowerCase().trim());
  for (const alias of aliases) {
    const a = alias.toLowerCase().trim();
    const idx = normHeaders.findIndex(h => h === a || h.includes(a));
    if (idx !== -1) return headers[idx];
  }
  return '';
}

function computeHealthForFile(
  rows: Record<string, string>[],
  headers: string[],
  reportType: ReportType,
  filename: string
): {
  totalRows: number;
  duplicateCount: number;
  cleanedCount: number;
  requiredFields: {
    field: string;
    label: string;
    coverage: number;
    present: boolean;
  }[];
  warnings: string[];
  preview: Record<string, unknown>[];
  confidence: string;
} | undefined {
  if (reportType === 'unknown' || rows.length === 0) return undefined;

  const totalRows = rows.length;

  const { cleaned, report } = dedupeRows(rows, reportType, 'temp-id', filename);
  const duplicateCount = report.duplicatesRemoved;
  const cleanedCount = report.cleanedRows;

  const { scores } = detectWithScores(filename, headers);
  const filenameRules = [
    /backlink|back[\s_-]link/i,
    /referring[\s_-]domain|ref[\s_-]domain/i,
    /anchor[\s_-]text|anchors/i,
    /keyword[\s_-]gap|kw[\s_-]gap|gap[\s_-]report/i,
    /organic[\s_-]research|organic[\s_-]position|serp[\s_-]position/i,
    /top[\s_-]page|competitor[\s_-]page|pages[\s_-]report/i,
    /hermes|keyword[\s_-]report/i,
    /keyword[\s_-]overview|keyword[\s_-]magic|keyword[\s_-]analytic/i,
    /position|ranking/i,
    /keyword/i,
  ];
  const isFilenameMatch = filenameRules.some((p) => p.test(filename));
  let confidence = 'Unknown';
  const detectedType = detectReportType(filename, headers);
  if (detectedType === reportType) {
    if (isFilenameMatch) {
      confidence = 'High (Filename Match)';
    } else {
      const score = scores[reportType] ?? 0;
      confidence = `Medium/High (Column Score: ${score})`;
    }
  } else {
    const score = scores[reportType] ?? 0;
    confidence = score > 7 ? `Medium/High (Column Score: ${score})` : `Low (Column Score: ${score})`;
  }

  const fields = REQUIRED_FIELDS_BY_TYPE[reportType] || [];
  const requiredFields = fields.map((f) => {
    const colName = findColumn(headers, ...f.candidates);
    if (!colName) {
      return {
        field: f.field,
        label: f.label,
        coverage: 0,
        present: false,
      };
    }
    const presentCount = rows.filter(
      (r) => r[colName] && r[colName].trim() !== ''
    ).length;
    const coverage = totalRows ? Math.round((presentCount / totalRows) * 100) : 0;
    return {
      field: f.field,
      label: f.label,
      coverage,
      present: coverage > 0,
    };
  });

  const warnings: string[] = [];
  requiredFields.forEach((rf) => {
    if (!rf.present) {
      warnings.push(`Missing required field/column: ${rf.label}`);
    } else if (rf.coverage < 100) {
      warnings.push(`Low required field coverage: ${rf.label} is only ${rf.coverage}% filled`);
    }
  });

  if (reportType === 'keyword') {
    const clusterCol = findColumn(headers, 'cluster');
    const pageTargetCol = findColumn(headers, 'page_target', 'page target', 'page.target');
    const clusterPresent = clusterCol ? rows.some(r => r[clusterCol] && r[clusterCol].trim() !== '') : false;
    const pageTargetPresent = pageTargetCol ? rows.some(r => r[pageTargetCol] && r[pageTargetCol].trim() !== '') : false;

    if (!clusterPresent || !pageTargetPresent) {
      warnings.push('Missing cluster or page_target in data. Hermes features may be limited.');
    }
  }

  const previewRows = rows.slice(0, 5);
  const preview = previewRows.map((r) => {
    let mapped: Record<string, unknown> = {};
    if (reportType === 'keyword' || reportType === 'organic_positions') {
      mapped = mapKeyword(r, 'preview') as unknown as Record<string, unknown>;
    } else if (reportType === 'keyword_gap') {
      mapped = mapKeywordGap(r, 'preview') as unknown as Record<string, unknown>;
    } else if (reportType === 'competitor_pages') {
      mapped = mapCompetitorPage(r, 'preview') as unknown as Record<string, unknown>;
    } else if (reportType === 'backlink') {
      mapped = mapBacklink(r, 'preview') as unknown as Record<string, unknown>;
    } else if (reportType === 'referring_domain') {
      mapped = mapReferringDomain(r, 'preview') as unknown as Record<string, unknown>;
    } else if (reportType === 'anchor_text') {
      mapped = mapAnchorText(r, 'preview') as unknown as Record<string, unknown>;
    }
    const { id, uploadId, raw, ...rest } = mapped;
    return rest;
  });

  return {
    totalRows,
    duplicateCount,
    cleanedCount,
    requiredFields,
    warnings,
    preview,
    confidence,
  };
}

// ---------------------------------------------------------------------------
// Import logic — async, writes to Supabase + localStorage cache
// ---------------------------------------------------------------------------

async function commitToStore(
  rows: Record<string, string>[],
  reportType: ReportType,
  filename: string,
  projectId?: string,
  eventType: 'import' | 'reimport' = 'import'
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
  let finalCleanedCount = cleaned.length;
  let dbDuplicates = 0;
  if (reportType === 'keyword' || reportType === 'organic_positions') {
    const mapped = cleaned.map((r) => mapKeyword(r, uploadId)).filter((k) => !isGarbageKeyword(k.keyword));
    const savedCount = await db.saveKeywords(mapped);
    dbDuplicates = mapped.length - savedCount;
    finalCleanedCount = savedCount;
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

  const totalDuplicates = report.duplicatesRemoved + dbDuplicates;
  const dedupeRate = rows.length > 0 ? totalDuplicates / rows.length : 0;

  // Persist upload audit log
  await saveUploadAuditLog({
    uploadId,
    filename,
    reportType,
    projectId,
    sourceTool: upload.sourceTool,
    rowCount: rows.length,
    cleanedRowCount: finalCleanedCount,
    duplicatesRemoved: totalDuplicates,
    dedupeRate,
    dedupeReportId: dedupeReport.id,
    eventType,
  });

  return {
    uploadId,
    totalRows: rows.length,
    cleanedRows: finalCleanedCount,
    duplicatesRemoved: totalDuplicates,
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
    const unsubscribe = subscribeProjectScopeChange((projectId) => {
      setSelectedProjectId(projectId);
      db.getProjects().then((projs) => {
        setProjects(projs);
        const proj = projs.find(p => p.id === projectId);
        setSelectedProjectName(proj ? proj.name : '');
      });
    });
    return () => unsubscribe();
  }, []);

  const updateSelectedProjectId = (id: string | null) => {
    setStorageSelectedProjectId(id);
    getCurrentUserId().then((userId) => {
      if (userId) {
        saveSelectedProjectSetting(id).catch((err) => {
          console.error('[upload] Failed to save selected project setting to cloud:', err);
        });
      }
    }).catch((err) => {
      console.error('[upload] Failed to get user ID:', err);
    });
  };

  const handleSelectProject = (id: string | null) => {
    updateSelectedProjectId(id);
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
      updateSelectedProjectId(projectId);
    } catch (err) {
      console.error('Error creating project:', err);
    } finally {
      setIsCreatingProject(false);
    }
  };

  const updateResult = useCallback(
    (id: string, patch: Partial<FileResult>) =>
      setResults((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          const updated = { ...r, ...patch };
          if (patch.selectedType !== undefined) {
            updated.health = computeHealthForFile(r.rows, r.headers, patch.selectedType, r.filename);
          }
          return updated;
        })
      ),
    []
  );

  // ---- Parse files, hold as pending review ----
  const processFiles = useCallback(
    async (files: File[]) => {
      setLoading(true);
      const newResults: FileResult[] = [];

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
            showColumns: detectedType === 'unknown',
          };

          if (detectedType !== 'unknown') {
            result.health = computeHealthForFile(rows, headers, detectedType, file.name);
          }

          newResults.push(result);
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

      updateResult(id, { isImporting: true, error: undefined, successMessage: undefined });
      try {
        const currentProjectId = getSelectedProjectId();
        const scopeResult = resolveImportScope(
          result.rows,
          result.selectedType,
          currentProjectId,
          projects
        );

        if (scopeResult.hardError) {
          throw new Error(scopeResult.hardError);
        }

        const imported = await commitToStore(
          result.rows,
          result.selectedType,
          result.filename,
          scopeResult.effectiveProjectId
        );

        const isAutoAssigned = !currentProjectId && scopeResult.effectiveProjectId;
        const autoProjName = isAutoAssigned
          ? projects.find((p) => p.id === scopeResult.effectiveProjectId)?.name
          : undefined;

        const successMessage = autoProjName
          ? `Successfully imported! (Auto-assigned to project "${autoProjName}")`
          : 'Successfully imported!';

        updateResult(id, {
          status: 'imported',
          detectedType: result.selectedType,
          showColumns: false,
          showReimport: false,
          isImporting: false,
          successMessage,
          ...imported,
        });
      } catch (err) {
        console.error('Manual import failed:', err);
        updateResult(id, {
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
          isImporting: false,
          successMessage: undefined,
        });
      }
    },
    [results, updateResult, projects]
  );

  // ---- Re-import an already-imported file with a new type ----
  const handleReimport = useCallback(
    async (id: string, newType: ReportType) => {
      const result = results.find((r) => r.id === id);
      if (!result || !result.uploadId || newType === 'unknown') return;

      updateResult(id, { isImporting: true, error: undefined, successMessage: undefined });
      try {
        // Preserve project association
        const store = getStore();
        const oldUpload = store.uploads.find((u) => u.id === result.uploadId);
        const projectId = oldUpload?.projectId;

        const scopeResult = resolveImportScope(
          result.rows,
          newType,
          projectId,
          projects
        );

        if (scopeResult.hardError) {
          throw new Error(scopeResult.hardError);
        }

        await db.deleteUpload(result.uploadId);
        const imported = await commitToStore(
          result.rows,
          newType,
          result.filename,
          scopeResult.effectiveProjectId,
          'reimport'
        );

        const isAutoAssigned = !projectId && scopeResult.effectiveProjectId;
        const autoProjName = isAutoAssigned
          ? projects.find((p) => p.id === scopeResult.effectiveProjectId)?.name
          : undefined;

        const successMessage = autoProjName
          ? `Successfully re-imported! (Auto-assigned to project "${autoProjName}")`
          : 'Successfully re-imported!';

        updateResult(id, {
          status: 'imported',
          selectedType: newType,
          detectedType: newType,
          showReimport: false,
          isImporting: false,
          successMessage,
          ...imported,
        });
      } catch (err) {
        console.error('Re-import failed:', err);
        updateResult(id, {
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
          isImporting: false,
          successMessage: undefined,
        });
      }
    },
    [results, updateResult, projects]
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

      {/* Optional Assignment Panel */}
      {selectedProjectId ? (
        <div style={{ marginBottom: '1.25rem', fontSize: '0.85rem', color: 'var(--muted)', background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            Target Project:{' '}
            <strong style={{ color: 'var(--accent)' }}>
              {projects.find(p => p.id === selectedProjectId)?.name || selectedProjectName || 'Loading...'}
            </strong>{' '}
            {projects.find(p => p.id === selectedProjectId)?.domain && (
              <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                ({projects.find(p => p.id === selectedProjectId)?.domain})
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              updateSelectedProjectId(null);
            }}
            style={{
              background: 'none',
              border: '1px solid var(--card-border)',
              borderRadius: '6px',
              color: 'var(--muted)',
              cursor: 'pointer',
              fontSize: '0.75rem',
              padding: '0.35rem 0.75rem',
              fontWeight: 500,
              transition: 'all 0.15s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.color = 'var(--foreground)';
              e.currentTarget.style.borderColor = 'var(--accent)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.color = 'var(--muted)';
              e.currentTarget.style.borderColor = 'var(--card-border)';
            }}
          >
            Switch to All Projects (Unassigned)
          </button>
        </div>
      ) : (
        <div style={{ marginBottom: '1.25rem', background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ flex: '1', minWidth: '280px' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.3rem', color: 'var(--foreground)' }}>
                Uploading to: <span style={{ color: 'var(--accent)' }}>All Projects / Unassigned research</span>
              </h2>
              <p style={{ color: 'var(--muted)', fontSize: '0.8rem', lineHeight: '1.4', margin: 0 }}>
                Ideal for raw keyword, backlink, or SEO research. You can organize these uploads into specific projects/sites at any time.
              </p>
            </div>

            {projects.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: '220px' }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Assign Uploads to Project
                </label>
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
                    outline: 'none',
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
            )}
          </div>

          <div style={{ borderTop: '1px dashed var(--card-border)', paddingTop: '0.75rem' }}>
            <details style={{ cursor: 'pointer' }}>
              <summary style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted)', userSelect: 'none', display: 'list-item' }}>
                Create a New Project (Optional)
              </summary>
              <div style={{ cursor: 'default', marginTop: '0.75rem' }} onClick={(e) => e.stopPropagation()}>
                <form onSubmit={handleCreateProject} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: '600px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
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
                          outline: 'none',
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
                          outline: 'none',
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--muted)' }}>Location (Optional)</label>
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
                          outline: 'none',
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--muted)' }}>Niche (Optional)</label>
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
                          outline: 'none',
                        }}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isCreatingProject || !newName.trim() || !newDomain.trim()}
                    style={{
                      fontSize: '0.82rem',
                      padding: '0.5rem 1.25rem',
                      background: isCreatingProject ? 'var(--card-border)' : 'var(--accent)',
                      color: isCreatingProject ? 'var(--muted)' : '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: isCreatingProject ? 'not-allowed' : 'pointer',
                      fontWeight: 600,
                      alignSelf: 'flex-start',
                      marginTop: '0.25rem',
                    }}
                  >
                    {isCreatingProject ? 'Creating...' : 'Create & Select Project'}
                  </button>
                </form>
              </div>
            </details>
          </div>
        </div>
      )}

      {/* UploadZone is always rendered and visible */}
      <UploadZone onFiles={processFiles} loading={loading} />

      {results.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Import Results</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {results.map((r) => (
              <ResultCard
                key={r.id}
                result={r}
                selectedProjectId={selectedProjectId}
                projects={projects}
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
  selectedProjectId: string | null;
  projects: ProjectRecord[];
  onTypeChange: (t: ReportType) => void;
  onImport: () => Promise<void>;
  onReimport: (t: ReportType) => Promise<void>;
  onToggleColumns: () => void;
  onToggleReimport: () => void;
}

function ResultCard({
  result,
  selectedProjectId,
  projects,
  onTypeChange,
  onImport,
  onReimport,
  onToggleColumns,
  onToggleReimport,
}: ResultCardProps) {
  const { status, detectedType, selectedType, filename, headers, showColumns, showReimport } = result;
  const scopeResult = resolveImportScope(result.rows, selectedType, selectedProjectId, projects);

  const [confirmingReimport, setConfirmingReimport] = useState<ReportType | null>(null);
  const [reimportSelected, setReimportSelected] = useState<ReportType>(detectedType === 'unknown' ? 'keyword' : detectedType);

  const borderColor =
    status === 'error'
      ? 'var(--danger)'
      : status === 'pending'
      ? 'var(--warning)'
      : 'var(--success)';

  if (confirmingReimport) {
    return (
      <div
        style={{
          background: 'var(--card)',
          border: `1px solid var(--warning)44`,
          borderLeft: `3px solid var(--warning)`,
          borderRadius: '8px',
          padding: '1rem 1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--foreground)' }}>
            Confirm Re-import
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--muted)', wordBreak: 'break-all' }}>
            File: <strong style={{ color: 'var(--foreground)' }}>{filename}</strong>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--muted)', display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.25rem 0.5rem' }}>
            <span>Current Type:</span>
            <strong style={{ color: 'var(--foreground)' }}>{REPORT_LABELS[detectedType]}</strong>

            <span>New Type:</span>
            <strong style={{ color: 'var(--accent)' }}>{REPORT_LABELS[confirmingReimport]}</strong>

            {result.cleanedRows !== undefined && (
              <>
                <span>Stored Rows:</span>
                <strong style={{ color: 'var(--foreground)' }}>{result.cleanedRows.toLocaleString()}</strong>
              </>
            )}

            {result.duplicatesRemoved !== undefined && (
              <>
                <span>Duplicates Removed:</span>
                <strong style={{ color: 'var(--foreground)' }}>{result.duplicatesRemoved.toLocaleString()}</strong>
              </>
            )}
          </div>
          <div style={{
            fontSize: '0.78rem',
            color: 'var(--danger)',
            border: '1px solid var(--danger)',
            borderRadius: '6px',
            padding: '0.5rem 0.75rem',
            marginTop: '0.25rem',
            fontWeight: 500,
            lineHeight: 1.4
          }}>
            ⚠ Warning: All existing rows for this upload in the database will be permanently removed and replaced with rows mapped to the new report type. This action cannot be undone.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button
            type="button"
            disabled={result.isImporting}
            onClick={() => setConfirmingReimport(null)}
            style={{
              background: 'none',
              border: '1px solid var(--card-border)',
              borderRadius: '6px',
              color: 'var(--muted)',
              cursor: result.isImporting ? 'not-allowed' : 'pointer',
              fontSize: '0.8rem',
              padding: '0.4rem 0.8rem',
              fontWeight: 500,
              opacity: result.isImporting ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={result.isImporting}
            onClick={async () => {
              try {
                await onReimport(confirmingReimport);
                setConfirmingReimport(null);
              } catch (err) {
                setConfirmingReimport(null);
              }
            }}
            style={{
              background: 'var(--danger)',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: result.isImporting ? 'not-allowed' : 'pointer',
              fontSize: '0.8rem',
              padding: '0.4rem 0.8rem',
              fontWeight: 600,
              opacity: result.isImporting ? 0.5 : 1,
            }}
          >
            {result.isImporting ? 'Re-importing...' : 'Yes, Replace Old Data'}
          </button>
        </div>
      </div>
    );
  }

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

      {result.successMessage && (
        <div style={{ fontSize: '0.82rem', color: 'var(--success)', fontWeight: 500 }}>
          ✓ {result.successMessage}
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

      {status === 'pending' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.25rem' }}>
          {/* Overridable report type selector */}
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: '0.82rem', color: 'var(--muted)', flexShrink: 0 }}>
              Report Type:
            </label>
            <select
              value={selectedType}
              disabled={result.isImporting}
              onChange={(e) => onTypeChange(e.target.value as ReportType)}
              style={{
                background: 'var(--background)',
                border: '1px solid var(--card-border)',
                borderRadius: '6px',
                padding: '0.35rem 0.6rem',
                color: 'var(--foreground)',
                fontSize: '0.82rem',
                cursor: result.isImporting ? 'not-allowed' : 'pointer',
                outline: 'none',
                opacity: result.isImporting ? 0.7 : 1,
              }}
            >
              <option value="unknown">Unknown — select manually</option>
              {ALL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {REPORT_LABELS[t]}
                </option>
              ))}
            </select>
            {detectedType !== 'unknown' && (
              <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                Detected: <strong style={{ color: 'var(--foreground)' }}>{REPORT_LABELS[detectedType]}</strong> ({result.health?.confidence})
              </span>
            )}
          </div>

          {/* Health check review panel */}
          {selectedType !== 'unknown' && result.health ? (
            <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '6px', padding: '0.75rem' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent)', marginBottom: '0.5rem' }}>
                📋 Upload Health Check — Review before storing
              </div>
              <div style={{ fontSize: '0.78rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem 1rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>
                <div><strong>Total rows:</strong> {result.health.totalRows.toLocaleString()}</div>
                <div><strong>Duplicates estimate:</strong> {result.health.duplicateCount.toLocaleString()}</div>
                <div><strong>Clean rows estimate:</strong> {result.health.cleanedCount.toLocaleString()}</div>
              </div>

              {/* Required field coverage */}
              {result.health.requiredFields.length > 0 && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.78rem' }}>
                  <strong>Required field coverage:</strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.25rem' }}>
                    {result.health.requiredFields.map((rf) => (
                      <span key={rf.field} style={{ background: rf.present ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: rf.present ? 'var(--success)' : 'var(--danger)', padding: '0.1rem 0.4rem', borderRadius: '3px', fontSize: '0.72rem', fontWeight: 500 }}>
                        {rf.label}: {rf.coverage}%
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Warnings / Errors */}
              {result.health.warnings.length > 0 && (
                <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {result.health.warnings.map((w, idx) => (
                    <div key={idx} style={{ fontSize: '0.78rem', color: 'var(--warning)', fontWeight: 500 }}>
                      ⚠ {w}
                    </div>
                  ))}
                </div>
              )}

              {/* Import Scope / Auto-assignment Messages & Warnings */}
              {scopeResult.warnings.length > 0 && (
                <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {scopeResult.warnings.map((msg, idx) => {
                    const isAutoAssign = msg.includes('Auto-assigned');
                    return (
                      <div
                        key={idx}
                        style={{
                          fontSize: '0.78rem',
                          color: isAutoAssign ? 'var(--success)' : 'var(--warning)',
                          fontWeight: 500,
                          background: isAutoAssign ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                          borderLeft: `3px solid ${isAutoAssign ? 'var(--success)' : 'var(--warning)'}`,
                          padding: '0.35rem 0.5rem',
                          borderRadius: '4px',
                        }}
                      >
                        {isAutoAssign ? '[OK]' : '[WARN]'} {msg}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Clear ASCII error box for organic positions project requirement */}
              {scopeResult.hardError && (
                <div style={{
                  fontFamily: 'monospace',
                  whiteSpace: 'pre-wrap',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid var(--danger)',
                  color: 'var(--danger)',
                  padding: '0.8rem 1rem',
                  borderRadius: '6px',
                  marginTop: '0.75rem',
                  fontSize: '0.78rem',
                  lineHeight: '1.4'
                }}>
                  {`+-------------------------------------------------------------+
| [ERROR] PROJECT SELECTION REQUIRED                          |
+-------------------------------------------------------------+
| Organic Positions imports require a valid existing project. |
| Please select or create a project above to continue.        |
+-------------------------------------------------------------+`}
                </div>
              )}

              <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button
                  type="button"
                  disabled={
                    result.isImporting ||
                    result.health.requiredFields.some((rf) => !rf.present) ||
                    !!scopeResult.hardError
                  }
                  onClick={onImport}
                  style={{
                    background:
                      result.isImporting ||
                      result.health.requiredFields.some((rf) => !rf.present) ||
                      !!scopeResult.hardError
                        ? 'var(--card-border)'
                        : 'var(--accent)',
                    color:
                      result.isImporting ||
                      result.health.requiredFields.some((rf) => !rf.present) ||
                      !!scopeResult.hardError
                        ? 'var(--muted)'
                        : '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '0.35rem 1rem',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor:
                      result.isImporting ||
                      result.health.requiredFields.some((rf) => !rf.present) ||
                      !!scopeResult.hardError
                        ? 'not-allowed'
                        : 'pointer',
                    opacity: result.isImporting ? 0.7 : 1,
                  }}
                >
                  {result.isImporting ? 'Storing...' : 'Confirm & Store'}
                </button>
                <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                  Preview of first 5 mapped rows below (columns shown if toggled)
                </span>
              </div>

              {/* Mapped preview */}
              {result.health.preview.length > 0 && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.7rem', background: 'var(--code-bg)', padding: '0.4rem', borderRadius: '4px', overflowX: 'auto', color: 'var(--foreground)' }}>
                  <pre style={{ margin: 0, whiteSpace: 'pre' }}>{JSON.stringify(result.health.preview, null, 2)}</pre>
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: '0.82rem', color: 'var(--warning)', fontWeight: 500 }}>
              ⚠ Please select a report type above to review and import.
            </div>
          )}
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
            type="button"
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

      {/* Re-import override — shown for already-imported files */}
      {status === 'imported' && result.rows.length > 0 && (
        <div>
          <button
            type="button"
            disabled={result.isImporting}
            onClick={onToggleReimport}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--muted)',
              fontSize: '0.78rem',
              cursor: result.isImporting ? 'not-allowed' : 'pointer',
              padding: 0,
              textDecoration: 'underline',
              opacity: result.isImporting ? 0.5 : 1,
            }}
          >
            {showReimport ? '▲ Cancel' : '↺ Re-import as different type'}
          </button>

          {showReimport && (
            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value={reimportSelected}
                disabled={result.isImporting}
                onChange={(e) => setReimportSelected(e.target.value as ReportType)}
                style={{
                  background: 'var(--card)',
                  border: '1px solid var(--card-border)',
                  borderRadius: '6px',
                  padding: '0.35rem 0.6rem',
                  color: 'var(--foreground)',
                  fontSize: '0.82rem',
                  cursor: result.isImporting ? 'not-allowed' : 'pointer',
                  outline: 'none',
                  opacity: result.isImporting ? 0.7 : 1,
                }}
              >
                {ALL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {REPORT_LABELS[t]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setConfirmingReimport(reimportSelected)}
                disabled={result.isImporting || reimportSelected === detectedType}
                style={{
                  background: reimportSelected !== detectedType ? 'var(--warning)' : 'var(--card-border)',
                  color: reimportSelected !== detectedType ? '#000' : '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '0.35rem 1rem',
                  fontWeight: 600,
                  fontSize: '0.82rem',
                  cursor: !result.isImporting && reimportSelected !== detectedType ? 'pointer' : 'not-allowed',
                  opacity: !result.isImporting && reimportSelected !== detectedType ? 1 : 0.5,
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
