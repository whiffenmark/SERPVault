import { generateContentBriefMarkdown, type ContentBrief } from './content-briefs';
import { getSupabase } from './supabase/client';
import { getCurrentUserId } from './supabase/auth';

export type ContentBriefWorkflowStatus = 'Draft' | 'In Review' | 'Approved' | 'Published' | 'Archived';

export const WORKFLOW_STATUSES: ContentBriefWorkflowStatus[] = ['Draft', 'In Review', 'Approved', 'Published', 'Archived'];

export const STATUS_COLORS: Record<ContentBriefWorkflowStatus, { color: string; bg: string }> = {
  'Draft': { color: 'var(--muted)', bg: 'rgba(100, 116, 139, 0.1)' },
  'In Review': { color: 'var(--warning)', bg: 'rgba(245, 158, 11, 0.1)' },
  'Approved': { color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.1)' },
  'Published': { color: 'var(--success)', bg: 'rgba(16, 185, 129, 0.1)' },
  'Archived': { color: 'rgba(239, 68, 68, 0.8)', bg: 'rgba(239, 68, 68, 0.1)' },
};

export interface ContentBriefWorkflowItem {
  status: ContentBriefWorkflowStatus;
  owner?: string;
  dueDate?: string; // YYYY-MM-DD
  notes?: string;
  checkedItems?: Record<number, boolean>;
  updatedAt?: string;
}

const LOCAL_STORAGE_KEY = 'serpvault_content_brief_workflow';

export function isContentBriefWorkflowStatus(value: unknown): value is ContentBriefWorkflowStatus {
  return typeof value === 'string' && (WORKFLOW_STATUSES as readonly string[]).includes(value);
}

export function sanitizeWorkflowItem(val: unknown): ContentBriefWorkflowItem {
  let status: ContentBriefWorkflowStatus = 'Draft';
  const isObject = typeof val === 'object' && val !== null;
  const obj = isObject ? (val as Record<string, unknown>) : null;

  if (obj && isContentBriefWorkflowStatus(obj['status'])) {
    status = obj['status'];
  }

  const item: ContentBriefWorkflowItem = { status };

  if (obj) {
    if (typeof obj['owner'] === 'string') item.owner = obj['owner'];

    const dueDateInput = obj['dueDate'] !== undefined ? obj['dueDate'] : obj['due_date'];
    if (typeof dueDateInput === 'string') item.dueDate = dueDateInput;

    if (typeof obj['notes'] === 'string') item.notes = obj['notes'];

    const checkedItemsInput = obj['checkedItems'] !== undefined ? obj['checkedItems'] : obj['checked_items'];
    if (typeof checkedItemsInput === 'object' && checkedItemsInput !== null && !Array.isArray(checkedItemsInput)) {
      const checked: Record<number, boolean> = {};
      for (const [chkKey, chkVal] of Object.entries(checkedItemsInput)) {
        const idx = parseInt(chkKey, 10);
        if (!isNaN(idx) && typeof chkVal === 'boolean') {
          checked[idx] = chkVal;
        }
      }
      item.checkedItems = checked;
    } else {
      item.checkedItems = {};
    }

    const updatedAtInput = obj['updatedAt'] !== undefined ? obj['updatedAt'] : obj['updated_at'];
    if (typeof updatedAtInput === 'string') {
      item.updatedAt = updatedAtInput;
    }
  } else {
    item.checkedItems = {};
  }

  return item;
}

export function getContentBriefWorkflowMap(): Record<string, ContentBriefWorkflowItem> {
  if (typeof window === 'undefined') return {};
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!data) return {};
    const parsed = JSON.parse(data);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    const result: Record<string, ContentBriefWorkflowItem> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        result[key] = sanitizeWorkflowItem(value);
      }
    }
    return result;
  } catch (e) {
    console.error('Failed to load content brief workflow from localStorage', e);
    return {};
  }
}

