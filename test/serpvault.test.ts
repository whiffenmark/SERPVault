// Mock window and localStorage globally BEFORE importing lib/storage
class MockLocalStorage {
  private store: Record<string, string> = {};
  getItem(key: string) { return this.store[key] || null; }
  setItem(key: string, value: string) { this.store[key] = value; }
  removeItem(key: string) { delete this.store[key]; }
  clear() { this.store = {}; }
}

class MockCustomEvent {
  constructor(public type: string, public init?: unknown) {}
}

const mockLocalStorage = new MockLocalStorage();
const globalContext = globalThis as unknown as Omit<typeof globalThis, 'window' | 'localStorage' | 'CustomEvent'> & {
  window: unknown;
  localStorage: MockLocalStorage;
  CustomEvent: typeof MockCustomEvent;
};

globalContext.window = {
  dispatchEvent: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
};
globalContext.localStorage = mockLocalStorage;
globalContext.CustomEvent = MockCustomEvent;

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';

// Import the modules to test
import { detectReportType } from '../lib/detect-report-type';
import { dedupeRows } from '../lib/dedupe';
import { mapKeyword, parseFormattedNum } from '../lib/map-rows';
import { getRowSiteScope, rowMatchesSiteSelection, filterRowsBySite, getStore, saveStore } from '../lib/storage';
import type { AppStore } from '../lib/types';

