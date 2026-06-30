import type { KeywordRecord, BacklinkRecord, CompetitorPageRecord } from './types';
import type { OpportunityQueueItem } from './opportunity-queue';
import type { OpportunityWorkflowStatus } from './opportunity-workflow';
import type { ContentBrief } from './content-briefs';
import { generateContentBriefMarkdown } from './content-briefs';
import type { CompetitorSummary } from './competitive-intelligence';
import type { SiteSelection } from './storage';


function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      headers.map((h) => {
        const v = String(r[h] ?? '');
        return v.includes(',') || v.includes('"') || v.includes('\n')
          ? `"${v.replace(/"/g, '""')}"`
          : v;
      }).join(',')
    ),
  ];
  return lines.join('\n');
}

function download(content: string, filename: string, mime = 'text/csv') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function scopedFilename(base: string, extension: string, scopeSlug?: string): string {
  return `${base}-${scopeSlug || 'all-projects'}.${extension}`;
}

export function exportKeywordsCSV(rows: KeywordRecord[], scopeSlug?: string): void {
  const data = rows.map((r) => ({
    Keyword: r.keyword,
    'Monthly Search Volume': r.volume ?? '',
    Difficulty: r.difficulty ?? '',
    CPC: r.cpc ?? '',
    Intent: r.intent ?? '',
    Tag: r.tag ?? '',
    'Opportunity Score': r.opportunityScore ?? '',
  }));
  download(toCSV(data), scopedFilename('serpvault-keywords', 'csv', scopeSlug));
}

export function exportBacklinksCSV(rows: BacklinkRecord[], scopeSlug?: string): void {
  const data = rows.map((r) => ({
    'Source URL': r.sourceUrl,
    'Target URL': r.targetUrl,
    'Anchor Text': r.anchorText ?? '',
    DA: r.domainAuthority ?? '',
    DR: r.domainRating ?? '',
    Tag: r.tag ?? '',
    'Opportunity Score': r.opportunityScore ?? '',
  }));
  download(toCSV(data), scopedFilename('serpvault-backlinks', 'csv', scopeSlug));
}

export function exportContentPlanCSV(rows: KeywordRecord[], scopeSlug?: string): void {
  const tagged = rows.filter((r) => r.tag && r.tag !== 'Ignore');
  const data = tagged.map((r) => ({
    Keyword: r.keyword,
    'Content Type': r.tag ?? '',
    'Monthly Search Volume': r.volume ?? '',
    Difficulty: r.difficulty ?? '',
    Intent: r.intent ?? '',
    'Opportunity Score': r.opportunityScore ?? '',
    'Target URL': r.url ?? '',
  }));
  download(toCSV(data), scopedFilename('serpvault-content-plan', 'csv', scopeSlug));
}

export function exportBacklinkTargetsCSV(rows: BacklinkRecord[], scopeSlug?: string): void {
  const tagged = rows.filter((r) => r.tag === 'Backlink Target');
  const data = tagged.map((r) => ({
    'Source URL': r.sourceUrl,
    'Anchor Text': r.anchorText ?? '',
    DA: r.domainAuthority ?? '',
    'Opportunity Score': r.opportunityScore ?? '',
  }));
  download(toCSV(data), scopedFilename('serpvault-backlink-targets', 'csv', scopeSlug));
}

