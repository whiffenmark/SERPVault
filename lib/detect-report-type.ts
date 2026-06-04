import type { ReportType } from './types';

const FILENAME_PATTERNS: Array<[RegExp, ReportType]> = [
  [/keyword.gap|gap.report|kw.gap/i, 'keyword_gap'],
  [/backlink|back.link/i, 'backlink'],
  [/referring.domain|ref.domain|rd./i, 'referring_domain'],
  [/anchor.text|anchors/i, 'anchor_text'],
  [/top.page|competitor.page|pages.report/i, 'competitor_pages'],
  [/organic.position|serp.position|position/i, 'organic_positions'],
  [/keyword/i, 'keyword'],
];

const COLUMN_PATTERNS: Array<[string[], ReportType]> = [
  [['source url', 'target url', 'anchor text'], 'backlink'],
  [['referring domain', 'target domain'], 'referring_domain'],
  [['anchor text', 'backlinks', 'referring domains'], 'anchor_text'],
  [['your position', 'competitor position'], 'keyword_gap'],
  [['page', 'traffic share', 'keywords'], 'competitor_pages'],
  [['url', 'position', 'keyword'], 'organic_positions'],
  [['keyword', 'search volume', 'keyword difficulty'], 'keyword'],
  [['keyword', 'volume', 'difficulty'], 'keyword'],
  [['keyword', 'cpc'], 'keyword'],
];

export function detectReportType(filename: string, headers: string[]): ReportType {
  const lowerFilename = filename.toLowerCase();
  for (const [pattern, type] of FILENAME_PATTERNS) {
    if (pattern.test(lowerFilename)) return type;
  }

  const lowerHeaders = headers.map((h) => h.toLowerCase().trim());
  for (const [required, type] of COLUMN_PATTERNS) {
    if (required.every((col) => lowerHeaders.some((h) => h.includes(col)))) {
      return type;
    }
  }

  return 'unknown';
}
