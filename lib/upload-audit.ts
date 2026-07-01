/**
 * lib/upload-audit.ts — Typed helpers for upload audit logs.
 */

import { getSupabase } from './supabase/client';
import { getCurrentUserId } from './supabase/auth';

export interface UploadAuditLogInput {
  uploadId: string;
  filename: string;
  reportType: string;
  projectId?: string;
  sourceTool?: string;
  rowCount: number;
  cleanedRowCount: number;
  duplicatesRemoved: number;
  dedupeRate: number;
  dedupeReportId: string;
  eventType: 'import' | 'reimport';
  metadata?: Record<string, unknown>;
}

export interface UploadAuditLog {
  id: string;
  userId: string;
  uploadId: string | null;
  filename: string | null;
  reportType: string | null;
  projectId: string | null;
  sourceTool: string | null;
  rowCount: number;
  cleanedRowCount: number;
  duplicatesRemoved: number;
  dedupeRate: number;
  dedupeReportId: string | null;
  eventType: 'import' | 'reimport';
  createdAt: string;
  metadata: Record<string, unknown>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromAuditRow(r: any): UploadAuditLog {
  return {
    id: r.id,
    userId: r.user_id,
    uploadId: r.upload_id,
    filename: r.filename,
    reportType: r.report_type,
    projectId: r.project_id,
    sourceTool: r.source_tool,
    rowCount: Number(r.row_count || 0),
    cleanedRowCount: Number(r.cleaned_row_count || 0),
    duplicatesRemoved: Number(r.duplicates_removed || 0),
    dedupeRate: Number(r.dedupe_rate || 0),
    dedupeReportId: r.dedupe_report_id,
    eventType: r.event_type || 'import',
    createdAt: r.created_at,
    metadata: r.metadata || {},
  };
}

/**
 * Persists an upload audit log entry.
 * If Supabase is not configured or user is not signed in, logs a local trace and returns.
 */
export async function saveUploadAuditLog(input: UploadAuditLogInput): Promise<void> {
  const sanitized = {
    upload_id: input.uploadId || null,
    filename: input.filename || null,
    report_type: input.reportType || null,
    project_id: input.projectId || null,
    source_tool: input.sourceTool || null,
    row_count: typeof input.rowCount === 'number' ? input.rowCount : 0,
    cleaned_row_count: typeof input.cleanedRowCount === 'number' ? input.cleanedRowCount : 0,
    duplicates_removed: typeof input.duplicatesRemoved === 'number' ? input.duplicatesRemoved : 0,
    dedupe_rate: typeof input.dedupeRate === 'number' ? input.dedupeRate : 0,
    dedupe_report_id: input.dedupeReportId || null,
    event_type: input.eventType || 'import',
    metadata: input.metadata || {},
  };

  const sb = getSupabase();
  if (!sb) {
    console.log('[upload-audit] Local mode no-op: skipped persisting audit log to cloud:', sanitized);
    return;
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    console.log('[upload-audit] Anonymous user: skipped persisting audit log to cloud:', sanitized);
    return;
  }

  try {
    const { error } = await sb.from('upload_audit_logs').insert({
      ...sanitized,
      user_id: userId,
    });
    if (error) {
      console.error('[upload-audit] failed to insert audit log to Supabase:', error.message);
    }
  } catch (err) {
    console.error('[upload-audit] exception inserting audit log:', err);
  }
}

/**
 * Retrieves all upload audit logs for the authenticated user.
 * Returns empty array if not configured/signed in.
 */
export async function getUploadAuditLogs(): Promise<UploadAuditLog[]> {
  const sb = getSupabase();
  if (!sb) return [];

  const userId = await getCurrentUserId();
  if (!userId) return [];

  try {
    const { data, error } = await sb
      .from('upload_audit_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[upload-audit] failed to fetch audit logs:', error.message);
      return [];
    }
    return (data || []).map(fromAuditRow);
  } catch (err) {
    console.error('[upload-audit] exception fetching audit logs:', err);
    return [];
  }
}
