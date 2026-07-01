import { getSupabase } from './supabase/client';
import { getCurrentUserId } from './supabase/auth';

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

    // Fire-and-forget cloud save if signed in
    saveOpportunityWorkflowMapToCloud(sanitized).catch((err) => {
      console.error('Failed to save opportunity workflow map to cloud in fire-and-forget:', err);
    });
  } catch (e) {
    console.error('Failed to save opportunity workflow to localStorage', e);
  }
}

export async function loadOpportunityWorkflowMap(): Promise<Record<string, OpportunityWorkflowStatus>> {
  const sb = getSupabase();
  if (!sb) return {};
  try {
    const userId = await getCurrentUserId();
    if (!userId) return {};

    const { data, error } = await sb
      .from('opportunity_workflow_items')
      .select('opportunity_id, status')
      .eq('user_id', userId);

    if (error) {
      console.error('Failed to load opportunity workflow from cloud:', error);
      return {};
    }

    const result: Record<string, OpportunityWorkflowStatus> = {};
    for (const row of data || []) {
      if (isOpportunityWorkflowStatus(row.status)) {
        result[row.opportunity_id] = row.status;
      }
    }
    return result;
  } catch (e) {
    console.error('Failed to load opportunity workflow from cloud:', e);
    return {};
  }
}

export async function saveOpportunityWorkflowMapToCloud(map: Record<string, OpportunityWorkflowStatus>): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  try {
    const userId = await getCurrentUserId();
    if (!userId) return;

    const rows = Object.entries(map)
      .filter(([_, status]) => isOpportunityWorkflowStatus(status))
      .map(([id, status]) => ({
        user_id: userId,
        opportunity_id: id,
        status,
        updated_at: new Date().toISOString()
      }));

    if (rows.length === 0) return;

    const { error } = await sb
      .from('opportunity_workflow_items')
      .upsert(rows, { onConflict: 'user_id,opportunity_id' });

    if (error) {
      console.error('Failed to save opportunity workflow to cloud:', error);
    }
  } catch (e) {
    console.error('Failed to save opportunity workflow to cloud:', e);
  }
}

export async function saveOpportunityWorkflowStatusToCloud(
  id: string,
  status: OpportunityWorkflowStatus,
  metadata?: Record<string, unknown>
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  try {
    const userId = await getCurrentUserId();
    if (!userId) return;
    if (!isOpportunityWorkflowStatus(status)) return;

    const { error } = await sb
      .from('opportunity_workflow_items')
      .upsert({
        user_id: userId,
        opportunity_id: id,
        status,
        metadata: metadata ?? {},
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,opportunity_id' });

    if (error) {
      console.error('Failed to save opportunity workflow status to cloud:', error);
    }
  } catch (e) {
    console.error('Failed to save opportunity workflow status to cloud:', e);
  }
}

export async function getMergedOpportunityWorkflowMap(): Promise<Record<string, OpportunityWorkflowStatus>> {
  const localMap = getOpportunityWorkflowMap();
  const sb = getSupabase();
  if (!sb) return localMap;
  try {
    const userId = await getCurrentUserId();
    if (!userId) return localMap;

    const cloudMap = await loadOpportunityWorkflowMap();
    return {
      ...localMap,
      ...cloudMap
    };
  } catch (e) {
    console.error('Error merging opportunity workflow maps:', e);
    return localMap;
  }
}
