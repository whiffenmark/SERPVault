/**
 * lib/supabase/rollout.ts — Production-safe Canary Rollout Helper.
 *
 * Gating of backend database features for a percentage of browsers plus explicit opt-in.
 * Default behavior is enabled (100% rollout) if NEXT_PUBLIC_SERPVAULT_CLOUD_ROLLOUT_PERCENT is not set.
 *
 * For example:
 * - Setting NEXT_PUBLIC_SERPVAULT_CLOUD_ROLLOUT_PERCENT to 5 configures a 5% rollout.
 * - Explicit local opt-in via localStorage key `serpvault_cloud_beta_opt_in` bypasses the rollout gate.
 * - Explicit local opt-out via localStorage key `serpvault_cloud_beta_opt_out` disables the backend features.
 */

const BUCKET_ID_KEY = 'serpvault_browser_bucket_id';
const OPT_IN_KEY = 'serpvault_cloud_beta_opt_in';
const OPT_OUT_KEY = 'serpvault_cloud_beta_opt_out';

/**
 * Parses the rollout percent environment variable value.
 * Defaults to 100 if the value is undefined, empty, or invalid.
 * Clamps the return value between 0 and 100.
 */
export function parseRolloutPercent(val: string | undefined): number {
  if (val === undefined || val === '') return 100;
  const parsed = parseInt(val, 10);
  if (isNaN(parsed)) return 100;
  if (parsed < 0) return 0;
  if (parsed > 100) return 100;
  return parsed;
}

/**
 * Simple, deterministic hashing function (similar to DJB2) to convert a string ID
 * into a non-negative integer.
 */
export function hashStringToInt(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Returns a stable bucket value between 0 and 99 for a given browser bucket ID.
 */
export function getBucket(bucketId: string): number {
  if (!bucketId) return 0;
  return hashStringToInt(bucketId) % 100;
}

/**
 * Pure helper to determine if cloud backend features are enabled.
 * Precedence:
 * 1. Opt-out takes precedence first and disables features.
 * 2. Opt-in takes precedence second and enables features.
 * 3. Fallback to stable bucket comparison (< percent).
 */
export function determineRollout(bucketId: string, percent: number, optIn: boolean, optOut: boolean): boolean {
  if (optOut) return false;
  if (optIn) return true;
  const bucket = getBucket(bucketId);
  return bucket < percent;
}

/**
 * Retrieves the stable browser bucket ID from localStorage.
 * If one does not exist, generates a new random string ID and persists it.
 * Safe to call during SSR (returns empty string).
 */
export function getBrowserBucketId(): string {
  if (typeof window === 'undefined') return '';
  try {
    let id = localStorage.getItem(BUCKET_ID_KEY);
    if (!id) {
      id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      localStorage.setItem(BUCKET_ID_KEY, id);
    }
    return id;
  } catch (e) {
    console.error('[rollout] failed to read/write browser bucket ID:', e);
    return '';
  }
}

/**
 * Client helper to check if the browser has opted in.
 */
export function getCloudBetaOptIn(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(OPT_IN_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Client helper to set the browser's opt-in status.
 * Setting opt-in clears any existing opt-out.
 */
export function setCloudBetaOptIn(val: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (val) {
      localStorage.setItem(OPT_IN_KEY, 'true');
      localStorage.removeItem(OPT_OUT_KEY);
    } else {
      localStorage.removeItem(OPT_IN_KEY);
    }
  } catch (e) {
    console.error('[rollout] failed to set opt-in status:', e);
  }
}

/**
 * Client helper to check if the browser has opted out.
 */
export function getCloudBetaOptOut(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(OPT_OUT_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Client helper to set the browser's opt-out status.
 * Setting opt-out clears any existing opt-in.
 */
export function setCloudBetaOptOut(val: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (val) {
      localStorage.setItem(OPT_OUT_KEY, 'true');
      localStorage.removeItem(OPT_IN_KEY);
    } else {
      localStorage.removeItem(OPT_OUT_KEY);
    }
  } catch (e) {
    console.error('[rollout] failed to set opt-out status:', e);
  }
}

/**
 * Client helper to evaluate the entire rollout decision for the current browser.
 * Safe to call during SSR (returns false).
 */
export function isCloudRolloutEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const envVal = process.env.NEXT_PUBLIC_SERPVAULT_CLOUD_ROLLOUT_PERCENT;
  const percent = parseRolloutPercent(envVal);
  const bucketId = getBrowserBucketId();
  const optIn = getCloudBetaOptIn();
  const optOut = getCloudBetaOptOut();
  return determineRollout(bucketId, percent, optIn, optOut);
}
