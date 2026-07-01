// Mock window and localStorage globally BEFORE importing lib/content-brief-workflow
class MockLocalStorage {
  private store: Record<string, string> = {};
  getItem(key: string) { return this.store[key] || null; }
  setItem(key: string, value: string) { this.store[key] = value; }
  removeItem(key: string) { delete this.store[key]; }
  clear() { this.store = {}; }
}

const mockLocalStorage = new MockLocalStorage();
const globalContext = globalThis as unknown as Omit<typeof globalThis, 'window' | 'localStorage'> & {
  window: unknown;
  localStorage: MockLocalStorage;
};

globalContext.window = {};
globalContext.localStorage = mockLocalStorage;

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { SupabaseClient } from '@supabase/supabase-js';
import { __setSupabaseClientForTesting } from '../lib/supabase/client';
import {
  isContentBriefWorkflowStatus,
  sanitizeWorkflowItem,
  getContentBriefWorkflowMap,
  saveContentBriefWorkflowMap,
  loadContentBriefWorkflowMap,
  saveContentBriefWorkflowMapToCloud,
  saveContentBriefWorkflowItemToCloud,
  getMergedContentBriefWorkflowMap,
  updateContentBriefWorkflowItemAsync,
  ContentBriefWorkflowItem,
  ContentBriefWorkflowStatus
} from '../lib/content-brief-workflow';

