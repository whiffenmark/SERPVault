import { test, describe } from 'node:test';
import assert from 'node:assert';
import { saveUserSetting, getUserSetting } from '../lib/supabase/user-settings';

describe('User Settings Helpers Unit Tests (Supabase Disconnected)', () => {
  test('getUserSetting returns present: false when Supabase/auth is unavailable', async () => {
    const result = await getUserSetting('selected_project_id');
    assert.deepStrictEqual(result, { present: false, value: null });
  });

  test('saveUserSetting resolves without throwing when Supabase/auth is unavailable', async () => {
    await assert.doesNotReject(async () => {
      await saveUserSetting('selected_project_id', 'proj_test_123');
    });
  });

  test('saveUserSetting resolves without throwing with null value when Supabase/auth is unavailable', async () => {
    await assert.doesNotReject(async () => {
      await saveUserSetting('selected_project_id', null);
    });
  });
});