export function saveContentBriefWorkflowMap(map: Record<string, ContentBriefWorkflowItem>) {
  if (typeof window === 'undefined') return;
  try {
    if (typeof map !== 'object' || map === null || Array.isArray(map)) {
      return;
    }
    const sanitized: Record<string, ContentBriefWorkflowItem> = {};
    for (const [key, value] of Object.entries(map)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        sanitized[key] = sanitizeWorkflowItem(value);
      }
    }
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sanitized));

    // Fire-and-forget cloud save if signed in
    saveContentBriefWorkflowMapToCloud(sanitized).catch((err) => {
      console.error('Failed to save content brief workflow map to cloud in fire-and-forget:', err);
    });
  } catch (e) {
    console.error('Failed to save content brief workflow to localStorage', e);
  }
}

export function updateContentBriefWorkflowItem(id: string, patch: Partial<ContentBriefWorkflowItem>): ContentBriefWorkflowItem {
  const map = getContentBriefWorkflowMap();
  const current = map[id] || { status: 'Draft' };

  const updatedItem: ContentBriefWorkflowItem = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString()
  };

  const sanitized = sanitizeWorkflowItem(updatedItem);

  map[id] = sanitized;
  saveContentBriefWorkflowMap(map);
  return sanitized;
}

export async function loadContentBriefWorkflowMap(): Promise<Record<string, ContentBriefWorkflowItem>> {
  const sb = getSupabase();
  if (!sb) return {};
  try {
    const userId = await getCurrentUserId();
    if (!userId) return {};

    const { data, error } = await sb
      .from('content_brief_workflows')
      .select('brief_id, status, owner, due_date, notes, checked_items, updated_at')
      .eq('user_id', userId);

    if (error) {
      console.error('Failed to load content brief workflow from cloud:', error);
      return {};
    }

    const result: Record<string, ContentBriefWorkflowItem> = {};
    for (const row of data || []) {
      const rawItem = {
        status: row.status,
        owner: row.owner ?? undefined,
        dueDate: row.due_date ?? undefined,
        notes: row.notes ?? undefined,
        checkedItems: row.checked_items ?? undefined,
        updatedAt: row.updated_at ?? undefined
      };
      result[row.brief_id] = sanitizeWorkflowItem(rawItem);
    }
    return result;
  } catch (e) {
    console.error('Failed to load content brief workflow from cloud:', e);
    return {};
  }
}

export async function saveContentBriefWorkflowMapToCloud(map: Record<string, ContentBriefWorkflowItem>): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  try {
    const userId = await getCurrentUserId();
    if (!userId) return;

    const rows = Object.entries(map).map(([briefId, item]) => {
      const sanitized = sanitizeWorkflowItem(item);
      return {
        user_id: userId,
        brief_id: briefId,
        status: sanitized.status,
        owner: sanitized.owner ?? null,
        due_date: sanitized.dueDate ?? null,
        notes: sanitized.notes ?? null,
        checked_items: sanitized.checkedItems ?? {},
        updated_at: sanitized.updatedAt || new Date().toISOString()
      };
    });

    if (rows.length === 0) return;

    const { error } = await sb
      .from('content_brief_workflows')
      .upsert(rows, { onConflict: 'user_id,brief_id' });

    if (error) {
      console.error('Failed to save content brief workflow map to cloud:', error);
    }
  } catch (e) {
    console.error('Failed to save content brief workflow map to cloud:', e);
  }
}

export async function saveContentBriefWorkflowItemToCloud(id: string, item: ContentBriefWorkflowItem): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  try {
    const userId = await getCurrentUserId();
    if (!userId) return;

    const sanitized = sanitizeWorkflowItem(item);
    const { error } = await sb
      .from('content_brief_workflows')
      .upsert({
        user_id: userId,
        brief_id: id,
        status: sanitized.status,
        owner: sanitized.owner ?? null,
        due_date: sanitized.dueDate ?? null,
        notes: sanitized.notes ?? null,
        checked_items: sanitized.checkedItems ?? {},
        updated_at: sanitized.updatedAt || new Date().toISOString()
      }, { onConflict: 'user_id,brief_id' });

    if (error) {
      console.error('Failed to save content brief workflow item to cloud:', error);
    }
  } catch (e) {
    console.error('Failed to save content brief workflow item to cloud:', e);
  }
}

