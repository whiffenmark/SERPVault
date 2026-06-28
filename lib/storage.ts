import type { AppStore } from './types';

const STORAGE_KEY = 'serpvault_data';

const defaultStore: AppStore = {
  uploads: [],
  keywords: [],
  keywordGaps: [],
  competitorPages: [],
  backlinks: [],
  referringDomains: [],
  anchorTexts: [],
  dedupeReports: [],
};

export function getStore(): AppStore {
  if (typeof window === 'undefined') return defaultStore;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultStore };
    return { ...defaultStore, ...JSON.parse(raw) };
  } catch {
    return { ...defaultStore };
  }
}

export function saveStore(store: AppStore): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (e) {
    console.error('Storage save failed:', e);
  }
}

export function updateStore(updater: (store: AppStore) => AppStore): AppStore {
  const current = getStore();
  const next = updater(current);
  saveStore(next);
  return next;
}

export function clearStore(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

/** Remove all data associated with a single upload ID. */
export function removeUpload(uploadId: string): void {
  updateStore((store) => ({
    ...store,
    uploads: store.uploads.filter((u) => u.id !== uploadId),
    keywords: store.keywords.filter((r) => r.uploadId !== uploadId),
    keywordGaps: store.keywordGaps.filter((r) => r.uploadId !== uploadId),
    competitorPages: store.competitorPages.filter((r) => r.uploadId !== uploadId),
    backlinks: store.backlinks.filter((r) => r.uploadId !== uploadId),
    referringDomains: store.referringDomains.filter((r) => r.uploadId !== uploadId),
    anchorTexts: store.anchorTexts.filter((r) => r.uploadId !== uploadId),
    dedupeReports: store.dedupeReports.filter((r) => r.uploadId !== uploadId),
  }));
}

// --- Project/Site Selector (localStorage only, PR #8) ---
const SITE_KEY = 'serpvault_selected_site';

export type SiteSelection = {
  domain: string;
  location: string;
  niche: string;
} | null;

type SiteScopedRow = {
  country?: string;
  database?: string;
  domain?: string;
  location?: string;
  raw?: Record<string, string>;
};

export function getSelectedSite(): SiteSelection {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SITE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setSelectedSite(site: SiteSelection): void {
  if (typeof window === 'undefined') return;
  if (site) {
    localStorage.setItem(SITE_KEY, JSON.stringify(site));
  } else {
    localStorage.removeItem(SITE_KEY);
  }
}

function normalizeScopeValue(value?: string): string {
  const trimmed = value?.toString().trim();
  return trimmed || '-';
}

function firstScopeValue(row: SiteScopedRow, keys: string[], fallbacks: Array<string | undefined> = []): string {
  const raw = row.raw || {};
  for (const key of keys) {
    const direct = raw[key];
    if (direct?.toString().trim()) return normalizeScopeValue(direct);

    const match = Object.keys(raw).find((rawKey) => rawKey.toLowerCase() === key.toLowerCase());
    if (match && raw[match]?.toString().trim()) return normalizeScopeValue(raw[match]);
  }

  for (const fallback of fallbacks) {
    if (fallback?.toString().trim()) return normalizeScopeValue(fallback);
  }

  return '-';
}

export function getRowSiteScope(row: SiteScopedRow): NonNullable<SiteSelection> {
  return {
    domain: firstScopeValue(row, ['domain'], [row.domain]),
    location: firstScopeValue(row, ['location', 'country', 'database'], [row.location, row.country, row.database]),
    niche: firstScopeValue(row, ['niche']),
  };
}

export function rowMatchesSiteSelection(row: SiteScopedRow, site: SiteSelection): boolean {
  if (!site) return true;

  const rowScope = getRowSiteScope(row);
  const matches = (selected: string, actual: string) => {
    const selectedValue = normalizeScopeValue(selected);
    return selectedValue === '-' || actual === selectedValue;
  };

  return (
    matches(site.domain, rowScope.domain) &&
    matches(site.location, rowScope.location) &&
    matches(site.niche, rowScope.niche)
  );
}

export function filterRowsBySite<T extends SiteScopedRow>(rows: T[], site: SiteSelection): T[] {
  return site ? rows.filter((row) => rowMatchesSiteSelection(row, site)) : rows;
}

export function siteSelectionLabel(site: SiteSelection): string {
  return site ? `${site.domain} / ${site.location} / ${site.niche}` : 'All Projects';
}

export function siteSelectionSlug(site: SiteSelection): string {
  if (!site) return 'all-projects';
  return [site.domain, site.location, site.niche]
    .map((part) => normalizeScopeValue(part).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
    .filter(Boolean)
    .join('-') || 'selected-project';
}
