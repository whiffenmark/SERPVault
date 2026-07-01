import type {
  UploadRecord,
  ProjectRecord,
  KeywordRecord,
  KeywordGapRecord,
  CompetitorPageRecord,
  BacklinkRecord,
  ReferringDomainRecord,
  AnchorTextRecord,
  DedupeReport,
} from './types';

export interface ReportStatus {
  type: string;
  label: string;
  count: number;
  uploadCount: number;
  status: 'Ready' | 'Thin' | 'Missing' | 'Needs Review';
}

export interface ProjectHealthStatus {
  id: string;
  name: string;
  domain: string;
  uploadCount: number;
  keywordCount: number;
  backlinkCount: number;
  competitorPageCount: number;
  lastUploadDate: string | null;
  gaps: string[];
}

export interface HealthIssue {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'warning' | 'info';
  category: 'coverage' | 'freshness' | 'assignment' | 'dedupe' | 'volume';
}

export interface HealthSummary {
  overallScore: number;
  metrics: {
    coverage: number;
    assignment: number;
    dedupe: number;
    freshness: number;
    volume: number;
  };
  totalRows: number;
  duplicatesRemoved: number;
  reportTypesCount: number;
  unassignedUploadsCount: number;
  lastUploadDate: string | null;
  reportCoverage: ReportStatus[];
  projectCoverage: ProjectHealthStatus[];
  issues: HealthIssue[];
}

/**
 * Computes a comprehensive data health & coverage summary based on database records.
 * Can be scoped to a single project or run globally.
 */
