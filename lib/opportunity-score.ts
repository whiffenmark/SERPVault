import type { KeywordRecord, KeywordGapRecord, BacklinkRecord } from './types';

export function scoreKeyword(r: Partial<KeywordRecord>): number {
  const vol = Number(r.volume ?? 0);
  const diff = Number(r.difficulty ?? 100);
  const cpc = Number(r.cpc ?? 0);
  const volScore = Math.min(vol / 1000, 40);
  const diffScore = Math.max(0, 40 - diff * 0.4);
  const cpcScore = Math.min(cpc * 4, 20);
  return Math.round(volScore + diffScore + cpcScore);
}

export function scoreKeywordGap(r: Partial<KeywordGapRecord>): number {
  const vol = Number(r.volume ?? 0);
  const diff = Number(r.difficulty ?? 100);
  const theirPos = Number(r.competitorPosition ?? 100);
  const yourPos = Number(r.yourPosition ?? 0);
  const volScore = Math.min(vol / 1000, 30);
  const diffScore = Math.max(0, 30 - diff * 0.3);
  const gapScore = yourPos === 0 ? 40 : Math.max(0, 40 - yourPos);
  const theirBonus = theirPos <= 10 ? 10 : 0;
  return Math.round(volScore + diffScore + gapScore + theirBonus);
}

export function scoreBacklink(r: Partial<BacklinkRecord>): number {
  const da = Number(r.domainAuthority ?? r.domainRating ?? 0);
  const traffic = Number(r.trafficSource ?? 0);
  const daScore = Math.min(da, 50);
  const trafficScore = Math.min(traffic / 100, 50);
  return Math.round(daScore + trafficScore);
}
