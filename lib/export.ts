import type { KeywordRecord, BacklinkRecord, CompetitorPageRecord } from './types';

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
    'Monthly Volume': r.volume ?? '',
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
    'Monthly Volume': r.volume ?? '',
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
    '| Keyword | Monthly Volume | Difficulty | Intent | Tag | Score |',
    '|---------|--------|------------|--------|-----|-------|',
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
        const vol = k.volume != null ? ` (${k.volume.toLocaleString()})` : '';
        lines.push(`- ${k.keyword}${vol}`);
      }
      lines.push('');
    }
  }

  download(lines.join('\n'), scopedFilename('hermes-content-plan', 'md', scopeSlug), 'text/markdown');
}