export function calculateDataHealth(
  uploads: UploadRecord[],
  projects: ProjectRecord[],
  keywords: KeywordRecord[],
  keywordGaps: KeywordGapRecord[],
  competitorPages: CompetitorPageRecord[],
  backlinks: BacklinkRecord[],
  referringDomains: ReferringDomainRecord[],
  anchorTexts: AnchorTextRecord[],
  dedupeReports: DedupeReport[],
  selectedProjectId: string | null
): HealthSummary {
  const now = new Date();

  // 1. Scoping
  const scopedUploads = selectedProjectId
    ? uploads.filter((u) => u.projectId === selectedProjectId)
    : uploads;

  const scopedUploadIds = new Set(scopedUploads.map((u) => u.id));

  const filterScoped = <T extends { uploadId: string }>(rows: T[]): T[] => {
    if (!selectedProjectId) return rows;
    return rows.filter((r) => scopedUploadIds.has(r.uploadId));
  };

  const scopedKeywords = filterScoped(keywords);
  const scopedKeywordGaps = filterScoped(keywordGaps);
  const scopedCompetitorPages = filterScoped(competitorPages);
  const scopedBacklinks = filterScoped(backlinks);
  const scopedReferringDomains = filterScoped(referringDomains);
  const scopedAnchorTexts = filterScoped(anchorTexts);
  const scopedDedupeReports = dedupeReports.filter((dr) => scopedUploadIds.has(dr.uploadId));

  // 2. Metrics helpers
  const totalRows =
    scopedKeywords.length +
    scopedKeywordGaps.length +
    scopedCompetitorPages.length +
    scopedBacklinks.length +
    scopedReferringDomains.length +
    scopedAnchorTexts.length;

  const duplicatesRemoved = scopedDedupeReports.reduce((acc, curr) => acc + (curr.duplicatesRemoved || 0), 0);
  const totalUploadedRows = scopedDedupeReports.reduce((acc, curr) => acc + (curr.totalRows || 0), 0);
  const duplicateRate = totalUploadedRows > 0 ? duplicatesRemoved / totalUploadedRows : 0;

  const globalUnassignedUploads = uploads.filter((u) => !u.projectId);
  const unassignedUploadsCount = globalUnassignedUploads.length;

  // Last Upload Freshness
  let lastUploadDate: string | null = null;
  if (scopedUploads.length > 0) {
    const dates = scopedUploads.map((u) => new Date(u.uploadedAt).getTime()).filter((t) => !isNaN(t));
    if (dates.length > 0) {
      lastUploadDate = new Date(Math.max(...dates)).toISOString();
    }
  }

  // 3. Score calculation
  // Coverage Score (25%): 6 report types
  const reportTypes = [
    { type: 'keyword', label: 'Keywords', rows: scopedKeywords, uploads: scopedUploads.filter(u => u.reportType === 'keyword') },
    { type: 'keyword_gap', label: 'Keyword Gaps', rows: scopedKeywordGaps, uploads: scopedUploads.filter(u => u.reportType === 'keyword_gap') },
    { type: 'competitor_pages', label: 'Competitor Pages', rows: scopedCompetitorPages, uploads: scopedUploads.filter(u => u.reportType === 'competitor_pages') },
    { type: 'backlink', label: 'Backlinks', rows: scopedBacklinks, uploads: scopedUploads.filter(u => u.reportType === 'backlink') },
    { type: 'referring_domain', label: 'Referring Domains', rows: scopedReferringDomains, uploads: scopedUploads.filter(u => u.reportType === 'referring_domain') },
    { type: 'anchor_text', label: 'Anchor Texts', rows: scopedAnchorTexts, uploads: scopedUploads.filter(u => u.reportType === 'anchor_text') },
  ];

  const presentReportTypes = reportTypes.filter((rt) => rt.rows.length > 0);
  const coverageScore = Math.round((presentReportTypes.length / 6) * 100);

  // Project Assignment Score (20%): Percentage of global uploads assigned to projects
  const assignmentScore = uploads.length > 0
    ? Math.round(((uploads.length - unassignedUploadsCount) / uploads.length) * 100)
    : 100;

  // Deduplication Score (20%): Percentage of scoped uploads with deduplication records
  const uploadsWithDedupeCount = scopedUploads.filter((u) => {
    return u.dedupeReportId || dedupeReports.some((dr) => dr.uploadId === u.id);
  }).length;
  const dedupeScore = scopedUploads.length > 0
    ? Math.round((uploadsWithDedupeCount / scopedUploads.length) * 100)
    : 100;

  // Freshness Score (15%): Days elapsed since last upload
  let freshnessScore = 0;
  if (lastUploadDate) {
    const daysAgo = (now.getTime() - new Date(lastUploadDate).getTime()) / (1000 * 60 * 60 * 24);
    if (daysAgo <= 7) freshnessScore = 100;
    else if (daysAgo <= 14) freshnessScore = 90;
    else if (daysAgo <= 30) freshnessScore = 75;
    else if (daysAgo <= 90) freshnessScore = 50;
    else freshnessScore = 20;
  }

  // Volume & Density Score (20%): density of core tables
  let volumeScore = 0;
  // Keywords (30 pts)
  if (scopedKeywords.length >= 100) volumeScore += 30;
  else if (scopedKeywords.length > 0) volumeScore += 15;
  // Backlinks (30 pts)
  if (scopedBacklinks.length >= 50) volumeScore += 30;
  else if (scopedBacklinks.length > 0) volumeScore += 15;
  // Competitor Pages (20 pts)
  if (scopedCompetitorPages.length >= 10) volumeScore += 20;
  else if (scopedCompetitorPages.length > 0) volumeScore += 10;
  // Actionability/Tags (20 pts)
  const taggedKeywords = scopedKeywords.filter((k) => k.tag && k.tag !== 'Ignore').length;
  const taggedBacklinks = scopedBacklinks.filter((b) => b.tag && b.tag !== 'Ignore').length;
  const totalTagged = taggedKeywords + taggedBacklinks;
  const actionablePct = (scopedKeywords.length + scopedBacklinks.length) > 0
    ? totalTagged / (scopedKeywords.length + scopedBacklinks.length)
    : 0;
  if (actionablePct >= 0.2) volumeScore += 20;
  else if (actionablePct > 0) volumeScore += 10;

  // Overall Score
  let overallScore = 0;
  if (scopedUploads.length > 0) {
    overallScore = Math.round(
      coverageScore * 0.25 +
      assignmentScore * 0.2 +
      dedupeScore * 0.2 +
      freshnessScore * 0.15 +
      volumeScore * 0.2
    );
  }

  // 4. Report Coverage List/Matrix
  const reportCoverage: ReportStatus[] = reportTypes.map((rt) => {
    const rowCount = rt.rows.length;
    const uCount = rt.uploads.length;
    let status: ReportStatus['status'] = 'Missing';

    if (rowCount > 0) {
      if (rowCount < 10) {
        status = 'Thin';
      } else {
        status = 'Ready';
      }
    } else if (uCount > 0) {
      status = 'Needs Review';
    }

    return {
      type: rt.type,
      label: rt.label,
      count: rowCount,
      uploadCount: uCount,
      status,
    };
  });

  // 5. Project Coverage List
  const projectCoverage: ProjectHealthStatus[] = projects.map((proj) => {
    const projUploads = uploads.filter((u) => u.projectId === proj.id);
    const projUploadIds = new Set(projUploads.map((u) => u.id));

    const projKeywords = keywords.filter((k) => projUploadIds.has(k.uploadId));
    const projBacklinks = backlinks.filter((b) => projUploadIds.has(b.uploadId));
    const projCompetitorPages = competitorPages.filter((cp) => projUploadIds.has(cp.uploadId));

    let projLastUpload: string | null = null;
    if (projUploads.length > 0) {
      const dates = projUploads.map((u) => new Date(u.uploadedAt).getTime()).filter((t) => !isNaN(t));
      if (dates.length > 0) {
        projLastUpload = new Date(Math.max(...dates)).toISOString();
      }
    }

    const gaps: string[] = [];
    if (projUploads.length === 0) gaps.push('No Uploads Assigned');
    if (projKeywords.length === 0) gaps.push('Missing Keywords');
    if (projBacklinks.length === 0) gaps.push('Missing Backlinks');
    if (projCompetitorPages.length === 0) gaps.push('Missing Competitor Pages');

    return {
      id: proj.id,
      name: proj.name,
      domain: proj.domain,
      uploadCount: projUploads.length,
      keywordCount: projKeywords.length,
      backlinkCount: projBacklinks.length,
      competitorPageCount: projCompetitorPages.length,
      lastUploadDate: projLastUpload,
      gaps,
    };
  });

  // 6. Actionable Issues / Recommendations
  const issues: HealthIssue[] = [];

  // Critical issues
  if (uploads.length === 0) {
    issues.push({
      id: 'no-uploads-global',
      title: 'Database is Empty',
      description: 'There are no uploads in the database. Head to the Upload CSVs page to upload reports.',
      severity: 'critical',
      category: 'volume',
    });
  } else if (selectedProjectId && scopedUploads.length === 0) {
    issues.push({
      id: 'no-uploads-project',
      title: 'Project Has No Data',
      description: 'The selected project has no assigned uploads. Link CSV uploads to this project in the Upload Library.',
      severity: 'critical',
      category: 'assignment',
    });
  }

  // Warning issues
  if (unassignedUploadsCount > 0) {
    issues.push({
      id: 'unassigned-uploads',
      title: `${unassignedUploadsCount} Unassigned Uploads`,
      description: `There are ${unassignedUploadsCount} uploaded reports that are not associated with any project. Assigning them ensures accurate data scoped analysis.`,
      severity: 'warning',
      category: 'assignment',
    });
  }

  if (scopedUploads.length > 0) {
    // Freshness warning
    if (lastUploadDate) {
      const daysAgo = Math.floor((now.getTime() - new Date(lastUploadDate).getTime()) / (1000 * 60 * 60 * 24));
      if (daysAgo > 30) {
        issues.push({
          id: 'stale-data',
          title: 'Stale Research Data',
          description: `The last upload in this scope was ${daysAgo} days ago. Consider updating reports to keep SEO opportunities fresh.`,
          severity: 'warning',
          category: 'freshness',
        });
      }
    }

    // Missing core types
    if (scopedKeywords.length === 0) {
      issues.push({
        id: 'missing-keywords',
        title: 'Missing Keyword Database',
        description: 'No keyword data is present in this scope. Upload keyword lists to begin tracking search volumes.',
        severity: 'warning',
        category: 'coverage',
      });
    }
    if (scopedBacklinks.length === 0) {
      issues.push({
        id: 'missing-backlinks',
        title: 'Missing Backlink Profile',
        description: 'No backlinks data found. Upload backlink export sheets to find referring opportunities.',
        severity: 'warning',
        category: 'coverage',
      });
    }
    if (scopedCompetitorPages.length === 0) {
      issues.push({
        id: 'missing-competitors',
        title: 'Missing Competitor Pages',
        description: 'No competitor page data is present. Upload competitor domain records to audit top SEO URLs.',
        severity: 'warning',
        category: 'coverage',
      });
    }

    // High duplicate rate
    if (duplicateRate > 0.3) {
      issues.push({
        id: 'high-duplicate-rate',
        title: 'High Duplicate Rate',
        description: `${Math.round(duplicateRate * 100)}% of your uploaded rows were duplicates removed during deduplication. Verify your source datasets to avoid redundant uploads.`,
        severity: 'warning',
        category: 'dedupe',
      });
    }
  }

  // Info issues
  if (scopedUploads.length > 0 && uploadsWithDedupeCount < scopedUploads.length) {
    const count = scopedUploads.length - uploadsWithDedupeCount;
    issues.push({
      id: 'pending-dedupe',
      title: 'Pending Deduplication Reports',
      description: `There are ${count} upload(s) in this scope that have not run through deduplication. Run deduplication on the Dedupe Reports page to clean database rows.`,
      severity: 'info',
      category: 'dedupe',
    });
  }

  // Gaps in secondary tables
  if (scopedUploads.length > 0) {
    if (scopedKeywordGaps.length === 0) {
      issues.push({
        id: 'missing-gaps',
        title: 'No Keyword Gap Reports',
        description: 'You have not uploaded any Keyword Gap analysis. Gaps identify keywords that competitors rank for but you do not.',
        severity: 'info',
        category: 'coverage',
      });
    }
    if (scopedReferringDomains.length === 0) {
      issues.push({
        id: 'missing-ref-domains',
        title: 'No Referring Domains Data',
        description: 'Referring domain counts provide high-level authority analysis. Consider importing referring domain CSVs.',
        severity: 'info',
        category: 'coverage',
      });
    }
  }

  // Project missing uploads warnings (when viewing All Projects)
  if (!selectedProjectId) {
    projects.forEach((p) => {
      const projUploads = uploads.filter((u) => u.projectId === p.id);
      if (projUploads.length === 0) {
        issues.push({
          id: `empty-project-${p.id}`,
          title: `Project "${p.name}" Has No Data`,
          description: `The project for "${p.domain}" has no assigned uploads in the system.`,
          severity: 'info',
          category: 'assignment',
        });
      }
    });
  }

  // Sort issues: critical -> warning -> info
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return {
    overallScore,
    metrics: {
      coverage: coverageScore,
      assignment: assignmentScore,
      dedupe: dedupeScore,
      freshness: freshnessScore,
      volume: volumeScore,
    },
    totalRows,
    duplicatesRemoved,
    reportTypesCount: presentReportTypes.length,
    unassignedUploadsCount,
    lastUploadDate,
    reportCoverage,
    projectCoverage,
    issues,
  };
}
