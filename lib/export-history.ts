import { nanoid } from './nanoid';

export interface ExportHistoryItem {
  id: string;
  title: string;
  category: string;
  scopeLabel: string;
  scopeSlug: string;
  generatedAt: string;
  details: string;
  count: string;
}

const STORAGE_KEY = 'serpvault_export_history';
const MAX_HISTORY_ITEMS = 50;

/**
 * Retrieves the local export history.
 * SSR-safe and resilient to localStorage failures.
 */
export function getExportHistory(): ExportHistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item): item is Record<string, unknown> => {
          return item !== null && typeof item === 'object';
        })
        .map((item) => ({
          id: typeof item.id === 'string' ? item.id : String(item.id || ''),
          title: typeof item.title === 'string' ? item.title : String(item.title || ''),
          category: typeof item.category === 'string' ? item.category : String(item.category || ''),
          scopeLabel: typeof item.scopeLabel === 'string' ? item.scopeLabel : String(item.scopeLabel || ''),
          scopeSlug: typeof item.scopeSlug === 'string' ? item.scopeSlug : String(item.scopeSlug || ''),
          generatedAt: typeof item.generatedAt === 'string' ? item.generatedAt : String(item.generatedAt || ''),
          details: typeof item.details === 'string' ? item.details : String(item.details || ''),
          count: typeof item.count === 'string' ? item.count : String(item.count || ''),
        }))
        .filter((item) => item.id.trim() !== '' && item.title.trim() !== '');
    }
    return [];
  } catch (e) {
    console.warn('Failed to get export history:', e);
    return [];
  }
}

/**
 * Adds an item to the export history.
 * Keeps the list sorted with the newest item first, capped at MAX_HISTORY_ITEMS.
 * SSR-safe and resilient to localStorage failures.
 */
export function addExportHistoryItem(item: Omit<ExportHistoryItem, 'id' | 'generatedAt'>): ExportHistoryItem[] {
  if (typeof window === 'undefined') return [];

  const newItem: ExportHistoryItem = {
    ...item,
    id: nanoid(),
    generatedAt: new Date().toISOString(),
  };

  const history = getExportHistory();
  // Keep it ordered newest first and capped at MAX_HISTORY_ITEMS
  const updated = [newItem, ...history].slice(0, MAX_HISTORY_ITEMS);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('Failed to save export history item:', e);
  }

  return updated;
}

/**
 * Clears the local export history.
 * SSR-safe and resilient to localStorage failures.
 */
export function clearExportHistory(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to clear export history:', e);
  }
}
