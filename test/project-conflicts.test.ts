import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  normalizeDomain,
  normalizeName,
  buildProjectConflictPlan
} from '../lib/project-conflicts';
import type { ProjectRecord } from '../lib/types';

describe('Project Conflicts Helper Unit Tests', () => {
  describe('Domain Normalization', () => {
    test('normalizes domains by removing protocol, www prefix, trailing paths, and converting to lowercase', () => {
      assert.strictEqual(normalizeDomain('https://www.example.com/path'), 'example.com');
      assert.strictEqual(normalizeDomain('http://example.com/'), 'example.com');
      assert.strictEqual(normalizeDomain('  EXAMPLE.COM  '), 'example.com');
      assert.strictEqual(normalizeDomain('www.sub.example.com/foo/bar?q=1'), 'sub.example.com');
      assert.strictEqual(normalizeDomain(''), '');
    });
  });

  describe('Name Normalization', () => {
    test('normalizes names by trimming, lowercasing, and collapsing whitespace', () => {
      assert.strictEqual(normalizeName('  My   Cool   Project  '), 'my cool project');
      assert.strictEqual(normalizeName('My-Cool-Project'), 'my-cool-project');
      assert.strictEqual(normalizeName(''), '');
    });
  });

  describe('Conflict Plan Builder', () => {
    const remoteProjects: ProjectRecord[] = [
      { id: 'r1', name: 'Alpha Project', domain: 'alpha.com', location: 'US', niche: 'SEO', createdAt: '' },
      { id: 'r2', name: 'Beta Project', domain: 'beta.com', createdAt: '' },
    ];

    test('maps unique local projects to projectsToCreate without merging', () => {
      const localProjects: ProjectRecord[] = [
        { id: 'l1', name: 'Gamma Project', domain: 'gamma.com', location: 'CA', niche: 'Tech', createdAt: '' },
      ];

      const plan = buildProjectConflictPlan(localProjects, remoteProjects);

      assert.strictEqual(plan.projectsToCreate.length, 1);
      assert.strictEqual(plan.projectsToCreate[0].id, 'l1');
      assert.strictEqual(plan.projectIdMap['l1'], 'l1');
      assert.strictEqual(plan.summaries.length, 0);
      assert.strictEqual(plan.warnings.length, 0);
    });

    test('merges local project with remote project on exact domain/location/niche match first', () => {
      const localProjects: ProjectRecord[] = [
        // Name is different, but domain, location, and niche match remote project 'r1'
        { id: 'l1', name: 'Alpha Project Restyled', domain: 'HTTPS://WWW.ALPHA.COM/', location: 'us', niche: 'seo', createdAt: '' },
      ];

      const plan = buildProjectConflictPlan(localProjects, remoteProjects);

      assert.strictEqual(plan.projectsToCreate.length, 0);
      assert.strictEqual(plan.projectIdMap['l1'], 'r1');
      assert.strictEqual(plan.summaries.length, 1);
      assert.ok(plan.summaries[0].includes('domain/location/niche match'));
      assert.strictEqual(plan.warnings.length, 0);
    });

    test('merges local project with remote project on normalized name match as fallback', () => {
      const localProjects: ProjectRecord[] = [
        // Domain is different, but name matches remote project 'r2' after normalization
        { id: 'l1', name: '   BETA   PROJECT   ', domain: 'beta-new.com', createdAt: '' },
      ];

      const plan = buildProjectConflictPlan(localProjects, remoteProjects);

      assert.strictEqual(plan.projectsToCreate.length, 0);
      assert.strictEqual(plan.projectIdMap['l1'], 'r2');
      assert.strictEqual(plan.summaries.length, 1);
      assert.ok(plan.summaries[0].includes('normalized name match'));
      assert.strictEqual(plan.warnings.length, 0);
    });

    test('handles local duplicates by mapping them to the first local or remote project ID and warning', () => {
      const localProjects: ProjectRecord[] = [
        // Two local duplicates that match remote 'r1'
        { id: 'l1', name: 'Alpha Project Dupe 1', domain: 'alpha.com', location: 'US', niche: 'SEO', createdAt: '' },
        { id: 'l2', name: 'Alpha Project Dupe 2', domain: 'alpha.com', location: 'US', niche: 'SEO', createdAt: '' },
        // Two local duplicates that do NOT match any remote
        { id: 'l3', name: 'Unique Local A', domain: 'unique.com', createdAt: '' },
        { id: 'l4', name: 'Unique Local B', domain: 'unique.com', createdAt: '' }, // Same domain
      ];

      const plan = buildProjectConflictPlan(localProjects, remoteProjects);

      // l1 maps to r1, l2 maps to r1 as duplicate
      assert.strictEqual(plan.projectIdMap['l1'], 'r1');
      assert.strictEqual(plan.projectIdMap['l2'], 'r1');

      // l3 gets created, l4 maps to l3 as duplicate
      assert.strictEqual(plan.projectIdMap['l3'], 'l3');
      assert.strictEqual(plan.projectIdMap['l4'], 'l3');

      // projectsToCreate should only contain l3
      assert.strictEqual(plan.projectsToCreate.length, 1);
      assert.strictEqual(plan.projectsToCreate[0].id, 'l3');

      // Checks summaries and warnings
      assert.strictEqual(plan.summaries.length, 1); // Only l1 merges to r1. l2 is duplicate warning.
      assert.strictEqual(plan.warnings.length, 2); // l2 has a warning, l4 has a warning
      assert.ok(plan.warnings.some(w => w.includes('Alpha Project Dupe 2') && w.includes('duplicate of another local project')));
      assert.ok(plan.warnings.some(w => w.includes('Unique Local B') && w.includes('duplicate of local project "Unique Local A"')));
    });
  });
});
