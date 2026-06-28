'use client';

import { useEffect, useState, useCallback } from 'react';
import { updateStore, getSelectedSite, filterRowsBySite, siteSelectionLabel, type SiteSelection } from '@/lib/storage';
import * as db from '@/lib/db';
import type { CompetitorPageRecord, Tag } from '@/lib/types';
import DataTable from '@/components/DataTable';
import ScoreBadge from '@/components/ScoreBadge';
import Card from '@/components/Card';
import type { Column } from '@/components/DataTable';

export default function CompetitorPagesPage() {
  const [rows, setRows] = useState<CompetitorPageRecord[]>([]);
  const [selectedSite, setSelectedSite] = useState<SiteSelection>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSelectedSite(getSelectedSite());
    db.getCompetitorPages().then(setRows).finally(() => setLoading(false));
  }, []);

  const handleTagChange = useCallback(async (id: string, tag: Tag | undefined) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, tag } : r)));
    updateStore((s) => ({ ...s, competitorPages: s.competitorPages.map((r) => (r.id === id ? { ...r, tag } : r)) }));
    await db.updateTag('competitor_pages', id, tag);
  }, []);

  const displayedPages = filterRowsBySite(rows, selectedSite);

  const totalTraffic = displayedPages.reduce((s, r) => s + (r.traffic ?? 0), 0);

  const columns: Column<CompetitorPageRecord>[] = [
    { key: 'domain', label: 'Domain', sortKey: (r) => r.domain },
    {
      key: 'url', label: 'URL',
      render: (r) => (
        <a href={r.url.startsWith('http') ? r.url : `https://${r.url}`} target="_blank" rel="noreferrer"
          style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: '0.8rem' }}>
          {r.url.replace(/^https?:\/\//, '').slice(0, 60)}
        </a>
      ),
    },
    { key: 'title', label: 'Title', render: (r) => r.title ?? '-' },
    { key: 'traffic', label: 'Traffic', sortKey: (r) => r.traffic ?? 0, render: (r) => r.traffic?.toLocaleString() ?? '-' },
    { key: 'trafficShare', label: 'Traffic %', sortKey: (r) => r.trafficShare ?? 0, render: (r) => (r.trafficShare != null ? `${r.trafficShare.toFixed(2)}%` : '-') },
    { key: 'keywords', label: 'Keywords', sortKey: (r) => r.keywords ?? 0, render: (r) => r.keywords?.toLocaleString() ?? '-' },
    { key: 'opportunityScore', label: 'Score', sortKey: (r) => r.opportunityScore ?? 0, render: (r) => <ScoreBadge score={r.opportunityScore ?? 0} /> },
  ];

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.3rem' }}>Competitor Top Pages</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>Analyze competitor pages to find content gaps and backlink opportunities.</p>
      </div>

      <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '0.9rem 1rem', marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
          Active Project / Site
        </div>
        <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{siteSelectionLabel(selectedSite)}</div>
        <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
          This scope filters competitor top pages and metrics. All Projects shows the full local dataset.
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <Card title="Pages Indexed" value={displayedPages.length} />
        <Card title="Total Traffic" value={totalTraffic.toLocaleString()} />
        <Card title="Unique Domains" value={new Set(displayedPages.map((r) => r.domain)).size} />
        <Card title="Tagged" value={displayedPages.filter((r) => r.tag).length} accent />
      </div>
      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
      ) : displayedPages.length === 0 ? (
        selectedSite ? (
          <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>
            No competitor pages match the active project/site.
          </div>
        ) : (
          <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>
            No competitor pages yet. <a href="/upload" style={{ color: 'var(--accent)' }}>Upload a top pages CSV</a> to get started.
          </div>
        )
      ) : (
        <DataTable columns={columns} rows={displayedPages} onTagChange={handleTagChange} />
      )}
    </div>
  );
}