export function exportActionPlanMD(
  keywords: KeywordRecord[],
  backlinks: BacklinkRecord[],
  competitors: CompetitorPageRecord[],
  scopeLabel = 'All Projects',
  scopeSlug?: string
): void {
  const date = new Date().toLocaleDateString();
  const topKw = [...keywords]
    .sort((a, b) => (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0))
    .slice(0, 20);
  const topBl = [...backlinks]
    .filter((r) => r.tag === 'Backlink Target')
    .sort((a, b) => (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0))
    .slice(0, 10);
  const topComp = [...competitors]
    .sort((a, b) => (b.traffic ?? 0) - (a.traffic ?? 0))
    .slice(0, 10);

  const lines: string[] = [
    `# SERPVault Action Plan — ${date}`,
    '',
    `**Export Scope:** ${scopeLabel}`,
    '',
    '## Top Keyword Opportunities',
    '',
    '| Keyword | Monthly Search Volume | Difficulty | Intent | Tag | Score |',
    '|---------|-----------------------|------------|--------|-----|-------|',
    ...topKw.map(
      (r) =>
        `| ${r.keyword} | ${r.volume ?? '-'} | ${r.difficulty ?? '-'} | ${r.intent ?? '-'} | ${r.tag ?? '-'} | ${r.opportunityScore ?? '-'} |`
    ),
    '',
    '## Top Backlink Targets',
    '',
    '| Source URL | Anchor | DA | Score |',
    '|------------|--------|----|-------|',
    ...topBl.map(
      (r) =>
        `| ${r.sourceUrl} | ${r.anchorText ?? '-'} | ${r.domainAuthority ?? '-'} | ${r.opportunityScore ?? '-'} |`
    ),
    '',
    '## Competitor Top Pages',
    '',
    '| URL | Traffic | Keywords |',
    '|-----|---------|----------|',
    ...topComp.map((r) => `| ${r.url} | ${r.traffic ?? '-'} | ${r.keywords ?? '-'} |`),
  ];

  download(lines.join('\n'), scopedFilename('serpvault-action-plan', 'md', scopeSlug), 'text/markdown');
}

function getHermesField(raw: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = raw[k];
    if (v != null && v !== '') return v;
  }
  return '-';
}

export function exportHermesContentPlanCSV(rows: KeywordRecord[], scopeSlug?: string): void {
  const hermesRows = rows.filter((k) => {
    const r = k.raw || {};
    return !!(r.cluster || r.Cluster || r['Cluster'] || r.page_target || r['page target'] || r.pageTarget);
  });
  const data = hermesRows.map((row) => {
    const r = row.raw || {};
    return {
      keyword: row.keyword,
      cluster: getHermesField(r, 'cluster', 'Cluster', 'CLUSTER'),
      page_target: getHermesField(r, 'page_target', 'page target', 'pageTarget', 'Page Target'),
      priority: getHermesField(r, 'priority', 'Priority'),
      serpvault_tag: getHermesField(r, 'serpvault_tag', 'serpvault tag', 'serpvaultTag'),
      intent: getHermesField(r, 'intent', 'Intent') || row.intent || '-',
      domain: getHermesField(r, 'domain', 'Domain'),
      location: getHermesField(r, 'location', 'Location', 'country', 'database'),
      niche: getHermesField(r, 'niche', 'Niche'),
    };
  });
  if (data.length === 0) {
    // still download empty? or handled in UI; per task, empty state in page
    download('keyword,cluster,page_target,priority,serpvault_tag,intent,domain,location,niche\n', scopedFilename('hermes-content-plan', 'csv', scopeSlug));
    return;
  }
  download(toCSV(data), scopedFilename('hermes-content-plan', 'csv', scopeSlug));
}

