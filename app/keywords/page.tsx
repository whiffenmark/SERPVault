'use client';

import { useEffect, useState, useCallback } from 'react';
import { updateStore } from '@/lib/storage';
import * as db from '@/lib/db';
import type { KeywordRecord, Tag } from '@/lib/types';
import DataTable from '@/components/DataTable';
import ScoreBadge from '@/components/ScoreBadge';
import Card from '@/components/Card';
import type { Column } from '@/components/DataTable';

export default function KeywordsPage() {
  const [keywords, setKeywords] = useState<KeywordRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    db.getKeywords().then(setKeywords).finally(() => setLoading(false));
  }, []);

  const handleTagChange = useCallback(async (id: string, tag: Tag | undefined) => {
    // Optimistic update
    setKeywords((prev) => prev.map((k) => (k.id === id ? { ...k, tag } : k)));
    // Persist to localStorage cache
    updateStore((s) => ({ ...s, keywords: s.keywords.map((k) => (k.id === id ? { ...k, tag } : k)) }));
    // Persist to Supabase
    await db.updateTag('keywords', id, tag);
  }, []);

  const avgDiff = keywords.length
    ? Math.round(keywords.reduce((s, k) => s + (k.difficulty ?? 0), 0) / keywords.length)
    : 0;
  const totalVol = keywords.reduce((s, k) => s + (k.volume ?? 0), 0);

  const columns: Column<KeywordRecord>[] = [
    { key: 'keyword', label: 'Keyword', sortKey: (r) => r.keyword },
    { key: 'volume', label: 'Volume', sortKey: (r) => r.volume ?? 0, render: (r) => r.volume?.toLocaleString() ?? '-' },
    { key: 'difficulty', label: 'KD', sortKey: (r) => r.difficulty ?? 0, render: (r) => r.difficulty ?? '-' },
    { key: 'cpc', label: 'CPC', sortKey: (r) => r.cpc ?? 0, render: (r) => (r.cpc != null ? `$${r.cpc.toFixed(2)}` : '-') },
    { key: 'intent', label: 'Intent', render: (r) => r.intent ?? '-' },
    { key: 'database', label: 'Database', render: (r) => r.database ?? '-' },
    { key: 'opportunityScore', label: 'Score', sortKey: (r) => r.opportunityScore ?? 0, render: (r) => <ScoreBadge score={r.opportunityScore ?? 0} /> },
  ];

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.3rem' }}>Keyword Database</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>All keywords from uploaded reports. Tag rows to build your content plan.</p>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <Card title="Total Keywords" value={keywords.length} />
        <Card title="Total Search Volume" value={totalVol.toLocaleString()} />
        <Card title="Avg KD" value={avgDiff} />
        <Card title="Tagged" value={keywords.filter((k) => k.tag).length} accent />
      </div>

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
      ) : keywords.length === 0 ? (
        <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>
          No keywords yet. <a href="/upload" style={{ color: 'var(--accent)' }}>Upload a keyword CSV</a> to get started.
        </div>
      ) : (
        <DataTable columns={columns} rows={keywords} onTagChange={handleTagChange} />
      )}
    </div>
  );
}
