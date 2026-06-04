import type {
  KeywordRecord,
  KeywordGapRecord,
  CompetitorPageRecord,
  BacklinkRecord,
  ReferringDomainRecord,
  AnchorTextRecord,
} from './types';
import { nanoid } from './nanoid';
import { scoreKeyword, scoreKeywordGap, scoreBacklink } from './opportunity-score';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip invisible Unicode chars (zero-width spaces, NBSP, BOM) and trim. */
function clean(s: string): string {
  return s.replace(/[​-‍﻿ ]+/g, '').trim();
}

/**
 * Parse numbers that use K / M / B suffixes or comma separators.
 * "8.5K" → 8500 | "1.2M" → 1_200_000 | "90.5K" → 90_500 | "330" → 330
 */
export function parseFormattedNum(v: string): number | undefined {
  if (!v) return undefined;
  const s = clean(v).replace(/,/g, '');
  if (!s || s === '-' || s.toLowerCase() === 'n/a' || s === '< 0.01') return undefined;
  const m = s.match(/^([0-9.]+)\s*([KkMmBb]?)$/);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  if (isNaN(n)) return undefined;
  const suffix = m[2].toUpperCase();
  if (suffix === 'K') return Math.round(n * 1_000);
  if (suffix === 'M') return Math.round(n * 1_000_000);
  if (suffix === 'B') return Math.round(n * 1_000_000_000);
  return n;
}

/**
 * Find a column value matching any candidate alias.
 *
 * Pass 1 — exact case-insensitive match (e.g. "keyword" matches "Keyword",
 *           NOT "Keywords" or "Top Keyword").
 * Pass 2 — substring (includes) match as fallback.
 */
function col(row: Record<string, string>, ...candidates: string[]): string {
  const keys = Object.keys(row);
  const nkeys = keys.map((k) => k.toLowerCase().trim());

  // Pass 1: exact
  for (const cand of candidates) {
    const c = cand.toLowerCase().trim();
    const idx = nkeys.findIndex((k) => k === c);
    if (idx !== -1) return clean(row[keys[idx]] ?? '');
  }
  // Pass 2: includes
  for (const cand of candidates) {
    const c = cand.toLowerCase().trim();
    const idx = nkeys.findIndex((k) => k.includes(c));
    if (idx !== -1) return clean(row[keys[idx]] ?? '');
  }
  return '';
}

/**
 * Like col() but skips any match whose value is a bare number.
 *
 * This prevents "Keywords" count column (value: "720") from being returned
 * when searching for the keyword text column (value: "water damage ...").
 * Both pass 1 (exact) and pass 2 (includes) are tried; numeric values are
 * skipped so the search continues to the next candidate / pass.
 */
function colText(row: Record<string, string>, ...candidates: string[]): string {
  const keys = Object.keys(row);
  const nkeys = keys.map((k) => k.toLowerCase().trim());

  for (const pass of [1, 2] as const) {
    for (const cand of candidates) {
      const c = cand.toLowerCase().trim();
      const idx =
        pass === 1
          ? nkeys.findIndex((k) => k === c)
          : nkeys.findIndex((k) => k.includes(c));
      if (idx === -1) continue;
      const val = clean(row[keys[idx]] ?? '');
      // Skip if the value is a bare number — it is a count/rank column
      if (val && isNaN(parseFloat(val))) return val;
    }
  }
  return '';
}