export function exportHermesContentPlanMD(rows: KeywordRecord[], scopeLabel = 'All Projects', scopeSlug?: string): void {
  const hermesRows = rows.filter((k) => {
    const r = k.raw || {};
    return !!(r.cluster || r.Cluster || r['Cluster'] || r.page_target || r['page target'] || r.pageTarget);
  });
  const date = new Date().toLocaleDateString();
  if (hermesRows.length === 0) {
    const md = `# Hermes Content Plan — ${date}\n\n**Export Scope:** ${scopeLabel}\n\nNo Hermes keyword data found. Upload a Hermes keyword_report CSV with cluster/page_target fields.`;
    download(md, scopedFilename('hermes-content-plan', 'md', scopeSlug), 'text/markdown');
    return;
  }

  // Group by cluster -> page_target (mirrors keywords page groupedPlanner)
  const clusterMap = new Map<string, Map<string, { meta: any; keywords: KeywordRecord[] }>>();
  for (const row of hermesRows) {
    const r = row.raw || {};
    const cluster = getHermesField(r, 'cluster', 'Cluster', 'CLUSTER');
    const pageTarget = getHermesField(r, 'page_target', 'page target', 'pageTarget', 'Page Target');
    if (!clusterMap.has(cluster)) clusterMap.set(cluster, new Map());
    const ptMap = clusterMap.get(cluster)!;
    if (!ptMap.has(pageTarget)) {
      ptMap.set(pageTarget, {
        meta: {
          priority: getHermesField(r, 'priority', 'Priority'),
          serpvault_tag: getHermesField(r, 'serpvault_tag', 'serpvault tag', 'serpvaultTag'),
          intent: getHermesField(r, 'intent', 'Intent') || row.intent || '-',
          domain: getHermesField(r, 'domain', 'Domain'),
          location: getHermesField(r, 'location', 'Location', 'country', 'database'),
          niche: getHermesField(r, 'niche', 'Niche'),
        },
        keywords: [],
      });
    }
    ptMap.get(pageTarget)!.keywords.push(row);
  }

  const lines: string[] = [
    `# Hermes Content Plan — ${date}`,
    '',
    `**Export Scope:** ${scopeLabel}`,
    '',
  ];
  for (const [cluster, ptMap] of clusterMap.entries()) {
    const total = Array.from(ptMap.values()).reduce((s, g) => s + g.keywords.length, 0);
    lines.push(`## 📁 Cluster: ${cluster} (${total} keywords)`);
    lines.push('');
    for (const [pageTarget, { meta, keywords }] of ptMap.entries()) {
      lines.push(`### 🎯 Page Target: ${pageTarget}`);
      lines.push('');
      lines.push(`- **Priority:** ${meta.priority}`);
      lines.push(`- **SV Tag:** ${meta.serpvault_tag}`);
      lines.push(`- **Intent:** ${meta.intent}`);
      lines.push(`- **Domain:** ${meta.domain}`);
      lines.push(`- **Location:** ${meta.location}`);
      lines.push(`- **Niche:** ${meta.niche}`);
      lines.push('');
      lines.push('**Keywords:**');
      for (const k of keywords) {
        const vol = k.volume != null ? ` (Monthly Search Volume: ${k.volume.toLocaleString()})` : '';
        lines.push(`- ${k.keyword}${vol}`);
      }
      lines.push('');
    }
  }

  download(lines.join('\n'), scopedFilename('hermes-content-plan', 'md', scopeSlug), 'text/markdown');
}

export function exportWorkflowActionPlanCSV(
  items: (OpportunityQueueItem & {
    status: OpportunityWorkflowStatus;
    owner?: string;
    dueDate?: string;
    notes?: string;
  })[],
  scopeSlug?: string
): void {
  const data = items.map((r) => ({
    Status: r.status,
    Type: r.type,
    Title: r.title,
    Detail: r.detail,
    Source: r.sourceLabel,
    'Recommended Action': r.recommendedAction,
    Score: r.score,
    Impact: r.impact,
    Owner: r.owner ?? '',
    'Due Date': r.dueDate ?? '',
    Notes: r.notes ?? '',
    href: r.href ?? '',
  }));
  download(toCSV(data), scopedFilename('serpvault-workflow-action-plan', 'csv', scopeSlug));
}

function cleanMDCell(val: unknown): string {
  if (val == null) return '-';
  const str = String(val).trim();
  if (str === '') return '-';
  return str.replace(/\|/g, '\\|').replace(/\s+/g, ' ');
}

