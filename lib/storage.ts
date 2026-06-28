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
  url?: string;
  targetUrl?: string;
  sourceUrl?: string;
  referringDomain?: string;
  targetDomain?: string;
  yourDomain?: string;
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

function extractDomain(val: string): string {
  if (!val) return '';
  let str = val.trim();
  if (!str || str === '-') return '';
  let hostname = '';
  try {
    hostname = new URL(str.includes('://') ? str : `https://${str}`).hostname;
  } catch {
    hostname = str.split('/')[0];
  }
  hostname = hostname.split(':')[0];
  hostname = hostname.replace(/^www\./i, '');
  return hostname.trim();
}

function getFieldValue(row: any, keys: string[]): string | undefined {
  const r = row.raw || {};
  const normalizeKey = (k: string) => k.toLowerCase().replace(/[\s_-]+/g, '');
  const normalizedSearchKeys = keys.map(normalizeKey);

  for (const rawKey of Object.keys(r)) {
    if (normalizedSearchKeys.includes(normalizeKey(rawKey))) {
      const val = r[rawKey];
      if (val !== undefined && val !== null) {
        const trimmed = val.toString().trim();
        if (trimmed) return trimmed;
      }
    }
  }

  for (const propKey of Object.keys(row)) {
    if (normalizedSearchKeys.includes(normalizeKey(propKey))) {
      const val = row[propKey];
      if (val !== undefined && val !== null) {
        const trimmed = val.toString().trim();
        if (trimmed) return trimmed;
      }
    }
  }

  return undefined;
}

export function getRowSiteScope(row: any): NonNullable<SiteSelection> {
  const getExplicitLocation = () => {
    const r = row.raw || {};
    const val = r.location ?? r.Location ?? r.country ?? r.Country ?? r.database ?? r.Database ?? row.location ?? row.country ?? row.database;
    return val !== undefined && val !== null ? val.toString().trim() : undefined;
  };

  const getExplicitNiche = () => {
    const r = row.raw || {};
    const val = r.niche ?? r.Niche ?? row.niche;
    return val !== undefined && val !== null ? val.toString().trim() : undefined;
  };

  let domain = '';
  const location = getExplicitLocation();
  const niche = getExplicitNiche();

  const hasBacklinkFields = row.targetUrl !== undefined || row.sourceUrl !== undefined ||
    getFieldValue(row, ['targetUrl', 'sourceUrl']) !== undefined;

  const hasReferringDomainFields = row.referringDomain !== undefined || row.targetDomain !== undefined ||
    getFieldValue(row, ['referringDomain', 'targetDomain']) !== undefined;

  if (hasBacklinkFields) {
    const targetKeys = ['targetUrl', 'target domain', 'to domain', 'destination domain', 'your domain'];
    const targetVal = getFieldValue(row, targetKeys) || row.targetUrl;
    if (targetVal && targetVal !== '-') {
      domain = extractDomain(targetVal);
    } else {
      const fallbackKeys = ['sourceUrl', 'source domain', 'referring domain', 'referringDomain', 'from domain', 'domain'];
      const fallbackVal = getFieldValue(row, fallbackKeys) || row.sourceUrl || row.domain;
      if (fallbackVal && fallbackVal !== '-') {
        domain = extractDomain(fallbackVal);
      }
    }
  } else if (hasReferringDomainFields) {
    const targetKeys = ['targetDomain', 'target domain', 'destination domain', 'your domain'];
    const targetVal = getFieldValue(row, targetKeys) || row.targetDomain;
    if (targetVal && targetVal !== '-') {
      domain = extractDomain(targetVal);
    } else {
      const fallbackKeys = ['referringDomain', 'referring domain', 'domain'];
      const fallbackVal = getFieldValue(row, fallbackKeys) || row.referringDomain || row.domain;
      if (fallbackVal && fallbackVal !== '-') {
        domain = extractDomain(fallbackVal);
      }
    }
  } else {
    const hasUrlField = row.url !== undefined || getFieldValue(row, ['url']) !== undefined;
    const hasKeywordField = row.keyword !== undefined || getFieldValue(row, ['keyword']) !== undefined;
    const isCompetitorPage = hasUrlField && !hasKeywordField;

    if (isCompetitorPage) {
      const domainVal = getFieldValue(row, ['domain']) || row.domain;
      if (domainVal && domainVal !== '-') {
        domain = extractDomain(domainVal);
      } else {
        const urlVal = getFieldValue(row, ['url']) || row.url;
        if (urlVal && urlVal !== '-') {
          domain = extractDomain(urlVal);
        }
      }
    } else {
      const domainVal = getFieldValue(row, ['domain']) || row.domain;
      if (domainVal && domainVal !== '-') {
        domain = extractDomain(domainVal);
      } else {
        const yourDomainVal = getFieldValue(row, ['yourDomain', 'your domain']) || row.yourDomain;
        if (yourDomainVal && yourDomainVal !== '-') {
          domain = extractDomain(yourDomainVal);
        }
      }
    }
  }

  return {
    domain: normalizeScopeValue(domain),
    location: normalizeScopeValue(location),
    niche: normalizeScopeValue(niche),
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
