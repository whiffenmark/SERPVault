'use client';

import { useEffect, useState } from 'react';
import * as db from '@/lib/db';
import type { DedupeReport } from '@/lib/types';
import Card from '@/components/Card';

const REPORT_LABELS: Record<string, string> = {
  keyword: 'Keyword Report', keyword_gap: 'Keyword Gap',
  competitor_pages: 'Competitor Pages', backlink: 'Backlinks',
  referring_domain: 'Referring Domains', anchor_text: 'Anchor Text',
  organic_positions: 'Organic Positions', unknown: 'Unknown',
};

export default function DedupePage() {
  const [reports, setReports] = useState<DedupeReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    db.getDedupeReports().then(setReports).finally(() => setLoading(false));
  }, []);

  const totalDupes = reports.reduce((s, r) => s + r.duplicatesRemoved, 0);
  const totalCleaned = reports.reduce((s, r) => s + r.cleanedRows, 0);

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.3rem' }}>Dedupe Reports</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>A dedupe report is created automatically with every CSV upload. Raw data is never deleted.</p>
      </div>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <Card title="Reports Created" value={reports.length} />
        <Card title="Total Duplicates Removed" value={totalDupes.toLocaleString()} accent />
        <Card title="Cleaned Rows Stored" value={totalCleaned.toLocaleString()} />
      </div>
      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
      ) : reports.length === 0 ? (
        <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>
          No dedupe reports yet. Reports are created automatically when you upload a CSV.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {reports.map((r) => (
            <div key={r.id} style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.2rem' }}>{r.filename}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--accent)' }}>{REPORT_LABELS[r.reportType] ?? r.reportType}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.15rem' }}>{new Date(r.createdAt).toLocaleString()}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{r.totalRows.toLocaleString()} total rows</div>
                  {r.duplicatesRemoved > 0
                    ? <div style={{ fontSize: '0.8rem', color: 'var(--warning)', fontWeight: 600 }}>-{r.duplicatesRemoved.toLocaleString()} duplicates</div>
                    : <div style={{ fontSize: '0.8rem', color: 'var(--success)' }}>No duplicates found</div>}
                  <div style={{ fontSize: '0.8rem', color: 'var(--success)', fontWeight: 600 }}>{r.cleanedRows.toLocaleString()} clean rows stored</div>
                </div>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>
                Dedupe key: <span style={{ color: 'var(--foreground)', fontFamily: 'monospace' }}>{r.dedupeKey}</span>
              </div>
              {r.issues.length > 0 && r.issues.map((issue, i) => (
                <div key={i} style={{ fontSize: '0.75rem', color: 'var(--warning)', marginTop: '0.15rem' }}>⚠ {issue}</div>
              ))}
              {r.duplicateExamples.length > 0 && (
                <details style={{ marginTop: '0.5rem' }}>
                  <summary style={{ fontSize: '0.78rem', color: 'var(--muted)', cursor: 'pointer' }}>
                    Show {r.duplicateExamples.length} example duplicate{r.duplicateExamples.length > 1 ? 's' : ''}
                  </summary>
                  <div style={{ marginTop: '0.5rem' }}>
                    {r.duplicateExamples.map((ex, i) => (
                      <div key={i} style={{ fontSize: '0.72rem', color: 'var(--muted)', background: 'rgba(0,0,0,0.2)', borderRadius: '4px', padding: '0.4rem 0.6rem', marginBottom: '0.25rem', fontFamily: 'monospace' }}>
                        {Object.entries(ex).slice(0, 6).map(([k, v]) => `${k}: ${v}`).join(' | ')}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