export function exportWorkflowActionPlanMD(
  items: (OpportunityQueueItem & {
    status: OpportunityWorkflowStatus;
    owner?: string;
    dueDate?: string;
    notes?: string;
  })[],
  scopeLabel = 'All Projects',
  scopeSlug?: string
): void {
  const date = new Date().toLocaleDateString();
  const lines: string[] = [
    `# SERPVault Workflow Action Plan — ${date}`,
    '',
    `**Export Scope:** ${scopeLabel}`,
    '',
    '| Status | Type | Title | Detail | Source | Recommended Action | Score | Impact | Owner | Due Date | Notes | Link |',
    '|--------|------|-------|--------|--------|--------------------|-------|--------|-------|----------|-------|------|',
    ...items.map(
      (r) =>
        `| ${cleanMDCell(r.status)} | ${cleanMDCell(r.type)} | ${cleanMDCell(r.title)} | ${cleanMDCell(r.detail)} | ${cleanMDCell(r.sourceLabel)} | ${cleanMDCell(r.recommendedAction)} | ${cleanMDCell(r.score)} | ${cleanMDCell(r.impact)} | ${cleanMDCell(r.owner)} | ${cleanMDCell(r.dueDate)} | ${cleanMDCell(r.notes)} | ${r.href ? `[View](${r.href})` : '-'} |`
    ),
  ];

  download(lines.join('\n'), scopedFilename('serpvault-workflow-action-plan', 'md', scopeSlug), 'text/markdown');
}

export function exportContentBriefPackMD(
  briefs: ContentBrief[],
  scopeLabel = 'All Projects',
  scopeSlug?: string
): void {
  const date = new Date().toLocaleDateString();
  const lines: string[] = [
    `# Content Brief Pack — ${date}`,
    '',
    `**Export Scope:** ${scopeLabel}`,
    `**Total Briefs:** ${briefs.length}`,
    '',
    '## Table of Contents',
    '',
  ];

  if (briefs.length === 0) {
    lines.push('_No content briefs available to export. Ensure keywords or content opportunities are tagged first._');
  } else {
    briefs.forEach((brief, idx) => {
      lines.push(`${idx + 1}. [${brief.title}](#brief-${brief.id}) (${brief.suggestedContentType} | Monthly Search Volume: ${brief.monthlyVolumeTotal?.toLocaleString() ?? 0} | Difficulty: ${brief.avgDifficulty}/100)`);
    });

    lines.push('', '---', '');

    briefs.forEach((brief, idx) => {
      lines.push(`<a name="brief-${brief.id}"></a>`);
      lines.push(generateContentBriefMarkdown(brief));
      if (idx < briefs.length - 1) {
        lines.push('', '---', '');
      }
    });
  }

  download(lines.join('\n'), scopedFilename('serpvault-content-brief-pack', 'md', scopeSlug), 'text/markdown');
}

export function exportCompetitiveIntelMD(
  summaries: CompetitorSummary[],
  scopeLabel = 'All Projects',
  scopeSlug?: string
): void {
  const date = new Date().toLocaleDateString();
  const sorted = [...summaries].sort((a, b) => b.opportunityScore - a.opportunityScore);

  const lines: string[] = [
    `# SERPVault Competitive Intelligence Report — ${date}`,
    '',
    `**Export Scope:** ${scopeLabel}`,
    `**Total Competitor Domains Analyzed:** ${summaries.length}`,
    '',
    '## Competitor Domain Summaries',
    '',
    '| Competitor Domain | Est. Monthly Traffic | Pages Indexed | Content Gaps | Backlink Prospects | Referring Domains | Top Page | Configured? | Opportunity Score |',
    '|-------------------|----------------------|---------------|--------------|-------------------|-------------------|----------|-------------|-------------------|',
    ...sorted.map((s) => {
      const topPage = s.topPageUrl ? `[${s.topPageTitle || s.topPageUrl}](${s.topPageUrl})` : '-';
      const isConfig = s.isConfigured ? 'Yes' : 'No';
      return `| ${s.domain} | ${s.estTraffic?.toLocaleString() ?? 0} | ${s.pageCount} | ${s.gapKeywordCount} | ${s.backlinkProspectCount} | ${s.referringDomainCount} | ${topPage} | ${isConfig} | ${s.opportunityScore} / 100 |`;
    }),
  ];

  download(lines.join('\n'), scopedFilename('serpvault-competitive-intelligence', 'md', scopeSlug), 'text/markdown');
}

export interface ExecutiveReportParams {
  scopeLabel: string;
  scopeSlug?: string;
  selectedSite: SiteSelection;
  counts: {
    keywords: number;
    gaps: number;
    backlinks: number;
    pages: number;
    domains: number;
  };
  workflowCounts: {
    planned: number;
    inProgress: number;
    done: number;
  };
  topOpportunities: OpportunityQueueItem[];
  topBriefs: ContentBrief[];
  topCompetitors: CompetitorSummary[];
}

