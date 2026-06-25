import type { ReportType } from './types';

/** Normalize a header string for fuzzy matching */
function norm(h: string): string {
  return h.toLowerCase().trim().replace(/\s+/g, ' ');
}

/** True if any header contains any of the given substrings */
function any(headers: string[], ...patterns: string[]): boolean {
  return patterns.some((p) => headers.some((h) => h.includes(p)));
}

/** Count headers that match any of the given substrings */
function count(headers: string[], ...patterns: string[]): number {
  return headers.filter((h) => patterns.some((p) => h.includes(p))).length;
}

// ---------------------------------------------------------------------------
// Filename rules — ordered from most specific to most generic
// ---------------------------------------------------------------------------
const FILENAME_RULES: Array<{ pattern: RegExp; type: ReportType }> = [
  // Explicit phrase matches
  { pattern: /backlink|back[\s_-]link/i, type: 'backlink' },
  { pattern: /referring[\s_-]domain|ref[\s_-]domain/i, type: 'referring_domain' },
  { pattern: /anchor[\s_-]text|anchors/i, type: 'anchor_text' },
  { pattern: /keyword[\s_-]gap|kw[\s_-]gap|gap[\s_-]report/i, type: 'keyword_gap' },
  { pattern: /organic[\s_-]research|organic[\s_-]position|serp[\s_-]position/i, type: 'organic_positions' },
  { pattern: /top[\s_-]page|competitor[\s_-]page|pages[\s_-]report/i, type: 'competitor_pages' },
  { pattern: /hermes|keyword[\s_-]report/i, type: 'keyword' },
  { pattern: /keyword[\s_-]overview|keyword[\s_-]magic|keyword[\s_-]analytic/i, type: 'keyword' },
  // Generic fallbacks
  { pattern: /position|ranking/i, type: 'organic_positions' },
  { pattern: /keyword/i, type: 'keyword' },
];

