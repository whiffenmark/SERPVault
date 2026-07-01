'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, FileDown, Copy, Check, ExternalLink, FileText, ChevronRight, AlertCircle } from 'lucide-react';
import * as db from '@/lib/db';
import { getSelectedSite, filterRowsBySite, siteSelectionLabel, type SiteSelection, subscribeProjectScopeChange } from '@/lib/storage';
import type { KeywordRecord, KeywordGapRecord, CompetitorPageRecord, BacklinkRecord, Tag } from '@/lib/types';
import Card from '@/components/Card';
import ScoreBadge from '@/components/ScoreBadge';
import { buildContentBriefs, generateContentBriefMarkdown, type ContentBrief } from '@/lib/content-briefs';
import {
  getMergedContentBriefWorkflowMap,
  updateContentBriefWorkflowItemAsync,
  generateContentBriefMarkdownWithWorkflow,
  WORKFLOW_STATUSES,
  STATUS_COLORS,
  type ContentBriefWorkflowStatus,
  type ContentBriefWorkflowItem
} from '@/lib/content-brief-workflow';

export default function ContentBriefsPage() {
  const [loading, setLoading] = useState(true);
  const [selectedSite, setSelectedSiteState] = useState<SiteSelection>(null);

  const [keywords, setKeywords] = useState<KeywordRecord[]>([]);
  const [keywordGaps, setKeywordGaps] = useState<KeywordGapRecord[]>([]);
  const [competitorPages, setCompetitorPages] = useState<CompetitorPageRecord[]>([]);
  const [backlinks, setBacklinks] = useState<BacklinkRecord[]>([]);

  // Selection and UI state
  const [selectedBriefId, setSelectedBriefId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [contentTypeFilter, setContentTypeFilter] = useState<string>('All');
  const [priorityFilter, setPriorityFilter] = useState<string>('All');
  const [intentFilter, setIntentFilter] = useState<string>('All');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'failure'>('idle');
  const [focusedBriefId, setFocusedBriefId] = useState<string | null>(null);

  // Workflow state map & filter
  const [workflowMap, setWorkflowMap] = useState<Record<string, ContentBriefWorkflowItem>>({});
  const [workflowStatusFilter, setWorkflowStatusFilter] = useState<string>('All');

  useEffect(() => {
    // Read site scope
    const site = getSelectedSite();
    setSelectedSiteState(site);

    // Fetch all database records
    Promise.all([
      db.getKeywords(),
      db.getKeywordGaps(),
      db.getCompetitorPages(),
      db.getBacklinks(),
      getMergedContentBriefWorkflowMap(),
    ])
      .then(([kws, gaps, comps, bls, mergedWorkflowMap]) => {
        setKeywords(kws);
        setKeywordGaps(gaps);
        setCompetitorPages(comps);
        setBacklinks(bls);
        setWorkflowMap(mergedWorkflowMap);
      })
      .catch((err) => {
        console.error('Failed to load data for content briefs:', err);
      })
      .finally(() => {
        setLoading(false);
      });

    const unsubscribe = subscribeProjectScopeChange(() => {
      setSelectedSiteState(getSelectedSite());
      getMergedContentBriefWorkflowMap().then((merged) => {
        setWorkflowMap(merged);
      });
    });
    return () => unsubscribe();
  }, []);

  // Filter raw rows by project site selection
  const scopedKeywords = useMemo(() => filterRowsBySite(keywords, selectedSite), [keywords, selectedSite]);
  const scopedKeywordGaps = useMemo(() => filterRowsBySite(keywordGaps, selectedSite), [keywordGaps, selectedSite]);
  const scopedCompetitorPages = useMemo(() => filterRowsBySite(competitorPages, selectedSite), [competitorPages, selectedSite]);
  const scopedBacklinks = useMemo(() => filterRowsBySite(backlinks, selectedSite), [backlinks, selectedSite]);

  // Build briefs using the lib helper
  const allBriefs = useMemo(() => {
    return buildContentBriefs(
      scopedKeywords,
      scopedKeywordGaps,
      scopedCompetitorPages,
      scopedBacklinks
    );
  }, [scopedKeywords, scopedKeywordGaps, scopedCompetitorPages, scopedBacklinks]);

  // Extract all distinct intents dynamically for filters
  const distinctIntents = useMemo(() => {
    const intents = new Set<string>();
    allBriefs.forEach((b) => {
      Object.keys(b.intentMix).forEach((intent) => {
        if (intent && intent.trim() !== '') {
          intents.add(intent.trim());
        }
      });
    });
    return Array.from(intents).sort();
  }, [allBriefs]);

  // Apply search/filters
  const filteredBriefs = useMemo(() => {
    return allBriefs.filter((b) => {
      // Search title, primary keyword, secondary keywords
      const matchesSearch =
        searchQuery.trim() === '' ||
        b.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.primaryKeyword.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.secondaryKeywords.some((sk) => sk.toLowerCase().includes(searchQuery.toLowerCase()));

      // Content Type filter
      const matchesType = contentTypeFilter === 'All' || b.suggestedContentType === contentTypeFilter;

      // Priority filter
      const matchesPriority = priorityFilter === 'All' || b.priority === priorityFilter;

      // Intent filter (check if this intent is present in the mix)
      const matchesIntent =
        intentFilter === 'All' || (b.intentMix[intentFilter] !== undefined && b.intentMix[intentFilter] > 0);

      // Workflow status filter
      const status = workflowMap[b.id]?.status || 'Draft';
      const matchesWorkflowStatus = workflowStatusFilter === 'All' || status === workflowStatusFilter;

      return matchesSearch && matchesType && matchesPriority && matchesIntent && matchesWorkflowStatus;
    });
  }, [allBriefs, searchQuery, contentTypeFilter, priorityFilter, intentFilter, workflowMap, workflowStatusFilter]);

  // Auto-select the first brief when list changes or if current selection is invalid
  const selectedBrief = useMemo(() => {
    if (filteredBriefs.length === 0) return null;
    const found = filteredBriefs.find((b) => b.id === selectedBriefId);
    return found || filteredBriefs[0];
  }, [filteredBriefs, selectedBriefId]);

  // Card summary statistics
  const stats = useMemo(() => {
    const totalBriefs = allBriefs.length;
    const totalVol = allBriefs.reduce((sum, b) => sum + b.monthlyVolumeTotal, 0);

    const difficultyBriefs = allBriefs.filter((b) => b.avgDifficulty > 0);
    const avgDiff = difficultyBriefs.length > 0
      ? Math.round(difficultyBriefs.reduce((sum, b) => sum + b.avgDifficulty, 0) / difficultyBriefs.length)
      : 0;

    const highPrioCount = allBriefs.filter((b) => b.priority === 'High').length;
    const missingTargets = allBriefs.filter((b) => !b.hasPageTarget).length;
    const withComps = allBriefs.filter((b) => b.competitorReferences.length > 0).length;

    let inReviewCount = 0;
    let approvedCount = 0;
    let publishedCount = 0;

    allBriefs.forEach((b) => {
      const status = workflowMap[b.id]?.status || 'Draft';
      if (status === 'In Review') inReviewCount++;
      else if (status === 'Approved') approvedCount++;
      else if (status === 'Published') publishedCount++;
    });

    return {
      totalBriefs,
      totalVol,
      avgDiff,
      highPrioCount,
      missingTargets,
      withComps,
      inReviewCount,
      approvedCount,
      publishedCount,
    };
  }, [allBriefs, workflowMap]);

  // Reset all filters helper
  const handleResetFilters = () => {
    setSearchQuery('');
    setContentTypeFilter('All');
    setPriorityFilter('All');
    setIntentFilter('All');
    setWorkflowStatusFilter('All');
  };

  // Copy Markdown for selected brief to clipboard
  const handleCopyMarkdown = (brief: ContentBrief) => {
    const wfItem = workflowMap[brief.id];
    const md = generateContentBriefMarkdownWithWorkflow(brief, wfItem);

    const fallbackCopy = (text: string) => {
      const textarea = document.createElement('textarea');
      try {
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.top = '0';
        textarea.style.left = '0';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const successful = document.execCommand('copy');
        if (successful) {
          setCopyStatus('success');
          setTimeout(() => setCopyStatus('idle'), 2000);
        } else {
          throw new Error('execCommand copy failed');
        }
      } catch (err) {
        console.error('Fallback copy failed:', err);
        setCopyStatus('failure');
        setTimeout(() => setCopyStatus('idle'), 2000);
      } finally {
        if (textarea.parentNode === document.body) {
          document.body.removeChild(textarea);
        }
      }
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(md)
        .then(() => {
          setCopyStatus('success');
          setTimeout(() => setCopyStatus('idle'), 2000);
        })
        .catch((err) => {
          console.warn('Clipboard write failed, using fallback:', err);
          fallbackCopy(md);
        });
    } else {
      fallbackCopy(md);
    }
  };

  // Download Markdown file for selected brief
  const handleDownloadMarkdown = (brief: ContentBrief) => {
    const wfItem = workflowMap[brief.id];
    const md = generateContentBriefMarkdownWithWorkflow(brief, wfItem);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `content-brief-${brief.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`;
    document.body.appendChild(a);
    try {
      a.click();
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      document.body.removeChild(a);
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 100);
    }
  };

  const checklistItems = [
    'Title Tag: Include primary keyword near the beginning (under 60 chars).',
    'Meta Description: Write a compelling description with primary keyword and CTA (under 160 chars).',
    'H1 Heading: Ensure exactly one H1 heading exists and contains primary keyword.',
    'Introductory Paragraph: Mention primary keyword naturally within first 100 words.',
    'Heading Structure: Integrate secondary keywords into H2s/H3s naturally.',
    'Keyword Distribution: Distribute secondary keywords naturally throughout body copy.',
    'Internal Links: Add links to this page from at least 3-5 existing, contextually relevant articles.',
    'External Authority Links: Link out to 2-3 high-quality, non-competing external resources.',
    'Visual Media: Add relevant images/videos with alt text containing target keywords.',
    'URL Slug: Keep slug short, clean, and optimized with the primary keyword.'
  ];

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80vh', color: 'var(--muted)', fontSize: '0.9rem' }}>
        Loading Content Briefs Workspace…
      </div>
    );
  }

  const activeProjectName = siteSelectionLabel(selectedSite);

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.3rem', color: 'var(--foreground)' }}>Content Briefs Workspace</h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>
            Structured editorial briefs generated from Hermes page targets and high-opportunity keyword clusters.
          </p>
        </div>
      </div>

      {/* Scope Block */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.15rem' }}>
            Active Project / Site Scope
          </div>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--foreground)' }}>{activeProjectName}</div>
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
          {allBriefs.length > 0 ? (
            <span>Auto-clustered from loaded database uploads.</span>
          ) : (
            <span>No project data loaded.</span>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
        <Card title="Total Briefs" value={stats.totalBriefs} sub="grouped page briefs" />
        <Card title="Total Monthly Volume" value={stats.totalVol} sub="cumulative monthly search volume" />
        <Card title="Avg Difficulty" value={stats.avgDiff} sub="average keyword KD" accent />
        <Card title="High Priority" value={stats.highPrioCount} sub="opportunity score >= 70" accent />
        <Card title="In Review" value={stats.inReviewCount} sub="briefs undergoing review" accent />
        <Card title="Approved" value={stats.approvedCount} sub="briefs approved for writers" />
        <Card title="Published" value={stats.publishedCount} sub="completed and live page briefs" />
        <Card title="Missing Target URL" value={stats.missingTargets} sub="briefs with cluster fallback" />
        <Card title="Competitors Found" value={stats.withComps} sub="matching competitor domains" />
      </div>

      {/* Main workspace container */}
      {allBriefs.length === 0 ? (
        /* Entirely Empty State */
        <div style={{ padding: '5rem 2rem', textAlign: 'center', background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--card-border)', marginTop: '1.5rem' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(99, 102, 241, 0.08)',
            color: 'var(--accent)',
            marginBottom: '1.25rem'
          }}>
            <FileText size={32} />
          </div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--foreground)' }}>No Content Briefs Found</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', maxWidth: '520px', margin: '0 auto 1.75rem', lineHeight: '1.5' }}>
            We couldn't build any content briefs for this project scope. To populate briefs, please upload keyword reports with Hermes clusters/page targets (e.g. <code>cluster</code> or <code>page_target</code> headers) via <strong>Upload CSVs</strong>, or tag key opportunities in the <strong>Content Opportunities</strong> panel.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <Link href="/upload" style={{ background: 'var(--accent)', color: '#fff', padding: '0.55rem 1.25rem', borderRadius: '6px', textDecoration: 'none', fontWeight: 600, fontSize: '0.82rem', transition: 'background 0.15s' }}>
              Upload SEO Data
            </Link>
            <Link href="/content" style={{ background: 'var(--card)', border: '1px solid var(--card-border)', color: 'var(--foreground)', padding: '0.55rem 1.25rem', borderRadius: '6px', textDecoration: 'none', fontWeight: 600, fontSize: '0.82rem', transition: 'all 0.15s' }}>
              Browse Opportunities
            </Link>
          </div>
        </div>
      ) : (
        /* Workspace layout with filters, sidebar, and detailed view */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1, minHeight: '600px' }}>

          {/* Filters Bar */}
          <div style={{
            background: 'var(--card)',
            border: '1px solid var(--card-border)',
            borderRadius: '8px',
            padding: '0.75rem 1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
          }}>
            {/* Search and drop-down filters */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', flex: 1 }}>

              {/* Search */}
              <div style={{ position: 'relative', width: '260px' }}>
                <Search size={14} style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
                <input
                  type="text"
                  placeholder="Search brief / keyword..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.35rem 0.5rem 0.35rem 1.75rem',
                    fontSize: '0.8rem',
                    background: 'var(--background)',
                    border: '1px solid var(--card-border)',
                    borderRadius: '6px',
                    color: 'var(--foreground)',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Type Select */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Type:</span>
                <select
                  value={contentTypeFilter}
                  onChange={(e) => setContentTypeFilter(e.target.value)}
                  style={{
                    padding: '0.35rem 0.5rem',
                    fontSize: '0.8rem',
                    background: 'var(--background)',
                    border: '1px solid var(--card-border)',
                    borderRadius: '6px',
                    color: 'var(--foreground)',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="All">All Types</option>
                  <option value="Blog Post">Blog Post</option>
                  <option value="Money Page">Money Page</option>
                  <option value="City Page">City Page</option>
                  <option value="Link Bait">Link Bait</option>
                </select>
              </div>

              {/* Priority Select */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Priority:</span>
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  style={{
                    padding: '0.35rem 0.5rem',
                    fontSize: '0.8rem',
                    background: 'var(--background)',
                    border: '1px solid var(--card-border)',
                    borderRadius: '6px',
                    color: 'var(--foreground)',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="All">All Priorities</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>

              {/* Intent Select */}
              {distinctIntents.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Intent:</span>
                  <select
                    value={intentFilter}
                    onChange={(e) => setIntentFilter(e.target.value)}
                    style={{
                      padding: '0.35rem 0.5rem',
                      fontSize: '0.8rem',
                      background: 'var(--background)',
                      border: '1px solid var(--card-border)',
                      borderRadius: '6px',
                      color: 'var(--foreground)',
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="All">All Intents</option>
                    {distinctIntents.map((intent) => (
                      <option key={intent} value={intent}>{intent}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Status Select */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Status:</span>
                <select
                  value={workflowStatusFilter}
                  onChange={(e) => setWorkflowStatusFilter(e.target.value)}
                  style={{
                    padding: '0.35rem 0.5rem',
                    fontSize: '0.8rem',
                    background: 'var(--background)',
                    border: '1px solid var(--card-border)',
                    borderRadius: '6px',
                    color: 'var(--foreground)',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="All">All Statuses</option>
                  {WORKFLOW_STATUSES.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Clear filters or search counts */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.75rem', color: 'var(--muted)' }}>
              <span>Showing {filteredBriefs.length} of {allBriefs.length} briefs</span>
              {(searchQuery !== '' || contentTypeFilter !== 'All' || priorityFilter !== 'All' || intentFilter !== 'All' || workflowStatusFilter !== 'All') && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  style={{
                    background: 'rgba(239, 68, 68, 0.08)',
                    color: 'var(--danger)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                  }}
                >
                  Reset Filters
                </button>
              )}
            </div>
          </div>

          {/* Core Panel splits */}
          {filteredBriefs.length === 0 ? (
            /* Empty state for search/filters */
            <div style={{ padding: '3.5rem 2rem', textAlign: 'center', background: 'var(--card)', borderRadius: '8px', border: '1px dashed var(--card-border)' }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: 'rgba(99, 102, 241, 0.08)',
                color: 'var(--accent)',
                marginBottom: '0.75rem'
              }}>
                <AlertCircle size={24} />
              </div>
              <h4 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.25rem', color: 'var(--foreground)' }}>No matching briefs</h4>
              <p style={{ color: 'var(--muted)', fontSize: '0.82rem', marginBottom: '1.25rem' }}>
                Your filter settings did not match any of the generated briefs. Try resetting or adjusting the query.
              </p>
              <button
                type="button"
                onClick={handleResetFilters}
                style={{
                  background: 'var(--accent)',
                  color: '#fff',
                  padding: '0.4rem 1rem',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Clear Filters
              </button>
            </div>
          ) : (
            /* Columns Workspace */
            <div style={{ display: 'flex', gap: '1rem', flex: 1, minHeight: '550px', alignItems: 'stretch' }}>

              {/* Left Column - Briefs Selector (Ranked List) */}
              <div style={{
                width: '38%',
                minWidth: '320px',
                background: 'var(--card)',
                border: '1px solid var(--card-border)',
                borderRadius: '10px',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}>
                <div style={{
                  padding: '0.75rem 1rem',
                  borderBottom: '1px solid var(--card-border)',
                  background: 'rgba(255,255,255,0.01)',
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  color: 'var(--foreground)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  Ranked Content Briefs
                </div>

                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px', padding: '0.5rem' }}>
                  {filteredBriefs.map((brief) => {
                    const isSelected = selectedBrief && selectedBrief.id === brief.id;
                    const isFocused = focusedBriefId === brief.id;
                    const priorityColor =
                      brief.priority === 'High'
                        ? 'var(--danger)'
                        : brief.priority === 'Medium'
                        ? 'var(--warning)'
                        : 'var(--muted)';

                    return (
                      <button
                        key={brief.id}
                        type="button"
                        onClick={() => setSelectedBriefId(brief.id)}
                        onFocus={() => setFocusedBriefId(brief.id)}
                        onBlur={() => setFocusedBriefId(null)}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          width: '100%',
                          textAlign: 'left',
                          fontFamily: 'inherit',
                          fontSize: 'inherit',
                          color: 'inherit',
                          padding: '0.75rem 0.85rem',
                          borderRadius: '6px',
                          border: '1px solid',
                          borderColor: isSelected
                            ? 'var(--accent)'
                            : isFocused
                            ? 'var(--accent)'
                            : 'transparent',
                          background: isSelected
                            ? 'rgba(99, 102, 241, 0.08)'
                            : isFocused
                            ? 'rgba(255, 255, 255, 0.02)'
                            : 'transparent',
                          cursor: 'pointer',
                          gap: '0.35rem',
                          transition: 'all 0.15s ease',
                          outline: 'none',
                          margin: 0,
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.background = isFocused ? 'rgba(255,255,255,0.02)' : 'transparent';
                          }
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', width: '100%' }}>
                          <span style={{
                            fontWeight: 600,
                            fontSize: '0.82rem',
                            color: isSelected ? 'var(--foreground)' : 'var(--foreground)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: '170px',
                          }} title={brief.title}>
                            {brief.title}
                          </span>
                          <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', flexShrink: 0 }}>
                            {(() => {
                              const status = workflowMap[brief.id]?.status || 'Draft';
                              const statusColor = STATUS_COLORS[status] || STATUS_COLORS['Draft'];
                              return (
                                <span style={{
                                  fontSize: '0.65rem',
                                  padding: '0.1rem 0.35rem',
                                  borderRadius: '4px',
                                  fontWeight: 700,
                                  background: statusColor.bg,
                                  color: statusColor.color,
                                  border: `1px solid ${statusColor.color}30`,
                                }}>
                                  {status}
                                </span>
                              );
                            })()}
                            <span style={{
                              fontSize: '0.68rem',
                              padding: '0.1rem 0.35rem',
                              borderRadius: '4px',
                              fontWeight: 700,
                              background: `${priorityColor}15`,
                              color: priorityColor,
                              border: `1px solid ${priorityColor}30`,
                            }}>
                              {brief.priority}
                            </span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: 'var(--muted)', width: '100%' }}>
                          <span>Key: <strong>{brief.primaryKeyword}</strong></span>
                          <span>Monthly Vol: {brief.monthlyVolumeTotal.toLocaleString()}</span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem', borderTop: '1px dashed var(--card-border)', paddingTop: '0.35rem', marginTop: '0.2rem', width: '100%' }}>
                          <span style={{ color: 'var(--accent)', fontWeight: 500 }}>
                            {brief.suggestedContentType}
                          </span>
                          <span style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                            {(() => {
                              const checkedCount = workflowMap[brief.id]?.checkedItems
                                ? Object.values(workflowMap[brief.id].checkedItems!).filter(Boolean).length
                                : 0;
                              if (checkedCount > 0) {
                                return (
                                  <span style={{ fontSize: '0.65rem', color: 'var(--muted)', background: 'rgba(255,255,255,0.04)', padding: '0.05rem 0.25rem', borderRadius: '3px', border: '1px solid var(--card-border)' }}>
                                    ✓ {checkedCount}/10
                                  </span>
                                );
                              }
                              return null;
                            })()}
                            {!brief.hasPageTarget && (
                              <span style={{ color: 'var(--warning)', background: 'rgba(245,158,11,0.08)', padding: '0.05rem 0.25rem', borderRadius: '3px', fontSize: '0.62rem' }}>
                                Cluster Fallback
                              </span>
                            )}
                            <span style={{ color: 'var(--foreground)', opacity: 0.8 }}>
                              Score: {brief.opportunityScore}
                            </span>
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right Column - Detail Panel */}
              {selectedBrief && (
                <div style={{
                  flex: 1,
                  background: 'var(--card)',
                  border: '1px solid var(--card-border)',
                  borderRadius: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}>
                  {/* Brief Detail Header */}
                  <div style={{
                    padding: '1rem',
                    borderBottom: '1px solid var(--card-border)',
                    background: 'rgba(255,255,255,0.01)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '1rem',
                  }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.15rem' }}>
                        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--foreground)' }}>
                          {selectedBrief.title}
                        </h2>
                        <span style={{
                          fontSize: '0.68rem',
                          padding: '0.1rem 0.35rem',
                          borderRadius: '4px',
                          fontWeight: 700,
                          background: selectedBrief.priority === 'High' ? 'rgba(239, 68, 68, 0.12)' : selectedBrief.priority === 'Medium' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(100, 116, 139, 0.12)',
                          color: selectedBrief.priority === 'High' ? 'var(--danger)' : selectedBrief.priority === 'Medium' ? 'var(--warning)' : 'var(--muted)',
                        }}>
                          {selectedBrief.priority} Priority
                        </span>
                        <span style={{
                          fontSize: '0.68rem',
                          padding: '0.1rem 0.35rem',
                          borderRadius: '4px',
                          fontWeight: 700,
                          background: 'rgba(99, 102, 241, 0.12)',
                          color: 'var(--accent)',
                        }}>
                          {selectedBrief.suggestedContentType}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span>Suggested URL: <code style={{ color: 'var(--foreground)', opacity: 0.9 }}>{selectedBrief.suggestedUrl}</code></span>
                        <span>•</span>
                        <span>Cluster/Topic: <strong>{selectedBrief.cluster}</strong></span>
                      </div>
                    </div>

                    {/* Operational Action Buttons */}
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {/* Copy Markdown */}
                      <button
                        type="button"
                        onClick={() => handleCopyMarkdown(selectedBrief)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          background: copyStatus === 'success'
                            ? 'rgba(16, 185, 129, 0.12)'
                            : copyStatus === 'failure'
                            ? 'rgba(239, 68, 68, 0.12)'
                            : 'rgba(255, 255, 255, 0.02)',
                          border: '1px solid',
                          borderColor: copyStatus === 'success'
                            ? 'var(--success)'
                            : copyStatus === 'failure'
                            ? 'var(--danger)'
                            : 'var(--card-border)',
                          color: copyStatus === 'success'
                            ? 'var(--success)'
                            : copyStatus === 'failure'
                            ? 'var(--danger)'
                            : 'var(--foreground)',
                          padding: '0.35rem 0.65rem',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          outline: 'none',
                        }}
                      >
                        {copyStatus === 'success' ? (
                          <Check size={12} />
                        ) : copyStatus === 'failure' ? (
                          <AlertCircle size={12} />
                        ) : (
                          <Copy size={12} />
                        )}
                        {copyStatus === 'success' ? 'Copied MD!' : copyStatus === 'failure' ? 'Copy Failed!' : 'Copy MD'}
                      </button>

                      {/* Download Markdown */}
                      <button
                        type="button"
                        onClick={() => handleDownloadMarkdown(selectedBrief)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          background: 'var(--accent)',
                          color: '#fff',
                          padding: '0.35rem 0.65rem',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          outline: 'none',
                          border: 'none',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--accent-hover)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'var(--accent)';
                        }}
                      >
                        <FileDown size={12} /> Download MD
                      </button>
                    </div>
                  </div>

                  {/* Brief Scrollable Body */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                    {/* Workflow & Editorial Controls section */}
                    <div style={{ background: 'rgba(99, 102, 241, 0.03)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--card-border)', paddingBottom: '0.5rem', marginBottom: '0.25rem' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Editorial Workflow & Controls
                        </span>
                        {workflowMap[selectedBrief.id]?.updatedAt && (
                          <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>
                            Updated: {new Date(workflowMap[selectedBrief.id].updatedAt!).toLocaleString()}
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                        {/* Status Select */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                          <label style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 500 }}>Workflow Status</label>
                          <select
                            value={workflowMap[selectedBrief.id]?.status || 'Draft'}
                            onChange={async (e) => {
                              const status = e.target.value as ContentBriefWorkflowStatus;
                              const tempItem: ContentBriefWorkflowItem = {
                                ...(workflowMap[selectedBrief.id] || { status: 'Draft' }),
                                status,
                                updatedAt: new Date().toISOString(),
                              };
                              setWorkflowMap(prev => ({
                                ...prev,
                                [selectedBrief.id]: tempItem
                              }));
                              try {
                                const updatedItem = await updateContentBriefWorkflowItemAsync(selectedBrief.id, { status });
                                setWorkflowMap(prev => ({
                                  ...prev,
                                  [selectedBrief.id]: updatedItem
                                }));
                              } catch (err) {
                                console.error('Failed to update status:', err);
                              }
                            }}
                            style={{
                              padding: '0.4rem 0.5rem',
                              fontSize: '0.8rem',
                              background: 'var(--background)',
                              border: '1px solid var(--card-border)',
                              borderRadius: '6px',
                              color: 'var(--foreground)',
                              outline: 'none',
                              cursor: 'pointer',
                              width: '100%',
                            }}
                          >
                            {WORKFLOW_STATUSES.map((status) => (
                              <option key={status} value={status}>{status}</option>
                            ))}
                          </select>
                        </div>

                        {/* Owner Input */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                          <label style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 500 }}>Owner</label>
                          <input
                            type="text"
                            placeholder="Assign owner..."
                            value={workflowMap[selectedBrief.id]?.owner || ''}
                            onChange={async (e) => {
                              const owner = e.target.value;
                              const tempItem: ContentBriefWorkflowItem = {
                                ...(workflowMap[selectedBrief.id] || { status: 'Draft' }),
                                owner,
                                updatedAt: new Date().toISOString(),
                              };
                              setWorkflowMap(prev => ({
                                ...prev,
                                [selectedBrief.id]: tempItem
                              }));
                              try {
                                const updatedItem = await updateContentBriefWorkflowItemAsync(selectedBrief.id, { owner });
                                setWorkflowMap(prev => ({
                                  ...prev,
                                  [selectedBrief.id]: updatedItem
                                }));
                              } catch (err) {
                                console.error('Failed to update owner:', err);
                              }
                            }}
                            style={{
                              padding: '0.4rem 0.5rem',
                              fontSize: '0.8rem',
                              background: 'var(--background)',
                              border: '1px solid var(--card-border)',
                              borderRadius: '6px',
                              color: 'var(--foreground)',
                              outline: 'none',
                              width: '100%',
                            }}
                          />
                        </div>

                        {/* Due Date Input */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                          <label style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 500 }}>Due Date</label>
                          <input
                            type="date"
                            value={workflowMap[selectedBrief.id]?.dueDate || ''}
                            onChange={async (e) => {
                              const dueDate = e.target.value;
                              const tempItem: ContentBriefWorkflowItem = {
                                ...(workflowMap[selectedBrief.id] || { status: 'Draft' }),
                                dueDate,
                                updatedAt: new Date().toISOString(),
                              };
                              setWorkflowMap(prev => ({
                                ...prev,
                                [selectedBrief.id]: tempItem
                              }));
                              try {
                                const updatedItem = await updateContentBriefWorkflowItemAsync(selectedBrief.id, { dueDate });
                                setWorkflowMap(prev => ({
                                  ...prev,
                                  [selectedBrief.id]: updatedItem
                                }));
                              } catch (err) {
                                console.error('Failed to update due date:', err);
                              }
                            }}
                            style={{
                              padding: '0.4rem 0.5rem',
                              fontSize: '0.8rem',
                              background: 'var(--background)',
                              border: '1px solid var(--card-border)',
                              borderRadius: '6px',
                              color: 'var(--foreground)',
                              outline: 'none',
                              width: '100%',
                            }}
                          />
                        </div>
                      </div>

                      {/* Notes Textarea */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        <label style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 500 }}>Editorial Notes</label>
                        <textarea
                          placeholder="Add notes for writers/editors..."
                          value={workflowMap[selectedBrief.id]?.notes || ''}
                          rows={2}
                          onChange={async (e) => {
                            const notes = e.target.value;
                            const tempItem: ContentBriefWorkflowItem = {
                              ...(workflowMap[selectedBrief.id] || { status: 'Draft' }),
                              notes,
                              updatedAt: new Date().toISOString(),
                            };
                            setWorkflowMap(prev => ({
                              ...prev,
                              [selectedBrief.id]: tempItem
                            }));
                            try {
                              const updatedItem = await updateContentBriefWorkflowItemAsync(selectedBrief.id, { notes });
                              setWorkflowMap(prev => ({
                                ...prev,
                                [selectedBrief.id]: updatedItem
                              }));
                            } catch (err) {
                              console.error('Failed to update notes:', err);
                            }
                          }}
                          style={{
                            padding: '0.4rem 0.5rem',
                            fontSize: '0.8rem',
                            background: 'var(--background)',
                            border: '1px solid var(--card-border)',
                            borderRadius: '6px',
                            color: 'var(--foreground)',
                            outline: 'none',
                            resize: 'vertical',
                            width: '100%',
                          }}
                        />
                      </div>

                      {/* Quick Archive/Unarchive Action */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
                        <button
                          type="button"
                          onClick={async () => {
                            const currentStatus = workflowMap[selectedBrief.id]?.status || 'Draft';
                            const newStatus: ContentBriefWorkflowStatus = currentStatus === 'Archived' ? 'Draft' : 'Archived';
                            const tempItem: ContentBriefWorkflowItem = {
                              ...(workflowMap[selectedBrief.id] || { status: 'Draft' }),
                              status: newStatus,
                              updatedAt: new Date().toISOString(),
                            };
                            setWorkflowMap(prev => ({
                              ...prev,
                              [selectedBrief.id]: tempItem
                            }));
                            try {
                              const updatedItem = await updateContentBriefWorkflowItemAsync(selectedBrief.id, { status: newStatus });
                              setWorkflowMap(prev => ({
                                ...prev,
                                [selectedBrief.id]: updatedItem
                              }));
                            } catch (err) {
                              console.error('Failed to archive brief:', err);
                            }
                          }}
                          style={{
                            background: 'transparent',
                            color: (workflowMap[selectedBrief.id]?.status || 'Draft') === 'Archived' ? 'var(--accent)' : 'var(--danger)',
                            border: 'none',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem'
                          }}
                        >
                          {(workflowMap[selectedBrief.id]?.status || 'Draft') === 'Archived' ? 'Unarchive Brief' : 'Archive Brief'}
                        </button>
                      </div>
                    </div>

                    {/* Overview & Metadata section */}
                    <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '0.85rem' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--foreground)', borderBottom: '1px solid var(--card-border)', paddingBottom: '0.35rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        1. Overview & SEO Metrics
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1rem' }}>
                        <div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>Monthly Search Volume</div>
                          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--foreground)' }}>
                            {selectedBrief.monthlyVolumeTotal.toLocaleString()} <span style={{ fontSize: '0.7rem', fontWeight: 400, color: 'var(--muted)' }}>/mo</span>
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>Avg Difficulty</div>
                          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--foreground)' }}>
                            {selectedBrief.avgDifficulty} <span style={{ fontSize: '0.7rem', fontWeight: 400, color: 'var(--muted)' }}>/100</span>
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>Opportunity Score</div>
                          <div style={{ display: 'flex', alignItems: 'center', marginTop: '0.1rem' }}>
                            <ScoreBadge score={selectedBrief.opportunityScore} />
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>Keywords Grouped</div>
                          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--foreground)' }}>
                            {selectedBrief.sourceRowCount}
                          </div>
                        </div>
                      </div>

                      {Object.keys(selectedBrief.intentMix).length > 0 && (
                        <div style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px dashed var(--card-border)' }}>
                          <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>Search Intent Profile</div>
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {Object.entries(selectedBrief.intentMix).map(([intent, percentage]) => (
                              <span key={intent} style={{
                                fontSize: '0.72rem',
                                color: 'var(--foreground)',
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid var(--card-border)',
                                padding: '0.15rem 0.4rem',
                                borderRadius: '4px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                              }}>
                                <span>{intent}:</span>
                                <strong>{percentage}%</strong>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Target Keywords section */}
                    <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '0.85rem' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--foreground)', borderBottom: '1px solid var(--card-border)', paddingBottom: '0.35rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        2. Target Keywords
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginBottom: '0.15rem' }}>Primary Keyword (Focus)</div>
                          <div style={{ display: 'inline-block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--accent)', background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.2)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                            {selectedBrief.primaryKeyword}
                          </div>
                        </div>
                        {selectedBrief.secondaryKeywords.length > 0 && (
                          <div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>Secondary Keywords to Include</div>
                            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                              {selectedBrief.secondaryKeywords.map((kw, i) => (
                                <span key={i} style={{ fontSize: '0.72rem', color: 'var(--foreground)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--card-border)', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                                  {kw}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Outline section */}
                    <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '0.85rem' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--foreground)', borderBottom: '1px solid var(--card-border)', paddingBottom: '0.35rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        3. Recommended Outline / Page Structure
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--foreground)', background: 'var(--code-bg)', border: '1px solid var(--card-border)', borderRadius: '6px', padding: '0.75rem' }}>
                        {selectedBrief.outline.map((line, idx) => {
                          const isH3 = line.startsWith('###');
                          return (
                            <div key={idx} style={{
                              paddingLeft: isH3 ? '1.5rem' : '0.5rem',
                              borderLeft: isH3 ? '1px solid var(--card-border)' : 'none',
                              color: isH3 ? 'var(--muted)' : 'var(--accent)',
                              fontWeight: isH3 ? 400 : 600,
                              lineHeight: '1.4',
                            }}>
                              {line}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Interactive Checklist section */}
                    <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '0.85rem' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--foreground)', borderBottom: '1px solid var(--card-border)', paddingBottom: '0.35rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        4. On-Page SEO Checklist
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                        {checklistItems.map((text, idx) => {
                          const isChecked = !!(workflowMap[selectedBrief.id]?.checkedItems?.[idx]);
                          return (
                            <label key={idx} style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: '0.5rem',
                              cursor: 'pointer',
                              fontSize: '0.76rem',
                              color: 'var(--foreground)',
                              opacity: isChecked ? 0.55 : 1,
                              transition: 'opacity 0.15s ease',
                            }}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={async (e) => {
                                  const updatedChecked = {
                                    ...(workflowMap[selectedBrief.id]?.checkedItems || {}),
                                    [idx]: e.target.checked,
                                  };
                                  const tempItem: ContentBriefWorkflowItem = {
                                    ...(workflowMap[selectedBrief.id] || { status: 'Draft' }),
                                    checkedItems: updatedChecked,
                                    updatedAt: new Date().toISOString(),
                                  };
                                  setWorkflowMap((prev) => ({
                                    ...prev,
                                    [selectedBrief.id]: tempItem,
                                  }));
                                  try {
                                    const updatedItem = await updateContentBriefWorkflowItemAsync(selectedBrief.id, { checkedItems: updatedChecked });
                                    setWorkflowMap((prev) => ({
                                      ...prev,
                                      [selectedBrief.id]: updatedItem,
                                    }));
                                  } catch (err) {
                                    console.error('Failed to update checklist item:', err);
                                  }
                                }}
                                style={{
                                  marginTop: '0.15rem',
                                  cursor: 'pointer',
                                  accentColor: 'var(--accent)',
                                }}
                              />
                              <span style={{
                                textDecoration: isChecked ? 'line-through' : 'none',
                                lineHeight: '1.3',
                              }}>
                                {text}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {/* Competitor References section */}
                    <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '0.85rem' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--foreground)', borderBottom: '1px solid var(--card-border)', paddingBottom: '0.35rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        5. Competitor References
                      </div>
                      {selectedBrief.competitorReferences.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                          {selectedBrief.competitorReferences.map((url, i) => (
                            <a
                              key={i}
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                fontSize: '0.74rem',
                                color: 'var(--accent)',
                                textDecoration: 'none',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
                            >
                              <ExternalLink size={10} style={{ flexShrink: 0 }} />
                              {url}
                            </a>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.74rem', color: 'var(--muted)', fontStyle: 'italic' }}>
                          No direct competitor page URL matches detected in database. Check competitor pages database for general insights.
                        </div>
                      )}
                    </div>

                    {/* Link Angles section */}
                    <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '0.85rem' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--foreground)', borderBottom: '1px solid var(--card-border)', paddingBottom: '0.35rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        6. Link Angles & Backlink Targets
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {selectedBrief.backlinkOrLinkAngleIdeas.map((idea, idx) => (
                          <div key={idx} style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '0.4rem',
                            fontSize: '0.74rem',
                            color: 'var(--foreground)',
                            lineHeight: '1.4',
                          }}>
                            <ChevronRight size={12} style={{ color: 'var(--accent)', marginTop: '0.15rem', flexShrink: 0 }} />
                            <span>{idea}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
