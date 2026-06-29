'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { FileDown, Search, ClipboardList } from 'lucide-react';
import * as db from '@/lib/db';
import {
  filterRowsBySite,
  getSelectedSite,
  siteSelectionLabel,
  siteSelectionSlug,
  type SiteSelection
} from '@/lib/storage';
import type {
  KeywordRecord,
  BacklinkRecord,
  CompetitorPageRecord,
  KeywordGapRecord
} from '@/lib/types';
import Card from '@/components/Card';
import { buildOpportunityQueue } from '@/lib/opportunity-queue';
import {
  WORKFLOW_STATUSES,
  STATUS_COLORS,
  getOpportunityWorkflowMap,
  saveOpportunityWorkflowMap,
  type OpportunityWorkflowStatus
} from '@/lib/opportunity-workflow';
import { exportWorkflowActionPlanCSV, exportWorkflowActionPlanMD } from '@/lib/export';

export default function ActionPlanPage() {
  const [keywords, setKeywords] = useState<KeywordRecord[]>([]);
  const [backlinks, setBacklinks] = useState<BacklinkRecord[]>([]);
  const [competitors, setCompetitors] = useState<CompetitorPageRecord[]>([]);
  const [gaps, setGaps] = useState<KeywordGapRecord[]>([]);
  const [selectedSite, setSelectedSiteState] = useState<SiteSelection>(null);
  const [loading, setLoading] = useState(true);

  const [workflowMap, setWorkflowMap] = useState<Record<string, OpportunityWorkflowStatus>>({});
  const [statusFilter, setStatusFilter] = useState<'All' | 'Planned' | 'In Progress' | 'Done'>('All');
  const [typeFilter, setTypeFilter] = useState<'all' | 'content' | 'gap' | 'backlink' | 'competitor'>('all');

  useEffect(() => {
    setSelectedSiteState(getSelectedSite());

    const map = getOpportunityWorkflowMap();
    setWorkflowMap(map);

    Promise.all([
      db.getKeywords(),
      db.getBacklinks(),
      db.getCompetitorPages(),
      db.getKeywordGaps(),
    ]).then(([kw, bl, cp, kg]) => {
      setKeywords(kw);
      setBacklinks(bl);
      setCompetitors(cp);
      setGaps(kg);
    }).finally(() => setLoading(false));
  }, []);

  const handleStatusChange = (id: string, newStatus: OpportunityWorkflowStatus) => {
    const updated = { ...workflowMap, [id]: newStatus };
    setWorkflowMap(updated);
    saveOpportunityWorkflowMap(updated);
  };

  const scopedKeywords = filterRowsBySite(keywords, selectedSite);
  const scopedBacklinks = filterRowsBySite(backlinks, selectedSite);
  const scopedGaps = filterRowsBySite(gaps, selectedSite);
  const scopedCompetitors = filterRowsBySite(competitors, selectedSite);
  const scopeLabel = siteSelectionLabel(selectedSite);

  const queue = useMemo(() => {
    return buildOpportunityQueue(scopedKeywords, scopedGaps, scopedBacklinks, scopedCompetitors);
  }, [scopedKeywords, scopedGaps, scopedBacklinks, scopedCompetitors]);

  const enrichedQueue = useMemo(() => {
    return queue.map((item) => ({
      ...item,
      status: workflowMap[item.id] || 'New',
    }));
  }, [queue, workflowMap]);

  // Keep only planned, in progress, or completed items
  const actionPlanQueue = useMemo(() => {
    return enrichedQueue.filter(
      (item) => item.status === 'Planned' || item.status === 'In Progress' || item.status === 'Done'
    );
  }, [enrichedQueue]);

  // Apply filters
  const filteredPlan = useMemo(() => {
    return actionPlanQueue.filter((item) => {
      if (typeFilter !== 'all' && item.type !== typeFilter) {
        return false;
      }
      if (statusFilter !== 'All' && item.status !== statusFilter) {
        return false;
      }
      return true;
    });
  }, [actionPlanQueue, typeFilter, statusFilter]);

  const counts = useMemo(() => {
    const planned = actionPlanQueue.filter((item) => item.status === 'Planned').length;
    const inProgress = actionPlanQueue.filter((item) => item.status === 'In Progress').length;
    const done = actionPlanQueue.filter((item) => item.status === 'Done').length;
    const totalImpact = actionPlanQueue.reduce((sum, item) => sum + (item.impact || 0), 0);
    return {
      total: actionPlanQueue.length,
      planned,
      inProgress,
      done,
      totalImpact,
    };
  }, [actionPlanQueue]);

  const handleExportCSV = () => {
    const slug = siteSelectionSlug(selectedSite);
    exportWorkflowActionPlanCSV(filteredPlan, slug);
  };

  const handleExportMD = () => {
    const label = siteSelectionLabel(selectedSite);
    const slug = siteSelectionSlug(selectedSite);
    exportWorkflowActionPlanMD(filteredPlan, label, slug);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80vh', color: 'var(--muted)', fontSize: '0.9rem' }}>
        Loading Action Plan…
      </div>
    );
  }

  // If the action plan is entirely empty
  if (actionPlanQueue.length === 0) {
    return (
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ marginBottom: '1.75rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.3rem' }}>Action Plan</h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>View, track, and export your curated SEO tasks.</p>
        </div>

        <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '0.9rem 1rem', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
            Active Project / Site
          </div>
          <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{scopeLabel}</div>
        </div>

        <div style={{ padding: '4.5rem 2rem', textAlign: 'center', background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--card-border)', marginTop: '2.5rem' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(99, 102, 241, 0.08)',
            color: 'var(--accent)',
            marginBottom: '1.25rem'
          }}>
            <ClipboardList size={32} />
          </div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.5rem' }}>Your Action Plan is Empty</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', maxWidth: '480px', margin: '0 auto 1.75rem', lineHeight: '1.5' }}>
            This workspace compiles your curated SEO opportunities. Go to the dashboard queue and mark items as <strong style={{ color: '#38bdf8' }}>Planned</strong>, <strong style={{ color: 'var(--warning)' }}>In Progress</strong>, or <strong style={{ color: 'var(--success)' }}>Done</strong> to add them here.
          </p>
          <Link href="/" style={{ display: 'inline-block', background: 'var(--accent)', color: '#fff', padding: '0.6rem 1.5rem', borderRadius: '7px', textDecoration: 'none', fontWeight: 600, fontSize: '0.85rem', transition: 'background 0.15s' }}>
            Go to Dashboard Queue
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.3rem' }}>SEO Action Plan</h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>Manage your curated execution queue and track deployment progress.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={handleExportCSV}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: 'var(--card)',
              border: '1px solid var(--card-border)',
              color: 'var(--foreground)',
              padding: '0.45rem 0.9rem',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.borderColor = 'var(--accent)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--card)';
              e.currentTarget.style.borderColor = 'var(--card-border)';
            }}
          >
            <FileDown size={14} /> Export CSV
          </button>
          <button
            onClick={handleExportMD}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: 'var(--card)',
              border: '1px solid var(--card-border)',
              color: 'var(--foreground)',
              padding: '0.45rem 0.9rem',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.borderColor = 'var(--accent)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--card)';
              e.currentTarget.style.borderColor = 'var(--card-border)';
            }}
          >
            <FileDown size={14} /> Export Markdown
          </button>
        </div>
      </div>

      {/* Scope Block */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '0.9rem 1rem', marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
          Active Project / Site Scope
        </div>
        <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{scopeLabel}</div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <Card title="Plan Items" value={counts.total} sub="total saved in plan" />
        <Card title="Planned" value={counts.planned} sub="to be deployed" />
        <Card title="In Progress" value={counts.inProgress} sub="currently active" accent />
        <Card title="Done" value={counts.done} sub="successfully deployed" accent />
        <Card title="Total Impact" value={counts.totalImpact} sub="cumulative search value" />
      </div>

      {/* Main Workspace Workspace */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '1.5rem', marginBottom: '2rem' }}>
        {/* Compact Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
          {/* Status Tabs */}
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)', marginRight: '0.35rem', fontWeight: 500 }}>Status:</span>
            {(
              [
                { id: 'All', label: 'All Statuses' },
                { id: 'Planned', label: 'Planned' },
                { id: 'In Progress', label: 'In Progress' },
                { id: 'Done', label: 'Done' },
              ] as const
            ).map((statusOption) => {
              const active = statusFilter === statusOption.id;
              let activeBorder = 'var(--accent)';
              let activeBg = 'var(--accent)';
              let activeColor = '#fff';

              if (active) {
                if (statusOption.id === 'Planned') { activeBg = 'rgba(56, 189, 248, 0.12)'; activeColor = '#38bdf8'; activeBorder = '#38bdf8'; }
                else if (statusOption.id === 'In Progress') { activeBg = 'rgba(245, 158, 11, 0.12)'; activeColor = 'var(--warning)'; activeBorder = 'var(--warning)'; }
                else if (statusOption.id === 'Done') { activeBg = 'rgba(16, 185, 129, 0.12)'; activeColor = 'var(--success)'; activeBorder = 'var(--success)'; }
                else { activeBg = 'rgba(99, 102, 241, 0.12)'; activeColor = 'var(--accent)'; activeBorder = 'var(--accent)'; }
              }

              return (
                <button
                  key={statusOption.id}
                  onClick={() => setStatusFilter(statusOption.id)}
                  style={{
                    padding: '0.3rem 0.7rem',
                    borderRadius: '15px',
                    border: '1px solid',
                    borderColor: active ? activeBorder : 'var(--card-border)',
                    background: active ? activeBg : 'transparent',
                    color: active ? activeColor : 'var(--muted)',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    outline: 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.borderColor = 'var(--accent)';
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.borderColor = 'var(--card-border)';
                  }}
                >
                  {statusOption.label}
                </button>
              );
            })}
          </div>

          {/* Type Chips */}
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {(
              [
                { id: 'all', label: 'All Types' },
                { id: 'content', label: 'Content' },
                { id: 'gap', label: 'Keyword Gaps' },
                { id: 'backlink', label: 'Backlinks' },
                { id: 'competitor', label: 'Competitors' },
              ] as const
            ).map((tab) => {
              const active = typeFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setTypeFilter(tab.id)}
                  style={{
                    padding: '0.3rem 0.7rem',
                    borderRadius: '20px',
                    border: '1px solid',
                    borderColor: active ? 'var(--accent)' : 'var(--card-border)',
                    background: active ? 'var(--accent)' : 'rgba(255,255,255,0.02)',
                    color: active ? '#fff' : 'var(--muted)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    outline: 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.borderColor = 'var(--accent)';
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.borderColor = 'var(--card-border)';
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Empty state for filters */}
        {filteredPlan.length === 0 ? (
          <div style={{ padding: '3.5rem 2rem', textAlign: 'center', background: 'rgba(255,255,255,0.01)', borderRadius: '8px', border: '1px dashed var(--card-border)' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: 'rgba(99, 102, 241, 0.08)',
              color: 'var(--accent)',
              marginBottom: '0.75rem'
            }}>
              <Search size={24} />
            </div>
            <h4 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.25rem' }}>No matching opportunities</h4>
            <p style={{ color: 'var(--muted)', fontSize: '0.82rem', marginBottom: '1.25rem', maxWidth: '400px', margin: '0.25rem auto 1.25rem' }}>
              Your current filters (Type: <strong>{typeFilter}</strong>, Status: <strong>{statusFilter}</strong>) did not match any plan items.
            </p>
            <button
              onClick={() => {
                setTypeFilter('all');
                setStatusFilter('All');
              }}
              style={{
                display: 'inline-block',
                background: 'var(--accent)',
                color: '#fff',
                padding: '0.45rem 1.2rem',
                borderRadius: '6px',
                fontSize: '0.82rem',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left', minWidth: '900px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--card-border)', color: 'var(--muted)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '0.6rem 0.5rem', width: '120px' }}>Priority</th>
                  <th style={{ padding: '0.6rem 0.5rem', width: '110px' }}>Type</th>
                  <th style={{ padding: '0.6rem 0.5rem', width: '230px' }}>Opportunity</th>
                  <th style={{ padding: '0.6rem 0.5rem', width: '110px' }}>Impact</th>
                  <th style={{ padding: '0.6rem 0.5rem', width: '130px' }}>Source</th>
                  <th style={{ padding: '0.6rem 0.5rem' }}>Recommended Action</th>
                  <th style={{ padding: '0.6rem 0.5rem', width: '140px' }}>Status</th>
                  <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right', width: '80px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlan.map((item) => {
                  let prioLabel = 'Low';
                  let prioColor = 'var(--muted)';
                  let prioBg = 'rgba(100, 116, 139, 0.1)';

                  if (item.score >= 70) {
                    prioLabel = 'High';
                    prioColor = 'var(--success)';
                    prioBg = 'rgba(16, 185, 129, 0.12)';
                  } else if (item.score >= 40) {
                    prioLabel = 'Medium';
                    prioColor = 'var(--warning)';
                    prioBg = 'rgba(245, 158, 11, 0.12)';
                  }

                  let impactText = '';
                  if (item.type === 'content' || item.type === 'gap') {
                    impactText = item.impact > 0 ? `Vol: ${item.impact.toLocaleString()}` : 'Vol: -';
                  } else if (item.type === 'backlink') {
                    impactText = `DA: ${item.impact}`;
                  } else if (item.type === 'competitor') {
                    impactText = item.impact > 0 ? `Traffic: ${item.impact.toLocaleString()}` : 'Traffic: -';
                  }

                  const statusColor = STATUS_COLORS[item.status] || { color: 'var(--foreground)', bg: 'rgba(255,255,255,0.05)' };

                  return (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: '1px solid var(--card-border)',
                        verticalAlign: 'middle',
                        transition: 'background-color 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.01)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <td style={{ padding: '0.65rem 0.5rem' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          color: prioColor,
                          background: prioBg,
                        }}>
                          {prioLabel} <span style={{ opacity: 0.8, marginLeft: '0.25rem', fontWeight: 400 }}>({item.score})</span>
                        </span>
                      </td>
                      <td style={{ padding: '0.65rem 0.5rem' }}>
                        <span style={{
                          display: 'inline-block',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          color: item.type === 'content' ? 'var(--accent)' : item.type === 'gap' ? '#38bdf8' : item.type === 'backlink' ? 'var(--success)' : 'var(--warning)',
                        }}>
                          {item.type}
                        </span>
                      </td>
                      <td style={{ padding: '0.65rem 0.5rem', maxWidth: '230px' }}>
                        <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.title}>
                          {item.title}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.detail}>
                          {item.detail}
                        </div>
                      </td>
                      <td style={{ padding: '0.65rem 0.5rem', fontWeight: 500, color: 'var(--foreground)' }}>
                        {impactText}
                      </td>
                      <td style={{ padding: '0.65rem 0.5rem' }}>
                        <span style={{
                          display: 'inline-block',
                          fontSize: '0.72rem',
                          color: 'var(--muted)',
                          border: '1px solid var(--card-border)',
                          borderRadius: '4px',
                          padding: '0.1rem 0.35rem',
                          background: 'rgba(255,255,255,0.01)',
                          maxWidth: '120px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }} title={item.sourceLabel}>
                          {item.sourceLabel}
                        </span>
                      </td>
                      <td style={{ padding: '0.65rem 0.5rem', color: 'var(--foreground)', opacity: 0.9 }}>
                        {item.recommendedAction}
                      </td>
                      <td style={{ padding: '0.65rem 0.5rem' }}>
                        <select
                          value={item.status}
                          onChange={(e) => handleStatusChange(item.id, e.target.value as OpportunityWorkflowStatus)}
                          style={{
                            padding: '0.25rem 0.5rem',
                            borderRadius: '6px',
                            border: '1px solid var(--card-border)',
                            color: statusColor.color,
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            outline: 'none',
                            width: '120px',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                            transition: 'all 0.15s ease',
                            backgroundColor: statusColor.bg,
                          }}
                        >
                          {WORKFLOW_STATUSES.map((status) => (
                            <option
                              key={status}
                              value={status}
                              style={{
                                background: 'var(--card)',
                                color: 'var(--foreground)',
                              }}
                            >
                              {status}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right' }}>
                        <Link
                          href={item.href || '#'}
                          style={{
                            display: 'inline-block',
                            color: 'var(--accent)',
                            textDecoration: 'none',
                            fontWeight: 600,
                            fontSize: '0.75rem',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '4px',
                            background: 'rgba(99, 102, 241, 0.08)',
                            transition: 'background 0.2s',
                          }}
                        >
                          View →
                        </Link>
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
  );
}
