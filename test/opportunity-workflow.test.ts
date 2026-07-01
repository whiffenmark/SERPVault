// Mock window and localStorage globally BEFORE importing lib/opportunity-workflow
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
  isOpportunityWorkflowStatus,
  getOpportunityWorkflowMap,
  saveOpportunityWorkflowMap,
  loadOpportunityWorkflowMap,
  saveOpportunityWorkflowMapToCloud,
  saveOpportunityWorkflowStatusToCloud,
  getMergedOpportunityWorkflowMap,
  OpportunityWorkflowStatus
} from '../lib/opportunity-workflow';

describe('Opportunity Workflow Unit Tests', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    __setSupabaseClientForTesting(null);
  });

  afterEach(() => {
    __setSupabaseClientForTesting(null);
  });

  describe('Status Sanitization', () => {
    test('isOpportunityWorkflowStatus validates correct and incorrect statuses', () => {
      assert.strictEqual(isOpportunityWorkflowStatus('New'), true);
      assert.strictEqual(isOpportunityWorkflowStatus('Planned'), true);
      assert.strictEqual(isOpportunityWorkflowStatus('In Progress'), true);
      assert.strictEqual(isOpportunityWorkflowStatus('Done'), true);
      assert.strictEqual(isOpportunityWorkflowStatus('Ignored'), true);
      
      assert.strictEqual(isOpportunityWorkflowStatus('Invalid'), false);
      assert.strictEqual(isOpportunityWorkflowStatus(123), false);
      assert.strictEqual(isOpportunityWorkflowStatus(null), false);
    });

    test('saveOpportunityWorkflowMap filters out invalid statuses', () => {
      const map: Record<string, any> = {
        'opp_1': 'Planned',
        'opp_2': 'InvalidStatus',
        'opp_3': 'Done'
      };
      saveOpportunityWorkflowMap(map);

      const loaded = getOpportunityWorkflowMap();
      assert.deepStrictEqual(loaded, {
        'opp_1': 'Planned',
        'opp_3': 'Done'
      });
    });
  });

  describe('Local Fallback (Supabase Disconnected)', () => {
    test('getOpportunityWorkflowMap returns empty map if nothing stored', () => {
      const loaded = getOpportunityWorkflowMap();
      assert.deepStrictEqual(loaded, {});
    });

    test('loadOpportunityWorkflowMap returns empty map when disconnected', async () => {
      const map = await loadOpportunityWorkflowMap();
      assert.deepStrictEqual(map, {});
    });

    test('saveOpportunityWorkflowMapToCloud resolves without throwing', async () => {
      await assert.doesNotReject(async () => {
        await saveOpportunityWorkflowMapToCloud({ 'opp_1': 'Planned' });
      });
    });

    test('saveOpportunityWorkflowStatusToCloud resolves without throwing', async () => {
      await assert.doesNotReject(async () => {
        await saveOpportunityWorkflowStatusToCloud('opp_1', 'In Progress');
      });
    });

    test('getMergedOpportunityWorkflowMap returns local map when disconnected', async () => {
      saveOpportunityWorkflowMap({ 'opp_1': 'Planned' });
      const merged = await getMergedOpportunityWorkflowMap();
      assert.deepStrictEqual(merged, { 'opp_1': 'Planned' });
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

    test('loadOpportunityWorkflowMap gets valid statuses from cloud', async () => {
      const cloudRows = [
        { opportunity_id: 'opp_1', status: 'Planned' },
        { opportunity_id: 'opp_2', status: 'InvalidStatus' }, // should be ignored
        { opportunity_id: 'opp_3', status: 'Done' }
      ];
      __setSupabaseClientForTesting(mockSupabaseClient(cloudRows) as SupabaseClient);

      const map = await loadOpportunityWorkflowMap();
      assert.deepStrictEqual(map, {
        'opp_1': 'Planned',
        'opp_3': 'Done'
      });
    });

    test('saveOpportunityWorkflowMapToCloud upserts rows to the database', async () => {
      __setSupabaseClientForTesting(mockSupabaseClient(null) as SupabaseClient);

      await saveOpportunityWorkflowMapToCloud({
        'opp_1': 'Planned',
        'opp_2': 'Done'
      });

      assert.strictEqual(upsertedRows.length, 2);
      assert.strictEqual(upsertedRows[0].opportunity_id, 'opp_1');
      assert.strictEqual(upsertedRows[0].status, 'Planned');
      assert.strictEqual(upsertedRows[1].opportunity_id, 'opp_2');
      assert.strictEqual(upsertedRows[1].status, 'Done');
    });

    test('saveOpportunityWorkflowStatusToCloud upserts single row with metadata', async () => {
      __setSupabaseClientForTesting(mockSupabaseClient(null) as SupabaseClient);

      await saveOpportunityWorkflowStatusToCloud('opp_1', 'In Progress', { foo: 'bar' });

      assert.strictEqual(upsertedRows.length, 1);
      assert.strictEqual(upsertedRows[0].opportunity_id, 'opp_1');
      assert.strictEqual(upsertedRows[0].status, 'In Progress');
      assert.deepStrictEqual(upsertedRows[0].metadata, { foo: 'bar' });
    });

    test('getMergedOpportunityWorkflowMap overlays cloud data on local data', async () => {
      // Setup local storage
      saveOpportunityWorkflowMap({
        'opp_1': 'Planned',
        'opp_2': 'New'
      });

      // Setup cloud data
      const cloudRows = [
        { opportunity_id: 'opp_2', status: 'Done' }, // overlays local 'New'
        { opportunity_id: 'opp_3', status: 'Ignored' } // new item from cloud
      ];
      __setSupabaseClientForTesting(mockSupabaseClient(cloudRows) as SupabaseClient);

      const merged = await getMergedOpportunityWorkflowMap();
      assert.deepStrictEqual(merged, {
        'opp_1': 'Planned', // preserved from local
        'opp_2': 'Done',    // overlaid from cloud
        'opp_3': 'Ignored'  // overlay from cloud
      });
    });
  });
});
