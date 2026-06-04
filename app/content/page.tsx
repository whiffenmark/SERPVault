'use client';

import { useEffect, useState, useCallback } from 'react';
import { getStore, updateStore } from '@/lib/storage';
import type { KeywordRecord, KeywordGapRecord, Tag } from '@/lib/types';
import DataTable from '@/components/DataTable';
import ScoreBadge from '@/components/ScoreBadge';
import Card from '@/components/Card';
import type { Column } from '@/components/DataTable';

type ContentRow = (KeywordRecord | KeywordGapRecord) & { _source: 'keyword' | 'gap' };

export default function ContentPage() {
  const [rows, setRows] = useState<ContentRow[]>([]);
  const [tab, setTab] = useState<'all' | 'tagged' | 'gap'>('all');

  useEffect(() => {
    const store = getStore();
    const kwRows: ContentRow[] = store.keywords.map((k) => ({ ...k, _source: 'keyword' as const }));
    const gapRows: ContentRow[] = store.keywordGaps.map((k) => ({ ...k, _source: 'gap' as const }));
    setRows([...kwRows, ...gapRows].sort((a, b) => (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0)));
  }, []);

  const handleTagChange = useCallback((id: string, tag: Tag | undefined) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const updated = updateStore((store) => {
      if (row._source === 'keyword') {
        return { ...store, keywords: store.keywords.map((k) => (k.id === id ? { ...k, tag } : k)) };
      }
      return { ...store, keywordGaps: store.keywordGaps.map((k) => (k.id === id ? { ...k, tag } : k)) };
    });
    const kwRows: ContentRow[] = updated.keywords.map((k) => ({ ...k, _source: 'keyword' as const }));
    const gapRows: ContentRow[] = updated.keywordGaps.map((k) => ({ ...k, _source: 'gap' as const }));
    setRows([...kwRows, ...gapRows].sort((a, b) => (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0)));
  }, [rows]);

  const displayRows = tab === 'all' ? rows : tab === 'tagged' ? rows.filter((r) => r.tag && r.tag !== 'Ignore') : rows.filter((r) => r._source === 'gap');

  const columns: Column<ContentRow>[] = [
    { key: 'keyword', label: 'Keyword', sortKey: (r) => r.keyword },
    {
      key: 'volume',
      label: 'Volume',
      sortKey: (r) => r.volume ?? 0,
      render: (r) => r.volume?.toLocaleString() ?? '-',
    },
    {
      key: 'difficulty',
      label: 'KD',
      sortKey: (r) => r.difficulty ?? 0,
      render: (r) => r.difficulty ?? '-',
    },
    { key: 'intent', label: 'Intent', render: (r) => r.intent ?? '-' },
    {
      key: '_source',
      label: 'Source',
      render: (r) => (
        <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.4rem', borderRadius: '4px', background: r._source === 'gap' ? '#f59e0b22' : '#6366f122', color: r._source === 'gap' ? 'var(--warning)' : 'var(--accent)' }}>
          {r._source === 'gap' ? 'Gap' : 'Keyword'}
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

  const tagCounts = Object.fromEntries(
    ['Money Page', 'Blog Post', 'City Page', 'Link Bait', 'Ignore'].map((t) => [
      t,
      rows.filter((r) => r.tag === t).length,
    ])
  );

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.3rem' }}>Content Opportunities</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>
          Keywords and gaps sorted by opportunity score. Tag them to build your content calendar.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <Card title="Total Opportunities" value={rows.length} />
        <Card title="Money Pages" value={tagCounts['Money Page'] ?? 0} accent />
        <Card title="Blog Posts" value={tagCounts['Blog Post'] ?? 0} />
        <Card title="City Pages" value={tagCounts['City Page'] ?? 0} />
        <Card title="Link Bait" value={tagCounts['Link Bait'] ?? 0} />
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {(['all', 'tagged', 'gap'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '0.4rem 1rem',
              borderRadius: '6px',
              border: '1px solid',
              borderColor: tab === t ? 'var(--accent)' : 'var(--card-border)',
              background: tab === t ? 'rgba(99,102,241,0.15)' : 'var(--card)',
              color: tab === t ? 'var(--accent)' : 'var(--muted)',
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: tab === t ? 600 : 400,
            }}
          >
            {t === 'all' ? 'All' : t === 'tagged' ? 'Tagged Only' : 'Keyword Gaps'}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>
          No content opportunities yet. <a href="/upload" style={{ color: 'var(--accent)' }}>Upload keyword or gap CSVs</a>.
        </div>
      ) : (
        <DataTable columns={columns} rows={displayRows} onTagChange={handleTagChange} />
      )}
    </div>
  );
}