/** Return a parsed number from the first matching column. */
function num(row: Record<string, string>, ...candidates: string[]): number | undefined {
  return parseFormattedNum(col(row, ...candidates));
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

export function mapKeyword(row: Record<string, string>, uploadId: string): KeywordRecord {
  const r: KeywordRecord = {
    id: nanoid(),
    uploadId,
    // colText skips "Keywords" (count) and returns the text keyword column
    keyword: colText(
      row,
      'keyword',       // SEMrush: "Keyword"
      'search term',   // Google Search Console
      'query',         // GSC alternate
      'search query',
      'keywords',      // fallback (skips numeric values)
    ),
    volume: num(
      row,
      'search volume',       // SEMrush keyword overview
      'avg monthly searches',// Google Keyword Planner
      'volume',              // generic
      'searches',
    ),
    difficulty: num(
      row,
      'keyword difficulty',  // SEMrush full label
      'kd %',                // SEMrush short (e.g. "KD %")
      'kd',                  // Ahrefs
      'difficulty',
    ),
    cpc: num(
      row,
      'cpc (usd)',            // SEMrush
      'cpc',
      'cost per click',
    ),
    intent: col(row, 'intent', 'search intent'),
    database: col(row, 'database', 'country', 'location', 'market'),
    position: num(row, 'position', 'rank', 'ranking'),
    url: col(row, 'url', 'landing page', 'landing url', 'page url'),
    raw: row,
  };
  r.opportunityScore = scoreKeyword(r);
  return r;
}

export function mapKeywordGap(row: Record<string, string>, uploadId: string): KeywordGapRecord {
  const r: KeywordGapRecord = {
    id: nanoid(),
    uploadId,
    keyword: colText(row, 'keyword', 'search term', 'query'),
    competitorDomain: col(row, 'competitor domain', 'competitor', 'comp.'),
    yourDomain: col(row, 'your domain', 'your website', 'you'),
    competitorPosition: num(row, 'competitor position', 'comp. position', 'competitor rank'),
    yourPosition: num(row, 'your position', 'your rank', 'position (you)'),
    volume: num(row, 'search volume', 'avg monthly searches', 'volume'),
    difficulty: num(row, 'keyword difficulty', 'kd %', 'kd', 'difficulty'),
    intent: col(row, 'intent', 'search intent'),
    raw: row,
  };
  r.opportunityScore = scoreKeywordGap(r);
  return r;
}

export function mapCompetitorPage(
  row: Record<string, string>,
  uploadId: string,
): CompetitorPageRecord {
  const url = col(row, 'url', 'page url', 'landing page', 'landing url', 'page', 'top pages');

  // Derive domain from an explicit column or by parsing the URL
  let domain = col(row, 'domain', 'root domain', 'subdomain');
  if (!domain && url) {
    try {
      domain = new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
    } catch {
      domain = url.split('/')[0];
    }
  }

  // "Traffic" must be exact-matched first so "Traffic Diff." and "Traffic %"
  // are not accidentally picked up.
  const traffic = num(row, 'traffic', 'organic traffic', 'estimated traffic');

  return {
    id: nanoid(),
    uploadId,
    domain,
    url,
    title: col(row, 'title', 'page title', 'meta title'),
    traffic,
    // SEMrush label is "Traffic %" — check exact before generic "traffic share"
    trafficShare: num(row, 'traffic %', 'traffic share', 'traffic percentage'),
    // "Keywords" is the count column (e.g. 23); num() handles this fine
    keywords: num(row, 'keywords', 'keyword count', 'no. of keywords', 'total keywords'),
    raw: row,
    opportunityScore: Math.min(Math.round((traffic ?? 0) / 100), 100),
  };
}

export function mapBacklink(row: Record<string, string>, uploadId: string): BacklinkRecord {
  const typeRaw = col(
    row,
    'link type',  // SEMrush
    'type',
    'dofollow',
    'do follow',
    'follow',
  ).toLowerCase();

  const r: BacklinkRecord = {
    id: nanoid(),
    uploadId,
    sourceUrl: col(
      row,
      'source url',      // SEMrush
      'from url',
      'referring url',
      'referring page',  // Ahrefs
      'source page',
      'source',
      'from',
      'backlink url',
    ),
    targetUrl: col(
      row,
      'target url',      // SEMrush
      'to url',
      'destination url',
      'target page',
      'target',
      'to',
    ),
    anchorText: col(row, 'anchor text', 'anchor and target', 'anchor'),
    domainAuthority: num(
      row,
      'domain authority',  // Moz
      'authority score',   // SEMrush
      'domain score',
      'page authority',
      'da',
    ),
    domainRating: num(row, 'domain rating', 'dr'),
    trafficSource: num(row, 'traffic', 'source traffic', 'page traffic'),
    doFollow:
      typeRaw === 'true' ||
      typeRaw === 'dofollow' ||
      typeRaw === 'yes' ||
      typeRaw === 'follow',
    raw: row,
  };
  r.opportunityScore = scoreBacklink(r);
  return r;
}

export function mapReferringDomain(
  row: Record<string, string>,
  uploadId: string,
): ReferringDomainRecord {
  return {
    id: nanoid(),
    uploadId,
    referringDomain: col(
      row,
      'referring domain',  // SEMrush
      'source domain',
      'ref domain',
      'root domain',
      'domain',
    ),
    targetDomain: col(
      row,
      'target domain',
      'destination domain',
      'to domain',
      'your domain',
    ),
    domainAuthority: num(
      row,
      'domain authority',
      'authority score',
      'domain score',
      'da',
    ),
    domainRating: num(row, 'domain rating', 'dr'),
    backlinks: num(
      row,
      'backlinks (total)',   // SEMrush
      'total backlinks',
      'backlinks',
      'no. of backlinks',    // Ahrefs
    ),
    raw: row,
  };
}

export function mapAnchorText(row: Record<string, string>, uploadId: string): AnchorTextRecord {
  return {
    id: nanoid(),
    uploadId,
    anchorText: col(row, 'anchor text', 'anchor and target', 'anchor'),
    backlinks: num(
      row,
      'backlinks (total)',
      'total backlinks',
      'backlinks',
      'no. of backlinks',
    ),
    referringDomains: num(row, 'referring domains', 'ref domains', 'domains'),
    doFollow: num(row, 'dofollow', 'do follow'),
    raw: row,
  };
}

// ---------------------------------------------------------------------------
// Quality filter
// ---------------------------------------------------------------------------

/**
 * Returns true for rows that look like CSV section headers or SERP metadata
 * rather than actual keyword records. Used to clean up exports (like SEMrush
 * SERP overview) that mix multiple data sections in one file.
 */
export function isGarbageKeyword(kw: string): boolean {
  if (!kw || !kw.trim()) return true;
  const k = kw.trim();
  // Bare number (rank index, count column, etc.)
  if (!isNaN(Number(k))) return true;
  // Looks like a URL
  if (/^https?:\/\//i.test(k) || /^www\./i.test(k)) return true;
  // Known SERP metadata labels that appear in SEMrush overview exports
  if (/^(local pack|people also ask|position on serp|serp features|sponsored)$/i.test(k)) return true;
  return false;
}
