import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { isCloudRolloutEnabled } from './rollout';

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (_client) return _client;
  if (typeof window === 'undefined') return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!isCloudRolloutEnabled()) return null;
  if (!_client) {
    _client = createClient(url, key);
  }
  return _client;
}

export function __setSupabaseClientForTesting(client: SupabaseClient | null) {
  _client = client;
}

export const supabaseConfigured = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export const supabaseEnabled = supabaseConfigured && isCloudRolloutEnabled();
