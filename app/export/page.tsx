'use client';

import { useEffect, useState, useMemo } from 'react';
import * as db from '@/lib/db';
import {
  filterRowsBySite,
  getSelectedSite,
  getSelectedProjectId,
  siteSelectionLabel,
  siteSelectionSlug,
  type SiteSelection,
} from '@/lib/storage';
import {
  exportKeywordsCSV,
  exportBacklinksCSV,
  exportContentPlanCSV,
  exportBacklinkTargetsCSV,
  exportActionPlanMD,
  exportHermesContentPlanCSV,
  exportHermesContentPlanMD,
  exportWorkflowActionPlanCSV,
  exportWorkflowActionPlanMD,
  exportContentBriefPackMD,
  exportCompetitiveIntelMD,
  exportExecutiveStrategyReportMD,
} from '@/lib/export';
import { buildOpportunityQueue } from '@/lib/opportunity-queue';
import { getOpportunityWorkflowMap, type OpportunityWorkflowStatus } from '@/lib/opportunity-workflow';
import { getActionPlanMetadataMap, type ActionPlanItemMetadata } from '@/lib/action-plan-metadata';
import { buildContentBriefs } from '@/lib/content-briefs';
import { getCompetitorDomainSummaries } from '@/lib/competitive-intelligence';
import type {
  KeywordRecord,
  BacklinkRecord,
  CompetitorPageRecord,
  KeywordGapRecord,
  ReferringDomainRecord,
  CompetitorRecord,
} from '@/lib/types';

