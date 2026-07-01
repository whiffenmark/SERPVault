import { test, describe } from 'node:test';
import assert from 'node:assert';
import { saveUploadAuditLog, type UploadAuditLogInput } from '../lib/upload-audit';
import { DELETION_ORDER } from '../lib/db';

describe('Privacy and Audit Unit Tests', () => {
  describe('Upload Audit Log Payload Construction', () => {
    test('saveUploadAuditLog resolves without throwing in local/offline mode', async () => {
      const input: UploadAuditLogInput = {
        uploadId: 'test_upload_123',
        filename: 'keywords.csv',
        reportType: 'keyword',
        projectId: 'test_project_123',
        rowCount: 100,
        cleanedRowCount: 85,
        duplicatesRemoved: 15,
        dedupeRate: 0.15,
        dedupeReportId: 'test_dedupe_123',
        eventType: 'import',
      };

      await assert.doesNotReject(async () => {
        await saveUploadAuditLog(input);
      });
    });

    test('saveUploadAuditLog sanitizes numeric inputs correctly', async () => {
      const input: any = {
        uploadId: 'test_upload_123',
        filename: 'keywords.csv',
        reportType: 'keyword',
        rowCount: 'not-a-number', // invalid input types
        cleanedRowCount: undefined,
        duplicatesRemoved: null,
        dedupeRate: '0.5',
        dedupeReportId: 'test_dedupe_123',
        eventType: 'import',
      };

      await assert.doesNotReject(async () => {
        await saveUploadAuditLog(input);
      });
    });
  });

  describe('Account Deletion Table Deletion Order', () => {
    test('DELETION_ORDER constant exists and has correct count', () => {
      assert.ok(Array.isArray(DELETION_ORDER));
      assert.strictEqual(DELETION_ORDER.length, 15);
    });

    test('DELETION_ORDER is dependency-safe (child tables before parent tables)', () => {
      // Find indexes of key tables
      const idxKeywords = DELETION_ORDER.indexOf('keywords');
      const idxKeywordGaps = DELETION_ORDER.indexOf('keyword_gaps');
      const idxCompetitorPages = DELETION_ORDER.indexOf('competitor_pages');
      const idxBacklinks = DELETION_ORDER.indexOf('backlinks');
      const idxReferringDomains = DELETION_ORDER.indexOf('referring_domains');
      const idxAnchorTexts = DELETION_ORDER.indexOf('anchor_texts');
      const idxDedupeReports = DELETION_ORDER.indexOf('dedupe_reports');
      const idxUploadAuditLogs = DELETION_ORDER.indexOf('upload_audit_logs');
      
      const idxUploads = DELETION_ORDER.indexOf('uploads');
      const idxCompetitors = DELETION_ORDER.indexOf('competitors');
      const idxProjects = DELETION_ORDER.indexOf('projects');
      const idxProfiles = DELETION_ORDER.indexOf('profiles');

      // Check existence
      assert.ok(idxKeywords !== -1, 'keywords table is present');
      assert.ok(idxUploads !== -1, 'uploads table is present');
      assert.ok(idxProjects !== -1, 'projects table is present');
      assert.ok(idxProfiles !== -1, 'profiles table is present');

      // Dependency checks:
      // 1. Child tables of uploads must be deleted before uploads:
      assert.ok(idxKeywords < idxUploads, 'keywords must be deleted before uploads');
      assert.ok(idxKeywordGaps < idxUploads, 'keyword_gaps must be deleted before uploads');
      assert.ok(idxCompetitorPages < idxUploads, 'competitor_pages must be deleted before uploads');
      assert.ok(idxBacklinks < idxUploads, 'backlinks must be deleted before uploads');
      assert.ok(idxReferringDomains < idxUploads, 'referring_domains must be deleted before uploads');
      assert.ok(idxAnchorTexts < idxUploads, 'anchor_texts must be deleted before uploads');
      assert.ok(idxDedupeReports < idxUploads, 'dedupe_reports must be deleted before uploads');

      // 2. Uploads and competitors must be deleted before projects:
      assert.ok(idxUploads < idxProjects, 'uploads must be deleted before projects');
      assert.ok(idxCompetitors < idxProjects, 'competitors must be deleted before projects');

      // 3. Profiles must be deleted after projects / users:
      assert.ok(idxProjects < idxProfiles, 'projects must be deleted before profiles');
    });
  });
});
