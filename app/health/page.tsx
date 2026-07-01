'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import * as db from '@/lib/db';
import {
  getSelectedProjectId,
  getSelectedProject,
  subscribeProjectScopeChange,
} from '@/lib/storage';
import {
  calculateDataHealth,
  type HealthSummary,
  type HealthIssue,
  type ReportStatus,
} from '@/lib/data-health';
import {
  getOpportunityWorkflowMap,
  saveOpportunityWorkflowMap,
  type OpportunityWorkflowStatus,
  getMergedOpportunityWorkflowMap,
} from '@/lib/opportunity-workflow';
import { getHealthIssueStableId } from '@/lib/health-action-items';
import Card from '@/components/Card';
import type {
  UploadRecord,
  ProjectRecord,
  KeywordRecord,
  KeywordGapRecord,
  CompetitorPageRecord,
  BacklinkRecord,
  ReferringDomainRecord,
  AnchorTextRecord,
  DedupeReport,
} from '@/lib/types';
import {
  ShieldAlert,
  AlertTriangle,
  Info,
  CheckCircle2,
  RefreshCw,
  TrendingUp,
  Briefcase,
  Layers,
  FileText,
  Activity,
  ArrowRight,
  Folder,
  Database,
  ChevronRight,
} from 'lucide-react';

