import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert';
import { SupabaseClient } from '@supabase/supabase-js';
import { getSelectedProjectSetting, saveSelectedProjectSetting } from '../lib/supabase/user-settings';
import { __setSupabaseClientForTesting } from '../lib/supabase/client';

describe('Selected Project Settings Unit Tests', () => {
  afterEach(() => {
    __setSupabaseClientForTesting(null);
  });

  describe('Disconnected State', () => {
    test('getSelectedProjectSetting returns undefined when Supabase/auth is unavailable', async () => {
      __setSupabaseClientForTesting(null);
      const result = await getSelectedProjectSetting();
      assert.strictEqual(result, undefined);
    });

    test('saveSelectedProjectSetting resolves without throwing when Supabase/auth is unavailable', async () => {
      await assert.doesNotReject(async () => {
        await saveSelectedProjectSetting('proj_test_123');
      });
    });

    test('saveSelectedProjectSetting resolves with null when Supabase/auth is unavailable', async () => {
      await assert.doesNotReject(async () => {
        await saveSelectedProjectSetting(null);
      });
    });
  });

  describe('Connected State with Mocked Client', () => {
    const mockMaybeSingle = (data: any, error: any = null) => {
      const query: any = {};
      query.maybeSingle = async () => ({ data, error });
      query.eq = () => query;
      query.select = () => query;
      return query;
    };

    const mockSupabaseClient = (data: any, error: any = null, userId: string | null = 'user_123') => {
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
        from: () => mockMaybeSingle(data, error)
      } as any;
    };

    test('returns the project ID when a valid string is returned from cloud', async () => {
      __setSupabaseClientForTesting(mockSupabaseClient({ value: 'proj_cloud_123' }) as SupabaseClient);

      const result = await getSelectedProjectSetting();
      assert.strictEqual(result, 'proj_cloud_123');
    });

    test('returns null when null is returned from cloud', async () => {
      __setSupabaseClientForTesting(mockSupabaseClient({ value: null }) as SupabaseClient);

      const result = await getSelectedProjectSetting();
      assert.strictEqual(result, null);
    });

    test('returns undefined (treated as absent) when an invalid number is returned from cloud', async () => {
      __setSupabaseClientForTesting(mockSupabaseClient({ value: 123 }) as SupabaseClient);

      const result = await getSelectedProjectSetting();
      assert.strictEqual(result, undefined);
    });

    test('returns undefined (treated as absent) when an invalid object is returned from cloud', async () => {
      __setSupabaseClientForTesting(mockSupabaseClient({ value: { invalid: true } }) as SupabaseClient);

      const result = await getSelectedProjectSetting();
      assert.strictEqual(result, undefined);
    });

    test('returns undefined when no setting record exists in the cloud', async () => {
      __setSupabaseClientForTesting(mockSupabaseClient(null) as SupabaseClient);

      const result = await getSelectedProjectSetting();
      assert.strictEqual(result, undefined);
    });

    test('returns undefined when Supabase returns an error', async () => {
      __setSupabaseClientForTesting(mockSupabaseClient(null, { message: 'DB Error' }) as SupabaseClient);

      const result = await getSelectedProjectSetting();
      assert.strictEqual(result, undefined);
    });
  });
});
