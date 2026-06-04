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