export default function DataHealthPage() {
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [keywords, setKeywords] = useState<KeywordRecord[]>([]);
  const [keywordGaps, setKeywordGaps] = useState<KeywordGapRecord[]>([]);
  const [competitorPages, setCompetitorPages] = useState<CompetitorPageRecord[]>([]);
  const [backlinks, setBacklinks] = useState<BacklinkRecord[]>([]);
  const [referringDomains, setReferringDomains] = useState<ReferringDomainRecord[]>([]);
  const [anchorTexts, setAnchorTexts] = useState<AnchorTextRecord[]>([]);
  const [dedupeReports, setDedupeReports] = useState<DedupeReport[]>([]);

  const [selectedProjectId, setSelectedProjectIdState] = useState<string | null>(null);
  const [selectedProjectRecord, setSelectedProjectRecord] = useState<ProjectRecord | null>(null);
  const [workflowMap, setWorkflowMap] = useState<Record<string, OpportunityWorkflowStatus>>({});
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      const [u, p, kw, kg, cp, bl, rd, at, dr] = await Promise.all([
        db.getUploads(),
        db.getProjects(),
        db.getKeywords(),
        db.getKeywordGaps(),
        db.getCompetitorPages(),
        db.getBacklinks(),
        db.getReferringDomains(),
        db.getAnchorTexts(),
        db.getDedupeReports(),
      ]);

      setUploads(u || []);
      setProjects(p || []);
      setKeywords(kw || []);
      setKeywordGaps(kg || []);
      setCompetitorPages(cp || []);
      setBacklinks(bl || []);
      setReferringDomains(rd || []);
      setAnchorTexts(at || []);
      setDedupeReports(dr || []);

      setSelectedProjectIdState(getSelectedProjectId());
      setSelectedProjectRecord(getSelectedProject());
      setWorkflowMap(getOpportunityWorkflowMap());
      getMergedOpportunityWorkflowMap().then((merged) => {
        setWorkflowMap(merged);
      });
    } catch (err) {
      console.error('[Data Health] Error loading database reports:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleHealthIssueInPlan = (issueId: string) => {
    const stableId = getHealthIssueStableId(issueId, selectedProjectId);
    const currentStatus = workflowMap[stableId];
    let newStatus: OpportunityWorkflowStatus;

    if (currentStatus === 'Planned') {
      newStatus = 'New';
    } else if (currentStatus === 'In Progress' || currentStatus === 'Done') {
      return;
    } else {
      newStatus = 'Planned';
    }

    const updated = { ...workflowMap, [stableId]: newStatus };
    setWorkflowMap(updated);
    saveOpportunityWorkflowMap(updated);
  };

  useEffect(() => {
    loadData();

    const unsubscribe = subscribeProjectScopeChange((projectId) => {
      setSelectedProjectIdState(projectId);
      setSelectedProjectRecord(getSelectedProject());
    });
    return () => unsubscribe();
  }, []);

  const health = useMemo<HealthSummary>(() => {
    return calculateDataHealth(
      uploads,
      projects,
      keywords,
      keywordGaps,
      competitorPages,
      backlinks,
      referringDomains,
      anchorTexts,
      dedupeReports,
      selectedProjectId
    );
  }, [
    uploads,
    projects,
    keywords,
    keywordGaps,
    competitorPages,
    backlinks,
    referringDomains,
    anchorTexts,
    dedupeReports,
    selectedProjectId,
  ]);

  const scoreColor = (score: number) => {
    if (score >= 80) return 'var(--success)';
    if (score >= 50) return 'var(--warning)';
    return 'var(--danger)';
  };

  const getSeverityStyle = (severity: HealthIssue['severity']) => {
    switch (severity) {
      case 'critical':
        return {
          borderLeft: '3px solid var(--danger)',
          background: 'rgba(239, 68, 68, 0.04)',
          badgeColor: 'var(--danger)',
          badgeBg: 'rgba(239, 68, 68, 0.1)',
        };
      case 'warning':
        return {
          borderLeft: '3px solid var(--warning)',
          background: 'rgba(245, 158, 11, 0.04)',
          badgeColor: 'var(--warning)',
          badgeBg: 'rgba(245, 158, 11, 0.1)',
        };
      case 'info':
        return {
          borderLeft: '3px solid var(--accent)',
          background: 'rgba(99, 102, 241, 0.04)',
          badgeColor: 'var(--accent)',
          badgeBg: 'rgba(99, 102, 241, 0.1)',
        };
    }
  };

  const getStatusBadgeStyle = (status: ReportStatus['status']) => {
    switch (status) {
      case 'Ready':
        return { color: 'var(--success)', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.2)' };
      case 'Thin':
        return { color: 'var(--warning)', background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.2)' };
      case 'Missing':
        return { color: 'var(--muted)', background: 'rgba(100, 116, 139, 0.08)', border: '1px solid rgba(100, 116, 139, 0.15)' };
      case 'Needs Review':
        return { color: 'var(--danger)', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.2)' };
    }
  };

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '60vh',
          color: 'var(--muted)',
        }}
      >
        <RefreshCw style={{ animation: 'spin 1s linear infinite', marginBottom: '1rem', color: 'var(--accent)' }} size={32} />
        <style dangerouslySetInnerHTML={{ __html: `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }` }} />
        <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>Analyzing SEO research database health...</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Title block */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>Data Health & Research Coverage</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
            Audit your imported keyword records, backlink databases, competitor lists, and clean/dedupe rates.
          </p>
        </div>
        
        {/* Active Project Scope Badge */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: selectedProjectId ? 'rgba(99, 102, 241, 0.08)' : 'rgba(100, 116, 139, 0.08)',
            border: `1px solid ${selectedProjectId ? 'rgba(99, 102, 241, 0.2)' : 'rgba(100, 116, 139, 0.2)'}`,
            padding: '0.5rem 0.85rem',
            borderRadius: '20px',
            fontSize: '0.78rem',
            fontWeight: 600,
            color: selectedProjectId ? 'var(--foreground)' : 'var(--muted)',
          }}
        >
          {selectedProjectId ? (
            <>
              <Briefcase size={14} style={{ color: 'var(--accent)' }} />
              <span>Project Scope: <span style={{ color: 'var(--accent)' }}>{selectedProjectRecord?.name || 'Selected Project'}</span> ({selectedProjectRecord?.domain})</span>
            </>
          ) : (
            <>
              <Layers size={14} style={{ color: 'var(--muted)' }} />
              <span>Global Scope: <span style={{ color: 'var(--foreground)' }}>All Projects</span></span>
            </>
          )}
        </div>
      </div>

      {/* Top Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem',
        }}
      >
        <Card
          title="Health Score"
          value={`${health.overallScore}%`}
          sub={health.overallScore >= 80 ? 'Excellent Coverage' : health.overallScore >= 50 ? 'Needs Attention' : 'Critical Gaps'}
          accent={health.overallScore > 0}
        />
        <Card
          title="Stored Rows"
          value={health.totalRows}
          sub={`${uploads.length} upload files`}
        />
        <Card
          title="Duplicates Removed"
          value={health.duplicatesRemoved}
          sub="Cleared during import"
        />
        <Card
          title="Report Types Present"
          value={`${health.reportTypesCount} / 6`}
          sub="Core templates filled"
        />
        <Card
          title="Unassigned Uploads"
          value={health.unassignedUploadsCount}
          sub="No project scope set"
          accent={health.unassignedUploadsCount > 0}
        />
        <Card
          title="Last Import"
          value={health.lastUploadDate ? new Date(health.lastUploadDate).toLocaleDateString() : 'N/A'}
          sub={
            health.lastUploadDate
              ? `${Math.floor((new Date().getTime() - new Date(health.lastUploadDate).getTime()) / (1000 * 60 * 60 * 24))} days ago`
              : 'Sync database'
          }
        />
      </div>

      {/* Main Content Layout */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* Two columns for Score Breakdown & Prioritized Recommendations */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
          
          {/* Health Score Breakdown Card */}
          <div
            style={{
              background: 'var(--card)',
              border: '1px solid var(--card-border)',
              borderRadius: '10px',
              padding: '1.25rem 1.5rem',
            }}
          >
            <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Activity size={18} style={{ color: 'var(--accent)' }} />
              Health Score Breakdown
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              
              {/* Coverage (25%) */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                  <span style={{ color: 'var(--foreground)' }}>Report Template Coverage (25% weight)</span>
                  <span style={{ color: scoreColor(health.metrics.coverage) }}>{health.metrics.coverage}%</span>
                </div>
                <div style={{ width: '100%', height: '6px', background: 'var(--background)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${health.metrics.coverage}%`, height: '100%', background: scoreColor(health.metrics.coverage), borderRadius: '4px', transition: 'width 0.3s ease' }} />
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '2px', display: 'block' }}>
                  Presence of keywords, gaps, competitor pages, referring domains, backlinks, and anchor texts.
                </span>
              </div>

              {/* Volume & Density (20%) */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                  <span style={{ color: 'var(--foreground)' }}>Data Volume & Actionability (20% weight)</span>
                  <span style={{ color: scoreColor(health.metrics.volume) }}>{health.metrics.volume}%</span>
                </div>
                <div style={{ width: '100%', height: '6px', background: 'var(--background)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${health.metrics.volume}%`, height: '100%', background: scoreColor(health.metrics.volume), borderRadius: '4px', transition: 'width 0.3s ease' }} />
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '2px', display: 'block' }}>
                  Adequate record counts in database and presence of keyword/backlink tags for filtering.
                </span>
              </div>

              {/* Project Assignment (20%) */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                  <span style={{ color: 'var(--foreground)' }}>Project Scope Assignment (20% weight)</span>
                  <span style={{ color: scoreColor(health.metrics.assignment) }}>{health.metrics.assignment}%</span>
                </div>
                <div style={{ width: '100%', height: '6px', background: 'var(--background)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${health.metrics.assignment}%`, height: '100%', background: scoreColor(health.metrics.assignment), borderRadius: '4px', transition: 'width 0.3s ease' }} />
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '2px', display: 'block' }}>
                  Proportion of uploaded reports mapped to an active project for targeted operational filters.
                </span>
              </div>

              {/* Deduplication Rate (20%) */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                  <span style={{ color: 'var(--foreground)' }}>Deduplication Cleanliness (20% weight)</span>
                  <span style={{ color: scoreColor(health.metrics.dedupe) }}>{health.metrics.dedupe}%</span>
                </div>
                <div style={{ width: '100%', height: '6px', background: 'var(--background)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${health.metrics.dedupe}%`, height: '100%', background: scoreColor(health.metrics.dedupe), borderRadius: '4px', transition: 'width 0.3s ease' }} />
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '2px', display: 'block' }}>
                  Percentage of active uploads verified and cleared of duplicate rows.
                </span>
              </div>

              {/* Freshness Window (15%) */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                  <span style={{ color: 'var(--foreground)' }}>Import Recency & Freshness (15% weight)</span>
                  <span style={{ color: scoreColor(health.metrics.freshness) }}>{health.metrics.freshness}%</span>
                </div>
                <div style={{ width: '100%', height: '6px', background: 'var(--background)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${health.metrics.freshness}%`, height: '100%', background: scoreColor(health.metrics.freshness), borderRadius: '4px', transition: 'width 0.3s ease' }} />
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '2px', display: 'block' }}>
                  Tracks if upload records have been updated within the past 30 days.
                </span>
              </div>

            </div>
          </div>

          {/* Prioritized Health Issues / Recommendations */}
          <div
            style={{
              background: 'var(--card)',
              border: '1px solid var(--card-border)',
              borderRadius: '10px',
              padding: '1.25rem 1.5rem',
              maxHeight: '480px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <TrendingUp size={18} style={{ color: 'var(--accent)' }} />
              Prioritized Recommendations ({health.issues.length})
            </h2>

            {health.issues.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--muted)', margin: 'auto 0' }}>
                <CheckCircle2 size={36} style={{ color: 'var(--success)', marginBottom: '0.75rem', display: 'inline-block' }} />
                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--foreground)' }}>Database Health is Perfect!</div>
                <div style={{ fontSize: '0.78rem', marginTop: '0.25rem' }}>All report templates are uploaded, assigned, and deduplicated.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {health.issues.map((issue) => {
                  const style = getSeverityStyle(issue.severity);
                  const stableId = getHealthIssueStableId(issue.id, selectedProjectId);
                  const currentStatus = workflowMap[stableId] || 'New';

                  let btnLabel = 'Add to Plan';
                  let btnBg = 'rgba(99, 102, 241, 0.08)';
                  let btnColor = 'var(--accent)';
                  let btnBorder = '1px solid var(--accent)';
                  let isBtnDisabled = false;

                  if (currentStatus === 'Planned') {
                    btnLabel = '✓ In Plan';
                    btnBg = 'rgba(56, 189, 248, 0.12)';
                    btnColor = '#38bdf8';
                    btnBorder = '1px solid #38bdf8';
                  } else if (currentStatus === 'In Progress') {
                    btnLabel = 'In Progress';
                    btnBg = 'rgba(245, 158, 11, 0.12)';
                    btnColor = 'var(--warning)';
                    btnBorder = '1px solid var(--warning)';
                    isBtnDisabled = true;
                  } else if (currentStatus === 'Done') {
                    btnLabel = 'Done';
                    btnBg = 'rgba(16, 185, 129, 0.12)';
                    btnColor = 'var(--success)';
                    btnBorder = '1px solid var(--success)';
                    isBtnDisabled = true;
                  }

                  return (
                    <div
                      key={issue.id}
                      style={{
                        background: style.background,
                        borderLeft: style.borderLeft,
                        borderTop: '1px solid var(--card-border)',
                        borderRight: '1px solid var(--card-border)',
                        borderBottom: '1px solid var(--card-border)',
                        borderRadius: '6px',
                        padding: '0.75rem 1rem',
                        position: 'relative',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          {issue.severity === 'critical' && <ShieldAlert size={14} style={{ color: 'var(--danger)' }} />}
                          {issue.severity === 'warning' && <AlertTriangle size={14} style={{ color: 'var(--warning)' }} />}
                          {issue.severity === 'info' && <Info size={14} style={{ color: 'var(--accent)' }} />}
                          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--foreground)' }}>
                            {issue.title}
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: '0.62rem',
                            fontWeight: 700,
                            color: style.badgeColor,
                            background: style.badgeBg,
                            padding: '0.1rem 0.4rem',
                            borderRadius: '10px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                          }}
                        >
                          {issue.severity}
                        </span>
                      </div>
                      
                      <p style={{ fontSize: '0.74rem', color: 'var(--muted)', margin: '0 0 0.5rem 0', lineHeight: 1.35 }}>
                        {issue.description}
                      </p>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--muted)', marginTop: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ textTransform: 'capitalize' }}>Category: {issue.category}</span>
                          {issue.category === 'volume' || issue.category === 'coverage' ? (
                            <>
                              <span style={{ color: 'var(--card-border)', margin: '0 0.25rem' }}>|</span>
                              <Link href="/upload" style={{ color: 'var(--accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '2px', fontWeight: 500 }}>
                                Upload CSV <ArrowRight size={10} />
                              </Link>
                            </>
                          ) : issue.category === 'dedupe' ? (
                            <>
                              <span style={{ color: 'var(--card-border)', margin: '0 0.25rem' }}>|</span>
                              <Link href="/dedupe" style={{ color: 'var(--accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '2px', fontWeight: 500 }}>
                                Clean Database <ArrowRight size={10} />
                              </Link>
                            </>
                          ) : issue.category === 'assignment' ? (
                            <>
                              <span style={{ color: 'var(--card-border)', margin: '0 0.25rem' }}>|</span>
                              <Link href="/uploads" style={{ color: 'var(--accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '2px', fontWeight: 500 }}>
                                Manage Scope <ArrowRight size={10} />
                              </Link>
                            </>
                          ) : null}
                        </div>

                        <button
                          type="button"
                          disabled={isBtnDisabled}
                          onClick={() => toggleHealthIssueInPlan(issue.id)}
                          style={{
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            background: btnBg,
                            color: btnColor,
                            border: btnBorder,
                            fontSize: '0.65rem',
                            fontWeight: 600,
                            cursor: isBtnDisabled ? 'default' : 'pointer',
                            transition: 'all 0.15s ease',
                            outline: 'none',
                          }}
                        >
                          {btnLabel}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* Report Coverage Matrix */}
        <div
          style={{
            background: 'var(--card)',
            border: '1px solid var(--card-border)',
            borderRadius: '10px',
            padding: '1.25rem 1.5rem',
          }}
        >
          <h2 style={{ fontSize: '1.05rem', fontWeight: 600, margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileText size={18} style={{ color: 'var(--accent)' }} />
            Report Coverage Matrix
          </h2>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: 'var(--table-header)', borderBottom: '1px solid var(--card-border)' }}>
                  <th style={{ padding: '0.65rem 0.8rem', textAlign: 'left', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Report Type
                  </th>
                  <th style={{ padding: '0.65rem 0.8rem', textAlign: 'center', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '120px' }}>
                    Files Mapped
                  </th>
                  <th style={{ padding: '0.65rem 0.8rem', textAlign: 'right', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '140px' }}>
                    Row Count
                  </th>
                  <th style={{ padding: '0.65rem 0.8rem', textAlign: 'center', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '140px' }}>
                    Coverage Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {health.reportCoverage.map((r, index) => {
                  const badge = getStatusBadgeStyle(r.status);
                  return (
                    <tr
                      key={r.type}
                      style={{
                        borderBottom: '1px solid var(--card-border)',
                        background: index % 2 === 1 ? 'var(--row-alt)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '0.75rem 0.8rem', fontWeight: 600, color: 'var(--foreground)' }}>
                        {r.label}
                      </td>
                      <td style={{ padding: '0.75rem 0.8rem', textAlign: 'center', color: 'var(--foreground)' }}>
                        {r.uploadCount}
                      </td>
                      <td style={{ padding: '0.75rem 0.8rem', textAlign: 'right', color: 'var(--foreground)', fontWeight: 500 }}>
                        {r.count.toLocaleString()}
                      </td>
                      <td style={{ padding: '0.75rem 0.8rem', textAlign: 'center' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            padding: '0.15rem 0.55rem',
                            borderRadius: '4px',
                            ...badge,
                          }}
                        >
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Project Coverage Audit */}
        <div
          style={{
            background: 'var(--card)',
            border: '1px solid var(--card-border)',
            borderRadius: '10px',
            padding: '1.25rem 1.5rem',
          }}
        >
          <h2 style={{ fontSize: '1.05rem', fontWeight: 600, margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Folder size={18} style={{ color: 'var(--accent)' }} />
            Project Research Coverage
          </h2>

          {health.projectCoverage.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--muted)' }}>
              <Database size={32} style={{ color: 'var(--muted)', marginBottom: '0.75rem', display: 'inline-block' }} />
              <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--foreground)' }}>No Projects Configured</div>
              <div style={{ fontSize: '0.78rem', marginTop: '0.25rem', marginBottom: '1rem' }}>Set up project environments in the sidebar to scope datasets.</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: 'var(--table-header)', borderBottom: '1px solid var(--card-border)' }}>
                    <th style={{ padding: '0.65rem 0.8rem', textAlign: 'left', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Project / Site Name
                    </th>
                    <th style={{ padding: '0.65rem 0.8rem', textAlign: 'left', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Domain
                    </th>
                    <th style={{ padding: '0.65rem 0.8rem', textAlign: 'center', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '90px' }}>
                      Uploads
                    </th>
                    <th style={{ padding: '0.65rem 0.8rem', textAlign: 'right', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '100px' }}>
                      Keywords
                    </th>
                    <th style={{ padding: '0.65rem 0.8rem', textAlign: 'right', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '100px' }}>
                      Backlinks
                    </th>
                    <th style={{ padding: '0.65rem 0.8rem', textAlign: 'right', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '110px' }}>
                      Comp Pages
                    </th>
                    <th style={{ padding: '0.65rem 0.8rem', textAlign: 'left', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '120px' }}>
                      Last Upload
                    </th>
                    <th style={{ padding: '0.65rem 0.8rem', textAlign: 'left', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Coverage Gaps
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {health.projectCoverage.map((proj, index) => {
                    const isSelected = selectedProjectId === proj.id;
                    return (
                      <tr
                        key={proj.id}
                        style={{
                          borderBottom: '1px solid var(--card-border)',
                          background: isSelected
                            ? 'rgba(99, 102, 241, 0.05)'
                            : index % 2 === 1
                            ? 'var(--row-alt)'
                            : 'transparent',
                          fontWeight: isSelected ? 500 : 'normal',
                        }}
                      >
                        <td style={{ padding: '0.75rem 0.8rem', color: isSelected ? 'var(--accent)' : 'var(--foreground)' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            {isSelected && <ChevronRight size={14} style={{ color: 'var(--accent)' }} />}
                            {proj.name}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem 0.8rem', color: 'var(--muted)', fontFamily: 'monospace' }}>
                          {proj.domain}
                        </td>
                        <td style={{ padding: '0.75rem 0.8rem', textAlign: 'center', color: 'var(--foreground)' }}>
                          {proj.uploadCount}
                        </td>
                        <td style={{ padding: '0.75rem 0.8rem', textAlign: 'right', color: 'var(--foreground)' }}>
                          {proj.keywordCount.toLocaleString()}
                        </td>
                        <td style={{ padding: '0.75rem 0.8rem', textAlign: 'right', color: 'var(--foreground)' }}>
                          {proj.backlinkCount.toLocaleString()}
                        </td>
                        <td style={{ padding: '0.75rem 0.8rem', textAlign: 'right', color: 'var(--foreground)' }}>
                          {proj.competitorPageCount.toLocaleString()}
                        </td>
                        <td style={{ padding: '0.75rem 0.8rem', textAlign: 'left', color: 'var(--muted)', fontSize: '0.78rem' }}>
                          {proj.lastUploadDate ? new Date(proj.lastUploadDate).toLocaleDateString() : 'N/A'}
                        </td>
                        <td style={{ padding: '0.75rem 0.8rem' }}>
                          {proj.gaps.length === 0 ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', color: 'var(--success)', fontSize: '0.7rem', fontWeight: 600 }}>
                              <CheckCircle2 size={12} /> Complete
                            </span>
                          ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                              {proj.gaps.map((gap, i) => (
                                <span
                                  key={i}
                                  style={{
                                    fontSize: '0.65rem',
                                    fontWeight: 500,
                                    background: gap === 'No Uploads Assigned' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                                    color: gap === 'No Uploads Assigned' ? 'var(--danger)' : 'var(--warning)',
                                    padding: '0.1rem 0.35rem',
                                    borderRadius: '4px',
                                    border: `1px solid ${gap === 'No Uploads Assigned' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)'}`,
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {gap}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
