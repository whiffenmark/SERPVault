import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  normalizeDomain,
  detectExplicitProjectDomain,
  resolveImportScope,
} from '../lib/import-scope';
import type { ProjectRecord } from '../lib/types';

describe('Import Scope Helper Unit Tests', () => {
  describe('Domain Normalization', () => {
    test('normalizes various domain formats correctly', () => {
      assert.strictEqual(normalizeDomain('https://www.example.com/path/to/page'), 'example.com');
      assert.strictEqual(normalizeDomain('http://example.com/'), 'example.com');
      assert.strictEqual(normalizeDomain('  EXAMPLE.COM  '), 'example.com');
      assert.strictEqual(normalizeDomain('www.sub.example.com/foo?bar=1'), 'sub.example.com');
      assert.strictEqual(normalizeDomain('example.com:8080'), 'example.com');
      assert.strictEqual(normalizeDomain(''), '');
    });
  });

  describe('Explicit Project Domain Detection', () => {
    test('detects domain using explicit project keys only', () => {
      const explicitRow1 = { raw: { 'project_domain': 'bluepipeplumbing.com' } };
      const explicitRow2 = { raw: { 'yourDomain': 'cactuslegalhelp.com' } };
      const explicitRow3 = { raw: { 'client site': 'testsite.com' } };
      const genericRow1 = { raw: { 'domain': 'competitor.com' } };
      const genericRow2 = { raw: { 'competitor': 'generic.com' } };
      const genericRow3 = { raw: { 'url': 'https://competitor.com/blog' } };

      assert.strictEqual(detectExplicitProjectDomain(explicitRow1), 'bluepipeplumbing.com');
      assert.strictEqual(detectExplicitProjectDomain(explicitRow2), 'cactuslegalhelp.com');
      assert.strictEqual(detectExplicitProjectDomain(explicitRow3), 'testsite.com');
      assert.strictEqual(detectExplicitProjectDomain(genericRow1), undefined);
      assert.strictEqual(detectExplicitProjectDomain(genericRow2), undefined);
      assert.strictEqual(detectExplicitProjectDomain(genericRow3), undefined);
    });
  });

  describe('Import Scope Resolution', () => {
    const mockProjects: ProjectRecord[] = [
      { id: 'proj-1', name: 'BluePipe', domain: 'bluepipeplumbing.com', createdAt: '' },
      { id: 'proj-2', name: 'Cactus Legal', domain: 'cactuslegalhelp.com', createdAt: '' },
    ];

    test('validates a correct selected project ID and returns assignment', () => {
      const rows = [{ raw: { keyword: 'plumber near me' } }];
      const result = resolveImportScope(rows, 'keyword', 'proj-1', mockProjects);

      assert.strictEqual(result.assignmentStatus, 'assigned');
      assert.strictEqual(result.effectiveProjectId, 'proj-1');
      assert.strictEqual(result.warnings.length, 0);
      assert.strictEqual(result.hardError, undefined);
    });

    test('flags stale/invalid project ID, clearing effective assignment for normal imports', () => {
      const rows = [{ raw: { keyword: 'plumber near me' } }];
      const result = resolveImportScope(rows, 'keyword', 'stale-id', mockProjects);

      assert.strictEqual(result.assignmentStatus, 'unassigned');
      assert.strictEqual(result.effectiveProjectId, undefined);
      assert.ok(result.warnings.some(w => w.includes('stale or invalid')));
      assert.strictEqual(result.hardError, undefined);
    });

    test('raises hard error for organic_positions if no valid project is resolved', () => {
      const rows = [{ raw: { keyword: 'lawyer phoenix' } }];
      
      // Case A: selected project is stale/invalid
      const resultA = resolveImportScope(rows, 'organic_positions', 'stale-id', mockProjects);
      assert.strictEqual(resultA.assignmentStatus, 'error');
      assert.strictEqual(resultA.effectiveProjectId, undefined);
      assert.ok(resultA.hardError !== undefined);

      // Case B: no project is selected at all
      const resultB = resolveImportScope(rows, 'organic_positions', null, mockProjects);
      assert.strictEqual(resultB.assignmentStatus, 'error');
      assert.strictEqual(resultB.effectiveProjectId, undefined);
      assert.ok(resultB.hardError !== undefined);

      // Case C: valid project is selected
      const resultC = resolveImportScope(rows, 'organic_positions', 'proj-2', mockProjects);
      assert.strictEqual(resultC.assignmentStatus, 'assigned');
      assert.strictEqual(resultC.effectiveProjectId, 'proj-2');
      assert.strictEqual(resultC.hardError, undefined);
    });

    test('auto-assigns matching project when explicit project_domain is present and no project is selected', () => {
      const rows = [
        { raw: { 'project_domain': 'bluepipeplumbing.com', keyword: 'drain repair' } }
      ];

      const result = resolveImportScope(rows, 'keyword', null, mockProjects);

      assert.strictEqual(result.assignmentStatus, 'assigned');
      assert.strictEqual(result.effectiveProjectId, 'proj-1');
      assert.strictEqual(result.matchedProjectId, 'proj-1');
      assert.ok(result.warnings.some(w => w.includes('Auto-assigned')));
    });

    test('does NOT auto-assign when generic or competitor domains match a project domain', () => {
      const rows = [
        { raw: { 'competitor': 'bluepipeplumbing.com', keyword: 'drain repair' } },
        { raw: { 'domain': 'cactuslegalhelp.com', keyword: 'accident attorney' } }
      ];

      const result = resolveImportScope(rows, 'keyword', null, mockProjects);

      assert.strictEqual(result.assignmentStatus, 'unassigned');
      assert.strictEqual(result.effectiveProjectId, undefined);
      assert.strictEqual(result.matchedProjectId, undefined);
      assert.strictEqual(result.warnings.length, 0);
    });
  });
});