// ---------------------------------------------------------------------------
// Column scoring
// ---------------------------------------------------------------------------
function scoreColumns(rawHeaders: string[]): Map<ReportType, number> {
  const h = rawHeaders.map(norm);
  const scores = new Map<ReportType, number>();
  const add = (t: ReportType, n: number) => scores.set(t, (scores.get(t) ?? 0) + n);

  // ---- Signal flags -------------------------------------------------------

  // Keyword / query
  const hasKeyword = any(h, 'keyword', 'search term', 'query');
  const hasVolume = any(h, 'search volume', 'avg monthly searches', 'volume', 'searches');
  const hasKD = any(h, 'keyword difficulty', 'kd', 'difficulty');
  const hasCPC = any(h, 'cost per click', 'cpc');
  const hasIntent = any(h, 'search intent', 'intent');
  const hasHermesKeywordReport =
    hasKeyword &&
    count(
      h,
      'cluster',
      'page_target',
      'page target',
      'serpvault_tag',
      'serpvault tag',
      'priority',
      'niche'
    ) >= 2;

  // Position
  const hasPosition = h.some(
    (hdr) =>
      hdr === 'position' ||
      hdr === 'rank' ||
      hdr.endsWith(' position') ||
      hdr.startsWith('position') ||
      hdr.includes('serp pos') ||
      hdr.includes('ranking')
  );
  const hasPrevPos = any(h, 'previous position', 'prev position', 'position change', 'delta');

  // URL / page
  const hasUrl = any(h, 'url', 'landing page', 'page url', 'landing url');
  const hasTraffic = any(h, 'traffic');
  const hasTrafficShare = any(h, 'traffic %', 'traffic share', 'traffic percentage');

  // "keywords" as a COUNT column (≠ the keyword text column)
  const hasKeywordsNum = h.some(
    (hdr) =>
      (hdr === 'keywords' ||
        hdr.includes('no. of keywords') ||
        hdr.includes('keyword count') ||
        hdr.includes('total keywords')) &&
      !hdr.includes('difficulty') &&
      hdr !== 'keyword'
  );
  const hasTopKeyword = any(h, 'top keyword', 'best keyword', 'top kw');

  // Backlink-specific
  const hasSourceUrl = any(
    h,
    'source url',
    'from url',
    'referring url',
    'referring page',
    'source page',
    'backlink url',
    'page url (source)'
  );
  const hasTargetUrl = any(
    h,
    'target url',
    'to url',
    'destination url',
    'target page',
    'page url (target)'
  );
  const hasAnchorText = any(h, 'anchor text', 'anchor and target');
  const hasAnchorAny = any(h, 'anchor');
  const hasLinkType = any(h, 'link type', 'nofollow', 'dofollow', 'follow');
  const hasFirstSeen = any(h, 'first seen', 'date found', 'discovered');
  const hasLastSeen = any(h, 'last seen', 'last active');

  // Referring-domain-specific
  const hasRefDomain = any(
    h,
    'referring domain',
    'source domain',
    'ref domain',
    'root domain'
  );
  const hasTargetDomain = any(h, 'target domain', 'destination domain');
  const hasDomainMetric = any(
    h,
    'domain authority',
    'domain rating',
    'domain score',
    'authority score',
    ' da',
    ' dr'
  );
  const hasRefDomainsCount = h.some(
    (hdr) => hdr.includes('referring domains') || hdr === 'ref domains'
  );
  const hasBacklinksCount = h.some(
    (hdr) =>
      hdr === 'backlinks' ||
      hdr.includes('total backlinks') ||
      hdr.includes('backlink count') ||
      hdr.includes('no. of backlinks') ||
      hdr === 'backlinks (total)'
  );

  // Keyword gap specific
  const hasCompetitor = any(h, 'competitor', 'comp.');
  const hasGapTerms = any(
    h,
    'gap',
    'missing',
    'weak',
    'strong',
    'untapped',
    'common keywords',
    'unique to',
    'shared'
  );
  // Multiple columns that look like positional data for different domains
  const multiPosCount = count(h, ' position', ' rank', 'pos.') + count(h, 'competitor', 'comp.');

  // ---- Score each type ----------------------------------------------------

  // BACKLINK — requires both source and target URL
  add('backlink', hasSourceUrl ? 5 : -20);
  add('backlink', hasTargetUrl ? 5 : -20);
  if (hasAnchorText) add('backlink', 3);
  else if (hasAnchorAny && hasSourceUrl) add('backlink', 2);
  if (hasLinkType) add('backlink', 2);
  if (hasFirstSeen || hasLastSeen) add('backlink', 2);
  if (hasDomainMetric && hasSourceUrl) add('backlink', 2);

  // REFERRING DOMAIN — requires referring domain col; penalised if source+target URLs found
  add('referring_domain', hasRefDomain ? 8 : -20);
  if (hasBacklinksCount) add('referring_domain', 3);
  if (hasDomainMetric) add('referring_domain', 2);
  if (hasTargetDomain) add('referring_domain', 2);
  if (hasFirstSeen || hasLastSeen) add('referring_domain', 1);
  if (hasSourceUrl && hasTargetUrl) add('referring_domain', -10); // probably backlink

  // ANCHOR TEXT — anchor + referring domains count, no per-link URLs
  if (hasAnchorText || hasAnchorAny) add('anchor_text', 5);
  if (hasRefDomainsCount) add('anchor_text', 4);
  if (hasBacklinksCount) add('anchor_text', 2);
  if (hasSourceUrl) add('anchor_text', -8); // per-link → backlink
  if (hasTargetUrl) add('anchor_text', -8);
  if (hasRefDomain) add('anchor_text', -6); // domain-level → referring_domain

  // ORGANIC POSITIONS — requires keyword + position
  if (hasKeyword && hasPosition) add('organic_positions', 8);
  if (hasUrl && hasPosition) add('organic_positions', 4);
  if (hasPrevPos) add('organic_positions', 5);
  if (hasTraffic && hasPosition) add('organic_positions', 3);
  if (hasVolume && hasPosition) add('organic_positions', 2);
  if (!hasPosition) add('organic_positions', -20);

  // COMPETITOR PAGES — URL + traffic/keywords count, no per-keyword text
  if (hasUrl) add('competitor_pages', 3);
  if (hasTraffic) add('competitor_pages', 3);
  if (hasKeywordsNum) add('competitor_pages', 4);
  if (hasTrafficShare) add('competitor_pages', 4);
  if (hasTopKeyword) add('competitor_pages', 5);
  if (hasKeyword && hasVolume && !hasPosition) add('competitor_pages', -5);
  if (hasKeyword && hasPosition) add('competitor_pages', -8);
  if (hasRefDomain || hasSourceUrl) add('competitor_pages', -8);

  // KEYWORD GAP — keyword + multiple competitor-domain position columns
  if (hasKeyword && multiPosCount >= 2) add('keyword_gap', 10);
  if (hasGapTerms) add('keyword_gap', 6);
  if (hasCompetitor && hasKeyword) add('keyword_gap', 5);
  if (hasKeyword && hasVolume && !hasPosition && multiPosCount < 2) add('keyword_gap', -4);

  // KEYWORD — keyword + volume, no position, no link data
  if (hasKeyword) add('keyword', 4);
  if (hasVolume) add('keyword', 4);
  if (hasKD) add('keyword', 2);
  if (hasCPC) add('keyword', 2);
  if (hasIntent) add('keyword', 2);
  if (hasHermesKeywordReport) add('keyword', 12);
  if (hasPosition) add('keyword', -4); // organic_positions more likely
  if (hasSourceUrl || hasRefDomain) add('keyword', -10);

  return scores;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function detectReportType(filename: string, headers: string[]): ReportType {
  // 1. Filename-based — fast, high confidence
  for (const rule of FILENAME_RULES) {
    if (rule.pattern.test(filename)) return rule.type;
  }

  // 2. Score-based column detection
  const scores = scoreColumns(headers);

  let bestType: ReportType = 'unknown';
  let bestScore = 7; // minimum threshold — avoids false positives on sparse CSVs

  for (const [type, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      bestType = type as ReportType;
    }
  }

  return bestType;
}

/** Returns per-type scores for debug/display purposes */
export function detectWithScores(
  filename: string,
  headers: string[]
): { type: ReportType; scores: Record<string, number> } {
  const type = detectReportType(filename, headers);
  const scoreMap = scoreColumns(headers);
  const scores: Record<string, number> = {};
  for (const [t, s] of scoreMap) scores[t] = s;
  return { type, scores };
}
