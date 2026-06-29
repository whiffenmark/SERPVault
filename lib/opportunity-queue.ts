import type { KeywordRecord, KeywordGapRecord, BacklinkRecord, CompetitorPageRecord } from './types';

export interface OpportunityQueueItem {
  id: string;
  type: 'content' | 'gap' | 'backlink' | 'competitor';
  title: string;
  detail: string;
  sourceLabel: string;
  recommendedAction: string;
  score: number;
  impact: number;
  href?: string;
  tag?: string;
  intent?: string;
}

function extractDomain(urlStr?: string): string {
  if (!urlStr) return '';
  let str = urlStr.trim();
  if (!str || str === '-') return '';
  try {
    if (!str.includes('://')) {
      str = 'https://' + str;
    }
    const url = new URL(str);
    return url.hostname.replace(/^www\./i, '');
  } catch {
    const parts = str.split('/');
    const host = parts[2] || parts[0];
    return host.replace(/^www\./i, '');
  }
}

function normalizeIdPart(part: string | undefined | null): string {
  if (!part) return '';
  return part.trim().toLowerCase().replace(/[\s:]+/g, '-');
}

function normalizeIdParts(parts: (string | undefined | null)[]): string {
  return parts
    .map(normalizeIdPart)
    .filter(Boolean)
    .join(':');
}

