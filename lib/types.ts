export type ReportType =
  | 'keyword'
  | 'keyword_gap'
  | 'competitor_pages'
  | 'backlink'
  | 'referring_domain'
  | 'anchor_text'
  | 'organic_positions'
  | 'unknown';

export type Tag =
  | 'Money Page'
  | 'Blog Post'
  | 'City Page'
  | 'Backlink Target'
  | 'Link Bait'
  | 'Ignore';

export interface UploadRecord {
  id: string;
  filename: string;
  reportType: ReportType;
  uploadedAt: string;
  rowCount: number;
  cleanedRowCount: number;
  dedupeReportId: string;
}

export interface KeywordRecord {
  id: string;
  uploadId: string;
  keyword: string;
  volume?: number;
  difficulty?: number;
  cpc?: number;
  intent?: string;
  database?: string;
  country?: string;
  position?: number;
  url?: string;
  tag?: Tag;
  opportunityScore?: number;
  raw: Record<string, string>;
}

export interface KeywordGapRecord {
  id: string;
  uploadId: string;
  keyword: string;
  competitorDomain?: string;
  yourDomain?: string;
  competitorPosition?: number;
  yourPosition?: number;
  volume?: number;
  difficulty?: number;
  intent?: string;
  tag?: Tag;
  opportunityScore?: number;
  raw: Record<string, string>;
}

export interface CompetitorPageRecord {
  id: string;
  uploadId: string;
  domain: string;
  url: string;
  title?: string;
  traffic?: number;
  trafficShare?: number;
  keywords?: number;
  tag?: Tag;
  opportunityScore?: number;
  raw: Record<string, string>;
}

export interface BacklinkRecord {
  id: string;
  uploadId: string;
  sourceUrl: string;
  targetUrl: string;
  anchorText?: string;
  domainAuthority?: number;
  domainRating?: number;
  trafficSource?: number;
  doFollow?: boolean;
  tag?: Tag;
  opportunityScore?: number;
  raw: Record<string, string>;
}

export interface ReferringDomainRecord {
  id: string;
  uploadId: string;
  referringDomain: string;
  targetDomain?: string;
  domainAuthority?: number;
  domainRating?: number;
  backlinks?: number;
  tag?: Tag;
  opportunityScore?: number;
  raw: Record<string, string>;
}

export interface AnchorTextRecord {
  id: string;
  uploadId: string;
  anchorText: string;
  backlinks?: number;
  referringDomains?: number;
  doFollow?: number;
  tag?: Tag;
  raw: Record<string, string>;
}

export interface DedupeReport {
  id: string;
  uploadId: string;
  filename: string;
  reportType: ReportType;
  createdAt: string;
  totalRows: number;
  duplicatesRemoved: number;
  cleanedRows: number;
  dedupeKey: string;
  issues: string[];
  duplicateExamples: Array<Record<string, string>>;
}

export interface ContentOpportunity {
  id: string;
  keyword: string;
  volume: number;
  difficulty: number;
  intent: string;
  suggestedType: Tag;
  opportunityScore: number;
  sourceUploadId: string;
}

export interface BacklinkOpportunity {
  id: string;
  sourceUrl: string;
  targetUrl: string;
  anchorText: string;
  domainAuthority: number;
  tag: Tag;
  opportunityScore: number;
  sourceUploadId: string;
}

export interface AppStore {
  uploads: UploadRecord[];
  keywords: KeywordRecord[];
  keywordGaps: KeywordGapRecord[];
  competitorPages: CompetitorPageRecord[];
  backlinks: BacklinkRecord[];
  referringDomains: ReferringDomainRecord[];
  anchorTexts: AnchorTextRecord[];
  dedupeReports: DedupeReport[];
}
