'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { updateStore, getSelectedSite, filterRowsBySite } from '@/lib/storage';
import * as db from '@/lib/db';
import type { KeywordRecord, Tag } from '@/lib/types';
import DataTable from '@/components/DataTable';
import ScoreBadge from '@/components/ScoreBadge';
import Card from '@/components/Card';
import type { Column } from '@/components/DataTable';

export default function KeywordsPage() {
  const [keywords, setKeywords] = useState<KeywordRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [keywordSearch, setKeywordSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({
    cluster: '', page_target: '', priority: '', serpvault_tag: '', intent: '', domain: '', location: '', niche: ''
  });

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

  // Hermes Grouped Planner data
  const hermesRows = keywords.filter((k) => {
    const r = k.raw || {};
    return !!(r.cluster || r.Cluster || r['Cluster'] || r.page_target || r['page target'] || r.pageTarget);
  });

  const groupedPlanner = useMemo(() => {
    const clusterMap = new Map<string, Map<string, { meta: any; keywords: KeywordRecord[] }>>();
    for (const row of hermesRows) {
      const r = row.raw || {};
      const cluster = r.cluster ?? r.Cluster ?? r['Cluster'] ?? 'Uncategorized';
      const pageTarget = r.page_target ?? r['page target'] ?? r.pageTarget ?? 'No Page Target';
      if (!clusterMap.has(cluster)) clusterMap.set(cluster, new Map());
      const ptMap = clusterMap.get(cluster)!;
      if (!ptMap.has(pageTarget)) {
        ptMap.set(pageTarget, {
          meta: {
            priority: r.priority ?? r.Priority ?? '-',
            serpvault_tag: r.serpvault_tag ?? r['serpvault tag'] ?? r.serpvaultTag ?? '-',
            intent: r.intent ?? r.Intent ?? row.intent ?? '-',
            domain: r.domain ?? r.Domain ?? '-',
            location: r.location ?? r.Location ?? r.country ?? row.country ?? '-',
            niche: r.niche ?? r.Niche ?? '-',
          },
          keywords: [],
        });
      }
      ptMap.get(pageTarget)!.keywords.push(row);
    }
    return clusterMap;
  }, [hermesRows]);

  // Keyword filters & search (PR #6) - minimal addition
  const getVal = (k: KeywordRecord, field: string): string => {
    const r = k.raw || {};
    switch (field) {
      case 'cluster': return r.cluster ?? r.Cluster ?? r['Cluster'] ?? '-';
      case 'page_target': return r.page_target ?? r['page target'] ?? r.pageTarget ?? '-';
      case 'priority': return r.priority ?? r.Priority ?? '-';
      case 'serpvault_tag': return r.serpvault_tag ?? r['serpvault tag'] ?? r.serpvaultTag ?? '-';
      case 'intent': return k.intent ?? r.intent ?? r.Intent ?? '-';
      case 'domain': return r.domain ?? r.Domain ?? '-';
      case 'location': return r.location ?? r.Location ?? r.country ?? k.country ?? '-';
      case 'niche': return r.niche ?? r.Niche ?? '-';
      default: return '-';
    }
  };

  const filteredKeywords = useMemo(() => {
    let result = filterRowsBySite(keywords, getSelectedSite());
    if (keywordSearch) {
      const q = keywordSearch.toLowerCase();
      result = result.filter((k) => k.keyword.toLowerCase().includes(q));
    }
    Object.entries(filters).forEach(([field, val]) => {
      if (val) {
        result = result.filter((k) => getVal(k, field) === val);
      }
    });
    return result;
  }, [keywords, keywordSearch, filters]);

  // Build unique options for each filter (from current keywords)
  const filterOptions = useMemo(() => {
    const opts: Record<string, string[]> = {};
    const fields = ['cluster', 'page_target', 'priority', 'serpvault_tag', 'intent', 'domain', 'location', 'niche'];
    fields.forEach(f => {
      const vals = new Set<string>();
      keywords.forEach(k => { const v = getVal(k, f); if (v !== '-') vals.add(v); });
      opts[f] = Array.from(vals).sort();
    });
    return opts;
  }, [keywords]);

  const columns: Column<KeywordRecord>[] = [
    { key: 'keyword', label: 'Keyword', sortKey: (r) => r.keyword },
    { key: 'volume', label: 'Volume', sortKey: (r) => r.volume ?? 0, render: (r) => r.volume?.toLocaleString() ?? '-' },
    { key: 'difficulty', label: 'KD', sortKey: (r) => r.difficulty ?? 0, render: (r) => r.difficulty ?? '-' },
    { key: 'cpc', label: 'CPC', sortKey: (r) => r.cpc ?? 0, render: (r) => (r.cpc != null ? `$${r.cpc.toFixed(2)}` : '-') },
    { key: 'intent', label: 'Intent', render: (r) => r.intent ?? '-' },
    { key: 'database', label: 'Database', render: (r) => r.database ?? '-' },
    { key: 'opportunityScore', label: 'Score', sortKey: (r) => r.opportunityScore ?? 0, render: (r) => <ScoreBadge score={r.opportunityScore ?? 0} /> },
    // Hermes keyword_report fields via raw (safe fallback for normal CSVs)
    { key: 'cluster', label: 'Cluster', render: (r) => r.raw?.cluster ?? r.raw?.Cluster ?? r.raw?.['Cluster'] ?? '-' },
    { key: 'page_target', label: 'Page Target', render: (r) => r.raw?.page_target ?? r.raw?.['page target'] ?? r.raw?.pageTarget ?? '-' },
    { key: 'priority', label: 'Priority', render: (r) => r.raw?.priority ?? r.raw?.Priority ?? '-' },
    { key: 'domain', label: 'Domain', render: (r) => r.raw?.domain ?? r.raw?.Domain ?? '-' },
    { key: 'location', label: 'Location', render: (r) => r.raw?.location ?? r.raw?.Location ?? r.raw?.country ?? '-' },
    { key: 'niche', label: 'Niche', render: (r) => r.raw?.niche ?? r.raw?.Niche ?? '-' },
    { key: 'serpvault_tag_raw', label: 'SV Tag (raw)', render: (r) => r.raw?.serpvault_tag ?? r.raw?.['serpvault tag'] ?? r.raw?.serpvaultTag ?? '-' },
  ];

  const filterLabels: Record<string, string> = {
    cluster: 'Cluster', page_target: 'Page Target', priority: 'Priority', serpvault_tag: 'SV Tag',
    intent: 'Intent', domain: 'Domain', location: 'Location', niche: 'Niche'
  };

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

      {/* Hermes Grouped Planner - new accordion section */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.75rem' }}>Hermes Grouped Planner</h2>
        {hermesRows.length === 0 ? (
          <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '2rem', textAlign: 'center', color: 'var(--muted)' }}>
            No Hermes keyword data yet.<br />
            Upload a Hermes <strong>keyword_report</strong> CSV (with cluster / page_target fields) to populate this grouped view.
          </div>
        ) : (
          Array.from(groupedPlanner.entries()).map(([cluster, ptMap]) => {
            const totalInCluster = Array.from(ptMap.values()).reduce((sum, g) => sum + g.keywords.length, 0);
            return (
              <details key={cluster} style={{ marginBottom: '1rem', border: '1px solid var(--card-border)', borderRadius: '10px', overflow: 'hidden', background: 'var(--card)' }}>
                <summary style={{ padding: '0.75rem 1rem', cursor: 'pointer', fontWeight: 600, background: 'var(--card)', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>📁 Cluster: {cluster}</span>
                  <span style={{ fontSize: '0.875rem', color: 'var(--muted)', fontWeight: 400 }}>{totalInCluster} keywords</span>
                </summary>
                <div style={{ padding: '1rem' }}>
                  {Array.from(ptMap.entries()).map(([pageTarget, { meta, keywords }]) => (
                    <details key={pageTarget} style={{ marginBottom: '0.75rem', border: '1px solid var(--card-border)', borderRadius: '8px', background: 'var(--bg, #0a0a0a)' }}>
                      <summary style={{ padding: '0.6rem 0.9rem', cursor: 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>🎯 Page Target: {pageTarget}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{keywords.length} kw</span>
                      </summary>
                      <div style={{ padding: '0.9rem', fontSize: '0.875rem', borderTop: '1px solid var(--card-border)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.4rem 1rem', marginBottom: '0.75rem' }}>
                          <div><strong>Priority:</strong> {meta.priority}</div>
                          <div><strong>SV Tag:</strong> {meta.serpvault_tag}</div>
                          <div><strong>Intent:</strong> {meta.intent}</div>
                          <div><strong>Domain:</strong> {meta.domain}</div>
                          <div><strong>Location:</strong> {meta.location}</div>
                          <div><strong>Niche:</strong> {meta.niche}</div>
                        </div>
                        <div style={{ marginBottom: '0.35rem', fontWeight: 500 }}>Keywords:</div>
                        <ul style={{ margin: 0, paddingLeft: '1.1rem', lineHeight: 1.5 }}>
                          {keywords.map((k) => (
                            <li key={k.id}>{k.keyword}{k.volume != null ? ` (${k.volume.toLocaleString()})` : ''}</li>
                          ))}
                        </ul>
                      </div>
                    </details>
                  ))}
                </div>
              </details>
            );
          })
        )}
      </div>

      {/* PR #6: Keyword search bar + filters for Hermes fields */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search keywords…"
          value={keywordSearch}
          onChange={(e) => setKeywordSearch(e.target.value)}
          style={{
            background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '6px',
            padding: '0.4rem 0.75rem', color: 'var(--foreground)', fontSize: '0.85rem', width: '220px', outline: 'none'
          }}
        />
        {Object.keys(filters).map((field) => (
          <select
            key={field}
            value={filters[field]}
            onChange={(e) => setFilters((f) => ({ ...f, [field]: e.target.value }))}
            style={{
              background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '6px',
              padding: '0.4rem 0.5rem', color: 'var(--foreground)', fontSize: '0.8rem', outline: 'none'
            }}
          >
            <option value="">{filterLabels[field]} (all)</option>
            {filterOptions[field]?.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        ))}
        <button
          onClick={() => { setKeywordSearch(''); setFilters({ cluster: '', page_target: '', priority: '', serpvault_tag: '', intent: '', domain: '', location: '', niche: '' }); }}
          style={{ padding: '0.35rem 0.6rem', background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer' }}
        >
          Clear
        </button>
        <span style={{ fontSize: '0.8rem', color: 'var(--muted)', marginLeft: 'auto' }}>
          {filteredKeywords.length} / {keywords.length} shown
        </span>
      </div>

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
      ) : keywords.length === 0 ? (
        <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>
          No keywords yet. <a href="/upload" style={{ color: 'var(--accent)' }}>Upload a keyword CSV</a> to get started.
        </div>
      ) : (
        <DataTable columns={columns} rows={filteredKeywords} onTagChange={handleTagChange} />
      )}
    </div>
  );
}
