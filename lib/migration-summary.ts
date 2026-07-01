import type { AppStore } from './types';

export interface MigrationSummary {
  perTableCounts: {
    projects: number;
    competitors: number;
    uploads: number;
    dedupeReports: number;
    keywords: number;
    keywordGaps: number;
    competitorPages: number;
    backlinks: number;
    referringDomains: number;
    anchorTexts: number;
  };
  totalRows: number;
  estimatedStorage: string;
  supabaseAvailable: boolean;
  userSignedIn: boolean;
  isSignedInRequiredStatusMet: boolean;
  canMigrate: boolean;
  warnings: string[];
}

/**
 * Builds a local data migration summary from browser/local store data.
 * Pure function with no direct dependency on browser globals like `localStorage` or `window`.
 */
export function buildMigrationSummary(
  store: AppStore,
  supabaseAvailable: boolean,
  userSignedIn: boolean,
  estimatedStorageBytes?: number
): MigrationSummary {
  const counts = {
    projects: store.projects?.length || 0,
    competitors: store.competitors?.length || 0,
    uploads: store.uploads?.length || 0,
    dedupeReports: store.dedupeReports?.length || 0,
    keywords: store.keywords?.length || 0,
    keywordGaps: store.keywordGaps?.length || 0,
    competitorPages: store.competitorPages?.length || 0,
    backlinks: store.backlinks?.length || 0,
    referringDomains: store.referringDomains?.length || 0,
    anchorTexts: store.anchorTexts?.length || 0,
  };

  const totalRows =
    counts.projects +
    counts.competitors +
    counts.uploads +
    counts.dedupeReports +
    counts.keywords +
    counts.keywordGaps +
    counts.competitorPages +
    counts.backlinks +
    counts.referringDomains +
    counts.anchorTexts;

  let storageSizeStr = '0.0 KB';
  if (estimatedStorageBytes !== undefined) {
    storageSizeStr = estimatedStorageBytes > 1024 * 1024
      ? `${(estimatedStorageBytes / 1024 / 1024).toFixed(2)} MB`
      : `${(estimatedStorageBytes / 1024).toFixed(1)} KB`;
  } else {
    try {
      const serialized = JSON.stringify(store);
      let bytes = 0;
      if (typeof Blob !== 'undefined') {
        bytes = new Blob([serialized]).size;
      } else if (typeof TextEncoder !== 'undefined') {
        bytes = new TextEncoder().encode(serialized).length;
      } else {
        bytes = serialized.length;
      }
      storageSizeStr = bytes > 1024 * 1024
        ? `${(bytes / 1024 / 1024).toFixed(2)} MB`
        : `${(bytes / 1024).toFixed(1)} KB`;
    } catch {
      storageSizeStr = 'Unknown';
    }
  }

  const warnings: string[] = [];
  if (totalRows === 0) {
    warnings.push('Local database is empty. There is no data to migrate.');
  }
  if (!userSignedIn) {
    warnings.push('You must be signed in to your Supabase account to migrate data to the cloud.');
  }
  if (!supabaseAvailable) {
    warnings.push('Supabase is not configured. Cloud sync features are disabled.');
  }

  const isSignedInRequiredStatusMet = userSignedIn;
  const canMigrate = supabaseAvailable && userSignedIn;

  return {
    perTableCounts: counts,
    totalRows,
    estimatedStorage: storageSizeStr,
    supabaseAvailable,
    userSignedIn,
    isSignedInRequiredStatusMet,
    canMigrate,
    warnings,
  };
}
