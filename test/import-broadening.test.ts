import { test, describe } from 'node:test';
import assert from 'node:assert';

import { detectReportType } from '../lib/detect-report-type';
import { dedupeRows } from '../lib/dedupe';
import {
  mapKeyword,
  mapKeywordGap,
  mapCompetitorPage,
  mapBacklink,
  mapReferringDomain,
  mapAnchorText
} from '../lib/map-rows';

describe('Broadened Import & Deduplication Unit Tests', () => {

  describe('SEMrush Backlink Export', () => {
    const headers = ['Source URL', 'Target URL', 'Anchor', 'Authority Score', 'Link Type', 'First Seen', 'Last Seen'];
    const row = {
      'Source URL': 'https://example-source.com/blog/seo-tips',
      'Target URL': 'https://serpvault.io/features',
      'Anchor': 'best SEO dashboard',
      'Authority Score': '48',
      'Link Type': 'dofollow',
      'First Seen': '2025-01-10',
      'Last Seen': '2026-06-30'
    };

    test('detects report type as backlink', () => {
      const type = detectReportType('export.csv', headers);
      assert.strictEqual(type, 'backlink');
    });

    test('maps fields correctly', () => {
      const mapped = mapBacklink(row, 'upload-semrush-backlink');
      assert.strictEqual(mapped.sourceUrl, 'https://example-source.com/blog/seo-tips');
      assert.strictEqual(mapped.targetUrl, 'https://serpvault.io/features');
      assert.strictEqual(mapped.anchorText, 'best SEO dashboard');
      assert.strictEqual(mapped.domainAuthority, 48);
      assert.strictEqual(mapped.doFollow, true);
    });

    test('deduplicates rows based on source + target + anchor', () => {
      const rows = [
        { 'Source URL': 'https://src.com', 'Target URL': 'https://tgt.com', 'Anchor': 'click here' },
        { 'Source URL': 'https://src.com', 'Target URL': 'https://tgt.com', 'Anchor': 'click here' }, // Duplicate
        { 'Source URL': 'https://src.com', 'Target URL': 'https://tgt.com', 'Anchor': 'different' },  // Unique anchor
        { 'Source URL': 'https://other.com', 'Target URL': 'https://tgt.com', 'Anchor': 'click here' } // Unique source
      ];

      const res = dedupeRows(rows, 'backlink', 'upload-backlink-dedupe', 'backlinks.csv');
      assert.strictEqual(res.cleaned.length, 3);
      assert.strictEqual(res.report.duplicatesRemoved, 1);
      assert.strictEqual(res.report.dedupeKey, 'Source URL + Target URL + Anchor');
    });
  });

  describe('Ahrefs Backlink Export', () => {
    const headers = ['Referring Page Title', 'Referring Page URL', 'Link URL', 'Anchor', 'Type', 'First Seen', 'DR'];
    const row = {
      'Referring Page Title': 'Ahrefs Review',
      'Referring Page URL': 'https://ahrefs-blog.com/review',
      'Link URL': 'https://serpvault.io',
      'Anchor': 'SERPVault tool',
      'Type': 'dofollow',
      'First Seen': '2024-05-12',
      'DR': '72'
    };

    test('detects report type as backlink', () => {
      const type = detectReportType('export.csv', headers);
      assert.strictEqual(type, 'backlink');
    });

    test('maps fields correctly', () => {
      const mapped = mapBacklink(row, 'upload-ahrefs-backlink');
      assert.strictEqual(mapped.sourceUrl, 'https://ahrefs-blog.com/review');
      assert.strictEqual(mapped.targetUrl, 'https://serpvault.io');
      assert.strictEqual(mapped.anchorText, 'SERPVault tool');
      assert.strictEqual(mapped.domainRating, 72);
      assert.strictEqual(mapped.doFollow, true);
    });
  });

  describe('Moz Backlink Export', () => {
    const headers = ['Source URL', 'Target URL', 'Anchor Text', 'Domain Authority'];
    const row = {
      'Source URL': 'https://moz-friendly.org/links',
      'Target URL': 'https://serpvault.io/pricing',
      'Anchor Text': 'competitive pricing',
      'Domain Authority': '65'
    };

    test('detects report type as backlink', () => {
      const type = detectReportType('export.csv', headers);
      assert.strictEqual(type, 'backlink');
    });

    test('maps fields correctly', () => {
      const mapped = mapBacklink(row, 'upload-moz-backlink');
      assert.strictEqual(mapped.sourceUrl, 'https://moz-friendly.org/links');
      assert.strictEqual(mapped.targetUrl, 'https://serpvault.io/pricing');
      assert.strictEqual(mapped.anchorText, 'competitive pricing');
      assert.strictEqual(mapped.domainAuthority, 65);
    });
  });

  describe('SEMrush Referring Domains Export', () => {
    const headers = ['Referring Domain', 'Authority Score', 'Backlinks (total)', 'First Seen', 'Last Seen'];
    const row = {
      'Referring Domain': 'external-site.com',
      'Authority Score': '35',
      'Backlinks (total)': '120',
      'First Seen': '2024-01-01',
      'Last Seen': '2026-06-01'
    };

    test('detects report type as referring_domain', () => {
      const type = detectReportType('export.csv', headers);
      assert.strictEqual(type, 'referring_domain');
    });

    test('maps fields correctly', () => {
      const mapped = mapReferringDomain(row, 'upload-semrush-refdomain');
      assert.strictEqual(mapped.referringDomain, 'external-site.com');
      assert.strictEqual(mapped.domainAuthority, 35);
      assert.strictEqual(mapped.backlinks, 120);
    });
  });

  describe('Ahrefs Referring Domains Export', () => {
    const headers = ['Referring Domain', 'DR', 'No. of Backlinks'];
    const row = {
      'Referring Domain': 'ahrefs-linked.org',
      'DR': '81',
      'No. of Backlinks': '2500'
    };

    test('detects report type as referring_domain', () => {
      const type = detectReportType('export.csv', headers);
      assert.strictEqual(type, 'referring_domain');
    });

    test('maps fields correctly', () => {
      const mapped = mapReferringDomain(row, 'upload-ahrefs-refdomain');
      assert.strictEqual(mapped.referringDomain, 'ahrefs-linked.org');
      assert.strictEqual(mapped.domainRating, 81);
      assert.strictEqual(mapped.backlinks, 2500);
    });
  });

  describe('SEMrush Competitor Pages Export', () => {
    const headers = ['URL', 'Traffic', 'Traffic %', 'Keywords', 'Top Keyword'];
    const row = {
      'URL': 'https://competitor.com/best-plumber',
      'Traffic': '4.2K',
      'Traffic %': '15.5',
      'Keywords': '42',
      'Top Keyword': 'best plumber local'
    };

    test('detects report type as competitor_pages', () => {
      const type = detectReportType('export.csv', headers);
      assert.strictEqual(type, 'competitor_pages');
    });

    test('maps fields correctly', () => {
      const mapped = mapCompetitorPage(row, 'upload-semrush-pages');
      assert.strictEqual(mapped.url, 'https://competitor.com/best-plumber');
      assert.strictEqual(mapped.domain, 'competitor.com');
      assert.strictEqual(mapped.traffic, 4200);
      assert.strictEqual(mapped.trafficShare, 15.5);
      assert.strictEqual(mapped.keywords, 42);
    });

    test('deduplicates rows based on URL and optional Domain', () => {
      const rows = [
        { 'URL': 'https://comp.com/page1', 'Domain': 'comp.com' },
        { 'URL': 'https://comp.com/page1', 'Domain': 'comp.com' }, // Duplicate
        { 'URL': 'https://comp.com/page2', 'Domain': 'comp.com' }  // Unique
      ];

      const res = dedupeRows(rows, 'competitor_pages', 'upload-pages-dedupe', 'pages.csv');
      assert.strictEqual(res.cleaned.length, 2);
      assert.strictEqual(res.report.duplicatesRemoved, 1);
    });
  });

  describe('Ahrefs Competitor Pages Export', () => {
    const headers = ['Page', 'Traffic', 'Keywords', 'Top Keyword'];
    const row = {
      'Page': 'https://other-competitor.com/service-page',
      'Traffic': '950',
      'Keywords': '18',
      'Top Keyword': 'cheap services'
    };

    test('detects report type as competitor_pages', () => {
      const type = detectReportType('export.csv', headers);
      assert.strictEqual(type, 'competitor_pages');
    });

    test('maps fields correctly', () => {
      const mapped = mapCompetitorPage(row, 'upload-ahrefs-pages');
      assert.strictEqual(mapped.url, 'https://other-competitor.com/service-page');
      assert.strictEqual(mapped.domain, 'other-competitor.com');
      assert.strictEqual(mapped.traffic, 950);
      assert.strictEqual(mapped.keywords, 18);
    });
  });

  describe('SEMrush Keyword Gap Export', () => {
    const headers = ['Keyword', 'Search Volume', 'KD', 'Intent', 'Your Position', 'Competitor Position', 'Gap'];
    const row = {
      'Keyword': 'emergency plumbing near me',
      'Search Volume': '1.2K',
      'KD': '62',
      'Intent': 'transactional',
      'Your Position': '15',
      'Competitor Position': '2',
      'Gap': 'weak'
    };

    test('detects report type as keyword_gap', () => {
      const type = detectReportType('export.csv', headers);
      assert.strictEqual(type, 'keyword_gap');
    });

    test('maps fields correctly', () => {
      const mapped = mapKeywordGap(row, 'upload-semrush-gap');
      assert.strictEqual(mapped.keyword, 'emergency plumbing near me');
      assert.strictEqual(mapped.volume, 1200);
      assert.strictEqual(mapped.difficulty, 62);
      assert.strictEqual(mapped.intent, 'transactional');
      assert.strictEqual(mapped.yourPosition, 15);
      assert.strictEqual(mapped.competitorPosition, 2);
    });
  });

  describe('SEMrush/Ahrefs Anchor Text Export', () => {
    const headers = ['Anchor Text', 'Backlinks', 'Referring Domains'];
    const row = {
      'Anchor Text': 'emergency plumber service',
      'Backlinks': '88',
      'Referring Domains': '14'
    };

    test('detects report type as anchor_text', () => {
      const type = detectReportType('export.csv', headers);
      assert.strictEqual(type, 'anchor_text');
    });

    test('maps fields correctly', () => {
      const mapped = mapAnchorText(row, 'upload-semrush-anchors');
      assert.strictEqual(mapped.anchorText, 'emergency plumber service');
      assert.strictEqual(mapped.backlinks, 88);
      assert.strictEqual(mapped.referringDomains, 14);
    });
  });

  describe('Hermes Keyword Report', () => {
    const headers = ['Keyword', 'Search Volume', 'Cluster', 'Page Target'];
    const row = {
      'Keyword': 'plumbing basics tips',
      'Search Volume': '320',
      'Cluster': 'educational plumbing',
      'Page Target': 'https://serpvault.io/blog/plumbing-basics'
    };

    test('detects report type as keyword', () => {
      const type = detectReportType('export.csv', headers);
      assert.strictEqual(type, 'keyword');
    });

    test('maps fields correctly and preserves custom fields in raw', () => {
      const mapped = mapKeyword(row, 'upload-hermes-keyword');
      assert.strictEqual(mapped.keyword, 'plumbing basics tips');
      assert.strictEqual(mapped.volume, 320);
      assert.strictEqual(mapped.raw['Cluster'], 'educational plumbing');
      assert.strictEqual(mapped.raw['Page Target'], 'https://serpvault.io/blog/plumbing-basics');
    });
  });

});
