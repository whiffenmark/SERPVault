'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { updateStore, getSelectedSite, filterRowsBySite, siteSelectionLabel, getSelectedProjectId, type SiteSelection, subscribeProjectScopeChange } from '@/lib/storage';
import * as db from '@/lib/db';
import type { CompetitorPageRecord, KeywordGapRecord, BacklinkRecord, ReferringDomainRecord, CompetitorRecord, Tag } from '@/lib/types';
import { getCompetitorDomainSummaries, getDomainFromUrl } from '@/lib/competitive-intelligence';
import ScoreBadge from '@/components/ScoreBadge';
import Card from '@/components/Card';
import { getCompetitorPageOpportunityId, getKeywordGapOpportunityId } from '@/lib/opportunity-queue';
import { getOpportunityWorkflowMap, saveOpportunityWorkflowMap, STATUS_COLORS, type OpportunityWorkflowStatus } from '@/lib/opportunity-workflow';
import {
  Globe,
  ExternalLink,
  Link as LinkIcon,
  Search,
  Sparkles,
  Info,
  AlertTriangle,
  ArrowRight
} from 'lucide-react';

const TAGS: Tag[] = ['Money Page', 'Blog Post', 'City Page', 'Backlink Target', 'Link Bait', 'Ignore'];

const TAG_COLORS: Record<Tag, string> = {
  'Money Page': '#10b981',
  'Blog Post': '#6366f1',
  'City Page': '#f59e0b',
  'Backlink Target': '#3b82f6',
  'Link Bait': '#ec4899',
  Ignore: '#64748b',
};

