import {
  ProjectRecord,
  CompetitorRecord,
  UploadRecord,
  KeywordRecord,
  KeywordGapRecord,
  CompetitorPageRecord,
  BacklinkRecord,
  ReferringDomainRecord,
  AnchorTextRecord,
  DedupeReport,
} from './types';

export type MetadataMap = Record<string, unknown>;
export type ExportHistoryItem = unknown;

export interface ExportDataInput {
  projects: ProjectRecord[];
  competitors: CompetitorRecord[];
  uploads: UploadRecord[];
  keywords: KeywordRecord[];
  keywordGaps: KeywordGapRecord[];
  competitorPages: CompetitorPageRecord[];
  backlinks: BacklinkRecord[];
  referringDomains: ReferringDomainRecord[];
  anchorTexts: AnchorTextRecord[];
  dedupeReports: DedupeReport[];
  opportunityWorkflowMap: MetadataMap;
  contentBriefWorkflowMap: MetadataMap;
  actionPlanMetadataMap: MetadataMap;
  exportHistory: ExportHistoryItem[];
  sourceMode: 'local' | 'supabase';
}

export interface FileEntry {
  name: string;
  content: string;
}

export function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return '';
  let str = '';
  if (typeof val === 'object') {
    str = JSON.stringify(val);
  } else {
    str = String(val);
  }
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function convertToCsv<T extends object>(rows: T[], headers: (keyof T)[]): string {
  const headerRow = headers.join(',');
  const dataRows = rows.map(row => {
    return headers.map(header => {
      const val = row[header];
      return escapeCsvCell(val);
    }).join(',');
  });
  return [headerRow, ...dataRows].join('\n');
}

