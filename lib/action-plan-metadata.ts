export interface ActionPlanItemMetadata {
  owner?: string;
  dueDate?: string; // YYYY-MM-DD
  notes?: string;
  updatedAt?: string;
}

const LOCAL_STORAGE_KEY = 'serpvault_action_plan_metadata';

export function getActionPlanMetadataMap(): Record<string, ActionPlanItemMetadata> {
  if (typeof window === 'undefined') return {};
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!data) return {};
    const parsed = JSON.parse(data);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    const result: Record<string, ActionPlanItemMetadata> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const val = value as Record<string, unknown>;
        const metadata: ActionPlanItemMetadata = {};
        if (typeof val.owner === 'string') metadata.owner = val.owner;
        if (typeof val.dueDate === 'string') metadata.dueDate = val.dueDate;
        if (typeof val.notes === 'string') metadata.notes = val.notes;
        if (typeof val.updatedAt === 'string') metadata.updatedAt = val.updatedAt;
        result[key] = metadata;
      }
    }
    return result;
  } catch (e) {
    console.error('Failed to load action plan metadata from localStorage', e);
    return {};
  }
}

export function saveActionPlanMetadataMap(map: Record<string, ActionPlanItemMetadata>) {
  if (typeof window === 'undefined') return;
  try {
    if (typeof map !== 'object' || map === null || Array.isArray(map)) {
      return;
    }
    const sanitized: Record<string, ActionPlanItemMetadata> = {};
    for (const [key, value] of Object.entries(map)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const val = value as Record<string, unknown>;
        const metadata: ActionPlanItemMetadata = {};
        if (typeof val.owner === 'string') metadata.owner = val.owner;
        if (typeof val.dueDate === 'string') metadata.dueDate = val.dueDate;
        if (typeof val.notes === 'string') metadata.notes = val.notes;
        if (typeof val.updatedAt === 'string') metadata.updatedAt = val.updatedAt;
        sanitized[key] = metadata;
      }
    }
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sanitized));
  } catch (e) {
    console.error('Failed to save action plan metadata to localStorage', e);
  }
}

export function updateActionPlanItemMetadata(id: string, patch: Partial<ActionPlanItemMetadata>) {
  const map = getActionPlanMetadataMap();
  const current = map[id] || {};
  const updatedItem: ActionPlanItemMetadata = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString()
  };
  map[id] = updatedItem;
  saveActionPlanMetadataMap(map);
  return updatedItem;
}
