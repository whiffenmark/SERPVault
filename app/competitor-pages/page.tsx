'use client';

import { useEffect, useState, useCallback } from 'react';
import { getStore, updateStore } from '@/lib/storage';
import type { CompetitorPageRecord, Tag } from '@/lib/types';
import DataTable from '@/components/DataTable';
import ScoreBadge from '@/components/ScoreBadge';
import Card from '@/components/Card';
import type { Column } from '@/components/DataTable';

export default function CompetitorPagesPage() {
  const [rows, setRows] = useState<CompetitorPageRecord[]>([]);

  useEffect(() => {
    setRows(getStore().competitorPages);
  }, []);

  const handleTagChange = useCallback((id: string, tag: Tag | undefined) => {
    const updated = updateStore((store) => ({
      ...store,
      competitorPages: store.competitorPages.map((r) => (r.id === id ? { ...r, tag } : r)),
    }));
    setRows(updated.competitorPages);
  }, []);

  const totalTraffic = rows.reduce((s, r) => s + (r.traffic ?? 0), 0);

  const columns: Column<CompetitorPageRecord>[] = [
    { key: 'domain', label: 'Domain', sortKey: (r) => r.domain },
    {
      key: 'url',
      label: 'URL',
      render: (r) => (
        <a href={r.url.startsWith('http') ? r.url : `https://${r.url}`} target="_blank" rel="noreferrer"
          style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: '0.8rem' }}
        >
          {r.url.replace(/^https?:\/\//, '').slice(0, 60)}
        </a>
      ),
    },
    { key: 'title', label: 'Title', render: (r) => r.title ?? '-' },
    {
      key: 'traffic',
      label: 'Traffic',
      sortKey: (r) => r.traffic ?? 0,
      render: (r) => r.traffic?.toLocaleString() ?? '-',
    },
    {
      key: 'trafficShare',
      label: 'Traffic %',
      sortKey: (r) => r.trafficShare ?? 0,
      render: (r) => (r.trafficShare != null ? `${r.trafficShare.toFixed(2)}%` : '-'),
    },
    {
      key: 'keywords',
      label: 'Keywords',
      sortKey: (r) => r.keywords ?? 0,
      render: (r) => r.keywords?.toLocaleString() ?? '-',
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
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.3rem' }}>Competitor Top Pages</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>Analyze competitor pages to find content gaps and backlink opportunities.</p>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <Card title="Pages Indexed" value={rows.length} />
        <Card title="Total Traffic" value={totalTraffic.toLocaleString()} />
        <Card title="Unique Domains" value={new Set(rows.map((r) => r.domain)).size} />
        <Card title="Tagged" value={rows.filter((r) => r.tag).length} accent />
      </div>

      {rows.length === 0 ? (
        <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>
          No competitor pages yet. <a href="/upload" style={{ color: 'var(--accent)' }}>Upload a top pages CSV</a> to get started.
        </div>
      ) : (
        <DataTable columns={columns} rows={rows} onTagChange={handleTagChange} />
      )}
    </div>
  );
}
