'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { updateStore, getSelectedSite, filterRowsBySite, siteSelectionLabel, type SiteSelection, subscribeProjectScopeChange } from '@/lib/storage';
import * as db from '@/lib/db';
import type { BacklinkRecord, Tag } from '@/lib/types';
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

function getDomainFromUrl(url: string): string {
  if (!url) return '';
  try {
    const cleanUrl = url.startsWith('http') ? url : `https://${url}`;
    const urlObj = new URL(cleanUrl);
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    const match = url.match(/^(?:https?:\/\/)?(?:www\.)?([^:\/\s]+)/i);
    return match ? match[1] : url;
  }
}

function MiniCard({ title, value, color, accent }: { title: string; value: number | string; color?: string; accent?: boolean }) {
  return (
    <div
      style={{
        flex: '1 1 140px',
        background: 'var(--card)',
        border: `1px solid ${accent ? 'var(--accent)' : 'var(--card-border)'}`,
        borderRadius: '8px',
        padding: '1rem 1.25rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {title}
      </div>
      <div style={{ fontSize: '1.4rem', fontWeight: 700, color: color || (accent ? 'var(--accent)' : 'var(--foreground)'), lineHeight: 1.1 }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </div>
  );
}

export default function BacklinksPage() {
  const [rows, setRows] = useState<BacklinkRecord[]>([]);
  const [selectedSite, setSelectedSite] = useState<SiteSelection>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [domainFilter, setDomainFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'dofollow' | 'nofollow'>('all');
  const [scoreThreshold, setScoreThreshold] = useState<number>(0);
  const [authorityThreshold, setAuthorityThreshold] = useState<number>(0);
  const [tagFilter, setTagFilter] = useState<string>('All');

  // Sorting
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Pagination
  const [page, setPage] = useState(0);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelectedSite(getSelectedSite());
    db.getBacklinks().then(setRows).finally(() => setLoading(false));

    const unsubscribe = subscribeProjectScopeChange(() => {
      setSelectedSite(getSelectedSite());
    });
    return () => unsubscribe();
  }, []);

  // Clear selection when site scope changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [selectedSite]);

  const handleTagChange = useCallback(async (id: string, tag: Tag | undefined) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, tag } : r)));
    updateStore((s) => ({ ...s, backlinks: s.backlinks.map((r) => (r.id === id ? { ...r, tag } : r)) }));
    await db.updateTag('backlinks', id, tag);
  }, []);

  const handleBulkTagChange = useCallback(async (ids: string[], tag: Tag | undefined) => {
    setRows((prev) => prev.map((r) => ids.includes(r.id) ? { ...r, tag } : r));
    updateStore((s) => ({ ...s, backlinks: s.backlinks.map((r) => ids.includes(r.id) ? { ...r, tag } : r) }));
    await Promise.all(ids.map(id => db.updateTag('backlinks', id, tag)));
    setSelectedIds(new Set());
  }, []);

  const handleClearFilters = useCallback(() => {
    setSearch('');
    setDomainFilter('');
    setTypeFilter('all');
    setScoreThreshold(0);
    setAuthorityThreshold(0);
    setTagFilter('All');
    setPage(0);
  }, []);

  const displayedBacklinks = useMemo(() => {
    return filterRowsBySite(rows, selectedSite);
  }, [rows, selectedSite]);

  // Filter and sort matching backlinks
  const filteredBacklinks = useMemo(() => {
    let result = displayedBacklinks;

    // 1. Search filter
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(r =>
        (r.sourceUrl && r.sourceUrl.toLowerCase().includes(q)) ||
        (r.targetUrl && r.targetUrl.toLowerCase().includes(q)) ||
        (r.anchorText && r.anchorText.toLowerCase().includes(q))
      );
    }

    // 2. Domain filter
    if (domainFilter) {
      const q = domainFilter.toLowerCase();
      result = result.filter(r => getDomainFromUrl(r.sourceUrl).toLowerCase().includes(q));
    }

    // 3. Type filter
    if (typeFilter === 'dofollow') {
      result = result.filter(r => r.doFollow === true);
    } else if (typeFilter === 'nofollow') {
      result = result.filter(r => r.doFollow === false);
    }

    // 4. Score threshold
    if (scoreThreshold > 0) {
      result = result.filter(r => (r.opportunityScore ?? 0) >= scoreThreshold);
    }

    // 5. Authority threshold
    if (authorityThreshold > 0) {
      result = result.filter(r => (r.domainAuthority ?? r.domainRating ?? 0) >= authorityThreshold);
    }

    // 6. Tag/status filter
    if (tagFilter === 'Untagged') {
      result = result.filter(r => !r.tag);
    } else if (tagFilter !== 'All') {
      result = result.filter(r => r.tag === tagFilter);
    }

    // 7. Sort
    if (sortCol) {
      result = [...result].sort((a, b) => {
        let av: string | number = '';
        let bv: string | number = '';

        if (sortCol === 'sourceUrl') {
          av = a.sourceUrl;
          bv = b.sourceUrl;
        } else if (sortCol === 'targetUrl') {
          av = a.targetUrl;
          bv = b.targetUrl;
        } else if (sortCol === 'anchorText') {
          av = a.anchorText ?? '';
          bv = b.anchorText ?? '';
        } else if (sortCol === 'domainAuthority') {
          av = a.domainAuthority ?? a.domainRating ?? 0;
          bv = b.domainAuthority ?? b.domainRating ?? 0;
        } else if (sortCol === 'doFollow') {
          av = a.doFollow ? 1 : 0;
          bv = b.doFollow ? 1 : 0;
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
  }, [displayedBacklinks, search, domainFilter, typeFilter, scoreThreshold, authorityThreshold, tagFilter, sortCol, sortDir]);

  // Domain Intelligence Section grouping (based on filtered backlink list)
  const domainIntelList = useMemo(() => {
    const groups: Record<string, {
      domain: string;
      total: number;
      dofollow: number;
      authSum: number;
      authCount: number;
      scoreSum: number;
      scoreCount: number;
      targets: number;
      ignored: number;
    }> = {};

    for (const r of filteredBacklinks) {
      const dom = getDomainFromUrl(r.sourceUrl);
      if (!groups[dom]) {
        groups[dom] = {
          domain: dom,
          total: 0,
          dofollow: 0,
          authSum: 0,
          authCount: 0,
          scoreSum: 0,
          scoreCount: 0,
          targets: 0,
          ignored: 0
        };
      }
      const g = groups[dom];
      g.total += 1;
      if (r.doFollow) {
        g.dofollow += 1;
      }
      const auth = r.domainAuthority ?? r.domainRating;
      if (auth !== undefined && auth !== null) {
        g.authSum += auth;
        g.authCount += 1;
      }
      if (r.opportunityScore !== undefined && r.opportunityScore !== null) {
        g.scoreSum += r.opportunityScore;
        g.scoreCount += 1;
      }
      if (r.tag === 'Backlink Target') {
        g.targets += 1;
      } else if (r.tag === 'Ignore') {
        g.ignored += 1;
      }
    }

    return Object.values(groups)
      .map(g => ({
        domain: g.domain,
        total: g.total,
        dofollow: g.dofollow,
        avgAuth: g.authCount > 0 ? Math.round(g.authSum / g.authCount) : 0,
        avgScore: g.scoreCount > 0 ? Math.round(g.scoreSum / g.scoreCount) : 0,
        targets: g.targets,
        ignored: g.ignored
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [filteredBacklinks]);

  // CSV Export
  const handleExportCsv = useCallback(() => {
    const headers = [
      'Source URL',
      'Target URL',
      'Anchor Text',
      'Domain Authority',
      'DoFollow',
      'Opportunity Score',
      'Tag',
      'Domain',
      'Location',
      'Niche'
    ];

    const escapeCsv = (val: unknown): string => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvRows = filteredBacklinks.map((r) => {
      const auth = r.domainAuthority ?? r.domainRating ?? '';
      const domainVal = r.raw?.domain ?? r.raw?.Domain ?? '';
      const locationVal = r.raw?.location ?? r.raw?.Location ?? '';
      const nicheVal = r.raw?.niche ?? r.raw?.Niche ?? '';

      return [
        r.sourceUrl,
        r.targetUrl,
        r.anchorText ?? '',
        auth,
        r.doFollow ? 'TRUE' : 'FALSE',
        r.opportunityScore ?? '',
        r.tag ?? '',
        domainVal,
        locationVal,
        nicheVal
      ].map(escapeCsv).join(',');
    });

    const csvContent = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `backlink_prospects_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [filteredBacklinks]);

  // KPI Calculations
  const totalBacklinks = displayedBacklinks.length;
  const dofollowCount = displayedBacklinks.filter((r) => r.doFollow).length;
  const referringDomainsCount = useMemo(() => {
    const domains = displayedBacklinks.map(r => getDomainFromUrl(r.sourceUrl));
    return new Set(domains).size;
  }, [displayedBacklinks]);
  const avgDA = displayedBacklinks.length
    ? Math.round(displayedBacklinks.reduce((s, r) => s + (r.domainAuthority ?? r.domainRating ?? 0), 0) / displayedBacklinks.length)
    : 0;
  const highOpportunityCount = displayedBacklinks.filter((r) => (r.opportunityScore ?? 0) >= 70).length;
  const taggedTargetsCount = displayedBacklinks.filter((r) => r.tag === 'Backlink Target').length;
  const ignoredCount = displayedBacklinks.filter((r) => r.tag === 'Ignore').length;

  // Pagination bounds
  const pageSize = 50;
  const totalPages = Math.ceil(filteredBacklinks.length / pageSize);
  const currentPage = Math.max(0, Math.min(page, Math.max(0, totalPages - 1)));
  const pageRows = useMemo(() => {
    return filteredBacklinks.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  }, [filteredBacklinks, currentPage, pageSize]);

  const handleSort = (key: string) => {
    if (sortCol === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(key);
      setSortDir('desc');
    }
    setPage(0);
  };

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

      {/* KPI Cards Grid */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <MiniCard title="Total Backlinks" value={totalBacklinks} />
        <MiniCard title="Referring Domains" value={referringDomainsCount} />
        <MiniCard title="DoFollow" value={dofollowCount} color="var(--success)" />
        <MiniCard title="Avg DA/DR" value={avgDA} />
        <MiniCard title="High Opportunity" value={highOpportunityCount} color="#10b981" />
        <MiniCard title="Tagged Targets" value={taggedTargetsCount} color="var(--accent)" accent />
        <MiniCard title="Ignored" value={ignoredCount} color="var(--muted)" />
      </div>

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
      ) : rows.length === 0 ? (
        /* Empty State 1: No backlinks in DB */
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--card-border)',
          borderRadius: '10px',
          padding: '3.5rem 2rem',
          textAlign: 'center',
          color: 'var(--muted)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1rem',
        }}>
          <div style={{ fontSize: '2.5rem' }}>🔗</div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--foreground)' }}>No backlinks found in database</h3>
          <p style={{ maxWidth: '400px', fontSize: '0.85rem', margin: '0 auto' }}>
            You haven't uploaded any backlink profile records yet. Import your first dataset to start auditing and acquiring links.
          </p>
          <a
            href="/upload"
            style={{
              background: 'var(--accent)',
              color: '#fff',
              textDecoration: 'none',
              borderRadius: '6px',
              padding: '0.5rem 1rem',
              fontSize: '0.85rem',
              fontWeight: 600,
              marginTop: '0.5rem',
            }}
          >
            Upload Backlink CSV
          </a>
        </div>
      ) : displayedBacklinks.length === 0 ? (
        /* Empty State 2: No project-scoped matches */
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--card-border)',
          borderRadius: '10px',
          padding: '3.5rem 2rem',
          textAlign: 'center',
          color: 'var(--muted)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1rem',
        }}>
          <div style={{ fontSize: '2.5rem' }}>📁</div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--foreground)' }}>No backlinks for active project</h3>
          <p style={{ maxWidth: '400px', fontSize: '0.85rem', margin: '0 auto' }}>
            There are no backlinks associated with the domain <strong>{siteSelectionLabel(selectedSite)}</strong>.
          </p>
          <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
            Try switching to another project, selecting "All Projects", or uploading backlinks for this project.
          </div>
        </div>
      ) : (
        <>
          {/* Domain Intelligence Section */}
          <div style={{
            background: 'var(--card)',
            border: '1px solid var(--card-border)',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--foreground)' }}>Domain Intelligence</h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Top Referring Domains by Volume</span>
            </div>

            {domainIntelList.length === 0 ? (
              <div style={{ fontSize: '0.8rem', color: 'var(--muted)', textAlign: 'center', padding: '0.5rem' }}>
                No domain intelligence data available.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--card-border)', color: 'var(--muted)' }}>
                      <th style={{ padding: '0.3rem 0.5rem', fontWeight: 500 }}>Referring Domain</th>
                      <th style={{ padding: '0.3rem 0.5rem', fontWeight: 500, textAlign: 'right' }}>Backlinks</th>
                      <th style={{ padding: '0.3rem 0.5rem', fontWeight: 500, textAlign: 'right' }}>DoFollow</th>
                      <th style={{ padding: '0.3rem 0.5rem', fontWeight: 500, textAlign: 'right' }}>Avg Auth</th>
                      <th style={{ padding: '0.3rem 0.5rem', fontWeight: 500, textAlign: 'right' }}>Avg Score</th>
                      <th style={{ padding: '0.3rem 0.5rem', fontWeight: 500, textAlign: 'right' }}>Targets / Ignored</th>
                    </tr>
                  </thead>
                  <tbody>
                    {domainIntelList.map((d, idx) => (
                      <tr key={idx} style={{ borderBottom: idx === domainIntelList.length - 1 ? 'none' : '1px solid var(--card-border)' }}>
                        <td style={{ padding: '0.4rem 0.5rem', fontWeight: 600, color: 'var(--foreground)' }}>{d.domain}</td>
                        <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>{d.total}</td>
                        <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: d.dofollow > 0 ? 'var(--success)' : 'var(--muted)' }}>{d.dofollow}</td>
                        <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>{d.avgAuth || '-'}</td>
                        <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>
                          {d.avgScore ? <ScoreBadge score={d.avgScore} /> : '-'}
                        </td>
                        <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: 'var(--muted)' }}>
                          <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{d.targets}</span>
                          {' / '}
                          <span style={{ color: 'var(--muted)' }}>{d.ignored}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Compact Filter Control Bar */}
          <div style={{
            background: 'var(--card)',
            border: '1px solid var(--card-border)',
            borderRadius: '8px',
            padding: '0.85rem 1rem',
            marginBottom: '1rem',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.75rem',
            alignItems: 'flex-end',
          }}>
            {/* Search Query */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '150px', flex: '1 1 150px' }}>
              <label style={{ fontSize: '0.7rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>Search</label>
              <input
                type="text"
                placeholder="Search URLs, anchor..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                style={{
                  background: 'var(--background)',
                  border: '1px solid var(--card-border)',
                  borderRadius: '6px',
                  padding: '0.4rem 0.6rem',
                  color: 'var(--foreground)',
                  fontSize: '0.8rem',
                  outline: 'none',
                  width: '100%',
                }}
              />
            </div>

            {/* Domain Filter */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '130px', flex: '1 1 130px' }}>
              <label style={{ fontSize: '0.7rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>Domain</label>
              <input
                type="text"
                placeholder="e.g. Forbes.com"
                value={domainFilter}
                onChange={(e) => { setDomainFilter(e.target.value); setPage(0); }}
                style={{
                  background: 'var(--background)',
                  border: '1px solid var(--card-border)',
                  borderRadius: '6px',
                  padding: '0.4rem 0.6rem',
                  color: 'var(--foreground)',
                  fontSize: '0.8rem',
                  outline: 'none',
                  width: '100%',
                }}
              />
            </div>

            {/* Type Filter */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '100px', flex: '1 1 100px' }}>
              <label style={{ fontSize: '0.7rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>Link Type</label>
              <select
                value={typeFilter}
                onChange={(e) => { setTypeFilter(e.target.value as 'all' | 'dofollow' | 'nofollow'); setPage(0); }}
                style={{
                  background: 'var(--background)',
                  border: '1px solid var(--card-border)',
                  borderRadius: '6px',
                  padding: '0.4rem 0.6rem',
                  color: 'var(--foreground)',
                  fontSize: '0.8rem',
                  outline: 'none',
                  width: '100%',
                  cursor: 'pointer'
                }}
              >
                <option value="all">All Links</option>
                <option value="dofollow">DoFollow</option>
                <option value="nofollow">NoFollow</option>
              </select>
            </div>

            {/* Score Threshold */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '80px', flex: '1 1 80px' }}>
              <label style={{ fontSize: '0.7rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>Min Score</label>
              <input
                type="number"
                min={0}
                max={100}
                value={scoreThreshold || ''}
                onChange={(e) => {
                  const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                  setScoreThreshold(isNaN(val) ? 0 : val);
                  setPage(0);
                }}
                placeholder="0"
                style={{
                  background: 'var(--background)',
                  border: '1px solid var(--card-border)',
                  borderRadius: '6px',
                  padding: '0.4rem 0.6rem',
                  color: 'var(--foreground)',
                  fontSize: '0.8rem',
                  outline: 'none',
                  width: '100%',
                }}
              />
            </div>

            {/* Authority Threshold */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '80px', flex: '1 1 80px' }}>
              <label style={{ fontSize: '0.7rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>Min DA/DR</label>
              <input
                type="number"
                min={0}
                max={100}
                value={authorityThreshold || ''}
                onChange={(e) => {
                  const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                  setAuthorityThreshold(isNaN(val) ? 0 : val);
                  setPage(0);
                }}
                placeholder="0"
                style={{
                  background: 'var(--background)',
                  border: '1px solid var(--card-border)',
                  borderRadius: '6px',
                  padding: '0.4rem 0.6rem',
                  color: 'var(--foreground)',
                  fontSize: '0.8rem',
                  outline: 'none',
                  width: '100%',
                }}
              />
            </div>

            {/* Tag Filter */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '120px', flex: '1 1 120px' }}>
              <label style={{ fontSize: '0.7rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>Tag Status</label>
              <select
                value={tagFilter}
                onChange={(e) => { setTagFilter(e.target.value); setPage(0); }}
                style={{
                  background: 'var(--background)',
                  border: '1px solid var(--card-border)',
                  borderRadius: '6px',
                  padding: '0.4rem 0.6rem',
                  color: 'var(--foreground)',
                  fontSize: '0.8rem',
                  outline: 'none',
                  width: '100%',
                  cursor: 'pointer'
                }}
              >
                <option value="All">All Tags</option>
                <option value="Untagged">Untagged</option>
                {TAGS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
              <button
                onClick={handleExportCsv}
                style={{
                  background: 'var(--card-border)',
                  border: '1px solid var(--card-border)',
                  borderRadius: '6px',
                  padding: '0.45rem 0.8rem',
                  color: 'var(--foreground)',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Export CSV
              </button>
              <button
                onClick={handleClearFilters}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--card-border)',
                  borderRadius: '6px',
                  padding: '0.45rem 0.8rem',
                  color: 'var(--muted)',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                }}
              >
                Clear
              </button>
            </div>
          </div>

          {/* Table Area */}
          {filteredBacklinks.length === 0 ? (
            /* Empty State 3: Filtered out everything */
            <div style={{
              background: 'var(--card)',
              border: '1px solid var(--card-border)',
              borderRadius: '10px',
              padding: '3.5rem 2rem',
              textAlign: 'center',
              color: 'var(--muted)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1rem',
              marginTop: '1rem'
            }}>
              <div style={{ fontSize: '2.5rem' }}>🔍</div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--foreground)' }}>No prospects match filters</h3>
              <p style={{ maxWidth: '400px', fontSize: '0.85rem', margin: '0 auto' }}>
                We found {displayedBacklinks.length} backlink opportunities in this project scope, but none match your active filter settings.
              </p>
              <button
                onClick={handleClearFilters}
                style={{
                  background: 'var(--accent)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '0.5rem 1rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  marginTop: '0.5rem',
                }}
              >
                Reset Active Filters
              </button>
            </div>
          ) : (
            <>
              {/* Bulk Actions Panel */}
              {selectedIds.size > 0 && (
                <div style={{
                  background: 'var(--card)',
                  border: '1px solid var(--accent)',
                  borderRadius: '8px',
                  padding: '0.75rem 1rem',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.75rem'
                }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                    {selectedIds.size} prospect{selectedIds.size === 1 ? '' : 's'} selected
                    {selectedIds.size < filteredBacklinks.length && (
                      <button
                        onClick={() => setSelectedIds(new Set(filteredBacklinks.map(r => r.id)))}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--accent)',
                          textDecoration: 'underline',
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          padding: 0,
                          marginLeft: '0.75rem'
                        }}
                      >
                        Select all {filteredBacklinks.length} matching prospects
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => handleBulkTagChange(Array.from(selectedIds), 'Backlink Target')}
                      style={{
                        background: 'var(--accent)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '0.4rem 0.8rem',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        fontWeight: 600
                      }}
                    >
                      Tag as Target
                    </button>
                    <button
                      onClick={() => handleBulkTagChange(Array.from(selectedIds), 'Ignore')}
                      style={{
                        background: '#374151',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '0.4rem 0.8rem',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        fontWeight: 600
                      }}
                    >
                      Tag Ignore
                    </button>
                    <button
                      onClick={() => handleBulkTagChange(Array.from(selectedIds), undefined)}
                      style={{
                        background: 'transparent',
                        color: 'var(--foreground)',
                        border: '1px solid var(--card-border)',
                        borderRadius: '6px',
                        padding: '0.4rem 0.8rem',
                        fontSize: '0.8rem',
                        cursor: 'pointer'
                      }}
                    >
                      Clear Tags
                    </button>
                    <button
                      onClick={() => setSelectedIds(new Set())}
                      style={{
                        background: 'transparent',
                        color: 'var(--muted)',
                        border: 'none',
                        padding: '0.4rem 0.5rem',
                        fontSize: '0.8rem',
                        cursor: 'pointer'
                      }}
                    >
                      Deselect All
                    </button>
                  </div>
                </div>
              )}

              {/* Data Table */}
              <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--card-border)', background: 'var(--card)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--card-border)', background: 'var(--table-header)' }}>
                      {/* Checkbox Header */}
                      <th style={{ padding: '0.6rem 0.875rem', width: '40px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={pageRows.length > 0 && pageRows.every(r => selectedIds.has(r.id))}
                          onChange={(e) => {
                            const newSelected = new Set(selectedIds);
                            if (e.target.checked) {
                              pageRows.forEach(r => newSelected.add(r.id));
                            } else {
                              pageRows.forEach(r => newSelected.delete(r.id));
                            }
                            setSelectedIds(newSelected);
                          }}
                          style={{ cursor: 'pointer' }}
                        />
                      </th>

                      {/* Sortable Column Headers */}
                      <th
                        onClick={() => handleSort('sourceUrl')}
                        style={{
                          padding: '0.6rem 0.875rem',
                          textAlign: 'left',
                          color: 'var(--muted)',
                          fontWeight: 600,
                          fontSize: '0.75rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          userSelect: 'none',
                        }}
                      >
                        Source URL {sortCol === 'sourceUrl' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                      </th>
                      <th
                        onClick={() => handleSort('targetUrl')}
                        style={{
                          padding: '0.6rem 0.875rem',
                          textAlign: 'left',
                          color: 'var(--muted)',
                          fontWeight: 600,
                          fontSize: '0.75rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          userSelect: 'none',
                        }}
                      >
                        Target URL {sortCol === 'targetUrl' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                      </th>
                      <th
                        onClick={() => handleSort('anchorText')}
                        style={{
                          padding: '0.6rem 0.875rem',
                          textAlign: 'left',
                          color: 'var(--muted)',
                          fontWeight: 600,
                          fontSize: '0.75rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          userSelect: 'none',
                        }}
                      >
                        Anchor Text {sortCol === 'anchorText' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                      </th>
                      <th
                        onClick={() => handleSort('domainAuthority')}
                        style={{
                          padding: '0.6rem 0.875rem',
                          textAlign: 'left',
                          color: 'var(--muted)',
                          fontWeight: 600,
                          fontSize: '0.75rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          userSelect: 'none',
                          width: '80px'
                        }}
                      >
                        DA {sortCol === 'domainAuthority' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                      </th>
                      <th
                        onClick={() => handleSort('doFollow')}
                        style={{
                          padding: '0.6rem 0.875rem',
                          textAlign: 'left',
                          color: 'var(--muted)',
                          fontWeight: 600,
                          fontSize: '0.75rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          userSelect: 'none',
                          width: '100px'
                        }}
                      >
                        Type {sortCol === 'doFollow' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                      </th>
                      <th
                        onClick={() => handleSort('opportunityScore')}
                        style={{
                          padding: '0.6rem 0.875rem',
                          textAlign: 'left',
                          color: 'var(--muted)',
                          fontWeight: 600,
                          fontSize: '0.75rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          userSelect: 'none',
                          width: '90px'
                        }}
                      >
                        Score {sortCol === 'opportunityScore' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                      </th>
                      <th
                        style={{
                          padding: '0.6rem 0.875rem',
                          textAlign: 'left',
                          color: 'var(--muted)',
                          fontWeight: 600,
                          fontSize: '0.75rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          whiteSpace: 'nowrap',
                          width: '160px'
                        }}
                      >
                        Tag
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row, i) => (
                      <tr
                        key={row.id}
                        style={{
                          borderBottom: '1px solid var(--card-border)',
                          background: i % 2 === 0 ? 'transparent' : 'var(--row-alt)',
                        }}
                      >
                        {/* Checkbox */}
                        <td style={{ padding: '0.55rem 0.875rem', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(row.id)}
                            onChange={(e) => {
                              const newSelected = new Set(selectedIds);
                              if (e.target.checked) {
                                newSelected.add(row.id);
                              } else {
                                newSelected.delete(row.id);
                              }
                              setSelectedIds(newSelected);
                            }}
                            style={{ cursor: 'pointer' }}
                          />
                        </td>

                        {/* Source URL Link */}
                        <td style={{ padding: '0.55rem 0.875rem', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <a
                            href={row.sourceUrl.startsWith('http') ? row.sourceUrl : `https://${row.sourceUrl}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: '0.8rem' }}
                          >
                            {row.sourceUrl.replace(/^https?:\/\//, '').slice(0, 50)}
                          </a>
                        </td>

                        {/* Target URL */}
                        <td style={{ padding: '0.55rem 0.875rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                            {row.targetUrl.replace(/^https?:\/\//, '').slice(0, 40)}
                          </span>
                        </td>

                        {/* Anchor Text */}
                        <td style={{ padding: '0.55rem 0.875rem', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--foreground)' }}>
                          {row.anchorText ?? '-'}
                        </td>

                        {/* DA */}
                        <td style={{ padding: '0.55rem 0.875rem', color: 'var(--foreground)' }}>
                          {row.domainAuthority ?? row.domainRating ?? '-'}
                        </td>

                        {/* Type */}
                        <td style={{ padding: '0.55rem 0.875rem' }}>
                          <span style={{ fontSize: '0.75rem', color: row.doFollow ? 'var(--success)' : 'var(--muted)', fontWeight: 600 }}>
                            {row.doFollow ? 'DoFollow' : 'NoFollow'}
                          </span>
                        </td>

                        {/* Score */}
                        <td style={{ padding: '0.55rem 0.875rem' }}>
                          <ScoreBadge score={row.opportunityScore ?? 0} />
                        </td>

                        {/* Tag select dropdown */}
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
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'flex-end', fontSize: '0.82rem', marginTop: '0.75rem' }}>
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={currentPage === 0}
                    style={{
                      padding: '0.3rem 0.75rem',
                      background: 'var(--card)',
                      border: '1px solid var(--card-border)',
                      borderRadius: '5px',
                      color: 'var(--foreground)',
                      cursor: currentPage === 0 ? 'not-allowed' : 'pointer',
                      opacity: currentPage === 0 ? 0.4 : 1
                    }}
                  >
                    ← Prev
                  </button>
                  <span style={{ color: 'var(--muted)' }}>
                    Page {currentPage + 1} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={currentPage >= totalPages - 1}
                    style={{
                      padding: '0.3rem 0.75rem',
                      background: 'var(--card)',
                      border: '1px solid var(--card-border)',
                      borderRadius: '5px',
                      color: 'var(--foreground)',
                      cursor: currentPage >= totalPages - 1 ? 'not-allowed' : 'pointer',
                      opacity: currentPage >= totalPages - 1 ? 0.4 : 1
                    }}
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
