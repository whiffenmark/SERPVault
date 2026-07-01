import { Session } from '@supabase/supabase-js';
import { getSupabase, supabaseEnabled } from './client';

export const isAuthAvailable = supabaseEnabled;

export async function getCurrentSession(): Promise<Session | null> {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb.auth.getSession();
    if (error) {
      console.error('[auth] Error getting session:', error.message);
      return null;
    }
    return data.session;
  } catch (err) {
    console.error('[auth] Exception getting session:', err);
    return null;
  }
}

export async function getCurrentUserId(): Promise<string | null> {
  const session = await getCurrentSession();
  return session?.user?.id ?? null;
}

export async function signInWithEmail(email: string, password: string) {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured');
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUpWithEmail(email: string, password: string) {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured');
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.auth.signOut();
  if (error) throw error;
}

export function subscribeAuthState(callback: (session: Session | null) => void): (() => void) | null {
  const sb = getSupabase();
  if (!sb) return null;

  getCurrentSession().then((session) => {
    callback(session);
  });

  const { data } = sb.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });

  return () => {
    data.subscription.unsubscribe();
  };
}
