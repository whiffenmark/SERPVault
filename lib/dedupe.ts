import type { ReportType, DedupeReport } from './types';
import { nanoid } from './nanoid';

interface DedupeResult {
  cleaned: Record<string, string>[];
  report: Omit<DedupeReport, 'uploadId' | 'filename'>;
}

function getKey(row: Record<string, string>, cols: string[]): string {
  return cols.map((c) => {
    const val = Object.entries(row).find(([k]) => k.toLowerCase().includes(c.toLowerCase()));
    return val ? val[1].toLowerCase().trim() : '';
  }).join('|||');
}

function findCol(row: Record<string, string>, candidates: string[]): string {
  const keys = Object.keys(row);
  for (const cand of candidates) {
    const found = keys.find((k) => k.toLowerCase().includes(cand.toLowerCase()));
    if (found) return found;
  }
  return '';
}

export function dedupeRows(
  rows: Record<string, string>[],
  reportType: ReportType,
  uploadId: string,
  filename: string
): DedupeResult {
  if (rows.length === 0) {
    return {
      cleaned: [],
      report: {
        id: nanoid(),
        reportType,
        createdAt: new Date().toISOString(),
        totalRows: 0,
        duplicatesRemoved: 0,
        cleanedRows: 0,
        dedupeKey: 'none',
        issues: ['No rows found'],
        duplicateExamples: [],
      },
    };
  }

  const sampleRow = rows[0];
  const issues: string[] = [];
  const duplicateExamples: Record<string, string>[] = [];
  let dedupeKeyCols: string[] = [];

  if (reportType === 'keyword' || reportType === 'organic_positions') {
    const kwCol = findCol(sampleRow, ['keyword']);
    const dbCol = findCol(sampleRow, ['database', 'country', 'location']);
    const intentCol = findCol(sampleRow, ['intent', 'search intent']);
    if (!kwCol) {
      issues.push('Missing "keyword" column — skipping strict dedupe, using all columns as key');
      dedupeKeyCols = Object.keys(sampleRow);
    } else {
      dedupeKeyCols = [kwCol, dbCol, intentCol].filter(Boolean);
    }
  } else if (reportType === 'keyword_gap') {
    const kwCol = findCol(sampleRow, ['keyword']);
    const compCol = findCol(sampleRow, ['competitor', 'domain']);
    const yourCol = findCol(sampleRow, ['your domain', 'you']);
    if (!kwCol) {
      issues.push('Missing "keyword" column — skipping strict dedupe');
      dedupeKeyCols = Object.keys(sampleRow);
    } else {
      dedupeKeyCols = [kwCol, compCol, yourCol].filter(Boolean);
    }
  } else if (reportType === 'competitor_pages') {
    const domainCol = findCol(sampleRow, ['domain']);
    const urlCol = findCol(sampleRow, ['url', 'page', 'landing']);
    if (!urlCol) {
      issues.push('Missing URL column — skipping strict dedupe');
      dedupeKeyCols = Object.keys(sampleRow);
    } else {
      dedupeKeyCols = [domainCol, urlCol].filter(Boolean);
    }
  } else if (reportType === 'backlink') {
    const srcCol = findCol(sampleRow, ['source url', 'source', 'from url', 'from']);
    const tgtCol = findCol(sampleRow, ['target url', 'target', 'to url', 'to']);
    const anchorCol = findCol(sampleRow, ['anchor', 'anchor text']);
    if (!srcCol || !tgtCol) {
      issues.push('Missing source/target URL columns — skipping strict dedupe');
      dedupeKeyCols = Object.keys(sampleRow);
    } else {
      dedupeKeyCols = [srcCol, tgtCol, anchorCol].filter(Boolean);
    }
  } else if (reportType === 'referring_domain') {
    const refCol = findCol(sampleRow, ['referring domain', 'domain', 'referring']);
    const tgtCol = findCol(sampleRow, ['target', 'to domain', 'your domain']);
    if (!refCol) {
      issues.push('Missing referring domain column — skipping strict dedupe');
      dedupeKeyCols = Object.keys(sampleRow);
    } else {
      dedupeKeyCols = [refCol, tgtCol].filter(Boolean);
    }
  } else if (reportType === 'anchor_text') {
    const anchorCol = findCol(sampleRow, ['anchor text', 'anchor']);
    if (!anchorCol) {
      issues.push('Missing anchor text column — skipping strict dedupe');
      dedupeKeyCols = Object.keys(sampleRow);
    } else {
      dedupeKeyCols = [anchorCol];
    }
  } else {
    issues.push(`Unknown report type "${reportType}" — using all columns as dedupe key`);
    dedupeKeyCols = Object.keys(sampleRow);
  }

  const seen = new Map<string, Record<string, string>>();
  const cleaned: Record<string, string>[] = [];
  let duplicatesRemoved = 0;

  for (const row of rows) {
    const key = dedupeKeyCols.map((col) => (row[col] ?? '').toLowerCase().trim()).join('|||');
    if (seen.has(key)) {
      duplicatesRemoved++;
      if (duplicateExamples.length < 5) duplicateExamples.push(row);
    } else {
      seen.set(key, row);
      cleaned.push(row);
    }
  }

  return {
    cleaned,
    report: {
      id: nanoid(),
      reportType,
      createdAt: new Date().toISOString(),
      totalRows: rows.length,
      duplicatesRemoved,
      cleanedRows: cleaned.length,
      dedupeKey: dedupeKeyCols.join(' + '),
      issues,
      duplicateExamples,
    },
  };
}
