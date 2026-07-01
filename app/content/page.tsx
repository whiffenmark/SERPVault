'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { updateStore, getSelectedSite, filterRowsBySite, subscribeProjectScopeChange } from '@/lib/storage';
import * as db from '@/lib/db';
import type { KeywordRecord, KeywordGapRecord, Tag } from '@/lib/types';
import DataTable from '@/components/DataTable';
import ScoreBadge from '@/components/ScoreBadge';
import Card from '@/components/Card';
import type { Column } from '@/components/DataTable';
import { getKeywordGapOpportunityId } from '@/lib/opportunity-queue';
import { getOpportunityWorkflowMap, saveOpportunityWorkflowMap, STATUS_COLORS, type OpportunityWorkflowStatus, getMergedOpportunityWorkflowMap } from '@/lib/opportunity-workflow';

type ContentRow = (KeywordRecord | KeywordGapRecord) & { _source: 'keyword' | 'gap' };

interface HermesKeywordRow extends KeywordRecord {
  _source: 'keyword';
}

interface HermesGroupMeta {
  priority: string;
  serpvault_tag: string;
  intent: string;
  domain: string;
  location: string;
  niche: string;
  suggestedType: Tag | '-';
}

interface HermesPageTargetGroup {
  meta: HermesGroupMeta;
  keywords: HermesKeywordRow[];
}

