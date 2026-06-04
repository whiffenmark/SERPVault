'use client';

import { useEffect, useState, useCallback } from 'react';
import { getStore, updateStore } from '@/lib/storage';
import type { BacklinkRecord, Tag } from '@/lib/types';
import DataTable from '@/components/DataTable';
import ScoreBadge from '@/components/ScoreBadge';
import Card from '@/components/Card';
import type { Column } from '@/components/DataTable';

export default function BacklinksPage() {
  const [rows, setRows] = useState<BacklinkRecord[]>([]);

  useEffect(() => {
    setRows(getStore().backlinks);
  }, []);

  const handleTagChange = useCallback((id: string, tag: Tag | undefined) => {
    const updated = updateStore((store) => ({
      ...store,
      backlinks: store.backlinks.map((r) => (r.id === id ? { ...r, tag } : r)),
    }));
    setRows(updated.backlinks);
  }, []);

  const avgDA = rows.length
    ? Math.round(rows.reduce((s, r) => s + (r.domainAuthority ?? r.domainRating ?? 0), 0) / rows.length)
    : 0;
  const doFollow = rows.filter((r) => r.doFollow).length;

  const columns: Column<BacklinkRecord>[] = [
    {
      key: 'sourceUrl',
      label: 'Source URL',
      render: (r) => (
        <a href={r.sourceUrl.startsWith('http') ? r.sourceUrl : `https://${r.sourceUrl}`} target="_blank" rel="noreferrer"
          style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: '0.8rem' }}
        >
          {r.sourceUrl.replace(/^https?:\/\//, '').slice(0, 50)}
        </a>
      ),
    },
    {
      key: 'targetUrl',
      label: 'Target URL',
      render: (r) => (
        <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
          {r.targetUrl.replace(/^https?:\/\//, '').slice(0, 40)}
        </span>
      ),
    },
    { key: 'anchorText', label: 'Anchor Text', render: (r) => r.anchorText ?? '-' },
    {
      key: 'domainAuthority',
      label: 'DA',
      sortKey: (r) => r.domainAuthority ?? r.domainRating ?? 0,
      render: (r) => r.domainAuthority ?? r.domainRating ?? '-',
    },
    {
      key: 'doFollow',
      label: 'Type',
      render: (r) => (
        <span style={{ fontSize: '0.75rem', color: r.doFollow ? 'var(--success)' : 'var(--muted)', fontWeight: 600 }}>
          {r.doFollow ? 'DoFollow' : 'NoFollow'}
        </span>
      ),
    },
    {
      key: 'opportunityScore',
      label: 'Score',
      sortKey: (r) => r.opportunityScore ?? 0,
      render: (r) => <ScoreBadge score={r.opportunityScore ?? 0} />,
    },
  ];

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.3rem' }}>Backlink Opportunities</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>Tag backlinks as targets to build your link acquisition list.</p>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <Card title="Total Backlinks" value={rows.length} />
        <Card title="DoFollow" value={doFollow} />
        <Card title="Avg DA" value={avgDA} />
        <Card title="Tagged Targets" value={rows.filter((r) => r.tag === 'Backlink Target').length} accent />
      </div>

      {rows.length === 0 ? (
        <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>
          No backlinks yet. <a href="/upload" style={{ color: 'var(--accent)' }}>Upload a backlink CSV</a> to get started.
        </div>
      ) : (
        <DataTable columns={columns} rows={rows} onTagChange={handleTagChange} />
      )}
    </div>
  );
}
