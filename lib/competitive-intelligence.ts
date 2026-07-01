import type { CompetitorPageRecord, KeywordGapRecord, BacklinkRecord, ReferringDomainRecord, CompetitorRecord } from './types';

export interface CompetitorSummary {
  domain: string;
  pageCount: number;
  estTraffic: number;
  pagesKeywordsSum: number;
  gapKeywordCount: number;
  backlinkProspectCount: number;
  referringDomainCount: number;
  topPageUrl?: string;
  topPageTitle?: string;
  opportunityScore: number;
  isConfigured: boolean;
}

/**
 * Helper to extract domain from a URL string.
 * Strips protocols, www subdomain, paths, and ports.
 */
export function getDomainFromUrl(url: string | undefined): string {
  if (!url) return '';
  let clean = url.trim().toLowerCase();
  clean = clean.replace(/^(https?:\/\/)?(www\.)?/, '');
  clean = clean.split('/')[0].split(':')[0];
  return clean;
}

/**
 * Calculates a competitive opportunity score (0 - 100) for a competitor domain.
 * Evaluates estimated traffic, content gaps, link prospects, and page index scale.
 */
export function calculateOpportunityScore(
  estTraffic: number,
  gapKeywordCount: number,
  backlinkProspectCount: number,
  pageCount: number
): number {
  // Traffic: up to 30 points (log scale up to 100k traffic)
  const trafficScore = estTraffic > 0 ? Math.min(Math.log10(estTraffic) * 6, 30) : 0;

  // Content Gaps: up to 35 points (up to 70 keyword gaps)
  const gapScore = Math.min(gapKeywordCount * 0.5, 35);

  // Link Prospects: up to 25 points (up to 25 backlink prospects)
  const linkScore = Math.min(backlinkProspectCount * 1.0, 25);

  // Page Index scale: up to 10 points (up to 20 pages indexed)
  const pageScore = Math.min(pageCount * 0.5, 10);

  return Math.round(trafficScore + gapScore + linkScore + pageScore);
}

/**
 * Aggregates competitor page records, keyword gaps, backlinks, referring domains,
 * and explicit project competitors into a summarized array of competitor domains.
 */
export function getCompetitorDomainSummaries(params: {
  competitorPages: CompetitorPageRecord[];
  keywordGaps: KeywordGapRecord[];
  backlinks: BacklinkRecord[];
  referringDomains: ReferringDomainRecord[];
  projectCompetitors: CompetitorRecord[];
  activeProjectDomain?: string;
}): CompetitorSummary[] {
  const {
    competitorPages,
    keywordGaps,
    backlinks,
    referringDomains,
    projectCompetitors,
    activeProjectDomain,
  } = params;

  const projectDomainNormalized = activeProjectDomain ? getDomainFromUrl(activeProjectDomain) : '';
  const domainSet = new Set<string>();

  // Collect domains from all available data sources
  projectCompetitors.forEach((c) => {
    if (c.domain) domainSet.add(getDomainFromUrl(c.domain));
  });

  competitorPages.forEach((p) => {
    if (p.domain) domainSet.add(getDomainFromUrl(p.domain));
  });

  keywordGaps.forEach((k) => {
    if (k.competitorDomain) domainSet.add(getDomainFromUrl(k.competitorDomain));
  });

  referringDomains.forEach((r) => {
    if (r.targetDomain) domainSet.add(getDomainFromUrl(r.targetDomain));
  });

  backlinks.forEach((b) => {
    const targetDomain = getDomainFromUrl(b.targetUrl);
    if (targetDomain) domainSet.add(targetDomain);
  });

  // Remove the active project domain (client domain) if it is present in the set
  if (projectDomainNormalized) {
    domainSet.delete(projectDomainNormalized);
  }

  const summaries: CompetitorSummary[] = [];

  for (const domain of domainSet) {
    if (!domain || domain === '-') continue;

    // Filter pages for this domain
    const domainPages = competitorPages.filter((p) => getDomainFromUrl(p.domain) === domain || getDomainFromUrl(p.url) === domain);
    const pageCount = domainPages.length;
    const estTraffic = domainPages.reduce((sum, p) => sum + (p.traffic ?? 0), 0);
    const pagesKeywordsSum = domainPages.reduce((sum, p) => sum + (p.keywords ?? 0), 0);

    // Filter keyword gaps
    const gapKeywordCount = keywordGaps.filter((k) => getDomainFromUrl(k.competitorDomain) === domain).length;

    // Filter backlinks targeting this competitor
    const backlinkProspectCount = backlinks.filter((b) => getDomainFromUrl(b.targetUrl) === domain).length;

    // Filter referring domains targeting this competitor
    const referringDomainCount = referringDomains.filter((r) => getDomainFromUrl(r.targetDomain) === domain).length;

    // Configured competitor check
    const isConfigured = projectCompetitors.some((c) => getDomainFromUrl(c.domain) === domain);

    // Top page URL & Title (highest traffic page)
    let topPageUrl: string | undefined;
    let topPageTitle: string | undefined;

    if (domainPages.length > 0) {
      const sortedPages = [...domainPages].sort((a, b) => (b.traffic ?? 0) - (a.traffic ?? 0));
      topPageUrl = sortedPages[0].url;
      topPageTitle = sortedPages[0].title;
    }

    const opportunityScore = calculateOpportunityScore(
      estTraffic,
      gapKeywordCount,
      backlinkProspectCount,
      pageCount
    );

    summaries.push({
      domain,
      pageCount,
      estTraffic,
      pagesKeywordsSum,
      gapKeywordCount,
      backlinkProspectCount,
      referringDomainCount,
      topPageUrl,
      topPageTitle,
      opportunityScore,
      isConfigured,
    });
  }

  // Sort by opportunity score descending
  return summaries.sort((a, b) => b.opportunityScore - a.opportunityScore);
}
