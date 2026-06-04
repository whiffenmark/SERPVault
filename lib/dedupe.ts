import type { ReportType, DedupeReport } from './types';
import { nanoid } from './nanoid';

interface DedupeResult {
  cleaned: Record<string, string>[];
  report: Omit<DedupeReport, 'uploadId' | 'filename'>;
}

/**
 * Find the first actual column key in a row that matches any candidate alias.
 * Matching is case-insensitive and uses substring includes.
 */
function findCol(row: Record<string, string>, ...aliases: string[]): string {
  const keys = Object.keys(row);
  const normKeys = keys.map((k) => k.toLowerCase().trim());
  for (const alias of aliases) {
    const a = alias.toLowerCase().trim();
    const idx = normKeys.findIndex((k) => k === a || k.includes(a));
    if (idx !== -1) return keys[idx];
  }
  return '';
}

/** Find all columns matching any alias (returns unique key names). */
function findAllCols(row: Record<string, string>, ...aliases: string[]): string[] {
  const keys = Object.keys(row);
  const normKeys = keys.map((k) => k.toLowerCase().trim());
  const found: string[] = [];
  for (const alias of aliases) {
    const a = alias.toLowerCase().trim();
    const idx = normKeys.findIndex((k) => k === a || k.includes(a));
    if (idx !== -1 && !found.includes(keys[idx])) found.push(keys[idx]);
  }
  return found;
}

function buildKey(row: Record<string, string>, cols: string[]): string {
  return cols.map((c) => (row[c] ?? '').toLowerCase().trim()).join('|||');
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

  const sample = rows[0];
  const issues: string[] = [];
  let keyCols: string[] = [];

  // -------------------------------------------------------------------------
  // Determine dedupe key columns per report type
  // -------------------------------------------------------------------------

  if (reportType === 'keyword') {
    const kwCol = findCol(
      sample,
      'keyword',
      'search term',
      'query',
      'keywords'
    );
    if (!kwCol) {
      issues.push('No keyword column found — using all columns as dedupe key');
      keyCols = Object.keys(sample);
    } else {
      // Primary: keyword. Optional: database / country + intent
      const dbCol = findCol(sample, 'database', 'country', 'location', 'market');
      const intentCol = findCol(sample, 'search intent', 'intent');
      keyCols = [kwCol, dbCol, intentCol].filter(Boolean);
    }

  } else if (reportType === 'organic_positions') {
    const kwCol = findCol(sample, 'keyword', 'search term', 'query');
    if (!kwCol) {
      issues.push('No keyword column found — using all columns as dedupe key');
      keyCols = Object.keys(sample);
    } else {
      const urlCol = findCol(
        sample,
        'url',
        'landing page',
        'page url',
        'landing url',
        'page'
      );
      const posCol = findCol(sample, 'position', 'rank', 'ranking');
      keyCols = [kwCol, urlCol, posCol].filter(Boolean);
    }

  } else if (reportType === 'keyword_gap') {
    const kwCol = findCol(sample, 'keyword', 'search term', 'query');
    if (!kwCol) {
      issues.push('No keyword column found — using all columns as dedupe key');
      keyCols = Object.keys(sample);
    } else {
      const compCol = findCol(
        sample,
        'competitor',
        'comp.',
        'competitor domain',
        'domain'
      );
      const yourCol = findCol(
        sample,
        'your domain',
        'your website',
        'you',
        'your position'
      );
      keyCols = [kwCol, compCol, yourCol].filter(Boolean);
    }

  } else if (reportType === 'competitor_pages') {
    const urlCol = findCol(
      sample,
      'url',
      'page url',
      'landing page',
      'landing url',
      'page',
      'top pages'
    );
    if (!urlCol) {
      issues.push('No URL column found — using all columns as dedupe key');
      keyCols = Object.keys(sample);
    } else {
      const domainCol = findCol(sample, 'domain', 'root domain', 'subdomain');
      // Use domain + url if domain col exists, otherwise url alone
      keyCols = domainCol ? [domainCol, urlCol] : [urlCol];
    }

  } else if (reportType === 'backlink') {
    const srcCol = findCol(
      sample,
      'source url',
      'from url',
      'referring url',
      'referring page',
      'source page',
      'source',
      'from',
      'backlink url'
    );
    const tgtCol = findCol(
      sample,
      'target url',
      'to url',
      'destination url',
      'target page',
      'target',
      'to'
    );
    if (!srcCol || !tgtCol) {
      issues.push(
        `Missing ${!srcCol ? 'source URL' : 'target URL'} column — using all columns as dedupe key`
      );
      keyCols = Object.keys(sample);
    } else {
      const anchorCol = findCol(
        sample,
        'anchor text',
        'anchor and target',
        'anchor'
      );
      keyCols = [srcCol, tgtCol, anchorCol].filter(Boolean);
    }

  } else if (reportType === 'referring_domain') {
    const refCol = findCol(
      sample,
      'referring domain',
      'source domain',
      'ref domain',
      'root domain',
      'domain'
    );
    if (!refCol) {
      issues.push('No referring domain column found — using all columns as dedupe key');
      keyCols = Object.keys(sample);
    } else {
      const tgtCol = findCol(
        sample,
        'target domain',
        'destination domain',
        'to domain',
        'your domain'
      );
      keyCols = [refCol, tgtCol].filter(Boolean);
    }

  } else if (reportType === 'anchor_text') {
    const anchorCol = findCol(
      sample,
      'anchor text',
      'anchor and target',
      'anchor'
    );
    if (!anchorCol) {
      issues.push('No anchor text column found — using all columns as dedupe key');
      keyCols = Object.keys(sample);
    } else {
      // Pair with referring domain or source domain count column to be specific
      const refDomainsCol = findCol(
        sample,
        'referring domains',
        'ref domains',
        'source domains'
      );
      const srcDomainCol = findCol(
        sample,
        'source domain',
        'referring domain'
      );
      const extra = refDomainsCol || srcDomainCol;
      keyCols = extra ? [anchorCol, extra] : [anchorCol];
    }

  } else {
    // unknown — use all columns but log it
    issues.push(`Unknown report type — using all ${Object.keys(sample).length} columns as dedupe key`);
    keyCols = Object.keys(sample);
  }

  // -------------------------------------------------------------------------
  // Deduplicate
  // -------------------------------------------------------------------------

  const seen = new Set<string>();
  const cleaned: Record<string, string>[] = [];
  const duplicateExamples: Record<string, string>[] = [];
  let duplicatesRemoved = 0;

  for (const row of rows) {
    const key = buildKey(row, keyCols);
    if (seen.has(key)) {
      duplicatesRemoved++;
      if (duplicateExamples.length < 5) duplicateExamples.push(row);
    } else {
      seen.add(key);
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
      dedupeKey: keyCols.join(' + '),
      issues,
      duplicateExamples,
    },
  };
}
