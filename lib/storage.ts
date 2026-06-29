import type { AppStore, ProjectRecord } from './types';

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
  projects: [],
  competitors: [],
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

// --- Project/Site Selector ---

export type SiteSelection = {
  domain: string;
  location: string;
  niche: string;
} | null;

export type SiteScopedRow = {
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
  uploadId?: string;
};

export function getSelectedProjectId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('serpvault_selected_project_id') || null;
}

export function setSelectedProjectId(id: string | null): void {
  if (typeof window === 'undefined') return;
  if (id) {
    localStorage.setItem('serpvault_selected_project_id', id);
  } else {
    localStorage.removeItem('serpvault_selected_project_id');
  }
}

export function getSelectedProject(): ProjectRecord | null {
  const id = getSelectedProjectId();
  if (!id) return null;
  return getStore().projects.find((p) => p.id === id) || null;
}

export function getSelectedSite(): SiteSelection {
  if (typeof window === 'undefined') return null;
  const projectId = getSelectedProjectId();
  if (!projectId) return null;
  const store = getStore();
  const project = (store.projects || []).find((p) => p.id === projectId);
  if (!project) return null;
  return {
    domain: project.domain,
    location: project.location || '',
    niche: project.niche || '',
  };
}

export function setSelectedSite(site: SiteSelection): void {
  if (typeof window === 'undefined') return;
  if (!site) {
    setSelectedProjectId(null);
    return;
  }
  const store = getStore();
  const project = (store.projects || []).find(
    (p) =>
      p.domain === site.domain &&
      (p.location || '') === (site.location || '') &&
      (p.niche || '') === (site.niche || '')
  );
  if (project) {
    setSelectedProjectId(project.id);
  } else {
    const projectByDomain = (store.projects || []).find((p) => p.domain === site.domain);
    if (projectByDomain) {
      setSelectedProjectId(projectByDomain.id);
    } else {
      setSelectedProjectId(null);
    }
  }
}

function normalizeScopeValue(value?: string): string {
  const trimmed = value?.toString().trim();
  return trimmed || '-';
}

/** Explicit project/client/owned-site fields for domain auto-detection. */
const EXPLICIT_PROJECT_DOMAIN_KEYS = [
  'project_domain',
  'project domain',
  'project site',
  'project site domain',
  'client_domain',
  'client domain',
  'client website',
  'client site',
  'site_domain',
  'site domain',
  'yourDomain',
  'your domain',
  'your website',
  'your site',
  'target project',
  'target project domain',
];

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

/**
 * Detects the project/site scope for a given row.
 * Strict rules: Only auto-detect project domain if explicit project/client/owned-site fields exist.
 * Do not fallback to generic/competitor SEO domains or URLs.
 * If project domain exists, location and niche are extracted from explicit fields.
 */
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
  let location = '';
  let niche = '';

  // Requirement 1 & 2: Only detect project domains via explicit fields.
  // Never fallback to generic 'domain', competitor pages URL, backlinks target/source, etc.
  const explicitDomainVal = getFieldValue(row, EXPLICIT_PROJECT_DOMAIN_KEYS);
  if (explicitDomainVal && explicitDomainVal !== '-') {
    domain = extractDomain(explicitDomainVal);
    // Requirement 3: Extract location and niche only if a valid project domain exists.
    if (domain) {
      location = getExplicitLocation() || '';
      niche = getExplicitNiche() || '';
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
  if (!site) return rows;
  const store = getStore();
  const selectedProjectId = getSelectedProjectId();
  return rows.filter((row) => {
    if (row.uploadId) {
      const upload = store.uploads.find((u) => u.id === row.uploadId);
      if (upload && upload.projectId) {
        return upload.projectId === selectedProjectId;
      }
    }
    // Legacy fallback
    return rowMatchesSiteSelection(row, site);
  });
}

export function siteSelectionLabel(site: SiteSelection): string {
  if (!site) return 'All Projects';
  const store = getStore();
  const project = (store.projects || []).find(
    (p) =>
      p.domain === site.domain &&
      (p.location || '') === (site.location || '') &&
      (p.niche || '') === (site.niche || '')
  );
  if (project) return project.name;
  return `${site.domain} / ${site.location} / ${site.niche}`;
}

export function siteSelectionSlug(site: SiteSelection): string {
  if (!site) return 'all-projects';
  return [site.domain, site.location, site.niche]
    .map((part) => normalizeScopeValue(part).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
    .filter(Boolean)
    .join('-') || 'selected-project';
}
