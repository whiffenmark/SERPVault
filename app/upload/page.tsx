'use client';

import { useState, useCallback } from 'react';
import UploadZone from '@/components/UploadZone';
import { parseCSV } from '@/lib/parse-csv';
import { detectReportType } from '@/lib/detect-report-type';
import { dedupeRows } from '@/lib/dedupe';
import { updateStore } from '@/lib/storage';
import { nanoid } from '@/lib/nanoid';
import {
  mapKeyword,
  mapKeywordGap,
  mapCompetitorPage,
  mapBacklink,
  mapReferringDomain,
  mapAnchorText,
} from '@/lib/map-rows';
import type { UploadRecord, DedupeReport } from '@/lib/types';

interface FileResult {
  filename: string;
  reportType: string;
  totalRows: number;
  cleanedRows: number;
  duplicatesRemoved: number;
  issues: string[];
  status: 'success' | 'error';
  error?: string;
}

export default function UploadPage() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<FileResult[]>([]);

  const processFiles = useCallback(async (files: File[]) => {
    setLoading(true);
    const newResults: FileResult[] = [];

    for (const file of files) {
      try {
        const { headers, rows, error } = await parseCSV(file);
        if (error || rows.length === 0) {
          newResults.push({ filename: file.name, reportType: 'unknown', totalRows: 0, cleanedRows: 0, duplicatesRemoved: 0, issues: [error ?? 'Empty file'], status: 'error', error: error ?? 'Empty file' });
          continue;
        }

        const reportType = detectReportType(file.name, headers);
        const uploadId = nanoid();
        const { cleaned, report } = dedupeRows(rows, reportType, uploadId, file.name);

        const dedupeReport: DedupeReport = {
          ...report,
          uploadId,
          filename: file.name,
        };

        const upload: UploadRecord = {
          id: uploadId,
          filename: file.name,
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
            next.keywords = [...next.keywords, ...cleaned.map((r) => mapKeyword(r, uploadId))];
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
          } else {
            // unknown — store as keywords with raw data
            next.keywords = [...next.keywords, ...cleaned.map((r) => mapKeyword(r, uploadId))];
          }

          return next;
        });

        newResults.push({
          filename: file.name,
          reportType,
          totalRows: rows.length,
          cleanedRows: cleaned.length,
          duplicatesRemoved: report.duplicatesRemoved,
          issues: report.issues,
          status: 'success',
        });
      } catch (err) {
        newResults.push({
          filename: file.name,
          reportType: 'unknown',
          totalRows: 0,
          cleanedRows: 0,
          duplicatesRemoved: 0,
          issues: [],
          status: 'error',
          error: String(err),
        });
      }
    }

    setResults((prev) => [...newResults, ...prev]);
    setLoading(false);
  }, []);

  const REPORT_LABELS: Record<string, string> = {
    keyword: 'Keyword Report',
    keyword_gap: 'Keyword Gap Report',
    competitor_pages: 'Competitor Top Pages',
    backlink: 'Backlink Report',
    referring_domain: 'Referring Domains',
    anchor_text: 'Anchor Text Report',
    organic_positions: 'Organic Positions',
    unknown: 'Unknown (stored as keywords)',
  };

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.3rem' }}>Upload CSVs</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>
          Drop one or more CSV exports. The report type is auto-detected from the filename and column headers.
        </p>
      </div>

      <UploadZone onFiles={processFiles} loading={loading} />

      {results.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Import Results</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {results.map((r, i) => (
              <div
                key={i}
                style={{
                  background: 'var(--card)',
                  border: `1px solid ${r.status === 'error' ? 'var(--danger)' : 'var(--success)'}33`,
                  borderRadius: '8px',
                  padding: '1rem 1.25rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.25rem' }}>{r.filename}</div>
                    {r.status === 'success' ? (
                      <>
                        <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                          Detected: <span style={{ color: 'var(--accent)' }}>{REPORT_LABELS[r.reportType] ?? r.reportType}</span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.2rem' }}>
                          {r.totalRows.toLocaleString()} rows → {r.cleanedRows.toLocaleString()} cleaned
                          {r.duplicatesRemoved > 0 && (
                            <span style={{ color: 'var(--warning)', marginLeft: '0.5rem' }}>
                              ({r.duplicatesRemoved.toLocaleString()} duplicates removed)
                            </span>
                          )}
                        </div>
                        {r.issues.length > 0 && (
                          <div style={{ marginTop: '0.4rem' }}>
                            {r.issues.map((issue, j) => (
                              <div key={j} style={{ fontSize: '0.75rem', color: 'var(--warning)', marginTop: '0.1rem' }}>
                                ⚠ {issue}
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>Error: {r.error}</div>
                    )}
                  </div>
                  <div style={{ fontSize: '1.25rem' }}>{r.status === 'success' ? '✓' : '✗'}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: '2rem', background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '1.25rem' }}>
        <h2 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Supported Report Types
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem 1.5rem' }}>
          {Object.entries(REPORT_LABELS).filter(([k]) => k !== 'unknown').map(([key, label]) => (
            <div key={key} style={{ fontSize: '0.82rem', color: 'var(--muted)', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <span style={{ color: 'var(--success)' }}>✓</span>
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