export function buildExportManifestAndFiles(input: ExportDataInput): { files: FileEntry[]; manifest: Record<string, unknown> } {
  const files: FileEntry[] = [];
  const perFileRowCounts: Record<string, number> = {};

  // 1. Projects
  const projectHeaders: (keyof ProjectRecord)[] = ['id', 'name', 'domain', 'location', 'niche', 'createdAt', 'updatedAt'];
  const projectsCsv = convertToCsv(input.projects || [], projectHeaders);
  files.push({ name: 'projects.csv', content: projectsCsv });
  perFileRowCounts['projects.csv'] = (input.projects || []).length;

  // 2. Competitors
  const competitorHeaders: (keyof CompetitorRecord)[] = ['id', 'projectId', 'domain', 'label', 'createdAt'];
  const competitorsCsv = convertToCsv(input.competitors || [], competitorHeaders);
  files.push({ name: 'competitors.csv', content: competitorsCsv });
  perFileRowCounts['competitors.csv'] = (input.competitors || []).length;

  // 3. Uploads
  const uploadHeaders: (keyof UploadRecord)[] = ['id', 'filename', 'reportType', 'uploadedAt', 'rowCount', 'cleanedRowCount', 'dedupeReportId', 'projectId', 'sourceTool'];
  const uploadsCsv = convertToCsv(input.uploads || [], uploadHeaders);
  files.push({ name: 'uploads.csv', content: uploadsCsv });
  perFileRowCounts['uploads.csv'] = (input.uploads || []).length;

  // 4. Keywords
  const keywordHeaders: (keyof KeywordRecord)[] = ['id', 'uploadId', 'keyword', 'volume', 'difficulty', 'cpc', 'intent', 'database', 'country', 'position', 'url', 'tag', 'opportunityScore', 'raw'];
  const keywordsCsv = convertToCsv(input.keywords || [], keywordHeaders);
  files.push({ name: 'keywords.csv', content: keywordsCsv });
  perFileRowCounts['keywords.csv'] = (input.keywords || []).length;

  // 5. Keyword Gaps
  const keywordGapHeaders: (keyof KeywordGapRecord)[] = ['id', 'uploadId', 'keyword', 'competitorDomain', 'yourDomain', 'competitorPosition', 'yourPosition', 'volume', 'difficulty', 'intent', 'tag', 'opportunityScore', 'raw'];
  const keywordGapsCsv = convertToCsv(input.keywordGaps || [], keywordGapHeaders);
  files.push({ name: 'keyword_gaps.csv', content: keywordGapsCsv });
  perFileRowCounts['keyword_gaps.csv'] = (input.keywordGaps || []).length;

  // 6. Competitor Pages
  const competitorPageHeaders: (keyof CompetitorPageRecord)[] = ['id', 'uploadId', 'domain', 'url', 'title', 'traffic', 'trafficShare', 'keywords', 'tag', 'opportunityScore', 'raw'];
  const competitorPagesCsv = convertToCsv(input.competitorPages || [], competitorPageHeaders);
  files.push({ name: 'competitor_pages.csv', content: competitorPagesCsv });
  perFileRowCounts['competitor_pages.csv'] = (input.competitorPages || []).length;

  // 7. Backlinks
  const backlinkHeaders: (keyof BacklinkRecord)[] = ['id', 'uploadId', 'sourceUrl', 'targetUrl', 'anchorText', 'domainAuthority', 'domainRating', 'trafficSource', 'doFollow', 'tag', 'opportunityScore', 'raw'];
  const backlinksCsv = convertToCsv(input.backlinks || [], backlinkHeaders);
  files.push({ name: 'backlinks.csv', content: backlinksCsv });
  perFileRowCounts['backlinks.csv'] = (input.backlinks || []).length;

  // 8. Referring Domains
  const referringDomainHeaders: (keyof ReferringDomainRecord)[] = ['id', 'uploadId', 'referringDomain', 'targetDomain', 'domainAuthority', 'domainRating', 'backlinks', 'tag', 'opportunityScore', 'raw'];
  const referringDomainsCsv = convertToCsv(input.referringDomains || [], referringDomainHeaders);
  files.push({ name: 'referring_domains.csv', content: referringDomainsCsv });
  perFileRowCounts['referring_domains.csv'] = (input.referringDomains || []).length;

  // 9. Anchor Texts
  const anchorTextHeaders: (keyof AnchorTextRecord)[] = ['id', 'uploadId', 'anchorText', 'backlinks', 'referringDomains', 'doFollow', 'tag', 'raw'];
  const anchorTextsCsv = convertToCsv(input.anchorTexts || [], anchorTextHeaders);
  files.push({ name: 'anchor_texts.csv', content: anchorTextsCsv });
  perFileRowCounts['anchor_texts.csv'] = (input.anchorTexts || []).length;

  // 10. Dedupe Reports
  const dedupeReportHeaders: (keyof DedupeReport)[] = ['id', 'uploadId', 'filename', 'reportType', 'createdAt', 'totalRows', 'duplicatesRemoved', 'cleanedRows', 'dedupeKey', 'issues', 'duplicateExamples'];
  const dedupeReportsCsv = convertToCsv(input.dedupeReports || [], dedupeReportHeaders);
  files.push({ name: 'dedupe_reports.csv', content: dedupeReportsCsv });
  perFileRowCounts['dedupe_reports.csv'] = (input.dedupeReports || []).length;

  // 11. JSON files
  const workflowMap = input.opportunityWorkflowMap || {};
  files.push({ name: 'opportunity_workflow_map.json', content: JSON.stringify(workflowMap, null, 2) });
  perFileRowCounts['opportunity_workflow_map.json'] = Object.keys(workflowMap).length;

  const briefMap = input.contentBriefWorkflowMap || {};
  files.push({ name: 'content_brief_workflow_map.json', content: JSON.stringify(briefMap, null, 2) });
  perFileRowCounts['content_brief_workflow_map.json'] = Object.keys(briefMap).length;

  const planMetadata = input.actionPlanMetadataMap || {};
  files.push({ name: 'action_plan_metadata.json', content: JSON.stringify(planMetadata, null, 2) });
  perFileRowCounts['action_plan_metadata.json'] = Object.keys(planMetadata).length;

  const history = input.exportHistory || [];
  files.push({ name: 'export_history.json', content: JSON.stringify(history, null, 2) });
  perFileRowCounts['export_history.json'] = history.length;

  // 12. Manifest
  const manifest = {
    exportedAt: new Date().toISOString(),
    appName: 'SERPVault',
    schemaVersion: '1.0',
    sourceMode: input.sourceMode,
    perFileRowCounts,
  };

  files.push({ name: 'manifest.json', content: JSON.stringify(manifest, null, 2) });

  return { files, manifest };
}

// CRC-32 code
const crcTable = new Int32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[i] = c;
}

export function crc32(data: Uint8Array): number {
  let crc = 0 ^ -1;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ data[i]) & 0xFF];
  }
  return (crc ^ -1) >>> 0;
}

