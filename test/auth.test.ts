import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert';
import { SupabaseClient } from '@supabase/supabase-js';
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
import { __setSupabaseClientForTesting } from '../lib/supabase/client';

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

describe('Auth Helpers Connected-Client Unit Tests', () => {
  const originalWindow = (globalThis as any).window;

  afterEach(() => {
    __setSupabaseClientForTesting(null);
    if (originalWindow === undefined) {
      delete (globalThis as any).window;
    } else {
      (globalThis as any).window = originalWindow;
    }
  });

  test('signInWithGitHub calls auth.signInWithOAuth with provider "github" and redirectTo ending in /settings when window.location.origin is available', async () => {
    let passedProvider: string | null = null;
    let passedOptions: any = null;

    const mockClient = {
      auth: {
        signInWithOAuth: async (args: { provider: string; options?: { redirectTo?: string } }) => {
          passedProvider = args.provider;
          passedOptions = args.options;
          return {
            data: { provider: 'github', url: 'https://github.com/login/oauth/authorize' },
            error: null,
          };
        },
      },
    } as unknown as SupabaseClient;

    __setSupabaseClientForTesting(mockClient);

    // Mock window with location.origin
    (globalThis as any).window = {
      location: {
        origin: 'http://test-origin.example.com',
      },
    };

    const data = await signInWithGitHub();

    assert.strictEqual(passedProvider, 'github');
    assert.ok(passedOptions?.redirectTo?.endsWith('/settings'));
    assert.strictEqual(passedOptions?.redirectTo, 'http://test-origin.example.com/settings');
    assert.deepStrictEqual(data, { provider: 'github', url: 'https://github.com/login/oauth/authorize' });
  });

  test('signInWithGitHub throws OAuth errors returned by the client', async () => {
    const mockOAuthError = new Error('OAuth authentication failed');
    const mockClient = {
      auth: {
        signInWithOAuth: async () => {
          return {
            data: null,
            error: mockOAuthError,
          };
        },
      },
    } as unknown as SupabaseClient;

    __setSupabaseClientForTesting(mockClient);

    // Mock window
    (globalThis as any).window = {
      location: {
        origin: 'http://test-origin.example.com',
      },
    };

    await assert.rejects(
      async () => {
        await signInWithGitHub();
      },
      /OAuth authentication failed/
    );
  });

  test('signInWithGitHub handles undefined window by passing undefined redirectTo', async () => {
    let passedOptions: any = null;

    const mockClient = {
      auth: {
        signInWithOAuth: async (args: { provider: string; options?: { redirectTo?: string } }) => {
          passedOptions = args.options;
          return {
            data: { provider: 'github', url: 'https://github.com/login/oauth/authorize' },
            error: null,
          };
        },
      },
    } as unknown as SupabaseClient;

    __setSupabaseClientForTesting(mockClient);

    // Ensure window is undefined
    delete (globalThis as any).window;

    await signInWithGitHub();

    assert.strictEqual(passedOptions?.redirectTo, undefined);
  });
});
