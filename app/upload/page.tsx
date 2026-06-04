'use client';

import { useState, useCallback } from 'react';
import UploadZone from '@/components/UploadZone';
import { parseCSV } from '@/lib/parse-csv';
import { detectReportType } from '@/lib/detect-report-type';
import { dedupeRows } from '@/lib/dedupe';
import { updateStore, removeUpload } from '@/lib/storage';
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
import type { ReportType, UploadRecord, DedupeReport } from '@/lib/types';

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
// Import logic (shared between first import and re-import)
// ---------------------------------------------------------------------------

function commitToStore(
  rows: Record<string, string>[],
  reportType: ReportType,
  filename: string
): {
  uploadId: string;
  totalRows: number;
  cleanedRows: number;
  duplicatesRemoved: number;
  issues: string[];
} {
  const uploadId = nanoid();
  const { cleaned, report } = dedupeRows(rows, reportType, uploadId, filename);

  const dedupeReport: DedupeReport = { ...report, uploadId, filename };
  const upload: UploadRecord = {
    id: uploadId,
    filename,
    reportType,
    uploadedAt: new Date().toISOString(),
    rowCount: rows.length,
    cleanedRowCount: cleaned.length,
    dedupeReportId: dedupeReport.id,
  };

  updateStore((store) => {
    const next = { ...store };
    next.uploads = [...next.uploads, upload];
    next.dedupeReports = [...next.dedupeReports, dedupeReport];

    if (reportType === 'keyword' || reportType === 'organic_positions') {
      const mapped = cleaned.map((r) => mapKeyword(r, uploadId));
      // Filter out garbage rows from mixed-format exports (e.g. SEMrush SERP overview)
      next.keywords = [...next.keywords, ...mapped.filter((k) => !isGarbageKeyword(k.keyword))];
    } else if (reportType === 'keyword_gap') {
      next.keywordGaps = [...next.keywordGaps, ...cleaned.map((r) => mapKeywordGap(r, uploadId))];
    } else if (reportType === 'competitor_pages') {
      next.competitorPages = [...next.competitorPages, ...cleaned.map((r) => mapCompetitorPage(r, uploadId))];
    } else if (reportType === 'backlink') {
      next.backlinks = [...next.backlinks, ...cleaned.map((r) => mapBacklink(r, uploadId))];
    } else if (reportType === 'referring_domain') {
      next.referringDomains = [...next.referringDomains, ...cleaned.map((r) => mapReferringDomain(r, uploadId))];
    } else if (reportType === 'anchor_text') {
      next.anchorTexts = [...next.anchorTexts, ...cleaned.map((r) => mapAnchorText(r, uploadId))];
    }
    // unknown: don't store — caller should not reach here with unknown

    return next;
  });

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

          if (detectedType !== 'unknown') {
            // Auto-import known types
            const imported = commitToStore(rows, detectedType, file.name);
            newResults.push({
              ...result,
              status: 'imported',
              ...imported,
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
    (id: string) => {
      const result = results.find((r) => r.id === id);
      if (!result || result.selectedType === 'unknown') return;
      const imported = commitToStore(result.rows, result.selectedType, result.filename);
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
    (id: string, newType: ReportType) => {
      const result = results.find((r) => r.id === id);
      if (!result || !result.uploadId || newType === 'unknown') return;
      // Remove old data from storage first
      removeUpload(result.uploadId);
      const imported = commitToStore(result.rows, newType, result.filename);
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

      <UploadZone onFiles={processFiles} loading={loading} />

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

      {status === 'pending' && detectedType !== 'unknown' && (
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
