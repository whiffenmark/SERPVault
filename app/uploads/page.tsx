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
    } catch (err) {
      console.error('[Upload Library] Error assigning project:', err);
    } finally {
      setLoading(false);
    }
  };

  // Row delete handler
  const handleDelete = async (u: UploadRecord) => {
    const message = `Are you sure you want to delete "${u.filename}"?\n\nThis will permanently delete this upload record and all associated keywords, gap details, pages, backlinks, domains, anchor texts, and dedupe reports from the database. This action cannot be undone.`;
    if (window.confirm(message)) {
      setLoading(true);
      try {
        await db.deleteUpload(u.id);
        setSelectedIds((prev) => prev.filter((id) => id !== u.id));
        await refreshData();
      } catch (err) {
        console.error('[Upload Library] Error deleting upload:', err);
      } finally {
        setLoading(false);
      }
    }
  };

  // Bulk actions handlers
  const handleBulkAssign = async (val: string) => {
    if (!val) return;
    const isUnassign = val === 'unassign';
    const targetProjId = isUnassign ? undefined : val;
    const targetProjName = isUnassign ? 'Unassigned' : projects.find((p) => p.id === val)?.name || val;

    const message = `Are you sure you want to assign the ${selectedIds.length} selected uploads to "${targetProjName}"?`;
    if (window.confirm(message)) {
      setLoading(true);
      try {
        await db.updateUploadProject(selectedIds, targetProjId);
        setSelectedIds([]);
        await refreshData();
      } catch (err) {
        console.error('[Upload Library] Error bulk assigning project:', err);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleBulkDelete = async () => {
    const message = `Are you sure you want to delete the ${selectedIds.length} selected uploads?\n\nThis will permanently delete all selected uploads and all keywords, gap details, pages, backlinks, domains, anchor texts, and dedupe reports imported from them. This cannot be undone.`;
    if (window.confirm(message)) {
      setLoading(true);
      try {
        for (const id of selectedIds) {
          await db.deleteUpload(id);
        }
        setSelectedIds([]);
        await refreshData();
      } catch (err) {
        console.error('[Upload Library] Error bulk deleting uploads:', err);
      } finally {
        setLoading(false);
      }
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
                    handleBulkAssign(e.target.value);
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
                onClick={handleBulkDelete}
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
                              onClick={() => handleDelete(u)}
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
    </div>
  );
}