describe('SERPVault Automated Test Suite', () => {

  describe('Report Type Detection', () => {
    test('detects report type by filename rules', () => {
      // Test filename pattern matching (case-insensitive)
      assert.strictEqual(detectReportType('my_backlink_report.csv', []), 'backlink');
      assert.strictEqual(detectReportType('competitor-pages-export.xlsx', []), 'competitor_pages');
      assert.strictEqual(detectReportType('KW-gap-analysis.csv', []), 'keyword_gap');
      assert.strictEqual(detectReportType('keyword_overview_march.csv', []), 'keyword');
      assert.strictEqual(detectReportType('some-positions-ranking.csv', []), 'organic_positions');
      assert.strictEqual(detectReportType('referring-domains.csv', []), 'referring_domain');
      assert.strictEqual(detectReportType('anchors-export.csv', []), 'anchor_text');
    });

    test('detects report type by column scoring (neutral filename)', () => {
      const neutralFile = 'export.csv';

      // Backlink column scoring
      const backlinkHeaders = ['source url', 'target url', 'anchor text', 'domain rating'];
      assert.strictEqual(detectReportType(neutralFile, backlinkHeaders), 'backlink');

      // Keyword column scoring
      const keywordHeaders = ['keyword', 'search volume', 'kd', 'cpc', 'intent'];
      assert.strictEqual(detectReportType(neutralFile, keywordHeaders), 'keyword');

      // Competitor Pages column scoring
      const competitorPageHeaders = ['url', 'traffic', 'no. of keywords', 'top keyword'];
      assert.strictEqual(detectReportType(neutralFile, competitorPageHeaders), 'competitor_pages');

      // Keyword Gap column scoring
      const keywordGapHeaders = ['keyword', 'competitor position', 'your position', 'gap'];
      assert.strictEqual(detectReportType(neutralFile, keywordGapHeaders), 'keyword_gap');
    });
  });

  describe('Keyword Deduplication', () => {
    test('removes duplicate rows and reports statistics correctly', () => {
      const rows = [
        { keyword: 'emergency plumber denver', database: 'us', intent: 'commercial' },
        { keyword: 'Emergency Plumber Denver ', database: 'US', intent: 'Commercial' }, // Duplicate (whitespace/case normalized)
        { keyword: 'water heater repair denver', database: 'us', intent: 'commercial' }, // Unique
        { keyword: 'emergency plumber denver', database: 'uk', intent: 'commercial' }, // Unique because of database
      ];

      const result = dedupeRows(rows, 'keyword', 'upload-123', 'keywords.csv');

      assert.strictEqual(result.cleaned.length, 3);
      assert.strictEqual(result.report.totalRows, 4);
      assert.strictEqual(result.report.duplicatesRemoved, 1);
      assert.strictEqual(result.report.cleanedRows, 3);
      assert.strictEqual(result.report.dedupeKey, 'keyword + database + intent');
      assert.deepStrictEqual(result.cleaned[0], rows[0]);
      assert.deepStrictEqual(result.cleaned[1], rows[2]);
      assert.deepStrictEqual(result.cleaned[2], rows[3]);
    });
  });

  describe('Keyword Row Mapping', () => {
    test('maps common keyword fields and preserves raw row data', () => {
      const rawRow = {
        'Search Term': 'emergency plumber denver',
        'Avg Monthly Searches': '1.9K',
        'KD %': '42',
        'CPC': '18.50',
        'Search Intent': 'Commercial',
        'Country': 'us',
        'Position': '3',
        'Landing Page': 'https://bluepipeplumbing.com/emergency-plumber-denver',
        'custom_tag': 'some-tag',
      };

      const mapped = mapKeyword(rawRow, 'upload-123');

      assert.strictEqual(mapped.uploadId, 'upload-123');
      assert.strictEqual(mapped.keyword, 'emergency plumber denver');
      assert.strictEqual(mapped.volume, 1900);
      assert.strictEqual(mapped.difficulty, 42);
      assert.strictEqual(mapped.cpc, 18.50);
      assert.strictEqual(mapped.intent, 'Commercial');
      assert.strictEqual(mapped.position, 3);
      assert.strictEqual(mapped.url, 'https://bluepipeplumbing.com/emergency-plumber-denver');
      assert.deepStrictEqual(mapped.raw, rawRow); // Verifies raw data preservation
    });

    test('parseFormattedNum parses values with suffixes and formatting', () => {
      assert.strictEqual(parseFormattedNum('8.5K'), 8500);
      assert.strictEqual(parseFormattedNum('1.2M'), 1200000);
      assert.strictEqual(parseFormattedNum('90.5K'), 90500);
      assert.strictEqual(parseFormattedNum('330'), 330);
      assert.strictEqual(parseFormattedNum('1,500'), 1500);
      assert.strictEqual(parseFormattedNum('-'), undefined);
      assert.strictEqual(parseFormattedNum('N/A'), undefined);
    });
  });

  describe('Project/Site Scoping', () => {
    beforeEach(() => {
      mockLocalStorage.clear();
    });

    test('detects project domain via explicit project domain fields only', () => {
      const projectRow1 = { raw: { 'project_domain': 'bluepipeplumbing.com', 'location': 'Denver CO', 'niche': 'Plumbing' } };
      const projectRow2 = { raw: { 'yourDomain': 'cactuslegalhelp.com', 'location': 'Phoenix AZ' } };
      const nonProjectRow1 = { raw: { 'competitor': 'competitor.com', 'location': 'Miami FL' } };
      const nonProjectRow2 = { raw: { 'domain': 'generic.com', 'niche': 'Roofing' } };
      const nonProjectRow3 = { raw: { 'url': 'https://competitor.com/blog' } };

      const scope1 = getRowSiteScope(projectRow1);
      const scope2 = getRowSiteScope(projectRow2);
      const scope3 = getRowSiteScope(nonProjectRow1);
      const scope4 = getRowSiteScope(nonProjectRow2);
      const scope5 = getRowSiteScope(nonProjectRow3);

      assert.strictEqual(scope1.domain, 'bluepipeplumbing.com');
      assert.strictEqual(scope1.location, 'Denver CO');
      assert.strictEqual(scope1.niche, 'Plumbing');

      assert.strictEqual(scope2.domain, 'cactuslegalhelp.com');
      assert.strictEqual(scope2.location, 'Phoenix AZ');
      assert.strictEqual(scope2.niche, '-'); // default normalize fallback

      // Competitor/generic domains must not become project domains
      assert.strictEqual(scope3.domain, '-');
      assert.strictEqual(scope3.location, '-'); // location ignored if no project domain
      assert.strictEqual(scope4.domain, '-');
      assert.strictEqual(scope5.domain, '-');
    });

    test('matches site selection correctly', () => {
      const site = { domain: 'bluepipeplumbing.com', location: 'Denver CO', niche: 'Plumbing' };

      const matchingRow = { raw: { 'project_domain': 'bluepipeplumbing.com', 'location': 'Denver CO', 'niche': 'Plumbing' } };
      const mismatchDomainRow = { raw: { 'project_domain': 'cactuslegalhelp.com', 'location': 'Denver CO', 'niche': 'Plumbing' } };
      const mismatchLocRow = { raw: { 'project_domain': 'bluepipeplumbing.com', 'location': 'Phoenix AZ', 'niche': 'Plumbing' } };
      const nonProjectRow = { raw: { 'domain': 'bluepipeplumbing.com' } }; // 'domain' is not an explicit project key

      assert.ok(rowMatchesSiteSelection(matchingRow, site));
      assert.ok(!rowMatchesSiteSelection(mismatchDomainRow, site));
      assert.ok(!rowMatchesSiteSelection(mismatchLocRow, site));
      assert.ok(!rowMatchesSiteSelection(nonProjectRow, site));
    });

    test('filters rows by explicit project domain metadata when upload has no project', () => {
      // Mock the app store state with uploads but no project assignment
      const store: AppStore = {
        uploads: [
          { id: 'upload-no-proj', filename: 'research.csv', reportType: 'keyword', uploadedAt: '', rowCount: 10, cleanedRowCount: 10, dedupeReportId: '' }
        ],
        keywords: [],
        keywordGaps: [],
        competitorPages: [],
        backlinks: [],
        referringDomains: [],
        anchorTexts: [],
        dedupeReports: [],
        projects: [
          { id: 'proj-1', name: 'BluePipe', domain: 'bluepipeplumbing.com', location: 'Denver CO', niche: 'Plumbing', createdAt: '' }
        ],
        competitors: []
      };
      saveStore(store);

      const rows: (Parameters<typeof filterRowsBySite>[0][number] & { keyword: string })[] = [
        { uploadId: 'upload-no-proj', raw: { 'project_domain': 'bluepipeplumbing.com', 'location': 'Denver CO', 'niche': 'Plumbing' }, keyword: 'emergency plumber' },
        { uploadId: 'upload-no-proj', raw: { 'project_domain': 'cactuslegalhelp.com', 'location': 'Phoenix AZ', 'niche': 'Legal' }, keyword: ' phoenix lawyer' },
        { uploadId: 'upload-no-proj', raw: { 'competitor': 'competitor.com' }, keyword: 'competitor service' }
      ];

      const site = { domain: 'bluepipeplumbing.com', location: 'Denver CO', niche: 'Plumbing' };

      const filtered = filterRowsBySite(rows, site);
      assert.strictEqual(filtered.length, 1);
      assert.strictEqual(filtered[0].keyword, 'emergency plumber');
    });

    test('filters rows by project ID when upload has project', () => {
      // Set the active project ID in localStorage
      mockLocalStorage.setItem('serpvault_selected_project_id', 'proj-1');

      const store: AppStore = {
        uploads: [
          { id: 'upload-proj-1', filename: 'bluepipe.csv', reportType: 'keyword', uploadedAt: '', rowCount: 10, cleanedRowCount: 10, dedupeReportId: '', projectId: 'proj-1' },
          { id: 'upload-proj-2', filename: 'cactus.csv', reportType: 'keyword', uploadedAt: '', rowCount: 10, cleanedRowCount: 10, dedupeReportId: '', projectId: 'proj-2' }
        ],
        keywords: [],
        keywordGaps: [],
        competitorPages: [],
        backlinks: [],
        referringDomains: [],
        anchorTexts: [],
        dedupeReports: [],
        projects: [
          { id: 'proj-1', name: 'BluePipe', domain: 'bluepipeplumbing.com', location: 'Denver CO', niche: 'Plumbing', createdAt: '' },
          { id: 'proj-2', name: 'Cactus', domain: 'cactuslegalhelp.com', location: 'Phoenix AZ', niche: 'Legal', createdAt: '' }
        ],
        competitors: []
      };
      saveStore(store);

      const rows = [
        { uploadId: 'upload-proj-1', raw: {}, keyword: 'emergency plumber' },
        { uploadId: 'upload-proj-2', raw: {}, keyword: 'phoenix lawyer' }
      ];

      const site = { domain: 'bluepipeplumbing.com', location: 'Denver CO', niche: 'Plumbing' };

      const filtered = filterRowsBySite(rows, site);
      assert.strictEqual(filtered.length, 1);
      assert.strictEqual(filtered[0].keyword, 'emergency plumber');
    });
  });
});
