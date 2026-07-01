import { test, describe } from 'node:test';
import assert from 'node:assert';
import { buildMigrationSummary } from '../lib/migration-summary';
import type { AppStore } from '../lib/types';

describe('Migration Summary Helper Unit Tests', () => {
  const emptyStore: AppStore = {
    uploads: [],
    keywords: [],
    keywordGaps: [],
    competitorPages: [],
    backlinks: [],
    referringDomains: [],
    anchorTexts: [],
    dedupeReports: [],
    projects: [],
    competitors: [],
  };

  test('reports empty database and unsigned user warnings correctly', () => {
    const summary = buildMigrationSummary(emptyStore, true, false);

    assert.strictEqual(summary.totalRows, 0);
    assert.strictEqual(summary.supabaseAvailable, true);
    assert.strictEqual(summary.userSignedIn, false);
    assert.strictEqual(summary.canMigrate, false);
    assert.strictEqual(summary.isSignedInRequiredStatusMet, false);
    assert.ok(summary.warnings.includes('Local database is empty. There is no data to migrate.'));
    assert.ok(summary.warnings.includes('You must be signed in to your Supabase account to migrate data to the cloud.'));
  });

  test('reports supabase not configured correctly', () => {
    const summary = buildMigrationSummary(emptyStore, false, true);

    assert.strictEqual(summary.supabaseAvailable, false);
    assert.strictEqual(summary.userSignedIn, true);
    assert.strictEqual(summary.canMigrate, false);
    assert.strictEqual(summary.isSignedInRequiredStatusMet, true);
    assert.ok(summary.warnings.includes('Supabase is not configured. Cloud sync features are disabled.'));
  });

  test('returns correct per-table counts and total rows', () => {
    const populatedStore: AppStore = {
      ...emptyStore,
      projects: [{ id: 'p1', name: 'Project 1', domain: 'example.com', createdAt: '' }],
      keywords: [
        { id: 'k1', uploadId: 'u1', keyword: 'seo tool', raw: {} },
        { id: 'k2', uploadId: 'u1', keyword: 'backlink checker', raw: {} },
      ],
      uploads: [{ id: 'u1', filename: 'export.csv', reportType: 'keyword', uploadedAt: '', rowCount: 2, cleanedRowCount: 2, dedupeReportId: 'dr1' }],
    };

    const summary = buildMigrationSummary(populatedStore, true, true, 10240);

    assert.strictEqual(summary.totalRows, 4);
    assert.strictEqual(summary.perTableCounts.projects, 1);
    assert.strictEqual(summary.perTableCounts.keywords, 2);
    assert.strictEqual(summary.perTableCounts.uploads, 1);
    assert.strictEqual(summary.perTableCounts.competitors, 0);
    assert.strictEqual(summary.estimatedStorage, '10.0 KB');
    assert.strictEqual(summary.canMigrate, true);
    assert.strictEqual(summary.warnings.length, 0);
  });

  test('estimates storage automatically if bytes not provided', () => {
    const populatedStore: AppStore = {
      ...emptyStore,
      projects: [{ id: 'p1', name: 'Project 1', domain: 'example.com', createdAt: '' }],
    };
    const summary = buildMigrationSummary(populatedStore, true, true);
    assert.match(summary.estimatedStorage, /^[0-9.]+ (KB|MB)$/);
  });
});