describe('Content Brief Workflow Unit Tests', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    __setSupabaseClientForTesting(null);
  });

  afterEach(() => {
    __setSupabaseClientForTesting(null);
  });

  describe('Sanitization & Helpers', () => {
    test('isContentBriefWorkflowStatus validates status values correctly', () => {
      assert.strictEqual(isContentBriefWorkflowStatus('Draft'), true);
      assert.strictEqual(isContentBriefWorkflowStatus('In Review'), true);
      assert.strictEqual(isContentBriefWorkflowStatus('Approved'), true);
      assert.strictEqual(isContentBriefWorkflowStatus('Published'), true);
      assert.strictEqual(isContentBriefWorkflowStatus('Archived'), true);

      assert.strictEqual(isContentBriefWorkflowStatus('InvalidStatus'), false);
      assert.strictEqual(isContentBriefWorkflowStatus(123), false);
      assert.strictEqual(isContentBriefWorkflowStatus(null), false);
    });

    test('sanitizeWorkflowItem sanitizes status and checkedItems correctly', () => {
      // Valid item
      const item1 = {
        status: 'Approved',
        owner: 'Alice',
        dueDate: '2026-07-01',
        notes: 'Looks good',
        checkedItems: { 0: true, 1: false },
        updatedAt: '2026-07-01T12:00:00.000Z'
      };
      const sanitized1 = sanitizeWorkflowItem(item1);
      assert.strictEqual(sanitized1.status, 'Approved');
      assert.strictEqual(sanitized1.owner, 'Alice');
      assert.deepStrictEqual(sanitized1.checkedItems, { 0: true, 1: false });

      // Invalid status fallback
      const item2 = {
        status: 'InvalidStatus',
        checkedItems: 'not-an-object'
      };
      const sanitized2 = sanitizeWorkflowItem(item2);
      assert.strictEqual(sanitized2.status, 'Draft');
      assert.deepStrictEqual(sanitized2.checkedItems, {});

      // DB snake_case mappings
      const item3 = {
        status: 'Published',
        due_date: '2026-08-01',
        checked_items: { '2': true, 'invalid_key': true, '3': 'not-a-boolean' }
      };
      const sanitized3 = sanitizeWorkflowItem(item3);
      assert.strictEqual(sanitized3.status, 'Published');
      assert.strictEqual(sanitized3.dueDate, '2026-08-01');
      assert.deepStrictEqual(sanitized3.checkedItems, { 2: true });
    });
  });

  describe('Local Fallback (Supabase Disconnected)', () => {
    test('getContentBriefWorkflowMap returns empty map if nothing stored', () => {
      const loaded = getContentBriefWorkflowMap();
      assert.deepStrictEqual(loaded, {});
    });

    test('loadContentBriefWorkflowMap returns empty map when disconnected', async () => {
      const map = await loadContentBriefWorkflowMap();
      assert.deepStrictEqual(map, {});
    });

    test('saveContentBriefWorkflowMapToCloud resolves without throwing', async () => {
      await assert.doesNotReject(async () => {
        await saveContentBriefWorkflowMapToCloud({
          'brief_1': { status: 'In Review' }
        });
      });
    });

    test('saveContentBriefWorkflowItemToCloud resolves without throwing', async () => {
      await assert.doesNotReject(async () => {
        await saveContentBriefWorkflowItemToCloud('brief_1', { status: 'Draft' });
      });
    });

    test('getMergedContentBriefWorkflowMap returns local map when disconnected', async () => {
      saveContentBriefWorkflowMap({
        'brief_1': { status: 'Draft', owner: 'Bob' }
      });
      const merged = await getMergedContentBriefWorkflowMap();
      assert.strictEqual(merged['brief_1']?.status, 'Draft');
      assert.strictEqual(merged['brief_1']?.owner, 'Bob');
    });

    test('updateContentBriefWorkflowItemAsync updates locally when disconnected', async () => {
      saveContentBriefWorkflowMap({
        'brief_1': { status: 'Draft', owner: 'Bob' }
      });
      const updated = await updateContentBriefWorkflowItemAsync('brief_1', { owner: 'Charlie', status: 'In Review' });
      assert.strictEqual(updated.status, 'In Review');
      assert.strictEqual(updated.owner, 'Charlie');

      const local = getContentBriefWorkflowMap();
      assert.strictEqual(local['brief_1']?.status, 'In Review');
      assert.strictEqual(local['brief_1']?.owner, 'Charlie');
    });
  });

  describe('Connected State with Mocked Client', () => {
    let upsertedRows: any[] = [];

    const mockQuery = (data: any, error: any = null) => {
      const query: any = {};
      query.select = () => query;
      query.eq = () => query;
      query.upsert = (rows: any, options?: any) => {
        upsertedRows = Array.isArray(rows) ? rows : [rows];
        return {
          then: (onfulfilled: any) => {
            return Promise.resolve(onfulfilled({ data: null, error }));
          }
        };
      };
      query.then = (onfulfilled: any) => {
        return Promise.resolve(onfulfilled({ data, error }));
      };
      return query;
    };

    const mockSupabaseClient = (data: any, error: any = null, userId: string | null = 'user_123') => {
      upsertedRows = [];
      const queryObj = mockQuery(data, error);
      return {
        auth: {
          getSession: async () => {
            if (!userId) return { data: { session: null }, error: null };
            return {
              data: {
                session: {
                  user: { id: userId }
                }
              },
              error: null
            };
          }
        },
        from: (table: string) => {
          return queryObj;
        }
      } as any;
    };

    test('loadContentBriefWorkflowMap gets and sanitizes status and checkedItems from cloud', async () => {
      const cloudRows = [
        {
          brief_id: 'brief_1',
          status: 'Approved',
          owner: 'Alice',
          due_date: '2026-07-01',
          notes: 'Important',
          checked_items: { '0': true, '1': false },
          updated_at: '2026-07-01T12:00:00.000Z'
        },
        {
          brief_id: 'brief_2',
          status: 'InvalidStatus', // fallback to Draft
          checked_items: 'not-an-object', // fallback to {}
          updated_at: '2026-07-01T13:00:00.000Z'
        }
      ];
      __setSupabaseClientForTesting(mockSupabaseClient(cloudRows) as SupabaseClient);

      const map = await loadContentBriefWorkflowMap();
      assert.strictEqual(map['brief_1']?.status, 'Approved');
      assert.strictEqual(map['brief_1']?.owner, 'Alice');
      assert.deepStrictEqual(map['brief_1']?.checkedItems, { 0: true, 1: false });

      assert.strictEqual(map['brief_2']?.status, 'Draft');
      assert.deepStrictEqual(map['brief_2']?.checkedItems, {});
    });

    test('saveContentBriefWorkflowMapToCloud upserts rows to database', async () => {
      __setSupabaseClientForTesting(mockSupabaseClient(null) as SupabaseClient);

      await saveContentBriefWorkflowMapToCloud({
        'brief_1': { status: 'In Review', owner: 'Bob' }
      });

      assert.strictEqual(upsertedRows.length, 1);
      assert.strictEqual(upsertedRows[0].brief_id, 'brief_1');
      assert.strictEqual(upsertedRows[0].status, 'In Review');
      assert.strictEqual(upsertedRows[0].owner, 'Bob');
      assert.deepStrictEqual(upsertedRows[0].checked_items, {});
    });

    test('getMergedContentBriefWorkflowMap merges based on updatedAt timestamp', async () => {
      // Local map
      saveContentBriefWorkflowMap({
        'brief_1': {
          status: 'Draft',
          owner: 'Alice',
          updatedAt: '2026-07-01T10:00:00.000Z'
        },
        'brief_2': {
          status: 'Approved',
          owner: 'Alice',
          updatedAt: '2026-07-01T15:00:00.000Z' // Local is newer
        }
      });

      // Cloud rows
      const cloudRows = [
        {
          brief_id: 'brief_1',
          status: 'In Review', // Cloud is newer (12:00:00 vs 10:00:00)
          owner: 'Bob',
          updated_at: '2026-07-01T12:00:00.000Z'
        },
        {
          brief_id: 'brief_2',
          status: 'Published', // Cloud is older (14:00:00 vs 15:00:00)
          owner: 'Bob',
          updated_at: '2026-07-01T14:00:00.000Z'
        },
        {
          brief_id: 'brief_3',
          status: 'Archived', // Only in cloud
          owner: 'Charlie',
          updated_at: '2026-07-01T11:00:00.000Z'
        }
      ];
      __setSupabaseClientForTesting(mockSupabaseClient(cloudRows) as SupabaseClient);

      const merged = await getMergedContentBriefWorkflowMap();
      
      // brief_1 cloud wins
      assert.strictEqual(merged['brief_1']?.status, 'In Review');
      assert.strictEqual(merged['brief_1']?.owner, 'Bob');

      // brief_2 local wins
      assert.strictEqual(merged['brief_2']?.status, 'Approved');
      assert.strictEqual(merged['brief_2']?.owner, 'Alice');

      // brief_3 cloud wins (only in cloud)
      assert.strictEqual(merged['brief_3']?.status, 'Archived');
      assert.strictEqual(merged['brief_3']?.owner, 'Charlie');
    });
  });
});