export async function getMergedContentBriefWorkflowMap(): Promise<Record<string, ContentBriefWorkflowItem>> {
  const localMap = getContentBriefWorkflowMap();
  const sb = getSupabase();
  if (!sb) return localMap;
  try {
    const userId = await getCurrentUserId();
    if (!userId) return localMap;

    const cloudMap = await loadContentBriefWorkflowMap();
    const merged: Record<string, ContentBriefWorkflowItem> = { ...localMap };

    const getTimestamp = (isoString?: string): number => {
      if (!isoString) return 0;
      const time = Date.parse(isoString);
      return isNaN(time) ? 0 : time;
    };

    for (const [key, cloudItem] of Object.entries(cloudMap)) {
      const localItem = localMap[key];
      if (!localItem) {
        merged[key] = cloudItem;
      } else {
        const localTime = getTimestamp(localItem.updatedAt);
        const cloudTime = getTimestamp(cloudItem.updatedAt);
        if (cloudTime >= localTime) {
          merged[key] = cloudItem;
        }
      }
    }
    return merged;
  } catch (e) {
    console.error('Error merging content brief workflow maps:', e);
    return localMap;
  }
}

export async function updateContentBriefWorkflowItemAsync(
  id: string,
  patch: Partial<ContentBriefWorkflowItem>
): Promise<ContentBriefWorkflowItem> {
  const localMap = getContentBriefWorkflowMap();
  const mergedMap = await getMergedContentBriefWorkflowMap();
  const current = mergedMap[id] || { status: 'Draft' };

  const updatedItem: ContentBriefWorkflowItem = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString()
  };

  const sanitized = sanitizeWorkflowItem(updatedItem);

  localMap[id] = sanitized;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(localMap));
    } catch (e) {
      console.error('Failed to save local map to localStorage in async update:', e);
    }
  }

  await saveContentBriefWorkflowItemToCloud(id, sanitized);

  return sanitized;
}

export function generateContentBriefMarkdownWithWorkflow(brief: ContentBrief, workflowItem?: ContentBriefWorkflowItem): string {
  let md = generateContentBriefMarkdown(brief);
  if (!workflowItem) return md;

  const checkedCount = workflowItem.checkedItems
    ? Object.values(workflowItem.checkedItems).filter(Boolean).length
    : 0;
  const totalChecklist = 10;

  let workflowSection = `\n## Editorial Workflow Status
- **Workflow Status:** ${workflowItem.status}
`;
  if (workflowItem.owner) {
    workflowSection += `- **Owner:** ${workflowItem.owner}\n`;
  }
  if (workflowItem.dueDate) {
    workflowSection += `- **Due Date:** ${workflowItem.dueDate}\n`;
  }
  workflowSection += `- **Checklist Progress:** ${checkedCount} / ${totalChecklist} tasks completed\n`;
  if (workflowItem.notes) {
    workflowSection += `- **Editorial Notes:** ${workflowItem.notes}\n`;
  }
  if (workflowItem.updatedAt) {
    workflowSection += `- **Last Updated:** ${new Date(workflowItem.updatedAt).toLocaleString()}\n`;
  }

  md = md.replace('## 2. Target Keywords', `${workflowSection.trim()}\n\n## 2. Target Keywords`);

  if (workflowItem.checkedItems) {
    const lines = md.split('\n');
    let checklistIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('- [ ]')) {
        if (workflowItem.checkedItems[checklistIndex]) {
          lines[i] = lines[i].replace('- [ ]', '- [x]');
        }
        checklistIndex++;
      }
    }
    md = lines.join('\n');
  }

  return md;
}
