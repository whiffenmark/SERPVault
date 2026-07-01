import { getSupabase } from './client';
import { getCurrentUserId } from './auth';

/**
 * Saves a user setting to Supabase if signed in, otherwise no-ops.
 * Value can be any JSON-serializable type.
 */
export async function saveUserSetting(key: string, value: unknown): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  try {
    const userId = await getCurrentUserId();
    if (!userId) return;

    const { error } = await sb
      .from('user_settings')
      .upsert(
        {
          user_id: userId,
          key,
          value,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,key' }
      );

    if (error) {
      console.error(`[user-settings] Error saving setting "${key}":`, error.message);
    }
  } catch (err) {
    console.error(`[user-settings] Exception saving setting "${key}":`, err);
  }
}

/**
 * Loads a user setting from Supabase if signed in.
 * Returns { present: true, value } if found, or { present: false, value: null } otherwise.
 */
export async function getUserSetting(key: string): Promise<{ present: boolean; value: unknown }> {
  const sb = getSupabase();
  if (!sb) return { present: false, value: null };

  try {
    const userId = await getCurrentUserId();
    if (!userId) return { present: false, value: null };

    const { data, error } = await sb
      .from('user_settings')
      .select('value')
      .eq('user_id', userId)
      .eq('key', key)
      .maybeSingle();

    if (error) {
      console.error(`[user-settings] Error loading setting "${key}":`, error.message);
      return { present: false, value: null };
    }

    if (!data) {
      return { present: false, value: null };
    }

    return { present: true, value: data.value };
  } catch (err) {
    console.error(`[user-settings] Exception loading setting "${key}":`, err);
    return { present: false, value: null };
  }
}

export const SELECTED_PROJECT_SETTING_KEY = 'selected_project_id';

/**
 * Saves the selected project setting (projectId can be string or null).
 */
export async function saveSelectedProjectSetting(projectId: string | null): Promise<void> {
  await saveUserSetting(SELECTED_PROJECT_SETTING_KEY, projectId);
}

/**
 * Loads the selected project setting from Supabase.
 * Only returns string | null when present, and treats invalid cloud values as absent (undefined).
 */
export async function getSelectedProjectSetting(): Promise<string | null | undefined> {
  const result = await getUserSetting(SELECTED_PROJECT_SETTING_KEY);
  if (!result.present) {
    return undefined;
  }
  const val = result.value;
  if (val === null || typeof val === 'string') {
    return val;
  }
  return undefined;
}

