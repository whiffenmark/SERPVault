import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';

// Mock window and localStorage globally BEFORE importing rollout helpers
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

globalContext.window = {
  dispatchEvent: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
};
globalContext.localStorage = mockLocalStorage;

// Import the rollout module
import {
  parseRolloutPercent,
  hashStringToInt,
  getBucket,
  determineRollout,
  getBrowserBucketId,
  getCloudBetaOptIn,
  setCloudBetaOptIn,
  getCloudBetaOptOut,
  setCloudBetaOptOut,
  isCloudRolloutEnabled
} from '../lib/supabase/rollout';

describe('Canary Rollout Helpers Unit Tests', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    delete process.env.NEXT_PUBLIC_SERPVAULT_CLOUD_ROLLOUT_PERCENT;
  });

  describe('parseRolloutPercent', () => {
    test('defaults to 100 for undefined, empty, or invalid input', () => {
      assert.strictEqual(parseRolloutPercent(undefined), 100);
      assert.strictEqual(parseRolloutPercent(''), 100);
      assert.strictEqual(parseRolloutPercent('not-a-number'), 100);
    });

    test('parses valid percentages correctly', () => {
      assert.strictEqual(parseRolloutPercent('5'), 5);
      assert.strictEqual(parseRolloutPercent('50'), 50);
      assert.strictEqual(parseRolloutPercent('100'), 100);
      assert.strictEqual(parseRolloutPercent('0'), 0);
    });

    test('clamps percentage boundaries between 0 and 100', () => {
      assert.strictEqual(parseRolloutPercent('-10'), 0);
      assert.strictEqual(parseRolloutPercent('120'), 100);
    });
  });

  describe('Stable Hashing & Bucketing', () => {
    test('hashStringToInt is deterministic', () => {
      const input = 'browser-uuid-12345';
      const hash1 = hashStringToInt(input);
      const hash2 = hashStringToInt(input);
      assert.strictEqual(hash1, hash2);
    });

    test('getBucket returns a value between 0 and 99', () => {
      const buckets = Array.from({ length: 100 }, (_, i) => getBucket(`browser-id-${i}`));
      for (const bucket of buckets) {
        assert.ok(bucket >= 0 && bucket < 100);
      }
    });

    test('getBucket is stable for the same input', () => {
      const id = 'stable-device-id';
      assert.strictEqual(getBucket(id), getBucket(id));
    });
  });

  describe('determineRollout', () => {
    test('returns false when optOut is true regardless of other settings', () => {
      assert.strictEqual(determineRollout('bucket-1', 100, true, true), false);
      assert.strictEqual(determineRollout('bucket-1', 100, false, true), false);
      assert.strictEqual(determineRollout('bucket-1', 5, true, true), false);
    });

    test('returns true when optIn is true and optOut is false', () => {
      assert.strictEqual(determineRollout('bucket-1', 0, true, false), true);
      assert.strictEqual(determineRollout('bucket-1', 5, true, false), true);
    });

    test('falls back to bucket < percent comparison', () => {
      // Find bucket ID that hashes to bucket < 5
      let under5Id = '';
      let over5Id = '';
      for (let i = 0; i < 1000; i++) {
        const id = `test-id-${i}`;
        const b = getBucket(id);
        if (b < 5 && !under5Id) under5Id = id;
        if (b >= 5 && !over5Id) over5Id = id;
        if (under5Id && over5Id) break;
      }

      assert.strictEqual(determineRollout(under5Id, 5, false, false), true);
      assert.strictEqual(determineRollout(over5Id, 5, false, false), false);
    });
  });

  describe('Client State Handlers (localStorage integration)', () => {
    test('getBrowserBucketId generates and retrieves a stable ID', () => {
      const id1 = getBrowserBucketId();
      assert.ok(id1.length > 0);
      const id2 = getBrowserBucketId();
      assert.strictEqual(id1, id2);
    });

    test('setCloudBetaOptIn persists true and removes optOut', () => {
      setCloudBetaOptOut(true);
      assert.strictEqual(getCloudBetaOptOut(), true);

      setCloudBetaOptIn(true);
      assert.strictEqual(getCloudBetaOptIn(), true);
      assert.strictEqual(getCloudBetaOptOut(), false);
    });

    test('setCloudBetaOptOut persists true and removes optIn', () => {
      setCloudBetaOptIn(true);
      assert.strictEqual(getCloudBetaOptIn(), true);

      setCloudBetaOptOut(true);
      assert.strictEqual(getCloudBetaOptOut(), true);
      assert.strictEqual(getCloudBetaOptIn(), false);
    });

    test('isCloudRolloutEnabled reflects environment and local settings', () => {
      // Default behavior (100% rollout)
      assert.strictEqual(isCloudRolloutEnabled(), true);

      // 0% rollout, default user is disabled
      process.env.NEXT_PUBLIC_SERPVAULT_CLOUD_ROLLOUT_PERCENT = '0';
      assert.strictEqual(isCloudRolloutEnabled(), false);

      // Opt-in overrides 0% rollout
      setCloudBetaOptIn(true);
      assert.strictEqual(isCloudRolloutEnabled(), true);

      // Opt-out overrides opt-in
      setCloudBetaOptOut(true);
      assert.strictEqual(isCloudRolloutEnabled(), false);
    });
  });
});