export default function ExportPage() {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [selectedSite, setSelectedSiteState] = useState<SiteSelection>(null);

  // Raw database datasets
  const [keywords, setKeywords] = useState<KeywordRecord[]>([]);
  const [keywordGaps, setKeywordGaps] = useState<KeywordGapRecord[]>([]);
  const [backlinks, setBacklinks] = useState<BacklinkRecord[]>([]);
  const [competitorPages, setCompetitorPages] = useState<CompetitorPageRecord[]>([]);
  const [referringDomains, setReferringDomains] = useState<ReferringDomainRecord[]>([]);
  const [projectCompetitors, setProjectCompetitors] = useState<CompetitorRecord[]>([]);
  const [workflowMap, setWorkflowMap] = useState<Record<string, OpportunityWorkflowStatus>>({});
  const [metadataMap, setMetadataMap] = useState<Record<string, ActionPlanItemMetadata>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const site = getSelectedSite();
    setSelectedSiteState(site);

    const wMap = getOpportunityWorkflowMap();
    setWorkflowMap(wMap);

    const mMap = getActionPlanMetadataMap();
    setMetadataMap(mMap);

    Promise.all([
      db.getKeywords(),
      db.getKeywordGaps(),
      db.getBacklinks(),
      db.getCompetitorPages(),
      db.getReferringDomains(),
      db.getCompetitors(),
    ])
      .then(([kws, gaps, bls, pages, domains, comps]) => {
        setKeywords(kws);
        setKeywordGaps(gaps);
        setBacklinks(bls);
        setCompetitorPages(pages);
        setReferringDomains(domains);
        setProjectCompetitors(comps);
      })
      .finally(() => setLoading(false));
  }, []);

  const scopeLabel = siteSelectionLabel(selectedSite);
  const scopeSlug = siteSelectionSlug(selectedSite);

  // Filter datasets by project scope
  const scopedKeywords = useMemo(() => filterRowsBySite(keywords, selectedSite), [keywords, selectedSite]);
  const scopedKeywordGaps = useMemo(() => filterRowsBySite(keywordGaps, selectedSite), [keywordGaps, selectedSite]);
  const scopedBacklinks = useMemo(() => filterRowsBySite(backlinks, selectedSite), [backlinks, selectedSite]);
  const scopedCompetitorPages = useMemo(() => filterRowsBySite(competitorPages, selectedSite), [competitorPages, selectedSite]);
  const scopedReferringDomains = useMemo(() => filterRowsBySite(referringDomains, selectedSite), [referringDomains, selectedSite]);

  const selectedProjectId = useMemo(() => getSelectedProjectId(), [selectedSite]);
  const scopedProjectCompetitors = useMemo(() => {
    if (!selectedProjectId) return projectCompetitors;
    return projectCompetitors.filter((comp) => comp.projectId === selectedProjectId);
  }, [projectCompetitors, selectedProjectId]);

  // Derived deliverables and strategic content
  const queue = useMemo(() => {
    return buildOpportunityQueue(scopedKeywords, scopedKeywordGaps, scopedBacklinks, scopedCompetitorPages);
  }, [scopedKeywords, scopedKeywordGaps, scopedBacklinks, scopedCompetitorPages]);

  const enrichedQueue = useMemo(() => {
    return queue.map((item) => {
      const meta = metadataMap[item.id] || {};
      return {
        ...item,
        status: workflowMap[item.id] || 'New',
        owner: meta.owner,
        dueDate: meta.dueDate,
        notes: meta.notes,
        updatedAt: meta.updatedAt,
      };
    });
  }, [queue, workflowMap, metadataMap]);

  // Filter queue to items matching actionable statuses
  const actionPlanQueue = useMemo(() => {
    return enrichedQueue.filter(
      (item) => item.status === 'Planned' || item.status === 'In Progress' || item.status === 'Done'
    );
  }, [enrichedQueue]);

  const workflowCounts = useMemo(() => {
    const planned = actionPlanQueue.filter((item) => item.status === 'Planned').length;
    const inProgress = actionPlanQueue.filter((item) => item.status === 'In Progress').length;
    const done = actionPlanQueue.filter((item) => item.status === 'Done').length;
    return { planned, inProgress, done };
  }, [actionPlanQueue]);

  const briefs = useMemo(() => {
    return buildContentBriefs(scopedKeywords, scopedKeywordGaps, scopedCompetitorPages, scopedBacklinks);
  }, [scopedKeywords, scopedKeywordGaps, scopedCompetitorPages, scopedBacklinks]);

  const competitorSummaries = useMemo(() => {
    return getCompetitorDomainSummaries({
      competitorPages: scopedCompetitorPages,
      keywordGaps: scopedKeywordGaps,
      backlinks: scopedBacklinks,
      referringDomains: scopedReferringDomains,
      projectCompetitors: scopedProjectCompetitors,
      activeProjectDomain: selectedSite?.domain,
    });
  }, [scopedCompetitorPages, scopedKeywordGaps, scopedBacklinks, scopedReferringDomains, scopedProjectCompetitors, selectedSite]);

  const hermesKeywords = useMemo(() => {
    return scopedKeywords.filter((k) => {
      const r = k.raw || {};
      return !!(r.cluster || r.Cluster || r['Cluster'] || r.page_target || r['page target'] || r.pageTarget);
    });
  }, [scopedKeywords]);

  async function run(label: string, fn: () => void) {
    setBusy(label);
    try {
      fn();
      setMessage('✓ Deliverable generated — check your downloads folder.');
    } catch (e) {
      setMessage(`Error: ${String(e)}`);
    }
    setBusy('');
    setTimeout(() => setMessage(''), 4000);
  }

  // Organized deliverables
  const sections = [
    {
      title: 'Executive Strategy & Client Reports',
      description: 'High-level strategy documents and summaries structured for client presentations and campaign updates.',
      cards: [
        {
          id: 'exec',
          title: 'Executive SEO Strategy Report',
          icon: '👑',
          description: 'A comprehensive, multi-section strategy report combining scope summary, SEO dataset metrics, workflow counters, top opportunities, and competitor summaries.',
          count: loading ? 'Calculating...' : 'Ready (Client-ready Markdown)',
          action: () => run('exec', () => exportExecutiveStrategyReportMD({
            scopeLabel,
            scopeSlug,
            selectedSite,
            counts: {
              keywords: scopedKeywords.length,
              gaps: scopedKeywordGaps.length,
              backlinks: scopedBacklinks.length,
              pages: scopedCompetitorPages.length,
              domains: scopedReferringDomains.length,
            },
            workflowCounts,
            topOpportunities: queue,
            topBriefs: briefs,
            topCompetitors: competitorSummaries,
          })),
        },
        {
          id: 'md',
          title: 'Top SEO Action Plan',
          icon: '📋',
          description: 'Formatted Markdown action plan highlighting top keyword opportunities, backlink targets, and competitor pages.',
          count: loading ? 'Calculating...' : `Includes top ${Math.min(20, scopedKeywords.length)} keyword opportunities`,
          action: () => run('md', () => exportActionPlanMD(scopedKeywords, scopedBacklinks, scopedCompetitorPages, scopeLabel, scopeSlug)),
        },
        {
          id: 'intel',
          title: 'Competitive Intelligence Report',
          icon: '🕵️‍♂️',
          description: 'Analyzes competitor domains showing organic traffic, pages, gaps, link prospects, referring domains, and opportunity scores.',
          count: loading ? 'Calculating...' : `${competitorSummaries.length} competitor domains analyzed`,
          action: () => run('intel', () => exportCompetitiveIntelMD(competitorSummaries, scopeLabel, scopeSlug)),
        },
      ]
    },
    {
      title: 'Execution & Team Deliverables',
      description: 'Structured assets ready for writers, link-builders, and project management execution.',
      cards: [
        {
          id: 'briefs',
          title: 'Content Brief Pack',
          icon: '📦',
          description: 'Combines all generated keyword cluster content briefs into a single Markdown file, complete with outlines, SEO checklists, and a table of contents.',
          count: loading ? 'Calculating...' : `${briefs.length} briefs ready for content writers`,
          action: () => run('briefs', () => exportContentBriefPackMD(briefs, scopeLabel, scopeSlug)),
        },
        {
          id: 'wf-csv',
          title: 'Workflow Action Plan (CSV)',
          icon: '📅',
          description: 'Monitored campaign tasks in Planned, In Progress, and Done stages with owners, due dates, and notes.',
          count: loading ? 'Calculating...' : `${workflowCounts.planned} planned, ${workflowCounts.inProgress} in progress, ${workflowCounts.done} done`,
          action: () => run('wf-csv', () => exportWorkflowActionPlanCSV(actionPlanQueue, scopeSlug)),
        },
        {
          id: 'wf-md',
          title: 'Workflow Action Plan (Markdown)',
          icon: '📝',
          description: 'Tracked opportunities filtered to actionable workflow statuses formatted in a Markdown table for clean execution logs.',
          count: loading ? 'Calculating...' : `${workflowCounts.planned} planned, ${workflowCounts.inProgress} in progress, ${workflowCounts.done} done`,
          action: () => run('wf-md', () => exportWorkflowActionPlanMD(actionPlanQueue, scopeLabel, scopeSlug)),
        },
      ]
    },
    {
      title: 'Raw SEO Datasets & Bulk Exports',
      description: 'Cleaned database CSV files and planners for spreadsheet analysis and advanced custom filtering.',
      cards: [
        {
          id: 'kw',
          title: 'All Keywords CSV',
          icon: '◈',
          description: 'Every keyword with monthly search volume, keyword difficulty, CPC, intent, tag, and opportunity score.',
          count: loading ? 'Calculating...' : `${scopedKeywords.length.toLocaleString()} keywords`,
          action: () => run('kw', () => exportKeywordsCSV(scopedKeywords, scopeSlug)),
        },
        {
          id: 'bl',
          title: 'All Backlinks CSV',
          icon: '⛓',
          description: 'Every backlink with source/target URLs, anchor text, domain authority, tag, and opportunity score.',
          count: loading ? 'Calculating...' : `${scopedBacklinks.length.toLocaleString()} backlinks`,
          action: () => run('bl', () => exportBacklinksCSV(scopedBacklinks, scopeSlug)),
        },
        {
          id: 'cp',
          title: 'Content Plan CSV',
          icon: '✎',
          description: 'Only tagged (non-Ignore) keywords as a prioritized content calendar.',
          count: loading ? 'Calculating...' : `${scopedKeywords.filter((k) => k.tag && k.tag !== 'Ignore').length.toLocaleString()} tagged keywords`,
          action: () => run('cp', () => exportContentPlanCSV(scopedKeywords, scopeSlug)),
        },
        {
          id: 'hcsv',
          title: 'Hermes Content Plan CSV',
          icon: '📋',
          description: 'Hermes keyword_report data (cluster/page_target) exported as CSV. Uses only existing keyword data with safe raw fallbacks.',
          count: loading ? 'Calculating...' : (hermesKeywords.length > 0 ? `${hermesKeywords.length.toLocaleString()} Hermes keywords` : 'No Hermes data'),
          action: () => run('hcsv', () => exportHermesContentPlanCSV(scopedKeywords, scopeSlug)),
        },
        {
          id: 'hmd',
          title: 'Hermes Content Plan Markdown',
          icon: '📝',
          description: 'Grouped Cluster → Page Target Markdown matching the Hermes planner view. Helpful empty state included when no data.',
          count: loading ? 'Calculating...' : (hermesKeywords.length > 0 ? `${hermesKeywords.length.toLocaleString()} Hermes keywords` : 'No Hermes data'),
          action: () => run('hmd', () => exportHermesContentPlanMD(scopedKeywords, scopeLabel, scopeSlug)),
        },
        {
          id: 'bt',
          title: 'Backlink Targets CSV',
          icon: '🎯',
          description: 'Rows tagged as "Backlink Target" — your link acquisition hit list.',
          count: loading ? 'Calculating...' : `${scopedBacklinks.filter((b) => b.tag === 'Backlink Target').length.toLocaleString()} targets`,
          action: () => run('bt', () => exportBacklinkTargetsCSV(scopedBacklinks, scopeSlug)),
        },
      ]
    }
  ];

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '3rem' }}>
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.4rem', letterSpacing: '-0.02em' }}>Deliverables Hub</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem', lineHeight: '1.4' }}>
          Download ready-to-present client reports, execution-focused workflow files, and cleaned raw datasets mapped to your active project scope.
        </p>
      </div>

      <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '1rem 1.25rem', marginBottom: '1.75rem' }}>
        <div style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem', fontWeight: 700 }}>
          Active Project Scope
        </div>
        <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--foreground)' }}>{scopeLabel}</div>
        <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.35rem', lineHeight: '1.4' }}>
          All strategic reports, briefs, and keyword exports automatically filter based on the active Project or Site scope. Select a specific project in the top bar to filter, or select "All Projects" to include all data.
        </div>
      </div>

      {message && (
        <div style={{ background: '#10b98115', border: '1px solid #10b98140', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1.5rem', fontSize: '0.875rem', color: '#10b981', fontWeight: 500 }}>
          {message}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {sections.map((section) => (
          <div key={section.title}>
            <div style={{ marginBottom: '0.85rem' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--foreground)', marginBottom: '0.2rem' }}>{section.title}</h2>
              <p style={{ color: 'var(--muted)', fontSize: '0.8rem', lineHeight: '1.3' }}>{section.description}</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {section.cards.map((card) => (
                <div
                  key={card.title}
                  style={{
                    background: 'var(--card)',
                    border: '1px solid var(--card-border)',
                    borderRadius: '10px',
                    padding: '1.1rem 1.35rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1.5rem',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.01)'
                  }}
                >
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '1.6rem', marginTop: '0.1rem', display: 'inline-block', minWidth: '1.75rem', textAlign: 'center' }}>
                      {card.icon}
                    </span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--foreground)', marginBottom: '0.2rem' }}>
                        {card.title}
                      </div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--muted)', lineHeight: '1.4' }}>
                        {card.description}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--accent)', marginTop: '0.4rem', fontWeight: 700 }}>
                        {card.count}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={card.action}
                    disabled={!!busy || loading}
                    style={{
                      flexShrink: 0,
                      background: (busy || loading) ? 'var(--card-border)' : 'var(--accent)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '7px',
                      padding: '0.5rem 1.15rem',
                      cursor: (busy || loading) ? 'wait' : 'pointer',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {busy === card.id ? '…' : '⤓ Export'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: '2.5rem', background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '1.25rem' }}>
        <h3 style={{ fontSize: '0.78rem', fontWeight: 800, marginBottom: '0.5rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Production & Workflow Optimization
        </h3>
        <p style={{ fontSize: '0.82rem', color: 'var(--muted)', lineHeight: '1.45' }}>
          To build high-value deliverables, begin by tagging pages/keywords in the Database pages and assigning target stages on the Workflow Board. Brief packs will only compile valid clusters, and strategy reports will highlight the top priorities and competitor insights that have been curated within your scoped dataset.
        </p>
      </div>

      <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--muted)', textAlign: 'center' }}>
        Hermes planner exports require imported keyword records containing cluster, page_target, or priority fields.
      </div>
    </div>
  );
}
