'use client';

import { useEffect, useState, useCallback } from 'react';
import { updateStore, getSelectedSite, filterRowsBySite, siteSelectionLabel, type SiteSelection } from '@/lib/storage';
import * as db from '@/lib/db';
import type { BacklinkRecord, Tag } from '@/lib/types';
import DataTable from '@/components/DataTable';
import ScoreBadge from '@/components/ScoreBadge';
import Card from '@/components/Card';
import type { Column } from '@/components/DataTable';

export default function BacklinksPage() {
  const [rows, setRows] = useState<BacklinkRecord[]>([]);
  const [selectedSite, setSelectedSite] = useState<SiteSelection>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSelectedSite(getSelectedSite());
    db.getBacklinks().then(setRows).finally(() => setLoading(false));
  }, []);

  const handleTagChange = useCallback(async (id: string, tag: Tag | undefined) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, tag } : r)));
    updateStore((s) => ({ ...s, backlinks: s.backlinks.map((r) => (r.id === id ? { ...r, tag } : r)) }));
    await db.updateTag('backlinks', id, tag);
  }, []);

  const displayedBacklinks = filterRowsBySite(rows, selectedSite);

  const avgDA = displayedBacklinks.length
    ? Math.round(displayedBacklinks.reduce((s, r) => s + (r.domainAuthority ?? r.domainRating ?? 0), 0) / displayedBacklinks.length)
    : 0;

  const columns: Column<BacklinkRecord>[] = [
    {
      key: 'sourceUrl', label: 'Source URL',
      render: (r) => (
        <a href={r.sourceUrl.startsWith('http') ? r.sourceUrl : `https://${r.sourceUrl}`} target="_blank" rel="noreferrer"
          style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: '0.8rem' }}>
          {r.sourceUrl.replace(/^https?:\/\//, '').slice(0, 50)}
        </a>
      ),
    },
    {
      key: 'targetUrl', label: 'Target URL',
      render: (r) => <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{r.targetUrl.replace(/^https?:\/\//, '').slice(0, 40)}</span>,
    },
    { key: 'anchorText', label: 'Anchor Text', render: (r) => r.anchorText ?? '-' },
    { key: 'domainAuthority', label: 'DA', sortKey: (r) => r.domainAuthority ?? r.domainRating ?? 0, render: (r) => r.domainAuthority ?? r.domainRating ?? '-' },
    {
      key: 'doFollow', label: 'Type',
      render: (r) => (
        <span style={{ fontSize: '0.75rem', color: r.doFollow ? 'var(--success)' : 'var(--muted)', fontWeight: 600 }}>
          {r.doFollow ? 'DoFollow' : 'NoFollow'}
        </span>
      ),
    },
    { key: 'opportunityScore', label: 'Score', sortKey: (r) => r.opportunityScore ?? 0, render: (r) => <ScoreBadge score={r.opportunityScore ?? 0} /> },
  ];

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.3rem' }}>Backlink Opportunities</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>Tag backlinks as targets to build your link acquisition list.</p>
      </div>

      <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '0.9rem 1rem', marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
          Active Project / Site
        </div>
        <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{siteSelectionLabel(selectedSite)}</div>
        <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
          This scope filters backlink targets and metrics. All Projects shows the full local dataset.
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <Card title="Total Backlinks" value={displayedBacklinks.length} />
        <Card title="DoFollow" value={displayedBacklinks.filter((r) => r.doFollow).length} />
        <Card title="Avg DA" value={avgDA} />
        <Card title="Tagged Targets" value={displayedBacklinks.filter((r) => r.tag === 'Backlink Target').length} accent />
      </div>
      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
      ) : displayedBacklinks.length === 0 ? (
        selectedSite ? (
          <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>
            No backlinks match the active project/site.
          </div>
        ) : (
          <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>
            No backlinks yet. <a href="/upload" style={{ color: 'var(--accent)' }}>Upload a backlink CSV</a> to get started.
          </div>
        )
      ) : (
        <DataTable columns={columns} rows={displayedBacklinks} onTagChange={handleTagChange} />
      )}
    </div>
  );
}
