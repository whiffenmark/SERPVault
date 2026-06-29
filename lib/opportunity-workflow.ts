export type OpportunityWorkflowStatus = 'New' | 'Planned' | 'In Progress' | 'Done' | 'Ignored';

export const WORKFLOW_STATUSES: OpportunityWorkflowStatus[] = ['New', 'Planned', 'In Progress', 'Done', 'Ignored'];

export const STATUS_COLORS: Record<OpportunityWorkflowStatus, { color: string; bg: string }> = {
  'New': { color: 'var(--accent)', bg: 'rgba(99, 102, 241, 0.1)' },
  'Planned': { color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.1)' },
  'In Progress': { color: 'var(--warning)', bg: 'rgba(245, 158, 11, 0.1)' },
  'Done': { color: 'var(--success)', bg: 'rgba(16, 185, 129, 0.1)' },
  'Ignored': { color: 'var(--muted)', bg: 'rgba(100, 116, 139, 0.1)' },
};

const LOCAL_STORAGE_KEY = 'serpvault_opportunity_workflow';

export function isOpportunityWorkflowStatus(value: unknown): value is OpportunityWorkflowStatus {
  return typeof value === 'string' && (WORKFLOW_STATUSES as readonly string[]).includes(value);
}

export function getOpportunityWorkflowMap(): Record<string, OpportunityWorkflowStatus> {
  if (typeof window === 'undefined') return {};
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!data) return {};
    const parsed = JSON.parse(data);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    const result: Record<string, OpportunityWorkflowStatus> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (isOpportunityWorkflowStatus(value)) {
        result[key] = value;
      }
    }
    return result;
  } catch (e) {
    console.error('Failed to load opportunity workflow from localStorage', e);
    return {};
  }
}

export function saveOpportunityWorkflowMap(map: Record<string, OpportunityWorkflowStatus>) {
  if (typeof window === 'undefined') return;
  try {
    if (typeof map !== 'object' || map === null || Array.isArray(map)) {
      return;
    }
    const sanitized: Record<string, OpportunityWorkflowStatus> = {};
    for (const [key, value] of Object.entries(map)) {
      if (isOpportunityWorkflowStatus(value)) {
        sanitized[key] = value;
      }
    }
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sanitized));
  } catch (e) {
    console.error('Failed to save opportunity workflow to localStorage', e);
  }
}

