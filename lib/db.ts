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
import { getCurrentUserId } from './supabase/auth';
import { getStore, updateStore, removeUpload as lsRemoveUpload } from './storage';
import { buildProjectConflictPlan } from './project-conflicts';
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
  ProjectRecord,
  CompetitorRecord,
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
  const userId = await getCurrentUserId();
  if (!userId) return; // Skip Supabase writes if no user is signed in
  const rowsWithUserId = rows.map(r => ({ ...r, user_id: userId }));
  for (const batch of chunk(rowsWithUserId, 500)) {
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
    project_id: u.projectId ?? null,
    source_tool: u.sourceTool ?? null,
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
    projectId: r.project_id ?? undefined,
    sourceTool: r.source_tool ?? undefined,
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

function toProjectRow(p: ProjectRecord) {
  return {
    id: p.id,
    name: p.name,
    domain: p.domain,
    location: p.location ?? null,
    niche: p.niche ?? null,
    created_at: p.createdAt,
    updated_at: p.updatedAt ?? null,
  };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromProjectRow(r: any): ProjectRecord {
  return {
    id: r.id,
    name: r.name,
    domain: r.domain,
    location: r.location ?? undefined,
    niche: r.niche ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at ?? undefined,
  };
}

function toCompetitorRow(c: CompetitorRecord) {
  return {
    id: c.id,
    project_id: c.projectId,
    domain: c.domain,
    label: c.label ?? null,
    created_at: c.createdAt ?? null,
  };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromCompetitorRow(r: any): CompetitorRecord {
  return {
    id: r.id,
    projectId: r.project_id,
    domain: r.domain,
    label: r.label ?? undefined,
    createdAt: r.created_at ?? undefined,
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

// ---------------------------------------------------------------------------
// Keyword Deduplication Helpers
// ---------------------------------------------------------------------------

interface UploadInfo {
  projectId: string;
  uploadedAt: string;
}

async function getUploadInfoMap(): Promise<Map<string, UploadInfo>> {
  const infoMap = new Map<string, UploadInfo>();

  // 1. Local store
  const store = getStore();
  if (store && store.uploads) {
    for (const u of store.uploads) {
      if (u.id) {
        infoMap.set(u.id, {
          projectId: u.projectId || 'unassigned',
          uploadedAt: u.uploadedAt || '',
        });
      }
    }
  }

  // 2. Supabase if configured & user is signed in
  const sb = getSupabase();
  if (sb) {
    const userId = await getCurrentUserId();
    if (userId) {
      try {
        const { data, error } = await sb.from('uploads').select('id, project_id, uploaded_at').eq('user_id', userId);
        if (data && !error) {
          for (const row of data) {
            if (row.id) {
              infoMap.set(row.id, {
                projectId: row.project_id || 'unassigned',
                uploadedAt: row.uploaded_at || '',
              });
            }
          }
        }
      } catch (e) {
        console.error('[db] failed to fetch uploads for info map:', e);
      }
    }
  }

  return infoMap;
}

function getKeywordIdentity(k: KeywordRecord, uploadInfoMap: Map<string, UploadInfo>): string {
  const kw = (k.keyword || '').toLowerCase().trim().replace(/\s+/g, ' ');
  const db = (k.database || '').toLowerCase().trim();
  const country = (k.country || '').toLowerCase().trim();

  let rawLoc = '';
  if (k.raw) {
    const locationKeys = ['database', 'country', 'location', 'market'];
    for (const key of Object.keys(k.raw)) {
      const lowerKey = key.toLowerCase();
      if (locationKeys.some(lk => lowerKey.includes(lk))) {
        const val = k.raw[key];
        if (val) {
          rawLoc = val.toLowerCase().trim();
          break;
        }
      }
    }
  }

  const signals = new Set<string>();
  if (db) signals.add(db);
  if (country) signals.add(country);
  if (rawLoc) signals.add(rawLoc);

  const locationSig = Array.from(signals).sort().join('||');
  const projectId = uploadInfoMap.get(k.uploadId)?.projectId || 'unassigned';

  return `${kw}::${locationSig}::${projectId}`;
}

export async function saveKeywords(rows: KeywordRecord[]): Promise<number> {
  const existingKeywords = await getKeywords();
  const uploadInfoMap = await getUploadInfoMap();

  const existingIdentities = new Set<string>();
  for (const k of existingKeywords) {
    existingIdentities.add(getKeywordIdentity(k, uploadInfoMap));
  }

  const filteredRows: KeywordRecord[] = [];
  const batchSeen = new Set<string>();

  for (const k of rows) {
    const idKey = getKeywordIdentity(k, uploadInfoMap);
    if (!existingIdentities.has(idKey) && !batchSeen.has(idKey)) {
      batchSeen.add(idKey);
      filteredRows.push(k);
    }
  }

  const finalSavedCount = filteredRows.length;

  if (rows.length > 0) {
    const uploadId = rows[0].uploadId;

    // Update local store upload cleanedRowCount
    updateStore(s => ({
      ...s,
      uploads: s.uploads.map(u => u.id === uploadId ? { ...u, cleanedRowCount: finalSavedCount } : u)
    }));

    // Update Supabase upload cleanedRowCount
    const sb = getSupabase();
    if (sb) {
      const userId = await getCurrentUserId();
      if (userId) {
        try {
          await sb.from('uploads').update({ cleaned_row_count: finalSavedCount }).eq('id', uploadId).eq('user_id', userId);
        } catch (err) {
          console.error('[db] failed to update upload cleaned_row_count in Supabase:', err);
        }
      }
    }
  }

  if (finalSavedCount === 0) return 0;

  updateStore(s => ({ ...s, keywords: [...s.keywords, ...filteredRows] }));
  await sbInsert('keywords', filteredRows.map(toKwRow));
  return finalSavedCount;
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

export async function saveProject(p: ProjectRecord, competitorDomains?: string[]): Promise<void> {
  const newCompetitors: CompetitorRecord[] = (competitorDomains || []).map((domain, index) => ({
    id: `${p.id}-comp-${index}-${Date.now()}`,
    projectId: p.id,
    domain: domain.trim(),
    createdAt: new Date().toISOString(),
  }));

  updateStore(s => ({
    ...s,
    projects: [...(s.projects || []), p],
    competitors: [...(s.competitors || []), ...newCompetitors],
  }));

  const sb = getSupabase();
  if (sb) {
    try {
      await sbInsert('projects', [toProjectRow(p)]);
      if (newCompetitors.length > 0) {
        await sbInsert('competitors', newCompetitors.map(toCompetitorRow));
      }
    } catch (err) {
      console.error('[db] saveProject Supabase error:', err);
    }
  }
}

export async function deleteProject(projectId: string): Promise<void> {
  updateStore(s => ({
    ...s,
    projects: (s.projects || []).filter(p => p.id !== projectId),
    competitors: (s.competitors || []).filter(c => c.projectId !== projectId),
    uploads: (s.uploads || []).map(u => u.projectId === projectId ? { ...u, projectId: undefined } : u),
  }));

  const sb = getSupabase();
  if (sb) {
    const userId = await getCurrentUserId();
    if (userId) {
      try {
        await sb.from('uploads').update({ project_id: null }).eq('project_id', projectId).eq('user_id', userId);
        await sb.from('competitors').delete().eq('project_id', projectId).eq('user_id', userId);
        await sb.from('projects').delete().eq('id', projectId).eq('user_id', userId);
      } catch (err) {
        console.error('[db] deleteProject Supabase error:', err);
      }
    }
  }
}

export async function updateUploadProject(uploadIds: string[], projectId: string | undefined): Promise<void> {
  updateStore(s => ({
    ...s,
    uploads: (s.uploads || []).map(u =>
      uploadIds.includes(u.id) ? { ...u, projectId } : u
    )
  }));

  const sb = getSupabase();
  if (sb && uploadIds.length > 0) {
    const userId = await getCurrentUserId();
    if (userId) {
      try {
        const { error } = await sb
          .from('uploads')
          .update({ project_id: projectId ?? null })
          .in('id', uploadIds)
          .eq('user_id', userId);
        if (error) {
          console.error(`[db] updateUploadProject Supabase error:`, error.message);
        }
      } catch (err) {
        console.error('[db] updateUploadProject Supabase error:', err);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Reads  (Supabase → localStorage fallback)
// ---------------------------------------------------------------------------

export async function getProjects(): Promise<ProjectRecord[]> {
  const sb = getSupabase();
  if (sb) {
    const userId = await getCurrentUserId();
    if (userId) {
      try {
        const { data, error } = await sb.from('projects').select('*').eq('user_id', userId).order('created_at', { ascending: false });
        if (data && !error) {
          const projects = data.map(fromProjectRow);
          updateStore(s => ({ ...s, projects }));
          return projects;
        }
        console.error('[db] getProjects:', error?.message);
      } catch (e) {
        console.error('[db] getProjects exception:', e);
      }
    }
  }
  return getStore().projects || [];
}

export async function getCompetitors(): Promise<CompetitorRecord[]> {
  const sb = getSupabase();
  if (sb) {
    const userId = await getCurrentUserId();
    if (userId) {
      try {
        const { data, error } = await sb.from('competitors').select('*').eq('user_id', userId).order('created_at', { ascending: false });
        if (data && !error) {
          const competitors = data.map(fromCompetitorRow);
          updateStore(s => ({ ...s, competitors }));
          return competitors;
        }
        console.error('[db] getCompetitors:', error?.message);
      } catch (e) {
        console.error('[db] getCompetitors exception:', e);
      }
    }
  }
  return getStore().competitors || [];
}

export async function getUploads(): Promise<UploadRecord[]> {
  const sb = getSupabase();
  if (sb) {
    const userId = await getCurrentUserId();
    if (userId) {
      try {
        const { data, error } = await sb.from('uploads').select('*').eq('user_id', userId).order('uploaded_at', { ascending: false });
        if (data && !error) {
          const uploads = data.map(fromUploadRow);
          updateStore(s => ({ ...s, uploads }));
          return uploads;
        }
        console.error('[db] getUploads:', error?.message);
      } catch (e) {
        console.error('[db] getUploads exception:', e);
      }
    }
  }
  return getStore().uploads;
}

export async function getKeywords(): Promise<KeywordRecord[]> {
  const sb = getSupabase();
  let allKeywords: KeywordRecord[] = [];
  let fetchedFromSb = false;

  if (sb) {
    const userId = await getCurrentUserId();
    if (userId) {
      try {
        const { data, error } = await sb.from('keywords').select('*').eq('user_id', userId).order('opportunity_score', { ascending: false, nullsFirst: false });
        if (data && !error) {
          allKeywords = data.map(fromKwRow);
          fetchedFromSb = true;
        } else {
          console.error('[db] getKeywords:', error?.message);
        }
      } catch (e) {
        console.error('[db] getKeywords exception:', e);
      }
    }
  }

  if (!fetchedFromSb) {
    allKeywords = getStore().keywords || [];
  }

  const uploadInfoMap = await getUploadInfoMap();

  // Sort a copy of allKeywords by upload's uploadedAt (ascending) to keep the first (oldest) inserted row
  const sortedForDedupe = [...allKeywords].sort((a, b) => {
    const timeA = uploadInfoMap.get(a.uploadId)?.uploadedAt || '';
    const timeB = uploadInfoMap.get(b.uploadId)?.uploadedAt || '';
    return timeA.localeCompare(timeB);
  });

  const seenIdentities = new Set<string>();
  const duplicateIdsToDelete = new Set<string>();

  for (const k of sortedForDedupe) {
    const idKey = getKeywordIdentity(k, uploadInfoMap);
    if (seenIdentities.has(idKey)) {
      duplicateIdsToDelete.add(k.id);
    } else {
      seenIdentities.add(idKey);
    }
  }

  if (duplicateIdsToDelete.size > 0) {
    // Update localStorage keywords to remove duplicates
    updateStore(s => ({
      ...s,
      keywords: (s.keywords || []).filter(k => !duplicateIdsToDelete.has(k.id))
    }));

    // Delete duplicate keyword row IDs from Supabase database
    if (sb) {
      const userId = await getCurrentUserId();
      if (userId) {
        try {
          const ids = Array.from(duplicateIdsToDelete);
          for (const batch of chunk(ids, 100)) {
            const { error } = await sb.from('keywords').delete().in('id', batch).eq('user_id', userId);
            if (error) {
              console.error('[db] failed to delete duplicate keywords from Supabase:', error.message);
            }
          }
        } catch (err) {
          console.error('[db] exception during Supabase delete of duplicate keywords:', err);
        }
      }
    }

    // Return filtered allKeywords to match current return behavior but clean
    return allKeywords.filter(k => !duplicateIdsToDelete.has(k.id));
  }

  return allKeywords;
}

export async function getKeywordGaps(): Promise<KeywordGapRecord[]> {
  const sb = getSupabase();
  if (sb) {
    const userId = await getCurrentUserId();
    if (userId) {
      const { data, error } = await sb.from('keyword_gaps').select('*').eq('user_id', userId).order('opportunity_score', { ascending: false, nullsFirst: false });
      if (data && !error) return data.map(fromGapRow);
      console.error('[db] getKeywordGaps:', error?.message);
    }
  }
  return getStore().keywordGaps;
}

export async function getCompetitorPages(): Promise<CompetitorPageRecord[]> {
  const sb = getSupabase();
  if (sb) {
    const userId = await getCurrentUserId();
    if (userId) {
      const { data, error } = await sb.from('competitor_pages').select('*').eq('user_id', userId).order('traffic', { ascending: false, nullsFirst: false });
      if (data && !error) return data.map(fromCpRow);
      console.error('[db] getCompetitorPages:', error?.message);
    }
  }
  return getStore().competitorPages;
}

export async function getBacklinks(): Promise<BacklinkRecord[]> {
  const sb = getSupabase();
  if (sb) {
    const userId = await getCurrentUserId();
    if (userId) {
      const { data, error } = await sb.from('backlinks').select('*').eq('user_id', userId).order('opportunity_score', { ascending: false, nullsFirst: false });
      if (data && !error) return data.map(fromBlRow);
      console.error('[db] getBacklinks:', error?.message);
    }
  }
  return getStore().backlinks;
}

export async function getReferringDomains(): Promise<ReferringDomainRecord[]> {
  const sb = getSupabase();
  if (sb) {
    const userId = await getCurrentUserId();
    if (userId) {
      const { data, error } = await sb.from('referring_domains').select('*').eq('user_id', userId);
      if (data && !error) return data.map(fromRdRow);
      console.error('[db] getReferringDomains:', error?.message);
    }
  }
  return getStore().referringDomains;
}

export async function getAnchorTexts(): Promise<AnchorTextRecord[]> {
  const sb = getSupabase();
  if (sb) {
    const userId = await getCurrentUserId();
    if (userId) {
      const { data, error } = await sb.from('anchor_texts').select('*').eq('user_id', userId);
      if (data && !error) return data.map(fromAtRow);
      console.error('[db] getAnchorTexts:', error?.message);
    }
  }
  return getStore().anchorTexts;
}

export async function getDedupeReports(): Promise<DedupeReport[]> {
  const sb = getSupabase();
  if (sb) {
    const userId = await getCurrentUserId();
    if (userId) {
      const { data, error } = await sb.from('dedupe_reports').select('*').eq('user_id', userId).order('created_at', { ascending: false });
      if (data && !error) return data.map(fromDrRow);
      console.error('[db] getDedupeReports:', error?.message);
    }
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
    const userId = await getCurrentUserId();
    if (userId) {
      const { error } = await sb.from(table).update({ tag: tag ?? null }).eq('id', id).eq('user_id', userId);
      if (error) console.error(`[db] updateTag ${table}:`, error.message);
    }
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
  const userId = await getCurrentUserId();
  if (!userId) return;

  const tables: TagTable[] = ['keywords', 'keyword_gaps', 'competitor_pages', 'backlinks', 'referring_domains', 'anchor_texts'];
  for (const t of tables) {
    await sb.from(t).delete().eq('upload_id', uploadId).eq('user_id', userId);
  }
  await sb.from('dedupe_reports').delete().eq('upload_id', uploadId).eq('user_id', userId);
  await sb.from('uploads').delete().eq('id', uploadId).eq('user_id', userId);
}

// ---------------------------------------------------------------------------
// Migrate localStorage → Supabase (one-time sync)
// ---------------------------------------------------------------------------

export async function migrateLocalToSupabase(): Promise<{
  tables: string[];
  rows: number;
  projectRemap?: Record<string, string>;
  projectSummaries?: string[];
  projectWarnings?: string[];
}> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase not configured');
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('No user is signed in to sync data');

  const store = getStore();
  let totalRows = 0;
  const tables: string[] = [];

  const run = async (table: string, rows: Record<string, unknown>[]) => {
    if (rows.length === 0) return;
    const rowsWithUserId = rows.map(r => ({ ...r, user_id: userId }));
    for (const batch of chunk(rowsWithUserId, 500)) {
      const { error } = await sb.from(table).upsert(batch, { onConflict: 'id' });
      if (error) console.error(`[migrate] ${table}:`, error.message);
    }
    tables.push(`${table} (${rows.length})`);
    totalRows += rows.length;
  };

  // Fetch the signed-in user's existing cloud projects before uploading
  const { data: remoteRows, error: fetchError } = await sb
    .from('projects')
    .select('*')
    .eq('user_id', userId);
  if (fetchError) {
    console.error('[migrate] failed to fetch remote projects:', fetchError.message);
  }
  const remoteProjects = (remoteRows || []).map(fromProjectRow);

  // Build conflict plan
  const plan = buildProjectConflictPlan(store.projects || [], remoteProjects);

  // Use the plan to skip creating duplicate projects
  await run('projects', plan.projectsToCreate.map(toProjectRow));

  // Rewrite project_id references in competitors according to the remap before writing
  const mappedCompetitors = (store.competitors || []).map(toCompetitorRow).map(c => {
    if (c.project_id && plan.projectIdMap[c.project_id]) {
      return { ...c, project_id: plan.projectIdMap[c.project_id] };
    }
    return c;
  });
  await run('competitors', mappedCompetitors);

  // Rewrite project_id references in uploads according to the remap before writing
  const mappedUploads = (store.uploads || []).map(toUploadRow).map(u => {
    if (u.project_id && plan.projectIdMap[u.project_id]) {
      return { ...u, project_id: plan.projectIdMap[u.project_id] };
    }
    return u;
  });
  await run('uploads', mappedUploads);

  await run('dedupe_reports', store.dedupeReports.map(toDrRow));
  await run('keywords', store.keywords.map(toKwRow));
  await run('keyword_gaps', store.keywordGaps.map(toGapRow));
  await run('competitor_pages', store.competitorPages.map(toCpRow));
  await run('backlinks', store.backlinks.map(toBlRow));
  await run('referring_domains', store.referringDomains.map(toRdRow));
  await run('anchor_texts', store.anchorTexts.map(toAtRow));

  return {
    tables,
    rows: totalRows,
    projectRemap: plan.projectIdMap,
    projectSummaries: plan.summaries,
    projectWarnings: plan.warnings,
  };
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

// ---------------------------------------------------------------------------
// Delete all cloud and local user-owned data
// ---------------------------------------------------------------------------

export const DELETION_ORDER = [
  'keywords',
  'keyword_gaps',
  'competitor_pages',
  'backlinks',
  'referring_domains',
  'anchor_texts',
  'dedupe_reports',
  'upload_audit_logs',
  'opportunity_workflow_items',
  'content_brief_workflows',
  'user_settings',
  'uploads',
  'competitors',
  'projects',
  'profiles'
] as const;

export async function deleteCloudUserData(): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    const userId = await getCurrentUserId();
    if (userId) {
      // Call the RPC function delete_user_data
      const { error } = await sb.rpc('delete_user_data');
      if (error) {
        console.error('[db] delete_user_data RPC error, falling back to manual deletes:', error.message);

        // Manual fallbacks in dependency-safe order:
        for (const table of DELETION_ORDER) {
          const { error: deleteError } = table === 'profiles'
            ? await sb.from('profiles').delete().eq('id', userId)
            : await sb.from(table).delete().eq('user_id', userId);
          if (deleteError) {
            throw new Error(`Failed to delete data from table ${table}: ${deleteError.message}`);
          }
        }
      }
    }
  }

  // Clear local storage data (matching local caches / workflow state)
  if (typeof window !== 'undefined') {
    // Clear main dataset storage:
    localStorage.removeItem('serpvault_data');

    // Clear workflow / settings / metadata storage:
    const workflowKeys = [
      'serpvault_opportunity_workflow',
      'serpvault_action_plan_metadata',
      'serpvault_content_brief_workflow',
      'serpvault_export_history',
      'serpvault_selected_project_id'
    ];
    for (const key of workflowKeys) {
      localStorage.removeItem(key);
    }
  }
}
