import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  escapeCsvCell,
  buildExportManifestAndFiles,
  createZip,
} from '../lib/all-data-export';

describe('All Data Export Helper Unit Tests', () => {
  // Test CSV escaping
  test('escapeCsvCell escapes correctly', () => {
    assert.strictEqual(escapeCsvCell(null), '');
    assert.strictEqual(escapeCsvCell(undefined), '');
    assert.strictEqual(escapeCsvCell('simple'), 'simple');
    assert.strictEqual(escapeCsvCell('text,with,commas'), '"text,with,commas"');
    assert.strictEqual(escapeCsvCell('text"with"quotes'), '"text""with""quotes"');
    assert.strictEqual(escapeCsvCell('text\nwith\nnewlines'), '"text\nwith\nnewlines"');
    assert.strictEqual(escapeCsvCell({ foo: 'bar' }), '"{""foo"":""bar""}"');
    assert.strictEqual(escapeCsvCell(['val1', 'val2']), '"[""val1"",""val2""]"');
  });

  // Test buildExportManifestAndFiles
  test('buildExportManifestAndFiles maps datasets correctly', () => {
    const input: any = {
      projects: [{ id: 'p1', name: 'Project 1', domain: 'example.com', location: 'us', niche: 'tech', createdAt: '2026-07-01T10:00:00Z', updatedAt: '2026-07-01T11:00:00Z' }],
      competitors: [{ id: 'c1', projectId: 'p1', domain: 'comp.com', label: 'Comp', createdAt: '2026-07-01T10:05:00Z' }],
      uploads: [],
      keywords: [],
      keywordGaps: [],
      competitorPages: [],
      backlinks: [],
      referringDomains: [],
      anchorTexts: [],
      dedupeReports: [],
      opportunityWorkflowMap: { 'kw1': 'Done' },
      contentBriefWorkflowMap: {},
      actionPlanMetadataMap: {},
      exportHistory: [],
      sourceMode: 'supabase'
    };

    const { files, manifest } = buildExportManifestAndFiles(input);

    assert.strictEqual(manifest.appName, 'SERPVault');
    assert.strictEqual(manifest.sourceMode, 'supabase');
    assert.strictEqual(manifest.perFileRowCounts['projects.csv'], 1);
    assert.strictEqual(manifest.perFileRowCounts['competitors.csv'], 1);
    assert.strictEqual(manifest.perFileRowCounts['uploads.csv'], 0);
    assert.strictEqual(manifest.perFileRowCounts['opportunity_workflow_map.json'], 1);

    // Verify projects.csv has header and data
    const projectsFile = files.find(f => f.name === 'projects.csv');
    assert.ok(projectsFile);
    const projectsLines = projectsFile.content.split('\n');
    assert.strictEqual(projectsLines[0], 'id,name,domain,location,niche,createdAt,updatedAt');
    assert.strictEqual(projectsLines[1], 'p1,Project 1,example.com,us,tech,2026-07-01T10:00:00Z,2026-07-01T11:00:00Z');

    // Verify opportunity_workflow_map.json content
    const workflowFile = files.find(f => f.name === 'opportunity_workflow_map.json');
    assert.ok(workflowFile);
    const parsedWorkflow = JSON.parse(workflowFile.content);
    assert.strictEqual(parsedWorkflow['kw1'], 'Done');
  });

  // Test ZIP creator structure
  test('createZip returns a valid ZIP byte array structure', () => {
    const entries = [
      { name: 'test1.txt', content: 'hello world' },
      { name: 'folder/test2.json', content: '{"ok":true}' }
    ];

    const zipBytes = createZip(entries);

    assert.ok(zipBytes instanceof Uint8Array);
    assert.ok(zipBytes.length > 100);

    // Local file header signature at the start: 0x04034b50 -> [0x50, 0x4b, 0x03, 0x04]
    assert.strictEqual(zipBytes[0], 0x50);
    assert.strictEqual(zipBytes[1], 0x4b);
    assert.strictEqual(zipBytes[2], 0x03);
    assert.strictEqual(zipBytes[3], 0x04);

    // End of Central Directory signature: 0x06054b50 -> [0x50, 0x4b, 0x05, 0x06]
    // The EOCD should be located 22 bytes from the end
    const eocdOffset = zipBytes.length - 22;
    assert.strictEqual(zipBytes[eocdOffset], 0x50);
    assert.strictEqual(zipBytes[eocdOffset + 1], 0x4b);
    assert.strictEqual(zipBytes[eocdOffset + 2], 0x05);
    assert.strictEqual(zipBytes[eocdOffset + 3], 0x06);

    // Number of entries in EOCD (at offset +8 and +10, 2 bytes) should be 2
    assert.strictEqual(zipBytes[eocdOffset + 8], 2);
    assert.strictEqual(zipBytes[eocdOffset + 10], 2);

    // Check if the filenames are present as strings in the bytes
    const textDecoder = new TextDecoder();
    const allText = textDecoder.decode(zipBytes);
    assert.ok(allText.includes('test1.txt'));
    assert.ok(allText.includes('folder/test2.json'));
    assert.ok(allText.includes('hello world'));
    assert.ok(allText.includes('{"ok":true}'));
  });
});