export default function ContentPage() {
  const [rows, setRows] = useState<ContentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [workflowMap, setWorkflowMap] = useState<Record<string, OpportunityWorkflowStatus>>({});
  const [tab, setTab] = useState<'all' | 'tagged' | 'gap'>('all');
  const [plannerExpanded, setPlannerExpanded] = useState(false);

  const loadData = useCallback(async (siteSelection = getSelectedSite()) => {
    setLoading(true);
    try {
      const [kws, gaps] = await Promise.all([db.getKeywords(), db.getKeywordGaps()]);
      let all: ContentRow[] = [
        ...kws.map((k) => ({ ...k, _source: "keyword" as const })),
        ...gaps.map((k) => ({ ...k, _source: "gap" as const })),
      ].sort((a, b) => (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0));

      all = filterRowsBySite(all, siteSelection);
      setRows(all);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setWorkflowMap(getOpportunityWorkflowMap());
    getMergedOpportunityWorkflowMap().then((merged) => {
      setWorkflowMap(merged);
    });
    loadData();

    const unsubscribe = subscribeProjectScopeChange(() => {
      loadData(getSelectedSite());
    });
    return () => unsubscribe();
  }, [loadData]);

  const handleTagChange = useCallback(async (id: string, tag: Tag | undefined) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, tag } : r)));
    if (row._source === 'keyword') {
      updateStore((s) => ({ ...s, keywords: s.keywords.map((k) => (k.id === id ? { ...k, tag } : k)) }));
      await db.updateTag('keywords', id, tag);
    } else {
      updateStore((s) => ({ ...s, keywordGaps: s.keywordGaps.map((k) => (k.id === id ? { ...k, tag } : k)) }));
      await db.updateTag('keyword_gaps', id, tag);
    }
  }, [rows]);

  const toggleWorkflowStatus = useCallback((opportunityId: string) => {
    setWorkflowMap((prev) => {
      const current = prev[opportunityId];
      let next: OpportunityWorkflowStatus;

      if (!current || current === 'New' || current === 'Ignored') {
        next = 'Planned';
      } else if (current === 'Planned') {
        next = 'New';
      } else {
        return prev;
      }

      const newMap = { ...prev, [opportunityId]: next };
      saveOpportunityWorkflowMap(newMap);
      return newMap;
    });
  }, []);

  const displayRows = tab === 'all' ? rows : tab === 'tagged' ? rows.filter((r) => r.tag && r.tag !== 'Ignore') : rows.filter((r) => r._source === 'gap');
  const tagCounts = Object.fromEntries(['Money Page', 'Blog Post', 'City Page', 'Link Bait', 'Ignore'].map((t) => [t, rows.filter((r) => r.tag === t).length]));

  // Hermes-style grouped content opportunities (Cluster → Page Target → Keywords)
  const hermesKeywords = useMemo(() => {
    const keywordRows = rows.filter((r): r is ContentRow & { _source: 'keyword' } => r._source === 'keyword');
    return (keywordRows as HermesKeywordRow[]).filter((k) => {
      const r = k.raw || {};
      return !!(r.cluster || r.Cluster || r['Cluster'] || r.page_target || r['page target'] || r.pageTarget);
    });
  }, [rows]);

  const groupedContentOpps = useMemo(() => {
    const clusterMap = new Map<string, Map<string, HermesPageTargetGroup>>();
    for (const row of hermesKeywords) {
      const r = row.raw || {};
      const cluster = r.cluster ?? r.Cluster ?? r['Cluster'] ?? 'Uncategorized';
      const pageTarget = r.page_target ?? r['page target'] ?? r.pageTarget ?? 'No Page Target';
      if (!clusterMap.has(cluster)) clusterMap.set(cluster, new Map());
      const ptMap = clusterMap.get(cluster)!;
      if (!ptMap.has(pageTarget)) {
        const svTag = r.serpvault_tag ?? r['serpvault tag'] ?? r.serpvaultTag ?? '-';
        const priority = r.priority ?? r.Priority ?? '-';
        ptMap.set(pageTarget, {
          meta: {
            priority,
            serpvault_tag: svTag,
            intent: r.intent ?? r.Intent ?? row.intent ?? '-',
            domain: r.domain ?? r.Domain ?? '-',
            location: r.location ?? r.Location ?? r.country ?? row.country ?? '-',
            niche: r.niche ?? r.Niche ?? '-',
            suggestedType: suggestContentType(svTag, priority, row.tag),
          },
          keywords: [],
        });
      }
      ptMap.get(pageTarget)!.keywords.push(row);
    }
    return clusterMap;
  }, [hermesKeywords]);

  const plannerSummary = useMemo(() => {
    let clusterCount = groupedContentOpps.size;
    let pageTargetCount = 0;
    let keywordCount = 0;
    for (const ptMap of groupedContentOpps.values()) {
      pageTargetCount += ptMap.size;
      for (const data of ptMap.values()) {
        keywordCount += data.keywords.length;
      }
    }
    return { clusterCount, pageTargetCount, keywordCount };
  }, [groupedContentOpps]);

  function suggestContentType(svTag: string, priority: string, existingTag?: Tag): Tag | '-' {
    if (existingTag) return existingTag;
    const t = (svTag || '').toLowerCase();
    const p = (priority || '').toLowerCase();
    if (t.includes('money') || t.includes('commercial') || p === 'high') return 'Money Page';
    if (t.includes('blog') || t.includes('informational') || t.includes('guide')) return 'Blog Post';
    if (t.includes('city') || t.includes('local') || t.includes('geo')) return 'City Page';
    if (t.includes('link') || t.includes('bait')) return 'Link Bait';
    return '-';
  }

  const columns: Column<ContentRow>[] = [
    { key: 'keyword', label: 'Keyword', sortKey: (r) => r.keyword },
    { key: 'volume', label: 'Monthly Volume', sortKey: (r) => r.volume ?? 0, render: (r) => r.volume?.toLocaleString() ?? '-' },
    { key: 'difficulty', label: 'KD', sortKey: (r) => r.difficulty ?? 0, render: (r) => r.difficulty ?? '-' },
    { key: 'intent', label: 'Intent', render: (r) => r.intent ?? '-' },
    {
      key: '_source', label: 'Source',
      render: (r) => (
        <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.4rem', borderRadius: '4px', background: r._source === 'gap' ? '#f59e0b22' : '#6366f122', color: r._source === 'gap' ? 'var(--warning)' : 'var(--accent)' }}>
          {r._source === 'gap' ? 'Gap' : 'Keyword'}
        </span>
      ),
    },
    { key: 'opportunityScore', label: 'Score', sortKey: (r) => r.opportunityScore ?? 0, render: (r) => <ScoreBadge score={r.opportunityScore ?? 0} /> },
    {
      key: 'actionPlan',
      label: 'Action Plan',
      render: (r) => {
        if (r._source !== 'gap') return <span style={{ color: 'var(--muted)' }}>-</span>;

        const oppId = getKeywordGapOpportunityId(r as KeywordGapRecord);
        const status = workflowMap[oppId] || 'New';

        if (status === 'In Progress' || status === 'Done') {
          return (
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 600,
                color: STATUS_COLORS[status].color,
                background: STATUS_COLORS[status].bg,
                padding: '0.15rem 0.4rem',
                borderRadius: '4px',
                border: `1px solid ${STATUS_COLORS[status].color}30`,
                display: 'inline-block',
                textAlign: 'center',
                width: '90px'
              }}
            >
              {status}
            </span>
          );
        }

        const isPlanned = status === 'Planned';
        return (
          <button
            type="button"
            onClick={() => toggleWorkflowStatus(oppId)}
            style={{
              fontSize: '0.72rem',
              fontWeight: 600,
              padding: '0.25rem 0.5rem',
              borderRadius: '4px',
              cursor: 'pointer',
              width: '90px',
              textAlign: 'center',
              transition: 'all 0.15s',
              border: isPlanned ? '1px solid #38bdf8' : '1px solid var(--card-border)',
              background: isPlanned ? 'rgba(56, 189, 248, 0.15)' : 'var(--card)',
              color: isPlanned ? '#38bdf8' : 'var(--foreground)'
            }}
          >
            {isPlanned ? 'Planned ✓' : 'Plan'}
          </button>
        );
      }
    },
  ];

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.3rem' }}>Content Opportunities</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>Keywords and gaps sorted by opportunity score. Tag them to build your content calendar.</p>
      </div>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <Card title="Total Opportunities" value={rows.length} />
        <Card title="Money Pages" value={tagCounts['Money Page'] ?? 0} accent />
        <Card title="Blog Posts" value={tagCounts['Blog Post'] ?? 0} />
        <Card title="City Pages" value={tagCounts['City Page'] ?? 0} />
        <Card title="Link Bait" value={tagCounts['Link Bait'] ?? 0} />
      </div>

      {/* Hermes-style Grouped Content Opportunities - PR #7 */}
      {hermesKeywords.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>Hermes Grouped Content Opportunities</h2>
              <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                ({plannerSummary.clusterCount} clusters / {plannerSummary.pageTargetCount} page targets / {plannerSummary.keywordCount} keywords)
              </span>
            </div>
            <button
              onClick={() => setPlannerExpanded(!plannerExpanded)}
              style={{
                padding: '0.35rem 0.65rem',
                background: 'var(--card)',
                border: '1px solid var(--card-border)',
                borderRadius: '6px',
                fontSize: '0.75rem',
                cursor: 'pointer',
                color: 'var(--foreground)',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                outline: 'none',
              }}
            >
              {plannerExpanded ? 'Hide Opportunities ▲' : 'Show Opportunities ▼'}
            </button>
          </div>

          {plannerExpanded && (
            <div
              style={{
                maxHeight: '380px',
                overflowY: 'auto',
                border: '1px solid var(--card-border)',
                borderRadius: '10px',
                padding: '1rem 1rem 0 1rem',
                background: 'var(--panel-subtle)',
              }}
            >
              {Array.from(groupedContentOpps.entries()).map(([cluster, ptMap]) => {
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
                              <div><strong>Suggested Type:</strong> {meta.suggestedType}</div>
                            </div>
                            <div style={{ marginBottom: '0.35rem', fontWeight: 500 }}>Keywords:</div>
                            <ul style={{ margin: 0, paddingLeft: '1.1rem', lineHeight: 1.5 }}>
                              {keywords.map((k: HermesKeywordRow) => (
                                <li key={k.id}>{k.keyword}{k.volume != null ? ` (${k.volume.toLocaleString()})` : ''}</li>
                              ))}
                            </ul>
                          </div>
                        </details>
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {(['all', 'tagged', 'gap'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '0.4rem 1rem', borderRadius: '6px', border: '1px solid', borderColor: tab === t ? 'var(--accent)' : 'var(--card-border)', background: tab === t ? 'rgba(99,102,241,0.15)' : 'var(--card)', color: tab === t ? 'var(--accent)' : 'var(--muted)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: tab === t ? 600 : 400 }}>
            {t === 'all' ? 'All' : t === 'tagged' ? 'Tagged Only' : 'Keyword Gaps'}
          </button>
        ))}
      </div>
      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>
          No content opportunities yet. <a href="/upload" style={{ color: 'var(--accent)' }}>Upload keyword or gap CSVs</a>.
        </div>
      ) : (
        <DataTable columns={columns} rows={displayRows} onTagChange={handleTagChange} />
      )}
    </div>
  );
}
