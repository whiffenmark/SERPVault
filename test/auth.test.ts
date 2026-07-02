import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  getCurrentSession,
  getCurrentUserId,
  signInWithEmail,
  signUpWithEmail,
  signInWithGitHub,
  signOut,
  subscribeAuthState,
  isAuthAvailable
} from '../lib/supabase/auth';

describe('Auth Helpers Unit Tests (Supabase Disconnected)', () => {
  test('isAuthAvailable reports false when env vars are absent', () => {
    assert.strictEqual(isAuthAvailable, false);
  });

  test('getCurrentSession resolves to null', async () => {
    const session = await getCurrentSession();
    assert.strictEqual(session, null);
  });

  test('getCurrentUserId resolves to null', async () => {
    const userId = await getCurrentUserId();
    assert.strictEqual(userId, null);
  });

  test('signInWithEmail throws configuration error', async () => {
    await assert.rejects(
      async () => {
        await signInWithEmail('test@example.com', 'password123');
      },
      /Supabase is not configured/
    );
  });

  test('signUpWithEmail throws configuration error', async () => {
    await assert.rejects(
      async () => {
        await signUpWithEmail('test@example.com', 'password123');
      },
      /Supabase is not configured/
    );
  });

  test('signInWithGitHub throws configuration error', async () => {
    await assert.rejects(
      async () => {
        await signInWithGitHub();
      },
      /Supabase is not configured/
    );
  });

  test('signOut resolves gracefully without throwing', async () => {
    await assert.doesNotReject(async () => {
      await signOut();
    });
  });

  test('subscribeAuthState returns null', () => {
    const unsubscribe = subscribeAuthState(() => {});
    assert.strictEqual(unsubscribe, null);
  });
});