export default function CompetitiveIntelligencePage() {
  const router = useRouter();
  const [selectedSite, setSelectedSite] = useState<SiteSelection>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [workflowMap, setWorkflowMap] = useState<Record<string, OpportunityWorkflowStatus>>({});

  // Raw database tables state
  const [competitorPages, setCompetitorPages] = useState<CompetitorPageRecord[]>([]);
  const [keywordGaps, setKeywordGaps] = useState<KeywordGapRecord[]>([]);
  const [backlinks, setBacklinks] = useState<BacklinkRecord[]>([]);
  const [referringDomains, setReferringDomains] = useState<ReferringDomainRecord[]>([]);
  const [projectCompetitors, setProjectCompetitors] = useState<CompetitorRecord[]>([]);

  // Workspace configuration state
  const [activeTab, setActiveTab] = useState<'summary' | 'pages' | 'gaps'>('summary');
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);

  // Competitor summaries filters
  const [summarySearch, setSummarySearch] = useState('');
  const [summaryChip, setSummaryChip] = useState<'All' | 'Content Gap' | 'Link Gap' | 'High Priority'>('All');

  // Top Pages filters
  const [pageSearch, setPageSearch] = useState('');
  const [pageTagFilter, setPageTagFilter] = useState<Tag | 'All'>('All');

  // Keyword Gaps filters
  const [gapSearch, setGapSearch] = useState('');

  // Load all DB data on mount
  useEffect(() => {
    setSelectedSite(getSelectedSite());
    setSelectedProjectId(getSelectedProjectId());
    setWorkflowMap(getOpportunityWorkflowMap());

    Promise.all([
      db.getCompetitorPages(),
      db.getKeywordGaps(),
      db.getBacklinks(),
      db.getReferringDomains(),
      db.getCompetitors(),
    ])
      .then(([pages, gaps, bls, rds, comps]) => {
        setCompetitorPages(pages);
        setKeywordGaps(gaps);
        setBacklinks(bls);
        setReferringDomains(rds);
        setProjectCompetitors(comps);
      })
      .finally(() => setLoading(false));

    const unsubscribe = subscribeProjectScopeChange((projectId) => {
      setSelectedSite(getSelectedSite());
      setSelectedProjectId(projectId);
    });
    return () => unsubscribe();
  }, []);

  // Tag editing handler for competitor pages
  const handleCpTagChange = useCallback(async (id: string, tag: Tag | undefined) => {
    setCompetitorPages((prev) => prev.map((p) => (p.id === id ? { ...p, tag } : p)));
    updateStore((s) => ({ ...s, competitorPages: s.competitorPages.map((p) => (p.id === id ? { ...p, tag } : p)) }));
    await db.updateTag('competitor_pages', id, tag);
  }, []);

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

  // Filter raw datasets by active Project / Site scope
  const displayedPages = useMemo(() => filterRowsBySite(competitorPages, selectedSite), [competitorPages, selectedSite]);
  const displayedGaps = useMemo(() => filterRowsBySite(keywordGaps, selectedSite), [keywordGaps, selectedSite]);
  const displayedBacklinks = useMemo(() => filterRowsBySite(backlinks, selectedSite), [backlinks, selectedSite]);
  const displayedRefDomains = useMemo(() => filterRowsBySite(referringDomains, selectedSite), [referringDomains, selectedSite]);

  // Scope projectCompetitors to the active project when selected. All Projects can include all configured competitors.
  const displayedProjectCompetitors = useMemo(() => {
    if (!selectedProjectId) {
      return projectCompetitors;
    }
    return projectCompetitors.filter((comp) => comp.projectId === selectedProjectId);
  }, [projectCompetitors, selectedProjectId]);

  // Aggregate into competitor domain summaries
  const competitors = useMemo(() => {
    return getCompetitorDomainSummaries({
      competitorPages: displayedPages,
      keywordGaps: displayedGaps,
      backlinks: displayedBacklinks,
      referringDomains: displayedRefDomains,
      projectCompetitors: displayedProjectCompetitors,
      activeProjectDomain: selectedSite?.domain,
    });
  }, [displayedPages, displayedGaps, displayedBacklinks, displayedRefDomains, displayedProjectCompetitors, selectedSite]);

  // Metrics calculations for top cards
  const metrics = useMemo(() => {
    const totalCompetitorsCount = competitors.length;
    const totalPagesCount = displayedPages.length;
    const totalTrafficSum = displayedPages.reduce((sum, r) => sum + (r.traffic ?? 0), 0);
    const totalGapsCount = displayedGaps.length;
    const totalProspectsCount = displayedBacklinks.length + displayedRefDomains.length;

    // High Priority Items: any entity (pages, gaps, or backlinks) with opportunityScore >= 80
    const highPriorityCount =
      displayedPages.filter((r) => (r.opportunityScore ?? 0) >= 80).length +
      displayedGaps.filter((r) => (r.opportunityScore ?? 0) >= 80).length +
      displayedBacklinks.filter((r) => (r.opportunityScore ?? 0) >= 80).length;

    return {
      competitorsCount: totalCompetitorsCount,
      pagesCount: totalPagesCount,
      trafficSum: totalTrafficSum,
      gapsCount: totalGapsCount,
      prospectsCount: totalProspectsCount,
      highPriority: highPriorityCount,
    };
  }, [competitors, displayedPages, displayedGaps, displayedBacklinks, displayedRefDomains]);

  // Filters competitor domain summaries
  const filteredCompetitors = useMemo(() => {
    return competitors.filter((comp) => {
      // Search matching
      const matchesSearch = comp.domain.toLowerCase().includes(summarySearch.toLowerCase());

      // Chip matching
      let matchesChip = true;
      if (summaryChip === 'Content Gap') {
        matchesChip = comp.gapKeywordCount > 0;
      } else if (summaryChip === 'Link Gap') {
        matchesChip = comp.backlinkProspectCount > 0 || comp.referringDomainCount > 0;
      } else if (summaryChip === 'High Priority') {
        matchesChip = comp.opportunityScore >= 70;
      }

      return matchesSearch && matchesChip;
    });
  }, [competitors, summarySearch, summaryChip]);

  // Filtered lists for Top Pages and Keyword Gaps panels based on selected domain and search terms
  const filteredPages = useMemo(() => {
    return displayedPages.filter((p) => {
      const isDomainMatch = !selectedDomain || getDomainFromUrl(p.domain) === selectedDomain || getDomainFromUrl(p.url) === selectedDomain;
      const isSearchMatch = !pageSearch || p.url.toLowerCase().includes(pageSearch.toLowerCase()) || (p.title && p.title.toLowerCase().includes(pageSearch.toLowerCase()));
      const isTagMatch = pageTagFilter === 'All' || p.tag === pageTagFilter;
      return isDomainMatch && isSearchMatch && isTagMatch;
    });
  }, [displayedPages, selectedDomain, pageSearch, pageTagFilter]);

  const filteredGaps = useMemo(() => {
    return displayedGaps.filter((g) => {
      const isDomainMatch = !selectedDomain || getDomainFromUrl(g.competitorDomain) === selectedDomain;
      const isSearchMatch = !gapSearch || g.keyword.toLowerCase().includes(gapSearch.toLowerCase());
      return isDomainMatch && isSearchMatch;
    });
  }, [displayedGaps, selectedDomain, gapSearch]);

  // Action suggestions mapping
  const getPageAction = useCallback((page: CompetitorPageRecord) => {
    if (page.tag === 'Ignore') return { text: 'None (Ignored)', color: 'var(--muted)' };
    const traffic = page.traffic ?? 0;
    const keywords = page.keywords ?? 0;
    const score = page.opportunityScore ?? 0;

    if (score >= 80 && traffic > 5000) {
      return { text: 'Build Competing Page', color: 'var(--danger)' };
    }
    if (score >= 60) {
      return { text: 'Improve Content', color: 'var(--warning)' };
    }
    if (keywords > 50) {
      return { text: 'Extract Keywords', color: 'var(--accent)' };
    }
    return { text: 'Monitor Performance', color: 'var(--success)' };
  }, []);

  const getGapAction = useCallback((gap: KeywordGapRecord) => {
    const diff = gap.difficulty ?? 0;
    const yourPos = gap.yourPosition ?? 0;

    if (yourPos === 0) {
      if (diff < 40) return { text: 'Create Content (Easy)', color: 'var(--success)' };
      return { text: 'Create Content (Hard)', color: 'var(--accent)' };
    }
    if (yourPos > 20) {
      return { text: 'Optimize Content', color: 'var(--warning)' };
    }
    if (yourPos > 10 && yourPos <= 20) {
      return { text: 'Build Links', color: 'var(--danger)' };
    }
    return { text: 'Monitor Position', color: 'var(--muted)' };
  }, []);

  // Recommendations generator
  const recommendationsList = useMemo(() => {
    const list: Array<{
      type: 'content' | 'link' | 'warning' | 'info';
      title: string;
      description: string;
      actionText: string;
      action: () => void;
    }> = [];

    if (competitors.length === 0 && !loading) {
      list.push({
        type: 'warning',
        title: 'Missing Competitor Data',
        description: 'You have not uploaded any competitor URLs, domain lists, or referring domains yet.',
        actionText: 'Go to Uploads',
        action: () => { router.push('/upload'); }
      });
    }

    // Insight: High traffic competitor with no gap keywords in database
    competitors.slice(0, 3).forEach((c) => {
      if (c.estTraffic > 5000 && c.gapKeywordCount === 0) {
        list.push({
          type: 'content',
          title: `Analyze Keyword Gap: ${c.domain}`,
          description: `${c.domain} drives an estimated ${c.estTraffic.toLocaleString()} monthly traffic, but has 0 gap keywords configured.`,
          actionText: 'Inspect Domain',
          action: () => {
            setSelectedDomain(c.domain);
            setActiveTab('summary');
          }
        });
      }
    });

    // Insight: Hub Pages with lots of keyword rankings
    displayedPages
      .filter((p) => (p.keywords ?? 0) > 80 && !p.tag)
      .slice(0, 2)
      .forEach((p) => {
        list.push({
          type: 'content',
          title: 'Unclassified Hub Page Found',
          description: `Competitor URL /${p.url.replace(/^https?:\/\//, '').split('/').slice(1).join('/') || p.url.slice(0, 25)} ranks for ${p.keywords} keywords.`,
          actionText: 'Review Top Pages',
          action: () => {
            setSelectedDomain(getDomainFromUrl(p.domain));
            setActiveTab('pages');
          }
        });
      });

    // Insight: Competitors with backlinks but no referring domains details
    competitors.slice(0, 3).forEach((c) => {
      if (c.backlinkProspectCount > 10 && c.referringDomainCount === 0) {
        list.push({
          type: 'link',
          title: `Extract Linking Domains for ${c.domain}`,
          description: `We found ${c.backlinkProspectCount} backlinks but no referring domain metrics for competitor ${c.domain}.`,
          actionText: 'Filter Domain',
          action: () => {
            setSelectedDomain(c.domain);
            setActiveTab('summary');
          }
        });
      }
    });

    // Default checklist fallback
    if (list.length < 3) {
      list.push({
        type: 'info',
        title: 'Configure Your Site Competitors',
        description: 'Establish explicit competitor domains in your project settings to enable cross-referenced insights.',
        actionText: 'Review Upload Library',
        action: () => {
          router.push('/uploads');
        }
      });
    }

    return list.slice(0, 3);
  }, [competitors, displayedPages, loading, router]);

  const getRecommendationStyle = (type: 'content' | 'link' | 'warning' | 'info') => {
    switch (type) {
      case 'warning':
        return { border: '1px solid rgba(239, 68, 68, 0.4)', bg: 'rgba(239, 68, 68, 0.05)', color: 'var(--danger)', icon: AlertTriangle };
      case 'content':
        return { border: '1px solid rgba(99, 102, 241, 0.4)', bg: 'rgba(99, 102, 241, 0.05)', color: 'var(--accent)', icon: Sparkles };
      case 'link':
        return { border: '1px solid rgba(16, 185, 129, 0.4)', bg: 'rgba(16, 185, 129, 0.05)', color: 'var(--success)', icon: LinkIcon };
      default:
        return { border: '1px solid var(--card-border)', bg: 'var(--panel-subtle)', color: 'var(--muted)', icon: Info };
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Header */}
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.3rem' }}>Competitive Intelligence</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>
          Aggregated search intelligence, keyword gaps, and link-prospect cross-referencing for your active project.
        </p>
      </div>

      {/* Active Project Scope Bar */}
      <div
        style={{
          background: 'var(--card)',
          border: '1px solid var(--card-border)',
          borderRadius: '8px',
          padding: '0.9rem 1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.5rem'
        }}
      >
        <div>
          <div style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.15rem' }}>
            Active Project / Site
          </div>
          <div style={{ fontSize: '0.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Globe size={15} style={{ color: 'var(--accent)' }} />
            {siteSelectionLabel(selectedSite)}
          </div>
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--muted)', maxWidth: '500px', textAlign: 'right' }}>
          All metrics and recommendations are dynamically scoped to the selected project.
        </div>
      </div>

      {/* Top Metrics Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: '1rem'
        }}
      >
        <Card title="Competitors" value={metrics.competitorsCount} sub="Aggregated Domains" />
        <Card title="Tracked Pages" value={metrics.pagesCount} sub="Indexed URLs" />
        <Card title="Est. Comp. Traffic" value={metrics.trafficSum.toLocaleString()} sub="Summed Monthly Visits" />
        <Card title="Keyword Gaps" value={metrics.gapsCount} sub="Content Opportunities" />
        <Card title="Link Prospects" value={metrics.prospectsCount} sub="Backlinks & Domains" />
        <Card title="High Priority Items" value={metrics.highPriority} sub="Opportunity Score >= 80" accent />
      </div>

      {/* Prioritized Recommendations */}
      <div>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Sparkles size={16} style={{ color: 'var(--accent)' }} />
          Prioritized Recommendations
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '1rem'
          }}
        >
          {recommendationsList.map((rec, index) => {
            const style = getRecommendationStyle(rec.type);
            const IconComponent = style.icon;
            return (
              <div
                key={index}
                style={{
                  background: style.bg,
                  border: style.border,
                  borderRadius: '8px',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '0.75rem'
                }}
              >
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <div style={{ color: style.color, marginTop: '2px', flexShrink: 0 }}>
                    <IconComponent size={18} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground)' }}>
                      {rec.title}
                    </h3>
                    <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.25rem', lineHeight: '1.3' }}>
                      {rec.description}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={rec.action}
                  style={{
                    alignSelf: 'flex-start',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: style.color,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    padding: 0,
                    textDecoration: 'underline'
                  }}
                >
                  {rec.actionText}
                  <ArrowRight size={12} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Tabs Navigator */}
      <div>
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            borderBottom: '1px solid var(--card-border)',
            marginBottom: '1rem',
            overflowX: 'auto'
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('summary')}
            style={{
              padding: '0.6rem 1.2rem',
              border: 'none',
              borderBottom: activeTab === 'summary' ? '2px solid var(--accent)' : '2px solid transparent',
              background: 'none',
              color: activeTab === 'summary' ? 'var(--foreground)' : 'var(--muted)',
              fontWeight: activeTab === 'summary' ? 600 : 400,
              cursor: 'pointer',
              fontSize: '0.85rem',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s',
            }}
          >
            Competitor Domains ({filteredCompetitors.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('pages')}
            style={{
              padding: '0.6rem 1.2rem',
              border: 'none',
              borderBottom: activeTab === 'pages' ? '2px solid var(--accent)' : '2px solid transparent',
              background: 'none',
              color: activeTab === 'pages' ? 'var(--foreground)' : 'var(--muted)',
              fontWeight: activeTab === 'pages' ? 600 : 400,
              cursor: 'pointer',
              fontSize: '0.85rem',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s',
            }}
          >
            Competitor Top Pages ({filteredPages.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('gaps')}
            style={{
              padding: '0.6rem 1.2rem',
              border: 'none',
              borderBottom: activeTab === 'gaps' ? '2px solid var(--accent)' : '2px solid transparent',
              background: 'none',
              color: activeTab === 'gaps' ? 'var(--foreground)' : 'var(--muted)',
              fontWeight: activeTab === 'gaps' ? 600 : 400,
              cursor: 'pointer',
              fontSize: '0.85rem',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s',
            }}
          >
            Keyword Gaps ({filteredGaps.length})
          </button>
        </div>

        {/* Global Filter Indicator if domain is selected */}
        {selectedDomain && (
          <div
            style={{
              background: 'rgba(99,102,241,0.08)',
              border: '1px solid var(--card-border)',
              borderRadius: '6px',
              padding: '0.5rem 0.75rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.8rem',
              marginBottom: '1rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--foreground)' }}>
              <Info size={14} style={{ color: 'var(--accent)' }} />
              Showing details filtered by competitor domain: <strong style={{ color: 'var(--accent)' }}>{selectedDomain}</strong>
            </div>
            <button
              type="button"
              onClick={() => setSelectedDomain(null)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent)',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: 600,
                textDecoration: 'underline'
              }}
            >
              Clear Filter
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--muted)' }}>
            <div style={{ fontSize: '1rem', fontWeight: 500, marginBottom: '0.5rem' }}>Loading competitive intelligence workspace...</div>
            <div style={{ fontSize: '0.8rem' }}>Aggregating page traffic, backlinks, and keyword gaps</div>
          </div>
        ) : (
          <>
            {/* TAB 1: Competitors Summary Table */}
            {activeTab === 'summary' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

                {/* Filters Row */}
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <Search size={14} style={{ position: 'absolute', left: '0.6rem', color: 'var(--muted)' }} />
                    <input
                      type="text"
                      placeholder="Search competitor domain…"
                      value={summarySearch}
                      onChange={(e) => setSummarySearch(e.target.value)}
                      style={{
                        background: 'var(--card)',
                        border: '1px solid var(--card-border)',
                        borderRadius: '6px',
                        padding: '0.4rem 0.75rem 0.4rem 1.8rem',
                        color: 'var(--foreground)',
                        fontSize: '0.85rem',
                        width: '250px',
                        outline: 'none',
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    {(['All', 'Content Gap', 'Link Gap', 'High Priority'] as const).map((chip) => {
                      const active = summaryChip === chip;
                      return (
                        <button
                          type="button"
                          key={chip}
                          onClick={() => setSummaryChip(chip)}
                          style={{
                            padding: '0.35rem 0.7rem',
                            borderRadius: '4px',
                            background: active ? 'var(--accent)' : 'var(--card)',
                            border: `1px solid ${active ? 'var(--accent)' : 'var(--card-border)'}`,
                            color: active ? '#fff' : 'var(--muted)',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            transition: 'all 0.1s'
                          }}
                        >
                          {chip}
                        </button>
                      );
                    })}
                  </div>

                  <span style={{ fontSize: '0.8rem', color: 'var(--muted)', marginLeft: 'auto' }}>
                    {filteredCompetitors.length.toLocaleString()} domains
                  </span>
                </div>

                {/* Table Container */}
                <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--card-border)', background: 'var(--card)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--card-border)', background: 'var(--table-header)' }}>
                        <th style={{ padding: '0.65rem 0.875rem', textAlign: 'left', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Competitor Domain
                        </th>
                        <th style={{ padding: '0.65rem 0.875rem', textAlign: 'right', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Pages
                        </th>
                        <th style={{ padding: '0.65rem 0.875rem', textAlign: 'right', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Est. Traffic
                        </th>
                        <th style={{ padding: '0.65rem 0.875rem', textAlign: 'right', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Keywords Sum
                        </th>
                        <th style={{ padding: '0.65rem 0.875rem', textAlign: 'right', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Gap Keywords
                        </th>
                        <th style={{ padding: '0.65rem 0.875rem', textAlign: 'right', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Link Prospects
                        </th>
                        <th style={{ padding: '0.65rem 0.875rem', textAlign: 'left', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Top URL / Landing Page
                        </th>
                        <th style={{ padding: '0.65rem 0.875rem', textAlign: 'center', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '90px' }}>
                          Intel Score
                        </th>
                        <th style={{ padding: '0.65rem 0.875rem', textAlign: 'center', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '130px' }}>
                          Action Plan
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCompetitors.map((comp, idx) => {
                        const isSelected = selectedDomain === comp.domain;
                        return (
                          <tr
                            key={comp.domain}
                            onClick={() => setSelectedDomain(isSelected ? null : comp.domain)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setSelectedDomain(isSelected ? null : comp.domain);
                              }
                            }}
                            tabIndex={0}
                            role="button"
                            aria-pressed={isSelected}
                            style={{
                              borderBottom: '1px solid var(--card-border)',
                              background: isSelected
                                ? 'rgba(99, 102, 241, 0.08)'
                                : idx % 2 === 0 ? 'transparent' : 'var(--row-alt)',
                              cursor: 'pointer',
                              transition: 'background 0.15s',
                              outlineOffset: '-2px'
                            }}
                          >
                            <td style={{ padding: '0.65rem 0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                              <Globe size={14} style={{ color: comp.isConfigured ? 'var(--accent)' : 'var(--muted)' }} />
                              <span>{comp.domain}</span>
                              {comp.isConfigured && (
                                <span
                                  style={{
                                    fontSize: '0.65rem',
                                    background: 'rgba(99,102,241,0.15)',
                                    color: 'var(--accent)',
                                    padding: '0.05rem 0.25rem',
                                    borderRadius: '3px',
                                    fontWeight: 500
                                  }}
                                >
                                  Configured
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '0.65rem 0.875rem', textAlign: 'right', color: 'var(--foreground)' }}>
                              {comp.pageCount.toLocaleString()}
                            </td>
                            <td style={{ padding: '0.65rem 0.875rem', textAlign: 'right', color: 'var(--foreground)', fontWeight: 500 }}>
                              {comp.estTraffic.toLocaleString()}
                            </td>
                            <td style={{ padding: '0.65rem 0.875rem', textAlign: 'right', color: 'var(--muted)' }}>
                              {comp.pagesKeywordsSum.toLocaleString()}
                            </td>
                            <td style={{ padding: '0.65rem 0.875rem', textAlign: 'right', color: comp.gapKeywordCount > 0 ? 'var(--warning)' : 'var(--muted)', fontWeight: comp.gapKeywordCount > 0 ? 600 : 400 }}>
                              {comp.gapKeywordCount}
                            </td>
                            <td style={{ padding: '0.65rem 0.875rem', textAlign: 'right', color: comp.backlinkProspectCount > 0 ? 'var(--success)' : 'var(--muted)', fontWeight: comp.backlinkProspectCount > 0 ? 600 : 400 }}>
                              {comp.backlinkProspectCount + comp.referringDomainCount}
                            </td>
                            <td style={{ padding: '0.65rem 0.875rem', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {comp.topPageUrl ? (
                                <a
                                  href={comp.topPageUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()} // don't trigger row selection
                                  style={{ color: 'var(--accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
                                >
                                  <span style={{ fontSize: '0.78rem' }}>{comp.topPageTitle || comp.topPageUrl.replace(/^https?:\/\//, '')}</span>
                                  <ExternalLink size={10} />
                                </a>
                              ) : (
                                <span style={{ color: 'var(--muted)' }}>-</span>
                              )}
                            </td>
                            <td style={{ padding: '0.65rem 0.875rem', textAlign: 'center' }}>
                              <ScoreBadge score={comp.opportunityScore} />
                            </td>
                            <td style={{ padding: '0.65rem 0.875rem', textAlign: 'center' }}>
                              {(() => {
                                const domainPages = displayedPages.filter(p => getDomainFromUrl(p.domain) === comp.domain || getDomainFromUrl(p.url) === comp.domain);
                                const eligiblePages = domainPages.filter(p => {
                                  if (p.tag === 'Ignore') return false;
                                  const isHighScore = (p.opportunityScore ?? 0) >= 70;
                                  const isHighTraffic = (p.traffic ?? 0) >= 500;
                                  return isHighScore || isHighTraffic;
                                });
                                const bestPage = [...eligiblePages].sort((a, b) => (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0))[0];

                                let bestOpp: { id: string; label: string; title: string } | null = null;
                                if (bestPage) {
                                  bestOpp = {
                                    id: getCompetitorPageOpportunityId(bestPage),
                                    label: 'Page',
                                    title: bestPage.title || bestPage.url
                                  };
                                } else {
                                  const domainGaps = displayedGaps.filter(g => getDomainFromUrl(g.competitorDomain) === comp.domain);
                                  const eligibleGaps = domainGaps.filter(g => g.tag !== 'Ignore');
                                  const bestGap = [...eligibleGaps].sort((a, b) => (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0))[0];
                                  if (bestGap) {
                                    bestOpp = {
                                      id: getKeywordGapOpportunityId(bestGap),
                                      label: 'Gap',
                                      title: bestGap.keyword
                                    };
                                  }
                                }

                                if (!bestOpp) {
                                  return (
                                    <button
                                      type="button"
                                      disabled
                                      onClick={(e) => e.stopPropagation()}
                                      style={{
                                        fontSize: '0.72rem',
                                        fontWeight: 600,
                                        padding: '0.2rem 0.5rem',
                                        borderRadius: '4px',
                                        border: '1px solid var(--card-border)',
                                        background: 'var(--panel-subtle)',
                                        color: 'var(--muted)',
                                        cursor: 'not-allowed',
                                        width: '100px',
                                        textAlign: 'center',
                                        display: 'inline-block'
                                      }}
                                    >
                                      No Opps
                                    </button>
                                  );
                                }

                                const status = workflowMap[bestOpp.id] || 'New';
                                if (status === 'In Progress' || status === 'Done') {
                                  return (
                                    <span
                                      style={{
                                        fontSize: '0.72rem',
                                        fontWeight: 600,
                                        color: STATUS_COLORS[status].color,
                                        background: STATUS_COLORS[status].bg,
                                        padding: '0.2rem 0.5rem',
                                        borderRadius: '4px',
                                        border: `1px solid ${STATUS_COLORS[status].color}30`,
                                        display: 'inline-block',
                                        textAlign: 'center',
                                        width: '100px'
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
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleWorkflowStatus(bestOpp!.id);
                                    }}
                                    style={{
                                      fontSize: '0.72rem',
                                      fontWeight: 600,
                                      padding: '0.2rem 0.5rem',
                                      borderRadius: '4px',
                                      cursor: 'pointer',
                                      width: '100px',
                                      textAlign: 'center',
                                      transition: 'all 0.15s',
                                      border: isPlanned ? '1px solid #38bdf8' : '1px solid var(--card-border)',
                                      background: isPlanned ? 'rgba(56, 189, 248, 0.15)' : 'var(--card)',
                                      color: isPlanned ? '#38bdf8' : 'var(--foreground)'
                                    }}
                                    title={isPlanned ? `Remove Planned ${bestOpp.label}: ${bestOpp.title}` : `Plan ${bestOpp.label}: ${bestOpp.title}`}
                                  >
                                    {isPlanned ? 'Planned ✓' : bestOpp.label === 'Page' ? 'Plan Page' : 'Plan Gap'}
                                  </button>
                                );
                              })()}
                            </td>
                          </tr>
                        );
                      })}
                      {filteredCompetitors.length === 0 && (
                        <tr>
                          <td colSpan={9} style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>
                            No competitor domain summaries found. Try adjusting filters or select another project site.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 2: Competitor Top Pages */}
            {activeTab === 'pages' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

                {/* Filters Row */}
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <Search size={14} style={{ position: 'absolute', left: '0.6rem', color: 'var(--muted)' }} />
                    <input
                      type="text"
                      placeholder="Search URL or title…"
                      value={pageSearch}
                      onChange={(e) => setPageSearch(e.target.value)}
                      style={{
                        background: 'var(--card)',
                        border: '1px solid var(--card-border)',
                        borderRadius: '6px',
                        padding: '0.4rem 0.75rem 0.4rem 1.8rem',
                        color: 'var(--foreground)',
                        fontSize: '0.85rem',
                        width: '250px',
                        outline: 'none',
                      }}
                    />
                  </div>

                  <select
                    value={pageTagFilter}
                    onChange={(e) => setPageTagFilter(e.target.value as Tag | 'All')}
                    style={{
                      background: 'var(--card)',
                      border: '1px solid var(--card-border)',
                      borderRadius: '6px',
                      padding: '0.4rem 0.75rem',
                      color: 'var(--foreground)',
                      fontSize: '0.85rem',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="All">All Tags</option>
                    {TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>

                  <span style={{ fontSize: '0.8rem', color: 'var(--muted)', marginLeft: 'auto' }}>
                    {filteredPages.length.toLocaleString()} pages
                  </span>
                </div>

                {/* Table Container */}
                <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--card-border)', background: 'var(--card)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--card-border)', background: 'var(--table-header)' }}>
                        <th style={{ padding: '0.65rem 0.875rem', textAlign: 'left', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Competitor Page URL
                        </th>
                        <th style={{ padding: '0.65rem 0.875rem', textAlign: 'left', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Title
                        </th>
                        <th style={{ padding: '0.65rem 0.875rem', textAlign: 'right', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Traffic
                        </th>
                        <th style={{ padding: '0.65rem 0.875rem', textAlign: 'right', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Keywords
                        </th>
                        <th style={{ padding: '0.65rem 0.875rem', textAlign: 'center', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '80px' }}>
                          Score
                        </th>
                        <th style={{ padding: '0.65rem 0.875rem', textAlign: 'left', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '130px' }}>
                          SERPVault Action
                        </th>
                        <th style={{ padding: '0.65rem 0.875rem', textAlign: 'center', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '120px' }}>
                          Action Plan
                        </th>
                        <th style={{ padding: '0.65rem 0.875rem', textAlign: 'left', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '160px' }}>
                          Tag Control
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPages.map((page, idx) => {
                        const recAction = getPageAction(page);
                        return (
                          <tr
                            key={page.id}
                            style={{
                              borderBottom: '1px solid var(--card-border)',
                              background: idx % 2 === 0 ? 'transparent' : 'var(--row-alt)',
                              transition: 'background 0.1s'
                            }}
                          >
                            <td style={{ padding: '0.65rem 0.875rem', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              <a
                                href={page.url.startsWith('http') ? page.url : `https://${page.url}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
                              >
                                <span>{page.url.replace(/^https?:\/\//, '')}</span>
                                <ExternalLink size={10} />
                              </a>
                              <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: '2px' }}>
                                Domain: {page.domain}
                              </div>
                            </td>
                            <td style={{ padding: '0.65rem 0.875rem', color: 'var(--foreground)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {page.title ?? '-'}
                            </td>
                            <td style={{ padding: '0.65rem 0.875rem', textAlign: 'right', fontWeight: 600 }}>
                              {page.traffic?.toLocaleString() ?? '-'}
                            </td>
                            <td style={{ padding: '0.65rem 0.875rem', textAlign: 'right', color: 'var(--muted)' }}>
                              {page.keywords?.toLocaleString() ?? '-'}
                            </td>
                            <td style={{ padding: '0.65rem 0.875rem', textAlign: 'center' }}>
                              <ScoreBadge score={page.opportunityScore ?? 0} />
                            </td>
                            <td style={{ padding: '0.65rem 0.875rem' }}>
                              <span
                                style={{
                                  fontSize: '0.72rem',
                                  fontWeight: 600,
                                  color: recAction.color,
                                  background: recAction.color + '15',
                                  padding: '0.15rem 0.4rem',
                                  borderRadius: '4px',
                                  border: `1px solid ${recAction.color}30`
                                }}
                              >
                                {recAction.text}
                              </span>
                            </td>
                            <td style={{ padding: '0.65rem 0.875rem', textAlign: 'center' }}>
                              {(() => {
                                const oppId = getCompetitorPageOpportunityId(page);
                                const status = workflowMap[oppId] || 'New';
                                if (status === 'In Progress' || status === 'Done') {
                                  return (
                                    <span
                                      style={{
                                        fontSize: '0.72rem',
                                        fontWeight: 600,
                                        color: STATUS_COLORS[status].color,
                                        background: STATUS_COLORS[status].bg,
                                        padding: '0.2rem 0.5rem',
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
                                      padding: '0.2rem 0.5rem',
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
                              })()}
                            </td>
                            <td style={{ padding: '0.65rem 0.875rem' }}>
                              <select
                                value={page.tag ?? ''}
                                onChange={(e) => handleCpTagChange(page.id, (e.target.value as Tag) || undefined)}
                                style={{
                                  background: page.tag ? TAG_COLORS[page.tag] + '22' : 'var(--card)',
                                  border: `1px solid ${page.tag ? TAG_COLORS[page.tag] : 'var(--card-border)'}`,
                                  borderRadius: '4px',
                                  padding: '0.2rem 0.4rem',
                                  color: page.tag ? TAG_COLORS[page.tag] : 'var(--muted)',
                                  fontSize: '0.75rem',
                                  cursor: 'pointer',
                                  outline: 'none',
                                  width: '100%'
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
                      {filteredPages.length === 0 && (
                        <tr>
                          <td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>
                            No competitor pages found matching current search.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 3: Keyword Gaps */}
            {activeTab === 'gaps' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

                {/* Filters Row */}
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <Search size={14} style={{ position: 'absolute', left: '0.6rem', color: 'var(--muted)' }} />
                    <input
                      type="text"
                      placeholder="Search keyword gap…"
                      value={gapSearch}
                      onChange={(e) => setGapSearch(e.target.value)}
                      style={{
                        background: 'var(--card)',
                        border: '1px solid var(--card-border)',
                        borderRadius: '6px',
                        padding: '0.4rem 0.75rem 0.4rem 1.8rem',
                        color: 'var(--foreground)',
                        fontSize: '0.85rem',
                        width: '250px',
                        outline: 'none',
                      }}
                    />
                  </div>

                  <span style={{ fontSize: '0.8rem', color: 'var(--muted)', marginLeft: 'auto' }}>
                    {filteredGaps.length.toLocaleString()} keyword gaps
                  </span>
                </div>

                {/* Table Container */}
                <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--card-border)', background: 'var(--card)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--card-border)', background: 'var(--table-header)' }}>
                        <th style={{ padding: '0.65rem 0.875rem', textAlign: 'left', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Keyword
                        </th>
                        <th style={{ padding: '0.65rem 0.875rem', textAlign: 'left', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Competitor Domain
                        </th>
                        <th style={{ padding: '0.65rem 0.875rem', textAlign: 'right', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Volume
                        </th>
                        <th style={{ padding: '0.65rem 0.875rem', textAlign: 'right', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Difficulty (SD)
                        </th>
                        <th style={{ padding: '0.65rem 0.875rem', textAlign: 'center', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Comp. Rank
                        </th>
                        <th style={{ padding: '0.65rem 0.875rem', textAlign: 'center', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Your Rank
                        </th>
                        <th style={{ padding: '0.65rem 0.875rem', textAlign: 'center', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '80px' }}>
                          Score
                        </th>
                        <th style={{ padding: '0.65rem 0.875rem', textAlign: 'left', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '160px' }}>
                          Suggested Action
                        </th>
                        <th style={{ padding: '0.65rem 0.875rem', textAlign: 'center', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '120px' }}>
                          Action Plan
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredGaps.map((gap, idx) => {
                        const sugAction = getGapAction(gap);
                        return (
                          <tr
                            key={gap.id}
                            style={{
                              borderBottom: '1px solid var(--card-border)',
                              background: idx % 2 === 0 ? 'transparent' : 'var(--row-alt)',
                              transition: 'background 0.1s'
                            }}
                          >
                            <td style={{ padding: '0.65rem 0.875rem', fontWeight: 600, color: 'var(--foreground)' }}>
                              {gap.keyword}
                            </td>
                            <td style={{ padding: '0.65rem 0.875rem', color: 'var(--muted)' }}>
                              {gap.competitorDomain ?? '-'}
                            </td>
                            <td style={{ padding: '0.65rem 0.875rem', textAlign: 'right' }}>
                              {gap.volume?.toLocaleString() ?? '-'}
                            </td>
                            <td style={{ padding: '0.65rem 0.875rem', textAlign: 'right' }}>
                              {gap.difficulty ?? '-'}
                            </td>
                            <td style={{ padding: '0.65rem 0.875rem', textAlign: 'center', fontWeight: 500, color: 'var(--warning)' }}>
                              #{gap.competitorPosition ?? '-'}
                            </td>
                            <td style={{ padding: '0.65rem 0.875rem', textAlign: 'center', color: gap.yourPosition ? 'var(--foreground)' : 'var(--muted)' }}>
                              {gap.yourPosition ? `#${gap.yourPosition}` : 'No Rank'}
                            </td>
                            <td style={{ padding: '0.65rem 0.875rem', textAlign: 'center' }}>
                              <ScoreBadge score={gap.opportunityScore ?? 0} />
                            </td>
                            <td style={{ padding: '0.65rem 0.875rem' }}>
                              <span
                                style={{
                                  fontSize: '0.72rem',
                                  fontWeight: 600,
                                  color: sugAction.color,
                                  background: sugAction.color + '15',
                                  padding: '0.15rem 0.4rem',
                                  borderRadius: '4px',
                                  border: `1px solid ${sugAction.color}30`
                                }}
                              >
                                {sugAction.text}
                              </span>
                            </td>
                            <td style={{ padding: '0.65rem 0.875rem', textAlign: 'center' }}>
                              {(() => {
                                const oppId = getKeywordGapOpportunityId(gap);
                                const status = workflowMap[oppId] || 'New';
                                if (status === 'In Progress' || status === 'Done') {
                                  return (
                                    <span
                                      style={{
                                        fontSize: '0.72rem',
                                        fontWeight: 600,
                                        color: STATUS_COLORS[status].color,
                                        background: STATUS_COLORS[status].bg,
                                        padding: '0.2rem 0.5rem',
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
                                      padding: '0.2rem 0.5rem',
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
                              })()}
                            </td>
                          </tr>
                        );
                      })}
                      {filteredGaps.length === 0 && (
                        <tr>
                          <td colSpan={9} style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>
                            No keyword gaps found matching current search.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
