/**
 * lib/db.ts — Unified data access layer.
 *
 * When NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY are set:
 *   • Writes go to Supabase AND update the localStorage cache.
 *   • Reads come from Supabase (localStorage is the offline fallback).
 *
 * Without those env vars everything falls back to localStorage so the app
 * still works locally without any credentials.
 */

import { getSupabase } from './supabase/client';
import { getStore, updateStore, removeUpload as lsRemoveUpload } from './storage';
import type {
  UploadRecord,
  KeywordRecord,
  KeywordGapRecord,
  CompetitorPageRecord,
  BacklinkRecord,
  ReferringDomainRecord,
  AnchorTextRecord,
  DedupeReport,
  Tag,
} from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function sbInsert(table: string, rows: Record<string, unknown>[]): Promise<void> {
  const sb = getSupabase();
  if (!sb || rows.length === 0) return;
  for (const batch of chunk(rows, 500)) {
    const { error } = await sb.from(table).insert(batch);
    if (error) console.error(`[db] insert ${table}:`, error.message);
  }
}

// ---------------------------------------------------------------------------
// Row mappers  (snake_case DB ↔ camelCase TypeScript)
// ---------------------------------------------------------------------------

function toUploadRow(u: UploadRecord) {
  return {
    id: u.id,
    filename: u.filename,
    report_type: u.reportType,
    uploaded_at: u.uploadedAt,
    row_count: u.rowCount,
    cleaned_row_count: u.cleanedRowCount,
    dedupe_report_id: u.dedupeReportId,
  };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromUploadRow(r: any): UploadRecord {
  return {
    id: r.id,
    filename: r.filename,
    reportType: r.report_type,
    uploadedAt: r.uploaded_at,
    rowCount: r.row_count,
    cleanedRowCount: r.cleaned_row_count,
    dedupeReportId: r.dedupe_report_id,
  };
}

function toKwRow(k: KeywordRecord) {
  return {
    id: k.id, upload_id: k.uploadId, keyword: k.keyword,
    volume: k.volume ?? null, difficulty: k.difficulty ?? null,
    cpc: k.cpc ?? null, intent: k.intent ?? null,
    database: k.database ?? null, country: k.country ?? null,
    position: k.position ?? null, url: k.url ?? null,
    tag: k.tag ?? null, opportunity_score: k.opportunityScore ?? null,
    raw: k.raw,
  };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromKwRow(r: any): KeywordRecord {
  return {
    id: r.id, uploadId: r.upload_id, keyword: r.keyword,
    volume: r.volume ?? undefined, difficulty: r.difficulty ?? undefined,
    cpc: r.cpc ?? undefined, intent: r.intent ?? undefined,
    database: r.database ?? undefined, country: r.country ?? undefined,
    position: r.position ?? undefined, url: r.url ?? undefined,
    tag: r.tag ?? undefined, opportunityScore: r.opportunity_score ?? undefined,
    raw: r.raw ?? {},
  };
}

function toGapRow(k: KeywordGapRecord) {
  return {
    id: k.id, upload_id: k.uploadId, keyword: k.keyword,
    competitor_domain: k.competitorDomain ?? null,
    your_domain: k.yourDomain ?? null,
    competitor_position: k.competitorPosition ?? null,
    your_position: k.yourPosition ?? null,
    volume: k.volume ?? null, difficulty: k.difficulty ?? null,
    intent: k.intent ?? null, tag: k.tag ?? null,
    opportunity_score: k.opportunityScore ?? null, raw: k.raw,
  };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromGapRow(r: any): KeywordGapRecord {
  return {
    id: r.id, uploadId: r.upload_id, keyword: r.keyword,
    competitorDomain: r.competitor_domain ?? undefined,
    yourDomain: r.your_domain ?? undefined,
    competitorPosition: r.competitor_position ?? undefined,
    yourPosition: r.your_position ?? undefined,
    volume: r.volume ?? undefined, difficulty: r.difficulty ?? undefined,
    intent: r.intent ?? undefined, tag: r.tag ?? undefined,
    opportunityScore: r.opportunity_score ?? undefined, raw: r.raw ?? {},
  };
}

function toCpRow(p: CompetitorPageRecord) {
  return {
    id: p.id, upload_id: p.uploadId, domain: p.domain, url: p.url,
    title: p.title ?? null, traffic: p.traffic ?? null,
    traffic_share: p.trafficShare ?? null, keywords: p.keywords ?? null,
    tag: p.tag ?? null, opportunity_score: p.opportunityScore ?? null,
    raw: p.raw,
  };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromCpRow(r: any): CompetitorPageRecord {
  return {
    id: r.id, uploadId: r.upload_id, domain: r.domain, url: r.url,
    title: r.title ?? undefined, traffic: r.traffic ?? undefined,
    trafficShare: r.traffic_share ?? undefined, keywords: r.keywords ?? undefined,
    tag: r.tag ?? undefined, opportunityScore: r.opportunity_score ?? undefined,
    raw: r.raw ?? {},
  };
}

function toBlRow(b: BacklinkRecord) {
  return {
    id: b.id, upload_id: b.uploadId,
    source_url: b.sourceUrl, target_url: b.targetUrl,
    anchor_text: b.anchorText ?? null,
    domain_authority: b.domainAuthority ?? null,
    domain_rating: b.domainRating ?? null,
    traffic_source: b.trafficSource ?? null,
    do_follow: b.doFollow ?? null,
    tag: b.tag ?? null, opportunity_score: b.opportunityScore ?? null,
    raw: b.raw,
  };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromBlRow(r: any): BacklinkRecord {
  return {
    id: r.id, uploadId: r.upload_id,
    sourceUrl: r.source_url, targetUrl: r.target_url,
    anchorText: r.anchor_text ?? undefined,
    domainAuthority: r.domain_authority ?? undefined,
    domainRating: r.domain_rating ?? undefined,
    trafficSource: r.traffic_source ?? undefined,
    doFollow: r.do_follow ?? undefined,
    tag: r.tag ?? undefined, opportunityScore: r.opportunity_score ?? undefined,
    raw: r.raw ?? {},
  };
}

function toRdRow(d: ReferringDomainRecord) {
  return {
    id: d.id, upload_id: d.uploadId,
    referring_domain: d.referringDomain,
    target_domain: d.targetDomain ?? null,
    domain_authority: d.domainAuthority ?? null,
    domain_rating: d.domainRating ?? null,
    backlinks: d.backlinks ?? null,
    tag: d.tag ?? null, opportunity_score: d.opportunityScore ?? null,
    raw: d.raw,
  };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRdRow(r: any): ReferringDomainRecord {
  return {
    id: r.id, uploadId: r.upload_id,
    referringDomain: r.referring_domain,
    targetDomain: r.target_domain ?? undefined,
    domainAuthority: r.domain_authority ?? undefined,
    domainRating: r.domain_rating ?? undefined,
    backlinks: r.backlinks ?? undefined,
    tag: r.tag ?? undefined, opportunityScore: r.opportunity_score ?? undefined,
    raw: r.raw ?? {},
  };
}

function toAtRow(a: AnchorTextRecord) {
  return {
    id: a.id, upload_id: a.uploadId,
    anchor_text: a.anchorText,
    backlinks: a.backlinks ?? null,
    referring_domains: a.referringDomains ?? null,
    do_follow: a.doFollow ?? null,
    tag: a.tag ?? null, raw: a.raw,
  };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromAtRow(r: any): AnchorTextRecord {
  return {
    id: r.id, uploadId: r.upload_id,
    anchorText: r.anchor_text,
    backlinks: r.backlinks ?? undefined,
    referringDomains: r.referring_domains ?? undefined,
    doFollow: r.do_follow ?? undefined,
    tag: r.tag ?? undefined, raw: r.raw ?? {},
  };
}

function toDrRow(d: DedupeReport) {
  return {
    id: d.id, upload_id: d.uploadId, filename: d.filename,
    report_type: d.reportType, created_at: d.createdAt,
    total_rows: d.totalRows, duplicates_removed: d.duplicatesRemoved,
    cleaned_rows: d.cleanedRows, dedupe_key: d.dedupeKey,
    issues: d.issues, duplicate_examples: d.duplicateExamples,
  };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromDrRow(r: any): DedupeReport {
  return {
    id: r.id, uploadId: r.upload_id, filename: r.filename,
    reportType: r.report_type, createdAt: r.created_at,
    totalRows: r.total_rows, duplicatesRemoved: r.duplicates_removed,
    cleanedRows: r.cleaned_rows, dedupeKey: r.dedupe_key,
    issues: r.issues ?? [], duplicateExamples: r.duplicate_examples ?? [],
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function saveUpload(u: UploadRecord): Promise<void> {
  updateStore(s => ({ ...s, uploads: [...s.uploads, u] }));
  await sbInsert('uploads', [toUploadRow(u)]);
}

export async function saveDedupeReport(r: DedupeReport): Promise<void> {
  updateStore(s => ({ ...s, dedupeReports: [...s.dedupeReports, r] }));
  await sbInsert('dedupe_reports', [toDrRow(r)]);
}

export async function saveKeywords(rows: KeywordRecord[]): Promise<void> {
  updateStore(s => ({ ...s, keywords: [...s.keywords, ...rows] }));
  await sbInsert('keywords', rows.map(toKwRow));
}

export async function saveKeywordGaps(rows: KeywordGapRecord[]): Promise<void> {
  updateStore(s => ({ ...s, keywordGaps: [...s.keywordGaps, ...rows] }));
  await sbInsert('keyword_gaps', rows.map(toGapRow));
}

export async function saveCompetitorPages(rows: CompetitorPageRecord[]): Promise<void> {
  updateStore(s => ({ ...s, competitorPages: [...s.competitorPages, ...rows] }));
  await sbInsert('competitor_pages', rows.map(toCpRow));
}

export async function saveBacklinks(rows: BacklinkRecord[]): Promise<void> {
  updateStore(s => ({ ...s, backlinks: [...s.backlinks, ...rows] }));
  await sbInsert('backlinks', rows.map(toBlRow));
}

export async function saveReferringDomains(rows: ReferringDomainRecord[]): Promise<void> {
  updateStore(s => ({ ...s, referringDomains: [...s.referringDomains, ...rows] }));
  await sbInsert('referring_domains', rows.map(toRdRow));
}

export async function saveAnchorTexts(rows: AnchorTextRecord[]): Promise<void> {
  updateStore(s => ({ ...s, anchorTexts: [...s.anchorTexts, ...rows] }));
  await sbInsert('anchor_texts', rows.map(toAtRow));
}

// ---------------------------------------------------------------------------
// Reads  (Supabase → localStorage fallback)
// ---------------------------------------------------------------------------

export async function getUploads(): Promise<UploadRecord[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from('uploads').select('*').order('uploaded_at', { ascending: false });
    if (data && !error) return data.map(fromUploadRow);
    console.error('[db] getUploads:', error?.message);
  }
  return getStore().uploads;
}

export async function getKeywords(): Promise<KeywordRecord[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from('keywords').select('*').order('opportunity_score', { ascending: false, nullsFirst: false });
    if (data && !error) return data.map(fromKwRow);
    console.error('[db] getKeywords:', error?.message);
  }
  return getStore().keywords;
}

export async function getKeywordGaps(): Promise<KeywordGapRecord[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from('keyword_gaps').select('*').order('opportunity_score', { ascending: false, nullsFirst: false });
    if (data && !error) return data.map(fromGapRow);
    console.error('[db] getKeywordGaps:', error?.message);
  }
  return getStore().keywordGaps;
}

export async function getCompetitorPages(): Promise<CompetitorPageRecord[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from('competitor_pages').select('*').order('traffic', { ascending: false, nullsFirst: false });
    if (data && !error) return data.map(fromCpRow);
    console.error('[db] getCompetitorPages:', error?.message);
  }
  return getStore().competitorPages;
}

export async function getBacklinks(): Promise<BacklinkRecord[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from('backlinks').select('*').order('opportunity_score', { ascending: false, nullsFirst: false });
    if (data && !error) return data.map(fromBlRow);
    console.error('[db] getBacklinks:', error?.message);
  }
  return getStore().backlinks;
}

export async function getReferringDomains(): Promise<ReferringDomainRecord[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from('referring_domains').select('*');
    if (data && !error) return data.map(fromRdRow);
    console.error('[db] getReferringDomains:', error?.message);
  }
  return getStore().referringDomains;
}

export async function getAnchorTexts(): Promise<AnchorTextRecord[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from('anchor_texts').select('*');
    if (data && !error) return data.map(fromAtRow);
    console.error('[db] getAnchorTexts:', error?.message);
  }
  return getStore().anchorTexts;
}

export async function getDedupeReports(): Promise<DedupeReport[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from('dedupe_reports').select('*').order('created_at', { ascending: false });
    if (data && !error) return data.map(fromDrRow);
    console.error('[db] getDedupeReports:', error?.message);
  }
  return getStore().dedupeReports;
}

// ---------------------------------------------------------------------------
// Tag updates
// ---------------------------------------------------------------------------

type TagTable = 'keywords' | 'keyword_gaps' | 'competitor_pages' | 'backlinks' | 'referring_domains' | 'anchor_texts';

export async function updateTag(table: TagTable, id: string, tag: Tag | undefined): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.from(table).update({ tag: tag ?? null }).eq('id', id);
    if (error) console.error(`[db] updateTag ${table}:`, error.message);
  }
  // localStorage is updated optimistically by the calling page
}

