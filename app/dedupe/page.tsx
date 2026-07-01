'use client';

import { useEffect, useState } from 'react';
import * as db from '@/lib/db';
import type { DedupeReport, UploadRecord, ProjectRecord } from '@/lib/types';
import Card from '@/components/Card';

const REPORT_LABELS: Record<string, string> = {
  keyword: 'Keyword Report',
  keyword_gap: 'Keyword Gap',
  competitor_pages: 'Competitor Pages',
  backlink: 'Backlinks',
  referring_domain: 'Referring Domains',
  anchor_text: 'Anchor Text',
  organic_positions: 'Organic Positions',
  unknown: 'Unknown',
};

export default function DedupePage() {
  const [reports, setReports] = useState<DedupeReport[]>([]);
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter & Sort States
  const [search, setSearch] = useState('');
  const [reportTypeFilter, setReportTypeFilter] = useState('All');
  const [issueFilter, setIssueFilter] = useState('All'); // 'All' | 'Has Issues' | 'Clean' | 'Duplicates Found'
  const [sortBy, setSortBy] = useState('newest'); // 'newest' | 'dup_rate_high' | 'dupes_removed' | 'cleaned_rows'

  useEffect(() => {
    Promise.all([
      db.getDedupeReports(),
      db.getUploads(),
      db.getProjects(),
    ])
      .then(([reportsData, uploadsData, projectsData]) => {
        setReports(reportsData);
        setUploads(uploadsData);
        setProjects(projectsData);
      })
      .catch((err) => {
        console.error('Failed to load dedupe audit data:', err);
      })
      .finally(() => setLoading(false));
  }, []);

  // Helper: Find upload for a given report
  const getUploadForReport = (r: DedupeReport) => {
    return uploads.find((u) => u.id === r.uploadId || u.dedupeReportId === r.id);
  };

  // Helper: Find project for a given upload
  const getProjectForUpload = (u?: UploadRecord) => {
    if (!u || !u.projectId) return undefined;
    return projects.find((p) => p.id === u.projectId);
  };

  // Helper: Compute duplicate rate
  const getDuplicateRate = (r: DedupeReport) => {
    return r.totalRows > 0 ? r.duplicatesRemoved / r.totalRows : 0;
  };

  // Helper: Severity configuration
  const getSeverity = (r: DedupeReport) => {
    const rate = getDuplicateRate(r);
    const hasIssues = r.issues && r.issues.length > 0;

    if (rate === 0 && !hasIssues) {
      return {
        label: 'Clean',
        color: 'var(--success)',
        bg: 'rgba(16, 185, 129, 0.1)',
        border: 'rgba(16, 185, 129, 0.2)',
      };
    }

    if (rate > 0.15) {
      return {
        label: 'High',
        color: 'var(--danger)',
        bg: 'rgba(239, 68, 68, 0.1)',
        border: 'rgba(239, 68, 68, 0.2)',
      };
    }

    if (rate > 0.05 || hasIssues) {
      return {
        label: 'Medium',
        color: 'var(--warning)',
        bg: 'rgba(245, 158, 11, 0.1)',
        border: 'rgba(245, 158, 11, 0.2)',
      };
    }

    return {
      label: 'Low',
      color: 'var(--accent)',
      bg: 'rgba(99, 102, 241, 0.1)',
      border: 'rgba(99, 102, 241, 0.2)',
    };
  };

  // Extract unique report types dynamically for filtering options
  const uniqueReportTypes = Array.from(new Set(reports.map((r) => r.reportType)));

  // Filter application
  const filteredReports = reports.filter((r) => {
    const matchesSearch =
      !search ||
      r.filename.toLowerCase().includes(search.toLowerCase()) ||
      r.dedupeKey.toLowerCase().includes(search.toLowerCase());

    const matchesType = reportTypeFilter === 'All' || r.reportType === reportTypeFilter;

    const matchesIssue =
      issueFilter === 'All'
        ? true
        : issueFilter === 'Has Issues'
        ? r.issues.length > 0
        : issueFilter === 'Clean'
        ? r.duplicatesRemoved === 0 && r.issues.length === 0
        : issueFilter === 'Duplicates Found'
        ? r.duplicatesRemoved > 0
        : true;

    return matchesSearch && matchesType && matchesIssue;
  });

  // Sort application
  const sortedReports = [...filteredReports].sort((a, b) => {
    if (sortBy === 'newest') {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    if (sortBy === 'dup_rate_high') {
      return getDuplicateRate(b) - getDuplicateRate(a);
    }
    if (sortBy === 'dupes_removed') {
      return b.duplicatesRemoved - a.duplicatesRemoved;
    }
    if (sortBy === 'cleaned_rows') {
      return b.cleanedRows - a.cleanedRows;
    }
    return 0;
  });

  // Check if any filter is active to show the clear button
  const hasActiveFilters =
    search !== '' ||
    reportTypeFilter !== 'All' ||
    issueFilter !== 'All' ||
    sortBy !== 'newest';

  const clearFilters = () => {
    setSearch('');
    setReportTypeFilter('All');
    setIssueFilter('All');
    setSortBy('newest');
  };

  // Compute summary stats dynamically based on filtered reports
  const totalDupes = filteredReports.reduce((s, r) => s + r.duplicatesRemoved, 0);
  const totalCleaned = filteredReports.reduce((s, r) => s + r.cleanedRows, 0);
  const avgDupRate =
    filteredReports.length > 0
      ? filteredReports.reduce((s, r) => s + getDuplicateRate(r), 0) / filteredReports.length
      : 0;
  const reportsWithIssuesCount = filteredReports.filter((r) => r.issues.length > 0).length;

  // CSV Audit Exporter
  const exportAuditCSV = () => {
    const data = filteredReports.map((r) => {
      const upload = getUploadForReport(r);
      const project = getProjectForUpload(upload);
      const projectText = project ? project.name : (upload?.projectId || 'Global/Unassigned');
      const rate = getDuplicateRate(r);

      return {
        Filename: r.filename,
        'Report Type': REPORT_LABELS[r.reportType] ?? r.reportType,
        'Created At': new Date(r.createdAt).toLocaleString(),
        'Total Rows': r.totalRows,
        'Duplicates Removed': r.duplicatesRemoved,
        'Cleaned Rows': r.cleanedRows,
        'Duplicate Rate': `${(rate * 100).toFixed(2)}%`,
        'Dedupe Key': r.dedupeKey,
        'Issue Count': r.issues.length,
        'Project Assignment': projectText,
      };
    });

    const toCSV = (rows: Record<string, unknown>[]): string => {
      if (rows.length === 0) return '';
      const headers = Object.keys(rows[0]);
      const lines = [
        headers.join(','),
        ...rows.map((row) =>
          headers.map((h) => {
            const v = String(row[h] ?? '');
            return v.includes(',') || v.includes('"') || v.includes('\n')
              ? `"${v.replace(/"/g, '""')}"`
              : v;
          }).join(',')
        ),
      ];
      return lines.join('\n');
    };

    const csvContent = toCSV(data);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `import-quality-audit-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '0 1rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.3rem' }}>Import Quality Audit</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>
          Audit CSV uploads, identify duplicate rates, and monitor formatting issues across project integrations.
        </p>
      </div>

      {/* Summary Stats Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <Card title="Reports Created" value={filteredReports.length} />
        <Card title="Total Duplicates Removed" value={totalDupes} accent={totalDupes > 0} />
        <Card title="Cleaned Rows Stored" value={totalCleaned} />
        <Card title="Average Duplicate Rate" value={`${(avgDupRate * 100).toFixed(1)}%`} />
        <Card title="Reports With Issues" value={reportsWithIssuesCount} accent={reportsWithIssuesCount > 0} />
      </div>

      {/* Filters Toolbar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '0.75rem',
          background: 'var(--card)',
          border: '1px solid var(--card-border)',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label htmlFor="search" style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 500 }}>
            Search Filename / Key
          </label>
          <input
            id="search"
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              background: 'var(--background)',
              border: '1px solid var(--card-border)',
              borderRadius: '6px',
              color: 'var(--foreground)',
              fontSize: '0.85rem',
              padding: '0.4rem 0.6rem',
              outline: 'none',
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label htmlFor="report-type" style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 500 }}>
            Report Type
          </label>
          <select
            id="report-type"
            value={reportTypeFilter}
            onChange={(e) => setReportTypeFilter(e.target.value)}
            style={{
              background: 'var(--background)',
              border: '1px solid var(--card-border)',
              borderRadius: '6px',
              color: 'var(--foreground)',
              fontSize: '0.85rem',
              padding: '0.4rem 0.6rem',
              outline: 'none',
            }}
          >
            <option value="All">All Types</option>
            {uniqueReportTypes.map((t) => (
              <option key={t} value={t}>
                {REPORT_LABELS[t] ?? t}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label htmlFor="issue-filter" style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 500 }}>
            Quality Status
          </label>
          <select
            id="issue-filter"
            value={issueFilter}
            onChange={(e) => setIssueFilter(e.target.value)}
            style={{
              background: 'var(--background)',
              border: '1px solid var(--card-border)',
              borderRadius: '6px',
              color: 'var(--foreground)',
              fontSize: '0.85rem',
              padding: '0.4rem 0.6rem',
              outline: 'none',
            }}
          >
            <option value="All">All Statuses</option>
            <option value="Has Issues">Has Issues</option>
            <option value="Clean">Clean</option>
            <option value="Duplicates Found">Duplicates Found</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label htmlFor="sort-by" style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 500 }}>
            Sort By
          </label>
          <select
            id="sort-by"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{
              background: 'var(--background)',
              border: '1px solid var(--card-border)',
              borderRadius: '6px',
              color: 'var(--foreground)',
              fontSize: '0.85rem',
              padding: '0.4rem 0.6rem',
              outline: 'none',
            }}
          >
            <option value="newest">Newest</option>
            <option value="dup_rate_high">Duplicate Rate (High)</option>
            <option value="dupes_removed">Duplicates Removed</option>
            <option value="cleaned_rows">Cleaned Rows</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              style={{
                flex: 1,
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: '6px',
                color: 'var(--danger)',
                fontSize: '0.8rem',
                fontWeight: 500,
                padding: '0.45rem 0.6rem',
                cursor: 'pointer',
                transition: 'all 0.15s',
                height: '32px',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)';
              }}
            >
              Clear
            </button>
          )}

          <button
            type="button"
            onClick={exportAuditCSV}
            disabled={filteredReports.length === 0}
            style={{
              flex: 1,
              background: filteredReports.length === 0 ? 'var(--card-border)' : 'var(--accent)',
              border: `1px solid ${filteredReports.length === 0 ? 'var(--card-border)' : 'var(--accent)'}`,
              borderRadius: '6px',
              color: filteredReports.length === 0 ? 'var(--muted)' : 'white',
              fontSize: '0.8rem',
              fontWeight: 500,
              padding: '0.45rem 0.6rem',
              cursor: filteredReports.length === 0 ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.3rem',
            }}
            onMouseEnter={(e) => {
              if (filteredReports.length > 0) {
                e.currentTarget.style.background = 'var(--accent-hover)';
              }
            }}
            onMouseLeave={(e) => {
              if (filteredReports.length > 0) {
                e.currentTarget.style.background = 'var(--accent)';
              }
            }}
          >
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Main Reports List */}
      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>Loading audit reports…</div>
      ) : reports.length === 0 ? (
        <div
          style={{
            background: 'var(--card)',
            border: '1px solid var(--card-border)',
            borderRadius: '10px',
            padding: '3rem',
            textAlign: 'center',
            color: 'var(--muted)',
          }}
        >
          No dedupe reports yet. Reports are created automatically when you upload a CSV.
        </div>
      ) : sortedReports.length === 0 ? (
        <div
          style={{
            background: 'var(--card)',
            border: '1px solid var(--card-border)',
            borderRadius: '10px',
            padding: '3rem',
            textAlign: 'center',
            color: 'var(--muted)',
          }}
        >
          <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.5rem' }}>
            No audit reports match your filter criteria.
          </div>
          <p style={{ fontSize: '0.825rem', marginBottom: '1.25rem' }}>
            Try clearing or adjusting your search phrase and status filters.
          </p>
          <button
            type="button"
            onClick={clearFilters}
            style={{
              background: 'var(--accent)',
              border: '1px solid var(--accent)',
              borderRadius: '6px',
              color: 'white',
              fontSize: '0.825rem',
              fontWeight: 500,
              padding: '0.45rem 1rem',
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--accent-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--accent)';
            }}
          >
            Clear Active Filters
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {sortedReports.map((r) => {
            const upload = getUploadForReport(r);
            const project = getProjectForUpload(upload);
            const projectText = project ? project.name : (upload?.projectId || 'Global/Unassigned');
            const rate = getDuplicateRate(r);
            const sev = getSeverity(r);

            return (
              <div
                key={r.id}
                style={{
                  background: 'var(--card)',
                  border: '1px solid var(--card-border)',
                  borderRadius: '10px',
                  padding: '1.25rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '0.75rem',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.2rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{r.filename}</span>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '0.15rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          backgroundColor: sev.bg,
                          color: sev.color,
                          border: `1px solid ${sev.border}`,
                        }}
                      >
                        {sev.label}
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        gap: '0.5rem',
                        fontSize: '0.78rem',
                        color: 'var(--muted)',
                        marginTop: '0.25rem',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        Type: <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{REPORT_LABELS[r.reportType] ?? r.reportType}</span>
                      </div>
                      <div>•</div>
                      <div>
                        Project: <span style={{ color: 'var(--foreground)', fontWeight: 500 }}>{projectText}</span>
                      </div>
                      <div>•</div>
                      <div>
                        Date: <span style={{ fontWeight: 500 }}>{new Date(r.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', minWidth: '150px' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                      {r.totalRows.toLocaleString()} total rows
                    </div>
                    {r.duplicatesRemoved > 0 ? (
                      <div style={{ fontSize: '0.8rem', color: 'var(--warning)', fontWeight: 600 }}>
                        -{r.duplicatesRemoved.toLocaleString()} duplicates ({(rate * 100).toFixed(1)}%)
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.8rem', color: 'var(--success)' }}>No duplicates found</div>
                    )}
                    <div style={{ fontSize: '0.8rem', color: 'var(--success)', fontWeight: 600 }}>
                      {r.cleanedRows.toLocaleString()} clean rows stored
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>
                  Dedupe key:{' '}
                  <span style={{ color: 'var(--foreground)', fontFamily: 'monospace' }}>{r.dedupeKey}</span>
                </div>

                {r.issues.length > 0 &&
                  r.issues.map((issue, i) => (
                    <div key={i} style={{ fontSize: '0.75rem', color: 'var(--warning)', marginTop: '0.15rem' }}>
                      ⚠ {issue}
                    </div>
                  ))}

                {r.duplicateExamples.length > 0 && (
                  <details style={{ marginTop: '0.5rem' }}>
                    <summary style={{ fontSize: '0.78rem', color: 'var(--muted)', cursor: 'pointer' }}>
                      Show {r.duplicateExamples.length} example duplicate{r.duplicateExamples.length > 1 ? 's' : ''}
                    </summary>
                    <div style={{ marginTop: '0.5rem' }}>
                      {r.duplicateExamples.map((ex, i) => (
                        <div
                          key={i}
                          style={{
                            fontSize: '0.72rem',
                            color: 'var(--muted)',
                            background: 'var(--code-bg)',
                            borderRadius: '4px',
                            padding: '0.4rem 0.6rem',
                            marginBottom: '0.25rem',
                            fontFamily: 'monospace',
                          }}
                        >
                          {Object.entries(ex)
                            .slice(0, 6)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(' | ')}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