// ZIP generation helpers
function writeUint16(buf: Uint8Array, offset: number, value: number) {
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >> 8) & 0xff;
}

function writeUint32(buf: Uint8Array, offset: number, value: number) {
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >> 8) & 0xff;
  buf[offset + 2] = (value >> 16) & 0xff;
  buf[offset + 3] = (value >> 24) & 0xff;
}

export function createZip(entries: FileEntry[]): Uint8Array {
  const encodedEntries = entries.map(entry => {
    const data = new TextEncoder().encode(entry.content);
    const nameBytes = new TextEncoder().encode(entry.name);
    const crc = crc32(data);
    return {
      name: entry.name,
      nameBytes,
      data,
      crc,
      size: data.length
    };
  });

  let totalSize = 22; // EOCD size
  for (const entry of encodedEntries) {
    totalSize += 30 + entry.nameBytes.length + entry.size; // Local Header
    totalSize += 46 + entry.nameBytes.length; // Central Directory Header
  }

  const zip = new Uint8Array(totalSize);
  let offset = 0;

  // Local File Headers & Data
  const localOffsets: number[] = [];
  for (const entry of encodedEntries) {
    localOffsets.push(offset);

    // Signature: 0x04034b50 -> [0x50, 0x4b, 0x03, 0x04]
    zip[offset] = 0x50; zip[offset + 1] = 0x4b; zip[offset + 2] = 0x03; zip[offset + 3] = 0x04;
    writeUint16(zip, offset + 4, 10);
    writeUint16(zip, offset + 6, 0);
    writeUint16(zip, offset + 8, 0);
    writeUint16(zip, offset + 10, 0);
    writeUint16(zip, offset + 12, 0);
    writeUint32(zip, offset + 14, entry.crc);
    writeUint32(zip, offset + 18, entry.size);
    writeUint32(zip, offset + 22, entry.size);
    writeUint16(zip, offset + 26, entry.nameBytes.length);
    writeUint16(zip, offset + 28, 0);
    offset += 30;

    zip.set(entry.nameBytes, offset);
    offset += entry.nameBytes.length;

    zip.set(entry.data, offset);
    offset += entry.size;
  }

  const centralDirStartOffset = offset;

  // Central Directory File Headers
  for (let i = 0; i < encodedEntries.length; i++) {
    const entry = encodedEntries[i];
    const localOffset = localOffsets[i];

    // Signature: 0x02014b50 -> [0x50, 0x4b, 0x01, 0x02]
    zip[offset] = 0x50; zip[offset + 1] = 0x4b; zip[offset + 2] = 0x01; zip[offset + 3] = 0x02;
    writeUint16(zip, offset + 4, 20);
    writeUint16(zip, offset + 6, 10);
    writeUint16(zip, offset + 8, 0);
    writeUint16(zip, offset + 10, 0);
    writeUint16(zip, offset + 12, 0);
    writeUint16(zip, offset + 14, 0);
    writeUint32(zip, offset + 16, entry.crc);
    writeUint32(zip, offset + 20, entry.size);
    writeUint32(zip, offset + 24, entry.size);
    writeUint16(zip, offset + 28, entry.nameBytes.length);
    writeUint16(zip, offset + 30, 0);
    writeUint16(zip, offset + 32, 0);
    writeUint16(zip, offset + 34, 0);
    writeUint16(zip, offset + 36, 0);
    writeUint32(zip, offset + 38, 0);
    writeUint32(zip, offset + 42, localOffset);
    offset += 46;

    zip.set(entry.nameBytes, offset);
    offset += entry.nameBytes.length;
  }

  const centralDirSize = offset - centralDirStartOffset;

  // End of Central Directory
  // Signature: 0x06054b50 -> [0x50, 0x4b, 0x05, 0x06]
  zip[offset] = 0x50; zip[offset + 1] = 0x4b; zip[offset + 2] = 0x05; zip[offset + 3] = 0x06;
  writeUint16(zip, offset + 4, 0);
  writeUint16(zip, offset + 6, 0);
  writeUint16(zip, offset + 8, encodedEntries.length);
  writeUint16(zip, offset + 10, encodedEntries.length);
  writeUint32(zip, offset + 12, centralDirSize);
  writeUint32(zip, offset + 16, centralDirStartOffset);
  writeUint16(zip, offset + 20, 0);

  return zip;
}