// ---------------------------------------------------------------------------
// Delete upload (re-import flow)
// ---------------------------------------------------------------------------

export async function deleteUpload(uploadId: string): Promise<void> {
  // Remove from localStorage cache
  lsRemoveUpload(uploadId);

  const sb = getSupabase();
  if (!sb) return;
  const tables: TagTable[] = ['keywords', 'keyword_gaps', 'competitor_pages', 'backlinks', 'referring_domains', 'anchor_texts'];
  for (const t of tables) {
    await sb.from(t).delete().eq('upload_id', uploadId);
  }
  await sb.from('dedupe_reports').delete().eq('upload_id', uploadId);
  await sb.from('uploads').delete().eq('id', uploadId);
}

// ---------------------------------------------------------------------------
// Migrate localStorage → Supabase (one-time sync)
// ---------------------------------------------------------------------------

export async function migrateLocalToSupabase(): Promise<{ tables: string[]; rows: number }> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase not configured');

  const store = getStore();
  let totalRows = 0;
  const tables: string[] = [];

  const run = async (table: string, rows: Record<string, unknown>[]) => {
    if (rows.length === 0) return;
    for (const batch of chunk(rows, 500)) {
      const { error } = await sb.from(table).upsert(batch, { onConflict: 'id' });
      if (error) console.error(`[migrate] ${table}:`, error.message);
    }
    tables.push(`${table} (${rows.length})`);
    totalRows += rows.length;
  };

  await run('uploads', store.uploads.map(toUploadRow));
  await run('dedupe_reports', store.dedupeReports.map(toDrRow));
  await run('keywords', store.keywords.map(toKwRow));
  await run('keyword_gaps', store.keywordGaps.map(toGapRow));
  await run('competitor_pages', store.competitorPages.map(toCpRow));
  await run('backlinks', store.backlinks.map(toBlRow));
  await run('referring_domains', store.referringDomains.map(toRdRow));
  await run('anchor_texts', store.anchorTexts.map(toAtRow));

  return { tables, rows: totalRows };
}

// ---------------------------------------------------------------------------
// Connection test
// ---------------------------------------------------------------------------

export async function testConnection(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase env vars not set' };
  const t0 = Date.now();
  const { error } = await sb.from('uploads').select('id').limit(1);
  if (error) return { ok: false, error: error.message };
  return { ok: true, latencyMs: Date.now() - t0 };
}
