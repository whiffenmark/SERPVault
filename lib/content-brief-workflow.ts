import { generateContentBriefMarkdown, type ContentBrief } from './content-briefs';

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
        const val = value as Record<string, unknown>;

        let status: ContentBriefWorkflowStatus = 'Draft';
        if (isContentBriefWorkflowStatus(val.status)) {
          status = val.status;
        }

        const item: ContentBriefWorkflowItem = { status };

        if (typeof val.owner === 'string') item.owner = val.owner;
        if (typeof val.dueDate === 'string') item.dueDate = val.dueDate;
        if (typeof val.notes === 'string') item.notes = val.notes;

        if (typeof val.checkedItems === 'object' && val.checkedItems !== null && !Array.isArray(val.checkedItems)) {
          const checked: Record<number, boolean> = {};
          for (const [chkKey, chkVal] of Object.entries(val.checkedItems)) {
            const idx = parseInt(chkKey, 10);
            if (!isNaN(idx) && typeof chkVal === 'boolean') {
              checked[idx] = chkVal;
            }
          }
          item.checkedItems = checked;
        }

        if (typeof val.updatedAt === 'string') item.updatedAt = val.updatedAt;

        result[key] = item;
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
        const val = value as unknown as Record<string, unknown>;

        let status: ContentBriefWorkflowStatus = 'Draft';
        if (isContentBriefWorkflowStatus(val.status)) {
          status = val.status;
        }

        const item: ContentBriefWorkflowItem = { status };

        if (typeof val.owner === 'string') item.owner = val.owner;
        if (typeof val.dueDate === 'string') item.dueDate = val.dueDate;
        if (typeof val.notes === 'string') item.notes = val.notes;

        if (typeof val.checkedItems === 'object' && val.checkedItems !== null && !Array.isArray(val.checkedItems)) {
          const checked: Record<number, boolean> = {};
          for (const [chkKey, chkVal] of Object.entries(val.checkedItems)) {
            const idx = parseInt(chkKey, 10);
            if (!isNaN(idx) && typeof chkVal === 'boolean') {
              checked[idx] = chkVal;
            }
          }
          item.checkedItems = checked;
        }

        if (typeof val.updatedAt === 'string') item.updatedAt = val.updatedAt;

        sanitized[key] = item;
      }
    }
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sanitized));
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

  map[id] = updatedItem;
  saveContentBriefWorkflowMap(map);
  return updatedItem;
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
