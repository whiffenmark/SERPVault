'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import * as db from '@/lib/db';
import type { UploadRecord, ProjectRecord, ReportType } from '@/lib/types';
import Card from '@/components/Card';

const REPORT_LABELS: Record<ReportType, string> = {
  keyword: 'Keyword Report',
  keyword_gap: 'Keyword Gap Report',
  competitor_pages: 'Competitor Top Pages',
  backlink: 'Backlink Report',
  referring_domain: 'Referring Domains',
  anchor_text: 'Anchor Text Report',
  organic_positions: 'Organic Positions',
  unknown: 'Unknown / Pending',
};

export default function UploadLibraryPage() {
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter and search state
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  // Checkbox selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Status message state
  const [status, setStatus] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: 'delete_single' | 'delete_bulk' | 'assign_bulk';
    title: string;
    affectedUploads: UploadRecord[];
    targetProjectId?: string;
    targetProjectName?: string;
  }>({
    isOpen: false,
    type: 'delete_single',
    title: '',
    affectedUploads: [],
  });

  const showStatus = (text: string, type: 'success' | 'error' = 'success') => {
    setStatus({ text, type });
  };

  useEffect(() => {
    if (status) {
      const timer = setTimeout(() => {
        setStatus(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  const modalCleanedRows = useMemo(() => {
    return confirmModal.affectedUploads.reduce((sum, u) => sum + (u.cleanedRowCount || 0), 0);
  }, [confirmModal.affectedUploads]);

  const renderFileList = (files: string[]) => {
    if (files.length === 0) return null;
    const maxToShow = 3;
    const shown = files.slice(0, maxToShow);
    const remaining = files.length - maxToShow;

    return (
      <ul style={{ margin: '0.35rem 0 0.35rem 1.2rem', padding: 0, color: 'var(--foreground)', fontSize: '0.85rem' }}>
        {shown.map((name, i) => (
          <li key={i} style={{ wordBreak: 'break-all', marginBottom: '0.2rem' }}>{name}</li>
        ))}
        {remaining > 0 && (
          <li style={{ listStyleType: 'none', color: 'var(--muted)', fontStyle: 'italic', marginLeft: '-1.2rem', marginTop: '0.2rem' }}>
            and {remaining} more
          </li>
        )}
      </ul>
    );
  };

  // Load uploads and projects from db
  const refreshData = async () => {
    try {
      const [u, p] = await Promise.all([
        db.getUploads(),
        db.getProjects(),
      ]);
      setUploads(u || []);
      setProjects(p || []);
    } catch (err) {
      console.error('[Upload Library] Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  // Compute stats for summary cards
  const totalCleanedRows = useMemo(() => {
    return uploads.reduce((sum, u) => sum + (u.cleanedRowCount || 0), 0);
  }, [uploads]);

  const uniqueReportTypes = useMemo(() => {
    return Array.from(new Set(uploads.map((u) => u.reportType))).filter(Boolean) as ReportType[];
  }, [uploads]);

  // Filtered uploads
  const filteredUploads = useMemo(() => {
    return uploads.filter((u) => {
      const matchesSearch = u.filename.toLowerCase().includes(search.toLowerCase());

      let matchesProject = true;
      if (projectFilter === 'unassigned') {
        matchesProject = !u.projectId;
      } else if (projectFilter !== 'all') {
        matchesProject = u.projectId === projectFilter;
      }

      let matchesType = true;
      if (typeFilter !== 'all') {
        matchesType = u.reportType === typeFilter;
      }

      return matchesSearch && matchesProject && matchesType;
    });
  }, [uploads, search, projectFilter, typeFilter]);

  // Selection handlers
  const isAllSelected = useMemo(() => {
    return filteredUploads.length > 0 && filteredUploads.every((u) => selectedIds.includes(u.id));
  }, [filteredUploads, selectedIds]);

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds((prev) => prev.filter((id) => !filteredUploads.some((fu) => fu.id === id)));
    } else {
      setSelectedIds((prev) => {
        const next = [...prev];
        filteredUploads.forEach((u) => {
          if (!next.includes(u.id)) next.push(u.id);
        });
        return next;
      });
    }
  };

  // Row assign handler
  const handleAssignProject = async (uploadId: string, projectId: string | undefined) => {
    setLoading(true);
    try {
      await db.updateUploadProject([uploadId], projectId);
      await refreshData();
      const projName = projectId ? (projects.find((p) => p.id === projectId)?.name || 'selected project') : 'Unassigned';
      showStatus(`Successfully assigned upload to "${projName}".`, 'success');
    } catch (err) {
      console.error('[Upload Library] Error assigning project:', err);
      showStatus(`Failed to assign project: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Row delete handler
  const handleDeleteTrigger = (u: UploadRecord) => {
    setConfirmModal({
      isOpen: true,
      type: 'delete_single',
      title: 'Delete Upload',
      affectedUploads: [u],
    });
  };

  const executeDeleteSingle = async (u: UploadRecord) => {
    setLoading(true);
    try {
      await db.deleteUpload(u.id);
      setSelectedIds((prev) => prev.filter((id) => id !== u.id));
      await refreshData();
      showStatus(`Successfully deleted upload "${u.filename}".`, 'success');
    } catch (err) {
      console.error('[Upload Library] Error deleting upload:', err);
      showStatus(`Failed to delete upload: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setLoading(false);
      setConfirmModal((prev) => ({ ...prev, isOpen: false }));
    }
  };

  // Bulk actions handlers
  const handleBulkAssignTrigger = (val: string) => {
    if (!val) return;
    const isUnassign = val === 'unassign';
    const targetProjId = isUnassign ? undefined : val;
    const targetProjName = isUnassign ? 'Unassigned' : projects.find((p) => p.id === val)?.name || val;
    const affected = uploads.filter((u) => selectedIds.includes(u.id));

    setConfirmModal({
      isOpen: true,
      type: 'assign_bulk',
      title: 'Bulk Project Assignment',
      affectedUploads: affected,
      targetProjectId: targetProjId,
      targetProjectName: targetProjName,
    });
  };

  const executeBulkAssign = async (affected: UploadRecord[], targetProjId: string | undefined, targetProjName: string) => {
    setLoading(true);
    try {
      const ids = affected.map((u) => u.id);
      await db.updateUploadProject(ids, targetProjId);
      setSelectedIds([]);
      await refreshData();
      showStatus(`Successfully assigned ${affected.length} upload(s) to "${targetProjName}".`, 'success');
    } catch (err) {
      console.error('[Upload Library] Error bulk assigning project:', err);
      showStatus(`Failed to assign uploads: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setLoading(false);
      setConfirmModal((prev) => ({ ...prev, isOpen: false }));
    }
  };

  const handleBulkDeleteTrigger = () => {
    const affected = uploads.filter((u) => selectedIds.includes(u.id));
    setConfirmModal({
      isOpen: true,
      type: 'delete_bulk',
      title: 'Bulk Delete Uploads',
      affectedUploads: affected,
    });
  };

  const executeDeleteBulk = async (affected: UploadRecord[]) => {
    setLoading(true);
    try {
      for (const u of affected) {
        await db.deleteUpload(u.id);
      }
      setSelectedIds([]);
      await refreshData();
      showStatus(`Successfully deleted ${affected.length} upload(s).`, 'success');
    } catch (err) {
      console.error('[Upload Library] Error bulk deleting uploads:', err);
      showStatus(`Failed to delete uploads: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setLoading(false);
      setConfirmModal((prev) => ({ ...prev, isOpen: false }));
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      {/* Page Header */}
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.3rem' }}>Upload Library</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>
          Manage your imported CSV data, categorize uploads into projects, or delete redundant import records.
        </p>
      </div>

      {/* Status Message */}
      {status && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: status.type === 'success' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
          border: `1px solid ${status.type === 'success' ? 'var(--success)' : 'var(--danger)'}`,
          color: status.type === 'success' ? 'var(--success)' : 'var(--danger)',
          borderRadius: '8px',
          padding: '0.75rem 1rem',
          marginBottom: '1.5rem',
          fontSize: '0.85rem',
          fontWeight: 500,
        }}>
          <span>{status.text}</span>
          <button
            type="button"
            onClick={() => setStatus(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: '1.1rem',
              lineHeight: 1,
              padding: '0 0.25rem',
              fontWeight: 700,
            }}
          >
            &times;
          </button>
        </div>
      )}

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <Card title="Total Uploads" value={loading && uploads.length === 0 ? '…' : uploads.length} sub="Files in database" />
        <Card title="Unassigned Uploads" value={loading && uploads.length === 0 ? '…' : uploads.filter((u) => !u.projectId).length} sub="Research / generic data" />
        <Card title="Project-Assigned" value={loading && uploads.length === 0 ? '…' : uploads.filter((u) => u.projectId).length} sub="Assigned to specific sites" />
        <Card title="Total Stored Rows" value={loading && uploads.length === 0 ? '…' : totalCleanedRows} sub="Cleaned row count sum" accent />
      </div>

      {/* Empty State: No uploads at all */}
      {!loading && uploads.length === 0 ? (
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--card-border)',
          borderRadius: '12px',
          padding: '3rem 2rem',
          textAlign: 'center',
          marginTop: '2rem'
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📁</div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--foreground)' }}>
            No Uploads Yet
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.875rem', maxWidth: '450px', margin: '0 auto 1.5rem', lineHeight: '1.5' }}>
            Your SEO library is empty. Upload CSV reports from SEMrush, Ahrefs, Moz, or other tools to start analyzing your projects.
          </p>
          <Link href="/upload" style={{
            display: 'inline-block',
            background: 'var(--accent)',
            color: '#fff',
            padding: '0.6rem 1.5rem',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '0.875rem',
            transition: 'background 0.15s ease'
          }}>
            Upload CSV Files →
          </Link>
        </div>
      ) : (
        <>
          {/* Filters Bar */}
          <div style={{
            display: 'flex',
            gap: '1rem',
            marginBottom: '1.25rem',
            flexWrap: 'wrap',
            alignItems: 'center',
            background: 'var(--card)',
            border: '1px solid var(--card-border)',
            borderRadius: '10px',
            padding: '0.75rem 1rem'
          }}>
            {/* Search by filename */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '1 1 240px' }}>
              <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Search Filename
              </label>
              <input
                type="text"
                placeholder="Search by filename..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  background: 'var(--background)',
                  border: '1px solid var(--card-border)',
                  borderRadius: '6px',
                  padding: '0.45rem 0.75rem',
                  color: 'var(--foreground)',
                  fontSize: '0.82rem',
                  outline: 'none',
                  width: '100%',
                }}
              />
            </div>

            {/* Project Filter */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '180px' }}>
              <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Project Scope
              </label>
              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                style={{
                  background: 'var(--background)',
                  border: '1px solid var(--card-border)',
                  borderRadius: '6px',
                  padding: '0.45rem 0.6rem',
                  color: 'var(--foreground)',
                  fontSize: '0.82rem',
                  outline: 'none',
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                <option value="all">All Projects</option>
                <option value="unassigned">Unassigned</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Report Type Filter */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '180px' }}>
              <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Report Type
              </label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                style={{
                  background: 'var(--background)',
                  border: '1px solid var(--card-border)',
                  borderRadius: '6px',
                  padding: '0.45rem 0.6rem',
                  color: 'var(--foreground)',
                  fontSize: '0.82rem',
                  outline: 'none',
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                <option value="all">All Report Types</option>
                {uniqueReportTypes.map((t) => (
                  <option key={t} value={t}>
                    {REPORT_LABELS[t] || t}
                  </option>
                ))}
              </select>
            </div>

            {/* Active Filters count */}
            <div style={{ marginLeft: 'auto', alignSelf: 'flex-end', paddingBottom: '0.35rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
              Showing {filteredUploads.length} of {uploads.length} files
            </div>
          </div>

          {/* Bulk Actions Panel */}
          {selectedIds.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              background: 'rgba(99, 102, 241, 0.1)',
              border: '1px solid var(--accent)',
              borderRadius: '8px',
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
              fontSize: '0.85rem',
              flexWrap: 'wrap'
            }}>
              <div style={{ fontWeight: 600, color: 'var(--foreground)' }}>
                {selectedIds.length} file{selectedIds.length > 1 ? 's' : ''} selected
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>Assign selected to:</span>
                <select
                  value=""
                  onChange={(e) => {
                    handleBulkAssignTrigger(e.target.value);
                    e.target.value = ""; // reset
                  }}
                  style={{
                    background: 'var(--card)',
                    border: '1px solid var(--card-border)',
                    borderRadius: '6px',
                    padding: '0.35rem 0.5rem',
                    color: 'var(--foreground)',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                >
                  <option value="" disabled>— Select project —</option>
                  <option value="unassign">Unassigned</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleBulkDeleteTrigger}
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid var(--danger)',
                  color: 'var(--danger)',
                  borderRadius: '6px',
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'var(--danger)';
                  e.currentTarget.style.color = '#fff';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
                  e.currentTarget.style.color = 'var(--danger)';
                }}
              >
                Delete Selected
              </button>

              <button
                type="button"
                onClick={() => setSelectedIds([])}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  marginLeft: 'auto',
                  padding: 0,
                }}
                onMouseOver={(e) => e.currentTarget.style.textDecoration = 'underline'}
                onMouseOut={(e) => e.currentTarget.style.textDecoration = 'none'}
              >
                Clear Selection
              </button>
            </div>
          )}

          {/* Uploads Table */}
          {filteredUploads.length === 0 ? (
            <div style={{
              background: 'var(--card)',
              border: '1px solid var(--card-border)',
              borderRadius: '10px',
              padding: '3rem 1.5rem',
              textAlign: 'center',
              color: 'var(--muted)',
              marginTop: '1rem'
            }}>
              <div style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>🔍</div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--foreground)', marginBottom: '0.25rem' }}>
                No matching uploads found
              </div>
              <div style={{ fontSize: '0.82rem', marginBottom: '1.25rem' }}>
                Adjust your filters or search terms to locate your files.
              </div>
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setProjectFilter('all');
                  setTypeFilter('all');
                }}
                style={{
                  background: 'none',
                  border: '1px solid var(--card-border)',
                  color: 'var(--foreground)',
                  borderRadius: '6px',
                  padding: '0.4rem 1rem',
                  fontSize: '0.82rem',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                Clear Filters
              </button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--card-border)', background: 'var(--card)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ background: 'var(--table-header)', borderBottom: '1px solid var(--card-border)' }}>
                    <th style={{ padding: '0.65rem 0.8rem', width: '40px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        onChange={handleToggleSelectAll}
                        style={{ cursor: 'pointer' }}
                      />
                    </th>
                    <th style={{ padding: '0.65rem 0.8rem', textAlign: 'left', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Filename
                    </th>
                    <th style={{ padding: '0.65rem 0.8rem', textAlign: 'left', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '180px' }}>
                      Report Type
                    </th>
                    <th style={{ padding: '0.65rem 0.8rem', textAlign: 'left', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '220px' }}>
                      Assigned Project
                    </th>
                    <th style={{ padding: '0.65rem 0.8rem', textAlign: 'right', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '160px' }}>
                      Cleaned / Raw Rows
                    </th>
                    <th style={{ padding: '0.65rem 0.8rem', textAlign: 'left', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '160px' }}>
                      Uploaded Date
                    </th>
                    <th style={{ padding: '0.65rem 0.8rem', textAlign: 'center', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '200px' }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUploads.map((u, index) => {
                    const isSelected = selectedIds.includes(u.id);
                    return (
                      <tr
                        key={u.id}
                        style={{
                          borderBottom: '1px solid var(--card-border)',
                          background: isSelected
                            ? 'rgba(99, 102, 241, 0.08)'
                            : index % 2 === 1
                            ? 'var(--row-alt)'
                            : 'transparent',
                          transition: 'background 0.15s ease'
                        }}
                      >
                        <td style={{ padding: '0.6rem 0.8rem', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              setSelectedIds((prev) =>
                                prev.includes(u.id) ? prev.filter((id) => id !== u.id) : [...prev, u.id]
                              );
                            }}
                            style={{ cursor: 'pointer' }}
                          />
                        </td>
                        <td style={{ padding: '0.6rem 0.8rem', fontWeight: 500, color: 'var(--foreground)', wordBreak: 'break-all' }}>
                          {u.filename}
                        </td>
                        <td style={{ padding: '0.6rem 0.8rem' }}>
                          <span style={{
                            background: 'rgba(99,102,241,0.15)',
                            color: 'var(--accent)',
                            padding: '0.15rem 0.5rem',
                            borderRadius: '4px',
                            fontWeight: 600,
                            fontSize: '0.75rem',
                            whiteSpace: 'nowrap'
                          }}>
                            {REPORT_LABELS[u.reportType] || u.reportType}
                          </span>
                        </td>
                        <td style={{ padding: '0.6rem 0.8rem' }}>
                          <select
                            value={u.projectId || ''}
                            onChange={(e) => handleAssignProject(u.id, e.target.value || undefined)}
                            style={{
                              fontSize: '0.8rem',
                              padding: '0.25rem 0.45rem',
                              border: '1px solid var(--card-border)',
                              borderRadius: '6px',
                              background: 'var(--background)',
                              color: 'var(--foreground)',
                              cursor: 'pointer',
                              outline: 'none',
                              maxWidth: '180px',
                              width: '100%',
                              textOverflow: 'ellipsis'
                            }}
                          >
                            <option value="">Unassigned</option>
                            {projects.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: '0.6rem 0.8rem', textAlign: 'right', fontWeight: 500, fontFamily: 'monospace' }}>
                          {u.cleanedRowCount.toLocaleString()} / {(u.rowCount || 0).toLocaleString()}
                        </td>
                        <td style={{ padding: '0.6rem 0.8rem', color: 'var(--muted)', fontSize: '0.78rem' }}>
                          {new Date(u.uploadedAt).toLocaleDateString(undefined, {
                            dateStyle: 'medium'
                          })}{' '}
                          {new Date(u.uploadedAt).toLocaleTimeString(undefined, {
                            timeStyle: 'short'
                          })}
                        </td>
                        <td style={{ padding: '0.6rem 0.8rem', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', alignItems: 'center' }}>
                            <Link
                              href="/upload"
                              style={{
                                color: 'var(--accent)',
                                textDecoration: 'none',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                              }}
                              onMouseOver={(e) => e.currentTarget.style.textDecoration = 'underline'}
                              onMouseOut={(e) => e.currentTarget.style.textDecoration = 'none'}
                            >
                              Upload replacement
                            </Link>
                            <span style={{ color: 'var(--card-border)' }}>|</span>
                            <button
                              type="button"
                              onClick={() => handleDeleteTrigger(u)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--danger)',
                                cursor: 'pointer',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                padding: 0,
                              }}
                              onMouseOver={(e) => e.currentTarget.style.textDecoration = 'underline'}
                              onMouseOut={(e) => e.currentTarget.style.textDecoration = 'none'}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Confirmation Modal Overlay */}
      {confirmModal.isOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'var(--overlay)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem',
        }}>
          <div style={{
            background: 'var(--card)',
            border: '1px solid var(--card-border)',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '500px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4)',
            overflow: 'hidden',
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--card-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--foreground)' }}>
                {confirmModal.title}
              </h3>
              <button
                type="button"
                onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                  fontSize: '1.25rem',
                  lineHeight: 1,
                  padding: 0,
                }}
                onMouseOver={(e) => e.currentTarget.style.color = 'var(--foreground)'}
                onMouseOut={(e) => e.currentTarget.style.color = 'var(--muted)'}
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(45, 49, 72, 0.3)', paddingBottom: '0.5rem' }}>
                  <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Affected Uploads</span>
                  <span style={{ color: 'var(--foreground)', fontSize: '0.85rem', fontWeight: 600 }}>
                    {confirmModal.affectedUploads.length} file{confirmModal.affectedUploads.length !== 1 ? 's' : ''}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(45, 49, 72, 0.3)', paddingBottom: '0.5rem' }}>
                  <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Cleaned Rows Affected</span>
                  <span style={{ color: 'var(--foreground)', fontSize: '0.85rem', fontWeight: 600 }}>
                    {modalCleanedRows.toLocaleString()}
                  </span>
                </div>

                {confirmModal.type === 'assign_bulk' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(45, 49, 72, 0.3)', paddingBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Target Project</span>
                    <span style={{ color: 'var(--accent)', fontSize: '0.85rem', fontWeight: 700 }}>
                      {confirmModal.targetProjectName}
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', paddingTop: '0.25rem' }}>
                  <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>File List</span>
                  <div style={{
                    maxHeight: '120px',
                    overflowY: 'auto',
                    background: 'var(--background)',
                    borderRadius: '6px',
                    border: '1px solid var(--card-border)',
                    padding: '0.5rem',
                  }}>
                    {renderFileList(confirmModal.affectedUploads.map((u) => u.filename))}
                  </div>
                </div>
              </div>

              {/* Warning message for deletes */}
              {(confirmModal.type === 'delete_single' || confirmModal.type === 'delete_bulk') && (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid var(--danger)',
                  borderRadius: '8px',
                  padding: '0.75rem 1rem',
                  color: 'var(--danger)',
                  fontSize: '0.82rem',
                  lineHeight: '1.4',
                  fontWeight: 500,
                }}>
                  This will permanently remove all imported rows tied to these uploads from the database. This action cannot be undone.
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '1rem 1.5rem',
              background: 'var(--background)',
              borderTop: '1px solid var(--card-border)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.75rem',
            }}>
              <button
                type="button"
                onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
                style={{
                  background: 'none',
                  border: '1px solid var(--card-border)',
                  color: 'var(--foreground)',
                  borderRadius: '6px',
                  padding: '0.5rem 1rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                }}
                onMouseOver={(e) => e.currentTarget.style.background = 'var(--card-border)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'none'}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirmModal.type === 'delete_single') {
                    executeDeleteSingle(confirmModal.affectedUploads[0]);
                  } else if (confirmModal.type === 'delete_bulk') {
                    executeDeleteBulk(confirmModal.affectedUploads);
                  } else if (confirmModal.type === 'assign_bulk') {
                    executeBulkAssign(
                      confirmModal.affectedUploads,
                      confirmModal.targetProjectId,
                      confirmModal.targetProjectName || ''
                    );
                  }
                }}
                style={{
                  background: (confirmModal.type === 'delete_single' || confirmModal.type === 'delete_bulk') ? 'var(--danger)' : 'var(--accent)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '0.5rem 1.25rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = (confirmModal.type === 'delete_single' || confirmModal.type === 'delete_bulk')
                    ? '#dc2626'
                    : 'var(--accent-hover)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = (confirmModal.type === 'delete_single' || confirmModal.type === 'delete_bulk')
                    ? 'var(--danger)'
                    : 'var(--accent)';
                }}
              >
                {confirmModal.type === 'assign_bulk' ? 'Confirm Assignment' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