export function exportExecutiveStrategyReportMD(
  params: ExecutiveReportParams
): void {
  const date = new Date().toLocaleDateString();
  const {
    scopeLabel,
    scopeSlug,
    selectedSite,
    counts,
    workflowCounts,
    topOpportunities,
    topBriefs,
    topCompetitors,
  } = params;

  const lines: string[] = [
    `# SERPVault Executive SEO Strategy Report`,
    `*Generated on ${date}*`,
    '',
    '## 1. Executive Summary & Scope',
    `- **Project / Site Name:** ${scopeLabel}`,
    `- **Target Domain:** ${selectedSite?.domain || 'All Projects'}`,
    `- **Target Location/Database:** ${selectedSite?.location || '-'}`,
    `- **Niche Focus:** ${selectedSite?.niche || '-'}`,
    '',
    '## 2. SEO Dataset Overview',
    'Below is a summary of the data imported and analyzed for this project scope:',
    '',
    `| Dataset | Count | Description |`,
    `|---------|-------|-------------|`,
    `| **Keywords** | ${counts.keywords.toLocaleString()} | Total monitored keywords |`,
    `| **Keyword Gaps** | ${counts.gaps.toLocaleString()} | Keyword opportunities where competitors rank higher |`,
    `| **Backlink Opportunities** | ${counts.backlinks.toLocaleString()} | Competitor backlink pages |`,
    `| **Competitor Pages** | ${counts.pages.toLocaleString()} | High-performing competitor URLs |`,
    `| **Referring Domains** | ${counts.domains.toLocaleString()} | Domains linking to competitors |`,
    '',
    '## 3. Workflow Status Summary',
    'Status of the identified SEO deliverables and tasks:',
    `- **Planned Opportunities:** ${workflowCounts.planned}`,
    `- **In-Progress Tasks:** ${workflowCounts.inProgress}`,
    `- **Completed Deliverables:** ${workflowCounts.done}`,
    '',
    '## 4. Top 10 Priority SEO Opportunities',
    'The highest-value keyword and link opportunities currently in scope:',
    '',
    '| Rank | Type | Title | Opportunity Details | Opportunity Score |',
    '|------|------|-------|---------------------|-------------------|',
    ...topOpportunities.slice(0, 10).map((opt, idx) => {
      return `| ${idx + 1} | ${opt.type.toUpperCase()} | ${opt.title} | ${cleanMDCell(opt.detail)} | ${opt.score} / 100 |`;
    }),
    '',
    '## 5. Top Content Briefs',
    'Prioritized content structure recommendations based on keyword clusters:',
    '',
    '| Brief Title | Suggested URL | Primary Keyword | Monthly Search Volume | Opportunity Score |',
    '|-------------|---------------|-----------------|-----------------------|-------------------|',
    ...topBriefs.slice(0, 10).map((brief) => {
      return `| ${brief.title} | \`${brief.suggestedUrl}\` | **${brief.primaryKeyword}** | ${brief.monthlyVolumeTotal?.toLocaleString() ?? 0} | ${brief.opportunityScore} / 100 |`;
    }),
    '',
    '## 6. Competitive Intelligence Summary',
    'Top competitors identified in this project scope, ranked by opportunity score:',
    '',
    '| Competitor Domain | Est. Monthly Traffic | Pages Indexed | Content Gaps | Link Prospects | Opportunity Score |',
    '|-------------------|----------------------|---------------|--------------|----------------|-------------------|',
    ...topCompetitors.slice(0, 10).map((comp) => {
      return `| ${comp.domain} | ${comp.estTraffic?.toLocaleString() ?? 0} | ${comp.pageCount} | ${comp.gapKeywordCount} | ${comp.backlinkProspectCount + comp.referringDomainCount} | ${comp.opportunityScore} / 100 |`;
    }),
  ];

  download(lines.join('\n'), scopedFilename('serpvault-executive-strategy-report', 'md', scopeSlug), 'text/markdown');
}
