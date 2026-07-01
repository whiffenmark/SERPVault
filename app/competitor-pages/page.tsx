'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { updateStore, getSelectedSite, filterRowsBySite, siteSelectionLabel, type SiteSelection, subscribeProjectScopeChange } from '@/lib/storage';
import * as db from '@/lib/db';
import type { CompetitorPageRecord, Tag } from '@/lib/types';
import ScoreBadge from '@/components/ScoreBadge';

const TAGS: Tag[] = ['Money Page', 'Blog Post', 'City Page', 'Backlink Target', 'Link Bait', 'Ignore'];

const TAG_COLORS: Record<Tag, string> = {
  'Money Page': '#10b981',
  'Blog Post': '#6366f1',
  'City Page': '#f59e0b',
  'Backlink Target': '#3b82f6',
  'Link Bait': '#ec4899',
  Ignore: '#64748b',
};

interface DomainStat {
  domain: string;
  pageCount: number;
  totalTraffic: number;
  trafficShareSum: number;
  totalKeywords: number;
  scoreSum: number;
  scoreCount: number;
  taggedCount: number;
  ignoredCount: number;
}

function KpiCard({ title, value, sub, accent }: { title: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div
      style={{
        background: 'var(--card)',
        border: `1px solid ${accent ? 'var(--accent)' : 'var(--card-border)'}`,
        borderRadius: '10px',
        padding: '1rem 1.25rem',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: '90px',
      }}
    >
      <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
        {title}
      </div>
      <div>
        <div style={{ fontSize: '1.4rem', fontWeight: 700, color: accent ? 'var(--accent)' : 'var(--foreground)', lineHeight: 1.1 }}>
          {value}
        </div>
        {sub && (
          <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.35rem' }}>{sub}</div>
        )}
      </div>
    </div>
  );
}