export function buildOpportunityQueue(
  keywords: KeywordRecord[],
  gaps: KeywordGapRecord[],
  backlinks: BacklinkRecord[],
  competitors: CompetitorPageRecord[]
): OpportunityQueueItem[] {
  const items: OpportunityQueueItem[] = [];

  // 1. Content Opportunities (Keywords)
  for (const kw of keywords) {
    if (kw.tag === 'Ignore') continue;
    const isTagged = !!kw.tag;
    const isHighScore = (kw.opportunityScore ?? 0) >= 70;

    if (isTagged || isHighScore) {
      const r = kw.raw || {};
      const cluster = r.cluster || r.Cluster || r['Cluster'];
      const pageTarget = r.page_target || r['page target'] || r.pageTarget;

      let detail = '';
      if (pageTarget && cluster) {
        detail = `Cluster: ${cluster} | Target Page: ${pageTarget}`;
      } else if (pageTarget) {
        detail = `Target Page: ${pageTarget}`;
      } else if (cluster) {
        detail = `Cluster: ${cluster}`;
      } else {
        detail = `Volume: ${kw.volume?.toLocaleString() ?? '-'} / Difficulty: ${kw.difficulty ?? '-'}`;
      }

      let recommendedAction = 'Create content targeting this keyword';
      if (kw.tag) {
        recommendedAction = `Optimize or create content for ${kw.tag}`;
      } else if (kw.intent) {
        recommendedAction = `Target informational/commercial intent (${kw.intent})`;
      }

      const dbCountry = kw.database || kw.country || '';
      const opportunityId = normalizeIdParts([
        'content',
        kw.keyword,
        dbCountry,
        pageTarget,
        cluster,
        kw.uploadId
      ]);

      items.push({
        id: opportunityId,
        type: 'content',
        title: kw.keyword,
        detail,
        sourceLabel: kw.database || 'Keyword Database',
        recommendedAction,
        score: kw.opportunityScore ?? 0,
        impact: kw.volume ?? 0,
        href: '/keywords',
        tag: kw.tag,
        intent: kw.intent,
      });
    }
  }

  // 2. Keyword Gaps
  for (const gap of gaps) {
    if (gap.tag === 'Ignore') continue;

    const competitor = gap.competitorDomain || 'Competitor';
    const compPos = gap.competitorPosition != null ? `pos ${gap.competitorPosition}` : 'unknown';
    const yourPos = gap.yourPosition != null ? `pos ${gap.yourPosition}` : 'unranked';
    const detail = `Competitor: ${competitor} (${compPos}) vs you (${yourPos})`;

    const recommendedAction = gap.competitorDomain
      ? `Bridge content gap against ${gap.competitorDomain}`
      : 'Optimize content to capture search engine gap';

    const opportunityId = normalizeIdParts([
      'gap',
      gap.keyword,
      gap.competitorDomain || '',
      gap.yourDomain || '',
      gap.uploadId
    ]);

    items.push({
      id: opportunityId,
      type: 'gap',
      title: gap.keyword,
      detail,
      sourceLabel: gap.competitorDomain ? `Gap: ${gap.competitorDomain}` : 'Keyword Gaps',
      recommendedAction,
      score: gap.opportunityScore ?? 0,
      impact: gap.volume ?? 0,
      href: '/content',
      tag: gap.tag,
      intent: gap.intent,
    });
  }

  // 3. Backlinks
  for (const bl of backlinks) {
    if (bl.tag === 'Ignore') continue;
    const isTarget = bl.tag === 'Backlink Target';
    const isHighScore = (bl.opportunityScore ?? 0) >= 70;
    const isHighAuthority = (bl.domainAuthority ?? 0) >= 40 || (bl.domainRating ?? 0) >= 40;

    if (isTarget || isHighScore || isHighAuthority) {
      const sourceDomain = extractDomain(bl.sourceUrl) || 'Unknown Source';
      const anchorStr = bl.anchorText ? `"${bl.anchorText}"` : 'No anchor text';
      const detail = `Source: ${sourceDomain} | Anchor: ${anchorStr}`;

      const recommendedAction = `Pitch for backlink from ${sourceDomain} targeting ${bl.targetUrl || 'your site'}`;

      const opportunityId = normalizeIdParts([
        'backlink',
        sourceDomain,
        bl.targetUrl || '',
        bl.anchorText || '',
        bl.uploadId
      ]);

      items.push({
        id: opportunityId,
        type: 'backlink',
        title: `Backlink Opportunity from ${sourceDomain}`,
        detail,
        sourceLabel: bl.tag === 'Backlink Target' ? 'Backlink Target' : 'Backlink Opportunity',
        recommendedAction,
        score: bl.opportunityScore ?? 0,
        impact: bl.domainAuthority ?? bl.domainRating ?? 0,
        href: '/backlinks',
        tag: bl.tag,
      });
    }
  }

  // 4. Competitor Pages
  for (const cp of competitors) {
    if (cp.tag === 'Ignore') continue;
    const isHighScore = (cp.opportunityScore ?? 0) >= 70;
    const isHighTraffic = (cp.traffic ?? 0) >= 500;

    if (isHighScore || isHighTraffic) {
      const detail = `Title: "${cp.title || 'N/A'}" | Domain: ${cp.domain} | URL: ${cp.url}`;
      const recommendedAction = `Create competing content for keyword targets (${cp.keywords ?? 0} keywords)`;

      const opportunityId = normalizeIdParts([
        'competitor',
        cp.domain,
        cp.url,
        cp.uploadId
      ]);

      items.push({
        id: opportunityId,
        type: 'competitor',
        title: cp.title || cp.url || 'Competitor Page',
        detail,
        sourceLabel: cp.domain || 'Competitor Database',
        recommendedAction,
        score: cp.opportunityScore ?? 0,
        impact: cp.traffic ?? 0,
        href: '/competitor-pages',
        tag: cp.tag,
      });
    }
  }

  // Rank: deterministic score descending, then impact descending, then title, then id
  const sorted = [...items].sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (b.impact !== a.impact) {
      return b.impact - a.impact;
    }
    const cmp = a.title.localeCompare(b.title);
    if (cmp !== 0) return cmp;
    return a.id.localeCompare(b.id);
  });

  // Deduplicate: same ID -> keep the one with higher score (first one in sorted list)
  const seen = new Set<string>();
  const deduped: OpportunityQueueItem[] = [];
  for (const item of sorted) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      deduped.push(item);
    }
  }

  return deduped;
}
