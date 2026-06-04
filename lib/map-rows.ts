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

function col(row: Record<string, string>, ...candidates: string[]): string {
  for (const c of candidates) {
    const key = Object.keys(row).find((k) => k.toLowerCase().includes(c.toLowerCase()));
    if (key && row[key]) return row[key];
  }
  return '';
}

function num(row: Record<string, string>, ...candidates: string[]): number | undefined {
  const v = col(row, ...candidates);
  const n = parseFloat(v.replace(/,/g, ''));
  return isNaN(n) ? undefined : n;
}

export function mapKeyword(row: Record<string, string>, uploadId: string): KeywordRecord {
  const r: KeywordRecord = {
    id: nanoid(),
    uploadId,
    keyword: col(row, 'keyword'),
    volume: num(row, 'search volume', 'volume'),
    difficulty: num(row, 'keyword difficulty', 'difficulty', 'kd'),
    cpc: num(row, 'cpc', 'cost per click'),
    intent: col(row, 'intent', 'search intent'),
    database: col(row, 'database', 'country', 'location'),
    position: num(row, 'position', 'rank'),
    url: col(row, 'url', 'landing page', 'page'),
    raw: row,
  };
  r.opportunityScore = scoreKeyword(r);
  return r;
}

export function mapKeywordGap(row: Record<string, string>, uploadId: string): KeywordGapRecord {
  const r: KeywordGapRecord = {
    id: nanoid(),
    uploadId,
    keyword: col(row, 'keyword'),
    competitorDomain: col(row, 'competitor', 'comp domain'),
    yourDomain: col(row, 'your domain', 'you'),
    competitorPosition: num(row, 'competitor position', 'comp position', 'competitor rank'),
    yourPosition: num(row, 'your position', 'your rank', 'position (you)'),
    volume: num(row, 'search volume', 'volume'),
    difficulty: num(row, 'keyword difficulty', 'difficulty', 'kd'),
    intent: col(row, 'intent', 'search intent'),
    raw: row,
  };
  r.opportunityScore = scoreKeywordGap(r);
  return r;
}

export function mapCompetitorPage(row: Record<string, string>, uploadId: string): CompetitorPageRecord {
  const url = col(row, 'url', 'page', 'landing page', 'top pages');
  const domain = col(row, 'domain') || (url ? new URL(url.startsWith('http') ? url : 'https://' + url).hostname : '');
  return {
    id: nanoid(),
    uploadId,
    domain,
    url,
    title: col(row, 'title', 'page title'),
    traffic: num(row, 'traffic', 'organic traffic', 'estimated traffic'),
    trafficShare: num(row, 'traffic share', 'traffic %'),
    keywords: num(row, 'keywords', 'keyword count'),
    raw: row,
    opportunityScore: Math.min(Math.round((num(row, 'traffic', 'organic traffic') ?? 0) / 100), 100),
  };
}

export function mapBacklink(row: Record<string, string>, uploadId: string): BacklinkRecord {
  const doFollowRaw = col(row, 'dofollow', 'do follow', 'link type', 'follow').toLowerCase();
  const r: BacklinkRecord = {
    id: nanoid(),
    uploadId,
    sourceUrl: col(row, 'source url', 'from url', 'referring url', 'source'),
    targetUrl: col(row, 'target url', 'to url', 'destination url', 'target'),
    anchorText: col(row, 'anchor text', 'anchor'),
    domainAuthority: num(row, 'domain authority', 'da', 'authority score'),
    domainRating: num(row, 'domain rating', 'dr'),
    trafficSource: num(row, 'traffic', 'source traffic'),
    doFollow: doFollowRaw === 'true' || doFollowRaw === 'dofollow' || doFollowRaw === 'yes',
    raw: row,
  };
  r.opportunityScore = scoreBacklink(r);
  return r;
}

export function mapReferringDomain(row: Record<string, string>, uploadId: string): ReferringDomainRecord {
  return {
    id: nanoid(),
    uploadId,
    referringDomain: col(row, 'referring domain', 'domain', 'ref domain'),
    targetDomain: col(row, 'target domain', 'your domain', 'to'),
    domainAuthority: num(row, 'domain authority', 'da', 'authority score'),
    domainRating: num(row, 'domain rating', 'dr'),
    backlinks: num(row, 'backlinks', 'links'),
    raw: row,
  };
}

export function mapAnchorText(row: Record<string, string>, uploadId: string): AnchorTextRecord {
  return {
    id: nanoid(),
    uploadId,
    anchorText: col(row, 'anchor text', 'anchor'),
    backlinks: num(row, 'backlinks', 'links'),
    referringDomains: num(row, 'referring domains', 'domains'),
    doFollow: num(row, 'dofollow', 'do follow'),
    raw: row,
  };
}