export default function CompetitorPagesPage() {
  const [rows, setRows] = useState<CompetitorPageRecord[]>([]);
  const [selectedSite, setSelectedSite] = useState<SiteSelection>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Filter states
  const [search, setSearch] = useState('');
  const [domainFilter, setDomainFilter] = useState('All');
  const [minTraffic, setMinTraffic] = useState<number | ''>('');
  const [minKeywords, setMinKeywords] = useState<number | ''>('');
  const [minOpportunity, setMinOpportunity] = useState<number | ''>('');
  const [tagFilter, setTagFilter] = useState<'All' | 'Untagged' | Tag>('All');

  // Sorting states
  const [sortCol, setSortCol] = useState<keyof CompetitorPageRecord | 'trafficShare' | null>('traffic');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Pagination state
  const [page, setPage] = useState(0);
  const pageSize = 50;

  // Row selection state
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelectedSite(getSelectedSite());
    db.getCompetitorPages().then(setRows).finally(() => setLoading(false));

    const unsubscribe = subscribeProjectScopeChange(() => {
      setSelectedSite(getSelectedSite());
    });
    return () => unsubscribe();
  }, []);

  // Reset pagination and selection on filter change
  useEffect(() => {
    setPage(0);
    setSelectedRowIds(new Set());
  }, [search, domainFilter, minTraffic, minKeywords, minOpportunity, tagFilter]);

  // Update tag for a single page
  const handleTagChange = useCallback(async (id: string, tag: Tag | undefined) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, tag } : r)));
    updateStore((s) => ({ ...s, competitorPages: s.competitorPages.map((r) => (r.id === id ? { ...r, tag } : r)) }));
    await db.updateTag('competitor_pages', id, tag);
  }, []);

  // Bulk tag selected pages
  const handleBulkTag = async (tag: Tag | undefined) => {
    const ids = Array.from(selectedRowIds);
    if (ids.length === 0) return;

    setIsSaving(true);

    // Optimistically update React State
    setRows((prev) => prev.map((r) => (ids.includes(r.id) ? { ...r, tag } : r)));

    // Optimistically update localStore
    updateStore((s) => ({
      ...s,
      competitorPages: s.competitorPages.map((r) => (ids.includes(r.id) ? { ...r, tag } : r)),
    }));

    // Update Supabase/DB
    try {
      await Promise.all(ids.map((id) => db.updateTag('competitor_pages', id, tag)));
    } catch (error) {
      console.error('Failed to bulk update tags:', error);
    } finally {
      setIsSaving(false);
      setSelectedRowIds(new Set());
    }
  };

  // Base list filtered by project/site selection
  const displayedPages = useMemo(() => {
    return filterRowsBySite(rows, selectedSite);
  }, [rows, selectedSite]);

  // Unique domains available for domain selector
  const uniqueDomains = useMemo(() => {
    const domains = Array.from(new Set(displayedPages.map((r) => r.domain)));
    return domains.sort((a, b) => a.localeCompare(b));
  }, [displayedPages]);

  // Competitor domain intelligence calculations
  const domainStats = useMemo(() => {
    const statsMap: Record<string, DomainStat> = {};

    displayedPages.forEach((r) => {
      if (!statsMap[r.domain]) {
        statsMap[r.domain] = {
          domain: r.domain,
          pageCount: 0,
          totalTraffic: 0,
          trafficShareSum: 0,
          totalKeywords: 0,
          scoreSum: 0,
          scoreCount: 0,
          taggedCount: 0,
          ignoredCount: 0,
        };
      }
      const d = statsMap[r.domain];
      d.pageCount += 1;
      d.totalTraffic += r.traffic ?? 0;
      d.trafficShareSum += r.trafficShare ?? 0;
      d.totalKeywords += r.keywords ?? 0;
      if (r.opportunityScore != null) {
        d.scoreSum += r.opportunityScore;
        d.scoreCount += 1;
      }
      if (r.tag && r.tag !== 'Ignore') {
        d.taggedCount += 1;
      }
      if (r.tag === 'Ignore') {
        d.ignoredCount += 1;
      }
    });

    return Object.values(statsMap).sort((a, b) => b.totalTraffic - a.totalTraffic);
  }, [displayedPages]);

  // Main table filtering + sorting
  const filtered = useMemo(() => {
    let result = displayedPages;

    // Search query: domain, url, title
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((r) => {
        return (
          (r.domain && r.domain.toLowerCase().includes(q)) ||
          (r.url && r.url.toLowerCase().includes(q)) ||
          (r.title && r.title.toLowerCase().includes(q))
        );
      });
    }

    // Domain Dropdown Filter
    if (domainFilter !== 'All') {
      result = result.filter((r) => r.domain === domainFilter);
    }

    // Min Traffic Filter
    if (minTraffic !== '') {
      result = result.filter((r) => (r.traffic ?? 0) >= minTraffic);
    }

    // Min Keywords Filter
    if (minKeywords !== '') {
      result = result.filter((r) => (r.keywords ?? 0) >= minKeywords);
    }

    // Min Opportunity Score Filter
    if (minOpportunity !== '') {
      result = result.filter((r) => (r.opportunityScore ?? 0) >= minOpportunity);
    }

    // Tag / Status Filter
    if (tagFilter !== 'All') {
      if (tagFilter === 'Untagged') {
        result = result.filter((r) => !r.tag);
      } else {
        result = result.filter((r) => r.tag === tagFilter);
      }
    }

    // Sorting
    if (sortCol) {
      result = [...result].sort((a, b) => {
        let av: string | number = '';
        let bv: string | number = '';

        if (sortCol === 'domain') {
          av = a.domain ?? '';
          bv = b.domain ?? '';
        } else if (sortCol === 'url') {
          av = a.url ?? '';
          bv = b.url ?? '';
        } else if (sortCol === 'title') {
          av = a.title ?? '';
          bv = b.title ?? '';
        } else if (sortCol === 'traffic') {
          av = a.traffic ?? 0;
          bv = b.traffic ?? 0;
        } else if (sortCol === 'trafficShare') {
          av = a.trafficShare ?? 0;
          bv = b.trafficShare ?? 0;
        } else if (sortCol === 'keywords') {
          av = a.keywords ?? 0;
          bv = b.keywords ?? 0;
        } else if (sortCol === 'opportunityScore') {
          av = a.opportunityScore ?? 0;
          bv = b.opportunityScore ?? 0;
        }

        if (typeof av === 'number' && typeof bv === 'number') {
          return sortDir === 'asc' ? av - bv : bv - av;
        }
        return sortDir === 'asc'
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av));
      });
    }

    return result;
  }, [displayedPages, search, domainFilter, minTraffic, minKeywords, minOpportunity, tagFilter, sortCol, sortDir]);

  // Paginated subset of rows
  const totalPages = Math.ceil(filtered.length / pageSize);
  const pageRows = useMemo(() => {
    return filtered.slice(page * pageSize, (page + 1) * pageSize);
  }, [filtered, page]);

  // Handle header sorting click
  const handleSort = (col: keyof CompetitorPageRecord | 'trafficShare') => {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
    setPage(0);
  };

  // Checkbox interactions
  const handleHeaderCheckboxChange = () => {
    const isAllPageRowsSelected = pageRows.length > 0 && pageRows.every((r) => selectedRowIds.has(r.id));
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (isAllPageRowsSelected) {
        pageRows.forEach((r) => next.delete(r.id));
      } else {
        pageRows.forEach((r) => next.add(r.id));
      }
      return next;
    });
  };

  const toggleRowSelection = (id: string) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedRowIds(new Set(filtered.map((r) => r.id)));
  };

  const clearSelection = () => {
    setSelectedRowIds(new Set());
  };

  const hasActiveFilters =
    search !== '' ||
    domainFilter !== 'All' ||
    minTraffic !== '' ||
    minKeywords !== '' ||
    minOpportunity !== '' ||
    tagFilter !== 'All';

  const handleClearFilters = () => {
    setSearch('');
    setDomainFilter('All');
    setMinTraffic('');
    setMinKeywords('');
    setMinOpportunity('');
    setTagFilter('All');
  };

  // Helper to extract raw values safely for CSV exports
  const findRawValue = (raw: Record<string, string> | undefined, keywords: string[]): string => {
    if (!raw) return '';
    const keys = Object.keys(raw);
    for (const k of keys) {
      const lowerKey = k.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const kw of keywords) {
        if (lowerKey.includes(kw)) {
          return raw[k] || '';
        }
      }
    }
    return '';
  };

  // CSV Export handler
  const handleExportCSV = () => {
    const headers = [
      'Domain',
      'URL',
      'Title',
      'Traffic',
      'Traffic Share %',
      'Keywords',
      'Opportunity Score',
      'Tag',
      'Raw Domain',
      'Raw Location',
      'Raw Niche',
    ];

    const csvRows = [headers.join(',')];

    for (const r of filtered) {
      const rawDomain = findRawValue(r.raw, ['competitordomain', 'domain', 'sourcedomain']);
      const rawLocation = findRawValue(r.raw, ['location', 'locale', 'country', 'database', 'market']);
      const rawNiche = findRawValue(r.raw, ['niche', 'category', 'vertical', 'industry']);

      const fields = [
        r.domain,
        r.url,
        r.title ?? '',
        r.traffic ?? '',
        r.trafficShare != null ? `${r.trafficShare}%` : '',
        r.keywords ?? '',
        r.opportunityScore ?? '',
        r.tag ?? '',
        rawDomain,
        rawLocation,
        rawNiche,
      ];

      // Escape quotes and commas in fields
      const escapedFields = fields.map((val) => {
        const s = String(val);
        if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      });

      csvRows.push(escapedFields.join(','));
    }

    const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvRows.join('\n'));
    const downloadLink = document.createElement('a');
    downloadLink.href = csvContent;
    downloadLink.download = `competitor_pages_prospects_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  };

  // Reusable inline styles
  const inputStyle: React.CSSProperties = {
    background: 'var(--card)',
    border: '1px solid var(--card-border)',
    borderRadius: '6px',
    padding: '0.4rem 0.75rem',
    color: 'var(--foreground)',
    fontSize: '0.82rem',
    outline: 'none',
    width: '100%',
    transition: 'border-color 0.2s',
  };

  const selectStyle: React.CSSProperties = {
    background: 'var(--card)',
    border: '1px solid var(--card-border)',
    borderRadius: '6px',
    padding: '0.4rem 0.75rem',
    color: 'var(--foreground)',
    fontSize: '0.82rem',
    outline: 'none',
    width: '100%',
    cursor: 'pointer',
    transition: 'border-color 0.2s',
  };

  const thStyle = (col: keyof CompetitorPageRecord | 'trafficShare' | null): React.CSSProperties => ({
    padding: '0.6rem 0.875rem',
    textAlign: col === 'traffic' || col === 'trafficShare' || col === 'keywords' ? 'right' : col === 'opportunityScore' ? 'center' : 'left',
    color: sortCol === col ? 'var(--foreground)' : 'var(--muted)',
    fontWeight: 600,
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    userSelect: 'none',
    transition: 'color 0.2s',
  });

  const isAllPageRowsSelected = pageRows.length > 0 && pageRows.every((r) => selectedRowIds.has(r.id));
  const isAnyPageRowsSelected = pageRows.some((r) => selectedRowIds.has(r.id));

  // Compute KPI card stats dynamically
  const kpis = useMemo(() => {
    const totalTraffic = filtered.reduce((s, r) => s + (r.traffic ?? 0), 0);
    const avgTrafficShare = filtered.length > 0 ? filtered.reduce((s, r) => s + (r.trafficShare ?? 0), 0) / filtered.length : 0;
    const totalKeywords = filtered.reduce((s, r) => s + (r.keywords ?? 0), 0);
    const highOpportunity = filtered.filter((r) => (r.opportunityScore ?? 0) >= 70).length;
    const tagged = filtered.filter((r) => r.tag && r.tag !== 'Ignore').length;
    const ignored = filtered.filter((r) => r.tag === 'Ignore').length;

    // Context bounds
    const totalTrafficProj = displayedPages.reduce((s, r) => s + (r.traffic ?? 0), 0);
    const totalKeywordsProj = displayedPages.reduce((s, r) => s + (r.keywords ?? 0), 0);
    const highOppProj = displayedPages.filter((r) => (r.opportunityScore ?? 0) >= 70).length;
    const taggedProj = displayedPages.filter((r) => r.tag && r.tag !== 'Ignore').length;
    const ignoredProj = displayedPages.filter((r) => r.tag === 'Ignore').length;

    return {
      pagesIndexed: filtered.length,
      pagesIndexedSub: `of ${displayedPages.length} in project`,
      uniqueDomains: new Set(filtered.map((r) => r.domain)).size,
      uniqueDomainsSub: `of ${new Set(displayedPages.map((r) => r.domain)).size} in project`,
      totalTraffic: totalTraffic.toLocaleString(),
      totalTrafficSub: `of ${totalTrafficProj.toLocaleString()} total`,
      avgTrafficShare: `${avgTrafficShare.toFixed(2)}%`,
      avgTrafficShareSub: 'Avg across selection',
      totalKeywords: totalKeywords.toLocaleString(),
      totalKeywordsSub: `of ${totalKeywordsProj.toLocaleString()} total`,
      highOpportunity,
      highOpportunitySub: `of ${highOppProj} in project`,
      tagged,
      taggedSub: `of ${taggedProj} in project`,
      ignored,
      ignoredSub: `of ${ignoredProj} in project`,
    };
  }, [filtered, displayedPages]);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      {/* Dynamic inline stylesheet for dynamic UI interactions */}
      <style dangerouslySetInnerHTML={{
        __html: `
          .hover-row:hover {
            background-color: rgba(99, 102, 241, 0.04) !important;
          }
          .input-focus:focus {
            border-color: var(--accent) !important;
          }
          .clickable-header:hover {
            color: var(--foreground) !important;
          }
        `
      }} />

      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.3rem' }}>Competitor Top Pages</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>Analyze competitor top-ranking pages to identify high-traffic content prospects and backlink targets.</p>
      </div>

      {/* Project Scope Info */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '0.9rem 1rem', marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
          Active Project / Site
        </div>
        <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{siteSelectionLabel(selectedSite)}</div>
        <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
          This scope filters competitor top pages and metrics. All Projects shows the full local dataset.
        </div>
      </div>

      {/* KPI Cards Section */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: '0.75rem',
        marginBottom: '1.5rem'
      }}>
        <KpiCard title="Pages Indexed" value={kpis.pagesIndexed} sub={kpis.pagesIndexedSub} />
        <KpiCard title="Unique Domains" value={kpis.uniqueDomains} sub={kpis.uniqueDomainsSub} />
        <KpiCard title="Total Traffic" value={kpis.totalTraffic} sub={kpis.totalTrafficSub} />
        <KpiCard title="Avg Traffic Share" value={kpis.avgTrafficShare} sub={kpis.avgTrafficShareSub} />
        <KpiCard title="Total Ranking Keywords" value={kpis.totalKeywords} sub={kpis.totalKeywordsSub} />
        <KpiCard title="High Opportunity Pages" value={kpis.highOpportunity} sub={kpis.highOpportunitySub} accent={kpis.highOpportunity > 0} />
        <KpiCard title="Tagged Pages" value={kpis.tagged} sub={kpis.taggedSub} />
        <KpiCard title="Ignored Pages" value={kpis.ignored} sub={kpis.ignoredSub} />
      </div>

      {/* Domain Competitor Intelligence Table */}
      {displayedPages.length > 0 && (
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--card-border)',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1.5rem'
        }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Domain Competitor Intelligence</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 400 }}>Top {Math.min(5, domainStats.length)} domains by traffic</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--card-border)', color: 'var(--muted)', fontWeight: 600 }}>
                  <th style={{ padding: '0.4rem 0.5rem' }}>Competitor Domain</th>
                  <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>Pages</th>
                  <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>Total Traffic</th>
                  <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>Avg Share %</th>
                  <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>Total Keywords</th>
                  <th style={{ padding: '0.4rem 0.5rem', textAlign: 'center' }}>Avg Score</th>
                  <th style={{ padding: '0.4rem 0.5rem', textAlign: 'center' }}>Status Stats</th>
                </tr>
              </thead>
              <tbody>
                {domainStats.slice(0, 5).map((d) => (
                  <tr key={d.domain} style={{ borderBottom: '1px solid var(--card-border)' }} className="hover-row">
                    <td style={{ padding: '0.5rem' }}>
                      <button
                        onClick={() => setDomainFilter(d.domain)}
                        title="Filter main list to this domain"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--accent)',
                          fontWeight: 600,
                          cursor: 'pointer',
                          padding: 0,
                          fontSize: '0.8rem',
                          textDecoration: 'underline'
                        }}
                      >
                        {d.domain}
                      </button>
                    </td>
                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>{d.pageCount}</td>
                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>{d.totalTraffic.toLocaleString()}</td>
                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>{d.pageCount > 0 ? (d.trafficShareSum / d.pageCount).toFixed(2) : '0.00'}%</td>
                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>{d.totalKeywords.toLocaleString()}</td>
                    <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                      <ScoreBadge score={d.scoreCount > 0 ? Math.round(d.scoreSum / d.scoreCount) : 0} />
                    </td>
                    <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                      <span style={{ color: '#10b981', fontWeight: 500 }}>{d.taggedCount} Tagged</span>
                      <span style={{ color: 'var(--muted)', margin: '0 0.4rem' }}>|</span>
                      <span style={{ color: '#64748b', fontWeight: 500 }}>{d.ignoredCount} Ignored</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Filters and CSV Export Panel */}
      <div style={{
        background: 'var(--card)',
        border: '1px solid var(--card-border)',
        borderRadius: '8px',
        padding: '1.25rem',
        marginBottom: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Filter & Segmentation</div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                style={{
                  background: 'none',
                  border: `1px solid var(--card-border)`,
                  borderRadius: '6px',
                  padding: '0.4rem 0.75rem',
                  color: 'var(--foreground)',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                Clear Filters
              </button>
            )}
            <button
              onClick={handleExportCSV}
              disabled={filtered.length === 0}
              style={{
                background: filtered.length === 0 ? 'var(--card-border)' : 'var(--accent)',
                border: 'none',
                borderRadius: '6px',
                padding: '0.4rem 0.8rem',
                color: '#ffffff',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: filtered.length === 0 ? 'not-allowed' : 'pointer',
                opacity: filtered.length === 0 ? 0.6 : 1,
                transition: 'all 0.2s',
              }}
            >
              Export CSV ({filtered.length})
            </button>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: '0.75rem'
        }}>
          {/* Search Bar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 500 }}>Search Keyword / URL / Title</label>
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-focus"
              style={inputStyle}
            />
          </div>

          {/* Domain Dropdown Filter */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 500 }}>Competitor Domain</label>
            <select
              value={domainFilter}
              onChange={(e) => setDomainFilter(e.target.value)}
              className="input-focus"
              style={selectStyle}
            >
              <option value="All">All Domains</option>
              {uniqueDomains.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {/* Min Traffic */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 500 }}>Min Traffic</label>
            <input
              type="number"
              placeholder="e.g. 1000"
              value={minTraffic}
              min={0}
              onChange={(e) => setMinTraffic(e.target.value === '' ? '' : Number(e.target.value))}
              className="input-focus"
              style={inputStyle}
            />
          </div>

          {/* Min Keywords */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 500 }}>Min Keywords</label>
            <input
              type="number"
              placeholder="e.g. 50"
              value={minKeywords}
              min={0}
              onChange={(e) => setMinKeywords(e.target.value === '' ? '' : Number(e.target.value))}
              className="input-focus"
              style={inputStyle}
            />
          </div>

          {/* Min Opportunity Score */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 500 }}>Min Opportunity Score</label>
            <input
              type="number"
              placeholder="e.g. 70"
              value={minOpportunity}
              min={0}
              max={100}
              onChange={(e) => setMinOpportunity(e.target.value === '' ? '' : Number(e.target.value))}
              className="input-focus"
              style={inputStyle}
            />
          </div>

          {/* Tag Filter */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 500 }}>Tag & Status</label>
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value as Tag | 'All' | 'Untagged')}
              className="input-focus"
              style={selectStyle}
            >
              <option value="All">All Tags</option>
              <option value="Untagged">Untagged</option>
              {TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Loading state */}
      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>Loading top competitor pages…</div>
      ) : displayedPages.length === 0 ? (
        selectedSite ? (
          <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>
            No competitor pages match the active project/site.
          </div>
        ) : (
          <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>
            No competitor pages yet. <a href="/upload" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Upload a top pages CSV</a> to get started.
          </div>
        )
      ) : (
        <>
          {/* Bulk Actions Panel */}
          {selectedRowIds.size > 0 && (
            <div style={{
              background: 'rgba(99, 102, 241, 0.08)',
              border: '1px solid var(--accent)',
              borderRadius: '8px',
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem',
              animation: 'fadeIn 0.2s'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                  {selectedRowIds.size} {selectedRowIds.size === 1 ? 'page' : 'pages'} selected.
                </span>
                {!isAllPageRowsSelected && filtered.length > pageRows.length && (
                  <button
                    onClick={selectAllFiltered}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent)',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: 0,
                      textDecoration: 'underline'
                    }}
                  >
                    Select all {filtered.length} filtered pages
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Apply Tag:</span>
                {(['Money Page', 'Blog Post', 'Link Bait', 'Ignore'] as Tag[]).map((t) => (
                  <button
                    key={t}
                    disabled={isSaving}
                    onClick={() => handleBulkTag(t)}
                    style={{
                      background: 'var(--card)',
                      border: `1px solid ${TAG_COLORS[t]}55`,
                      borderRadius: '4px',
                      padding: '0.25rem 0.5rem',
                      color: TAG_COLORS[t],
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      cursor: isSaving ? 'not-allowed' : 'pointer',
                      opacity: isSaving ? 0.6 : 1,
                      transition: 'all 0.2s',
                    }}
                  >
                    {t}
                  </button>
                ))}
                <button
                  disabled={isSaving}
                  onClick={() => handleBulkTag(undefined)}
                  style={{
                    background: 'var(--card)',
                    border: '1px solid var(--card-border)',
                    borderRadius: '4px',
                    padding: '0.25rem 0.5rem',
                    color: 'var(--muted)',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                  }}
                >
                  Clear Tag
                </button>
                <div style={{ width: '1px', height: '14px', background: 'var(--card-border)', margin: '0 0.25rem' }}></div>
                <button
                  onClick={clearSelection}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--muted)',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  Deselect All
                </button>
                {isSaving && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontStyle: 'italic', marginLeft: '0.5rem' }}>Saving changes...</span>
                )}
              </div>
            </div>
          )}

          {/* Core Table View */}
          <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--card-border)', background: 'var(--card)', marginBottom: '1rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--card-border)', background: 'var(--table-header)' }}>
                  {/* Select Header */}
                  <th style={{ width: '40px', padding: '0.6rem 0.875rem', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={isAllPageRowsSelected}
                      ref={(el) => {
                        if (el) {
                          el.indeterminate = isAnyPageRowsSelected && !isAllPageRowsSelected;
                        }
                      }}
                      onChange={handleHeaderCheckboxChange}
                      style={{ cursor: 'pointer' }}
                    />
                  </th>
                  {/* Domain Header */}
                  <th
                    onClick={() => handleSort('domain')}
                    className="clickable-header"
                    style={thStyle('domain')}
                  >
                    Domain {sortCol === 'domain' && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                  {/* URL Header */}
                  <th
                    onClick={() => handleSort('url')}
                    className="clickable-header"
                    style={thStyle('url')}
                  >
                    URL {sortCol === 'url' && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                  {/* Title Header */}
                  <th
                    onClick={() => handleSort('title')}
                    className="clickable-header"
                    style={thStyle('title')}
                  >
                    Title {sortCol === 'title' && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                  {/* Traffic Header */}
                  <th
                    onClick={() => handleSort('traffic')}
                    className="clickable-header"
                    style={thStyle('traffic')}
                  >
                    Traffic {sortCol === 'traffic' && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                  {/* Traffic Share Header */}
                  <th
                    onClick={() => handleSort('trafficShare')}
                    className="clickable-header"
                    style={thStyle('trafficShare')}
                  >
                    Share % {sortCol === 'trafficShare' && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                  {/* Keywords Header */}
                  <th
                    onClick={() => handleSort('keywords')}
                    className="clickable-header"
                    style={thStyle('keywords')}
                  >
                    Keywords {sortCol === 'keywords' && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                  {/* Opportunity Score Header */}
                  <th
                    onClick={() => handleSort('opportunityScore')}
                    className="clickable-header"
                    style={thStyle('opportunityScore')}
                  >
                    Score {sortCol === 'opportunityScore' && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                  {/* Tag Selector Header */}
                  <th style={{ ...thStyle(null), cursor: 'default' }}>
                    Tag
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, i) => {
                  const isSelected = selectedRowIds.has(row.id);
                  return (
                    <tr
                      key={row.id}
                      style={{
                        borderBottom: '1px solid var(--card-border)',
                        background: isSelected
                          ? 'rgba(99, 102, 241, 0.08)'
                          : i % 2 === 0 ? 'transparent' : 'var(--row-alt)',
                        transition: 'background 0.2s',
                      }}
                      className="hover-row"
                    >
                      {/* Checkbox */}
                      <td style={{ padding: '0.55rem 0.875rem', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRowSelection(row.id)}
                          style={{ cursor: 'pointer' }}
                        />
                      </td>

                      {/* Domain */}
                      <td style={{ padding: '0.55rem 0.875rem', color: 'var(--foreground)', whiteSpace: 'nowrap' }}>
                        {row.domain}
                      </td>

                      {/* URL (External Link) */}
                      <td style={{ padding: '0.55rem 0.875rem', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <a
                          href={row.url.startsWith('http') ? row.url : `https://${row.url}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: '0.8rem' }}
                        >
                          {row.url.replace(/^https?:\/\//, '').slice(0, 60)}
                        </a>
                      </td>

                      {/* Title */}
                      <td style={{ padding: '0.55rem 0.875rem', color: 'var(--foreground)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.title}>
                        {row.title ?? '-'}
                      </td>

                      {/* Traffic */}
                      <td style={{ padding: '0.55rem 0.875rem', color: 'var(--foreground)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {row.traffic?.toLocaleString() ?? '-'}
                      </td>

                      {/* Traffic Share % */}
                      <td style={{ padding: '0.55rem 0.875rem', color: 'var(--foreground)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {row.trafficShare != null ? `${row.trafficShare.toFixed(2)}%` : '-'}
                      </td>

                      {/* Keywords */}
                      <td style={{ padding: '0.55rem 0.875rem', color: 'var(--foreground)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {row.keywords?.toLocaleString() ?? '-'}
                      </td>

                      {/* Opportunity Score */}
                      <td style={{ padding: '0.55rem 0.875rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <ScoreBadge score={row.opportunityScore ?? 0} />
                      </td>

                      {/* Tag Selector */}
                      <td style={{ padding: '0.55rem 0.875rem' }}>
                        <select
                          value={row.tag ?? ''}
                          onChange={(e) => handleTagChange(row.id, (e.target.value as Tag) || undefined)}
                          style={{
                            background: row.tag ? TAG_COLORS[row.tag] + '22' : 'var(--card)',
                            border: `1px solid ${row.tag ? TAG_COLORS[row.tag] : 'var(--card-border)'}`,
                            borderRadius: '4px',
                            padding: '0.2rem 0.4rem',
                            color: row.tag ? TAG_COLORS[row.tag] : 'var(--muted)',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            outline: 'none',
                          }}
                        >
                          <option value="">— No tag —</option>
                          {TAGS.map((t) => (
                            <option key={t} value={t} style={{ background: 'var(--card)', color: TAG_COLORS[t] }}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'flex-end', fontSize: '0.82rem' }}>
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                style={{
                  padding: '0.3rem 0.75rem',
                  background: 'var(--card)',
                  border: '1px solid var(--card-border)',
                  borderRadius: '5px',
                  color: 'var(--foreground)',
                  cursor: page === 0 ? 'not-allowed' : 'pointer',
                  opacity: page === 0 ? 0.4 : 1
                }}
              >
                ← Prev
              </button>
              <span style={{ color: 'var(--muted)' }}>
                Page {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                style={{
                  padding: '0.3rem 0.75rem',
                  background: 'var(--card)',
                  border: '1px solid var(--card-border)',
                  borderRadius: '5px',
                  color: 'var(--foreground)',
                  cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer',
                  opacity: page >= totalPages - 1 ? 0.4 : 1
                }}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
