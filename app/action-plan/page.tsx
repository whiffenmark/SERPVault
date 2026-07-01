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
  type SiteSelection,
  subscribeProjectScopeChange
} from '@/lib/storage';
import type {
  KeywordRecord,
  BacklinkRecord,
  CompetitorPageRecord,
  KeywordGapRecord,
  UploadRecord,
  ProjectRecord,
  ReferringDomainRecord,
  AnchorTextRecord,
  DedupeReport
} from '@/lib/types';
import Card from '@/components/Card';
import { buildOpportunityQueue } from '@/lib/opportunity-queue';
import { calculateDataHealth } from '@/lib/data-health';
import { convertHealthIssueToQueueItem } from '@/lib/health-action-items';
import {
  WORKFLOW_STATUSES,
  STATUS_COLORS,
  getOpportunityWorkflowMap,
  saveOpportunityWorkflowMap,
  type OpportunityWorkflowStatus,
  getMergedOpportunityWorkflowMap
} from '@/lib/opportunity-workflow';
import { exportWorkflowActionPlanCSV, exportWorkflowActionPlanMD } from '@/lib/export';
import {
  getActionPlanMetadataMap,
  saveActionPlanMetadataMap,
  type ActionPlanItemMetadata
} from '@/lib/action-plan-metadata';

function getImpactText(type: string, impact: number): string {
  if (type === 'content' || type === 'gap') {
    return impact > 0 ? `Monthly Vol: ${impact.toLocaleString()}` : 'Monthly Vol: -';
  }
  if (type === 'backlink') {
    return `DA: ${impact}`;
  }
  if (type === 'competitor') {
    return impact > 0 ? `Traffic: ${impact.toLocaleString()}` : 'Traffic: -';
  }
  if (type === 'health') {
    return impact === 3 ? 'Impact: Critical' : impact === 2 ? 'Impact: Warning' : 'Impact: Info';
  }
  return '';
}

export default function ActionPlanPage() {
  const [keywords, setKeywords] = useState<KeywordRecord[]>([]);
  const [backlinks, setBacklinks] = useState<BacklinkRecord[]>([]);
  const [competitors, setCompetitors] = useState<CompetitorPageRecord[]>([]);
  const [gaps, setGaps] = useState<KeywordGapRecord[]>([]);

  // Extra datasets needed for calculateDataHealth
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [referringDomains, setReferringDomains] = useState<ReferringDomainRecord[]>([]);
  const [anchorTexts, setAnchorTexts] = useState<AnchorTextRecord[]>([]);
  const [dedupeReports, setDedupeReports] = useState<DedupeReport[]>([]);

  const [selectedSite, setSelectedSiteState] = useState<SiteSelection>(null);
  const [loading, setLoading] = useState(true);

  const [workflowMap, setWorkflowMap] = useState<Record<string, OpportunityWorkflowStatus>>({});
  const [metadataMap, setMetadataMap] = useState<Record<string, ActionPlanItemMetadata>>({});
  const [statusFilter, setStatusFilter] = useState<'All' | 'Planned' | 'In Progress' | 'Done'>('All');
  const [typeFilter, setTypeFilter] = useState<'all' | 'content' | 'gap' | 'backlink' | 'competitor' | 'health'>('all');
  const [dueFilter, setDueFilter] = useState<'All' | 'Overdue' | 'This Week' | 'No Due Date'>('All');
  const [viewMode, setViewMode] = useState<'Board' | 'Table'>('Board');

  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<OpportunityWorkflowStatus | ''>('');
  const [bulkOwner, setBulkOwner] = useState<string>('');
  const [bulkDueDate, setBulkDueDate] = useState<string>('');

  useEffect(() => {
    setSelectedSiteState(getSelectedSite());

    const map = getOpportunityWorkflowMap();
    setWorkflowMap(map);
    getMergedOpportunityWorkflowMap().then((merged) => {
      setWorkflowMap(merged);
    });

    const meta = getActionPlanMetadataMap();
    setMetadataMap(meta);

    let savedView: string | null = null;
    try {
      savedView = localStorage.getItem('serpvault_action_plan_view');
    } catch (e) {
      console.warn('localStorage is not available for reading:', e);
    }
    if (savedView === 'Board' || savedView === 'Table') {
      setViewMode(savedView);
    }

    Promise.all([
      db.getKeywords(),
      db.getBacklinks(),
      db.getCompetitorPages(),
      db.getKeywordGaps(),
      db.getUploads(),
      db.getProjects(),
      db.getReferringDomains(),
      db.getAnchorTexts(),
      db.getDedupeReports(),
    ]).then(([kw, bl, cp, kg, u, p, rd, at, dr]) => {
      setKeywords(kw || []);
      setBacklinks(bl || []);
      setCompetitors(cp || []);
      setGaps(kg || []);
      setUploads(u || []);
      setProjects(p || []);
      setReferringDomains(rd || []);
      setAnchorTexts(at || []);
      setDedupeReports(dr || []);
    }).finally(() => setLoading(false));

    const unsubscribe = subscribeProjectScopeChange(() => {
      setSelectedSiteState(getSelectedSite());
    });
    return () => unsubscribe();
  }, []);

  const handleViewModeChange = (newMode: 'Board' | 'Table') => {
    setViewMode(newMode);
    try {
      localStorage.setItem('serpvault_action_plan_view', newMode);
    } catch (e) {
      console.warn('localStorage is not available for writing:', e);
    }
  };

  const handleStatusChange = (id: string, newStatus: OpportunityWorkflowStatus) => {
    const updated = { ...workflowMap, [id]: newStatus };
    setWorkflowMap(updated);
    saveOpportunityWorkflowMap(updated);
  };

  const handleMetadataChange = (id: string, patch: Partial<ActionPlanItemMetadata>) => {
    setMetadataMap((prev) => {
      const updated = {
        ...prev,
        [id]: {
          ...(prev[id] || {}),
          ...patch,
          updatedAt: new Date().toISOString(),
        },
      };
      saveActionPlanMetadataMap(updated);
      return updated;
    });
  };

  const handleToggleSelect = (id: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleClearSelection = () => {
    setSelectedItemIds(new Set());
  };

  const scopedKeywords = filterRowsBySite(keywords, selectedSite);
  const scopedBacklinks = filterRowsBySite(backlinks, selectedSite);
  const scopedGaps = filterRowsBySite(gaps, selectedSite);
  const scopedCompetitors = filterRowsBySite(competitors, selectedSite);
  const scopeLabel = siteSelectionLabel(selectedSite);

  const selectedProjectId = useMemo(() => {
    if (!selectedSite) return null;
    const project = projects.find(
      (p) =>
        p.domain === selectedSite.domain &&
        (p.location || '') === (selectedSite.location || '') &&
        (p.niche || '') === (selectedSite.niche || '')
    );
    return project ? project.id : null;
  }, [projects, selectedSite]);

  const healthSummary = useMemo(() => {
    if (loading) return null;
    return calculateDataHealth(
      uploads,
      projects,
      keywords,
      gaps,
      competitors,
      backlinks,
      referringDomains,
      anchorTexts,
      dedupeReports,
      selectedProjectId
    );
  }, [
    loading,
    uploads,
    projects,
    keywords,
    gaps,
    competitors,
    backlinks,
    referringDomains,
    anchorTexts,
    dedupeReports,
    selectedProjectId,
  ]);

  const healthQueueItems = useMemo(() => {
    if (!healthSummary) return [];
    return healthSummary.issues.map((issue) =>
      convertHealthIssueToQueueItem(issue, selectedProjectId)
    );
  }, [healthSummary, selectedProjectId]);

  const queue = useMemo(() => {
    const opps = buildOpportunityQueue(scopedKeywords, scopedGaps, scopedBacklinks, scopedCompetitors);
    return [...opps, ...healthQueueItems];
  }, [scopedKeywords, scopedGaps, scopedBacklinks, scopedCompetitors, healthQueueItems]);

  const enrichedQueue = useMemo(() => {
    return queue.map((item) => {
      const meta = metadataMap[item.id] || {};
      return {
        ...item,
        status: workflowMap[item.id] || 'New',
        owner: meta.owner,
        dueDate: meta.dueDate,
        notes: meta.notes,
        updatedAt: meta.updatedAt,
      };
    });
  }, [queue, workflowMap, metadataMap]);

  // Keep only planned, in progress, or completed items
  const actionPlanQueue = useMemo(() => {
    return enrichedQueue.filter(
      (item) => item.status === 'Planned' || item.status === 'In Progress' || item.status === 'Done'
    );
  }, [enrichedQueue]);

  // Due date calculation helpers
  const { todayStr, next7Str } = useMemo(() => {
    const today = new Date();
    const next7 = new Date();
    next7.setDate(today.getDate() + 7);
    return {
      todayStr: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`,
      next7Str: `${next7.getFullYear()}-${String(next7.getMonth() + 1).padStart(2, '0')}-${String(next7.getDate()).padStart(2, '0')}`,
    };
  }, []);

  const isOverdue = (dueDate?: string, status?: string) => {
    return !!(dueDate && dueDate < todayStr && status !== 'Done');
  };

  const isThisWeek = (dueDate?: string) => {
    return !!(dueDate && dueDate >= todayStr && dueDate <= next7Str);
  };

  // Apply filters
  const filteredPlan = useMemo(() => {
    return actionPlanQueue.filter((item) => {
      if (typeFilter !== 'all' && item.type !== typeFilter) {
        return false;
      }
      if (statusFilter !== 'All' && item.status !== statusFilter) {
        return false;
      }
      if (dueFilter === 'Overdue') {
        if (!isOverdue(item.dueDate, item.status)) return false;
      } else if (dueFilter === 'This Week') {
        if (!isThisWeek(item.dueDate)) return false;
      } else if (dueFilter === 'No Due Date') {
        if (item.dueDate) return false;
      }
      return true;
    });
  }, [actionPlanQueue, typeFilter, statusFilter, dueFilter, todayStr, next7Str]);

  const filteredPlanIds = useMemo(() => new Set(filteredPlan.map(item => item.id)), [filteredPlan]);

  useEffect(() => {
    setSelectedItemIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (filteredPlanIds.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [filteredPlanIds]);

  const isAllFilteredSelected = useMemo(() => {
    if (filteredPlan.length === 0) return false;
    return filteredPlan.every((item) => selectedItemIds.has(item.id));
  }, [filteredPlan, selectedItemIds]);

  const handleSelectAllToggle = () => {
    if (isAllFilteredSelected) {
      setSelectedItemIds((prev) => {
        const next = new Set(prev);
        filteredPlan.forEach((item) => next.delete(item.id));
        return next;
      });
    } else {
      setSelectedItemIds((prev) => {
        const next = new Set(prev);
        filteredPlan.forEach((item) => next.add(item.id));
        return next;
      });
    }
  };

  const selectedStats = useMemo(() => {
    let totalImpact = 0;
    let overdueCount = 0;
    selectedItemIds.forEach((id) => {
      const item = actionPlanQueue.find((q) => q.id === id);
      if (item) {
        totalImpact += item.impact || 0;
        if (isOverdue(item.dueDate, item.status)) {
          overdueCount++;
        }
      }
    });
    return { totalImpact, overdueCount };
  }, [selectedItemIds, actionPlanQueue, todayStr]);

  const handleApplyBulkActions = () => {
    if (selectedItemIds.size === 0) return;

    let newWorkflowMap = { ...workflowMap };
    let newMetadataMap = { ...metadataMap };
    let hasWorkflowChanges = false;
    let hasMetadataChanges = false;
    const now = new Date().toISOString();

    selectedItemIds.forEach((id) => {
      if (bulkStatus) {
        newWorkflowMap[id] = bulkStatus;
        hasWorkflowChanges = true;
      }

      const patch: Partial<ActionPlanItemMetadata> = {};
      if (bulkOwner.trim() !== '') {
        patch.owner = bulkOwner.trim();
      }
      if (bulkDueDate !== '') {
        patch.dueDate = bulkDueDate;
      }

      if (Object.keys(patch).length > 0) {
        newMetadataMap[id] = {
          ...(newMetadataMap[id] || {}),
          ...patch,
          updatedAt: now,
        };
        hasMetadataChanges = true;
      }
    });

    if (hasWorkflowChanges) {
      setWorkflowMap(newWorkflowMap);
      saveOpportunityWorkflowMap(newWorkflowMap);
    }
    if (hasMetadataChanges) {
      setMetadataMap(newMetadataMap);
      saveActionPlanMetadataMap(newMetadataMap);
    }

    setBulkStatus('');
    setBulkOwner('');
    setBulkDueDate('');
    setSelectedItemIds(new Set());
  };

  const handleBulkMarkDone = () => {
    if (selectedItemIds.size === 0) return;

    const newWorkflowMap = { ...workflowMap };
    let newMetadataMap = { ...metadataMap };
    let hasMetadataChanges = false;
    const now = new Date().toISOString();

    selectedItemIds.forEach((id) => {
      newWorkflowMap[id] = 'Done';

      const patch: Partial<ActionPlanItemMetadata> = {};
      if (bulkOwner.trim() !== '') {
        patch.owner = bulkOwner.trim();
      }
      if (bulkDueDate !== '') {
        patch.dueDate = bulkDueDate;
      }

      if (Object.keys(patch).length > 0) {
        newMetadataMap[id] = {
          ...(newMetadataMap[id] || {}),
          ...patch,
          updatedAt: now,
        };
        hasMetadataChanges = true;
      }
    });

    setWorkflowMap(newWorkflowMap);
    saveOpportunityWorkflowMap(newWorkflowMap);

    if (hasMetadataChanges) {
      setMetadataMap(newMetadataMap);
      saveActionPlanMetadataMap(newMetadataMap);
    }

    setBulkStatus('');
    setBulkOwner('');
    setBulkDueDate('');
    setSelectedItemIds(new Set());
  };

  const counts = useMemo(() => {
    const planned = actionPlanQueue.filter((item) => item.status === 'Planned').length;
    const inProgress = actionPlanQueue.filter((item) => item.status === 'In Progress').length;
    const done = actionPlanQueue.filter((item) => item.status === 'Done').length;
    const totalImpact = actionPlanQueue.reduce((sum, item) => sum + (item.impact || 0), 0);

    // New stats
    const assigned = actionPlanQueue.filter((item) => item.owner && item.owner.trim() !== '').length;
    const dueThisWeek = actionPlanQueue.filter((item) => item.dueDate && item.dueDate >= todayStr && item.dueDate <= next7Str).length;
    const overdue = actionPlanQueue.filter((item) => item.dueDate && item.dueDate < todayStr && item.status !== 'Done').length;
    const withNotes = actionPlanQueue.filter((item) => item.notes && item.notes.trim() !== '').length;

    return {
      total: actionPlanQueue.length,
      planned,
      inProgress,
      done,
      totalImpact,
      assigned,
      dueThisWeek,
      overdue,
      withNotes,
    };
  }, [actionPlanQueue, todayStr, next7Str]);

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
            type="button"
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
            type="button"
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
        <Card title="Plan Items" value={counts.total} sub="total saved in plan" />
        <Card title="Planned" value={counts.planned} sub="to be deployed" />
        <Card title="In Progress" value={counts.inProgress} sub="currently active" accent />
        <Card title="Done" value={counts.done} sub="successfully deployed" accent />
        <Card title="Total Impact" value={counts.totalImpact} sub="cumulative search value" />
      </div>

      {/* Secondary Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '0.8rem 1rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>Assigned Items</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--foreground)' }}>{counts.assigned}</div>
        </div>
        <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '0.8rem 1rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>Due This Week</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: counts.dueThisWeek > 0 ? 'var(--warning)' : 'var(--foreground)' }}>{counts.dueThisWeek}</div>
        </div>
        <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '0.8rem 1rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>Overdue</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: counts.overdue > 0 ? 'var(--danger)' : 'var(--foreground)' }}>{counts.overdue}</div>
        </div>
        <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '0.8rem 1rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>Items with Notes</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--foreground)' }}>{counts.withNotes}</div>
        </div>
      </div>

      {/* Main Workspace Workspace */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '1.5rem', marginBottom: '2rem' }}>
        {/* Compact Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--card-border)', paddingBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
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
                    type="button"
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
                  { id: 'health', label: 'Data Health' },
                ] as const
              ).map((tab) => {
                const active = typeFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
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

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--muted)', marginRight: '0.35rem', fontWeight: 500 }}>Due Date:</span>
              {(
                [
                  { id: 'All', label: 'All Due' },
                  { id: 'Overdue', label: 'Overdue' },
                  { id: 'This Week', label: 'This Week' },
                  { id: 'No Due Date', label: 'No Due Date' },
                ] as const
              ).map((dueOption) => {
                const active = dueFilter === dueOption.id;
                let activeBorder = 'var(--accent)';
                let activeBg = 'var(--accent)';
                let activeColor = '#fff';

                if (active) {
                  if (dueOption.id === 'Overdue') { activeBg = 'rgba(239, 68, 68, 0.12)'; activeColor = 'var(--danger)'; activeBorder = 'var(--danger)'; }
                  else if (dueOption.id === 'This Week') { activeBg = 'rgba(99, 102, 241, 0.12)'; activeColor = 'var(--accent)'; activeBorder = 'var(--accent)'; }
                  else if (dueOption.id === 'No Due Date') { activeBg = 'rgba(100, 116, 139, 0.12)'; activeColor = 'var(--muted)'; activeBorder = 'var(--muted)'; }
                  else { activeBg = 'rgba(255,255,255,0.08)'; activeColor = 'var(--foreground)'; activeBorder = 'var(--card-border)'; }
                }

                return (
                  <button
                    key={dueOption.id}
                    type="button"
                    onClick={() => setDueFilter(dueOption.id)}
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
                    {dueOption.label}
                  </button>
                );
              })}
            </div>

            {/* View Toggle */}
            <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', padding: '0.15rem', border: '1px solid var(--card-border)' }}>
              {(['Board', 'Table'] as const).map((mode) => {
                const active = viewMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => handleViewModeChange(mode)}
                    style={{
                      padding: '0.25rem 0.6rem',
                      borderRadius: '4px',
                      border: 'none',
                      background: active ? 'var(--accent)' : 'transparent',
                      color: active ? '#fff' : 'var(--muted)',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      outline: 'none',
                    }}
                  >
                    {mode}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Selection Helper Header */}
        {filteredPlan.length > 0 && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
            padding: '0.5rem 0.75rem',
            background: 'rgba(255, 255, 255, 0.01)',
            border: '1px dashed var(--card-border)',
            borderRadius: '6px',
            fontSize: '0.8rem',
          }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button
                type="button"
                onClick={handleSelectAllToggle}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--card-border)',
                  color: 'var(--foreground)',
                  padding: '0.25rem 0.6rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--card-border)';
                }}
              >
                {isAllFilteredSelected ? 'Deselect All Visible' : `Select All Visible (${filteredPlan.length})`}
              </button>
              {selectedItemIds.size > 0 && (
                <button
                  type="button"
                  onClick={handleClearSelection}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--card-border)',
                    color: 'var(--muted)',
                    padding: '0.25rem 0.6rem',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--foreground)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--muted)';
                  }}
                >
                  Clear Selection
                </button>
              )}
            </div>
            {selectedItemIds.size > 0 && (
              <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>
                <strong style={{ color: 'var(--accent)' }}>{selectedItemIds.size}</strong> selected items
              </span>
            )}
          </div>
        )}

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
            <p style={{ color: 'var(--muted)', fontSize: '0.82rem', marginBottom: '1.25rem', maxWidth: '450px', margin: '0.25rem auto 1.25rem' }}>
              Your current filters (Type: <strong>{typeFilter}</strong>, Status: <strong>{statusFilter}</strong>, Due: <strong>{dueFilter}</strong>) did not match any plan items.
            </p>
            <button
              type="button"
              onClick={() => {
                setTypeFilter('all');
                setStatusFilter('All');
                setDueFilter('All');
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
        ) : viewMode === 'Board' ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '1.25rem',
            alignItems: 'start',
          }}>
            {(['Planned', 'In Progress', 'Done'] as const).map((status) => {
              const columnItems = filteredPlan.filter((item) => item.status === status);
              const count = columnItems.length;
              const columnImpact = columnItems.reduce((sum, item) => sum + (item.impact || 0), 0);

              let statusColor = '#38bdf8';
              if (status === 'In Progress') statusColor = 'var(--warning)';
              else if (status === 'Done') statusColor = 'var(--success)';

              return (
                <div
                  key={status}
                  style={{
                    background: 'rgba(255, 255, 255, 0.01)',
                    borderRadius: '8px',
                    border: '1px solid var(--card-border)',
                    padding: '0.75rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                    minHeight: '400px',
                  }}
                >
                  {/* Column Header */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingBottom: '0.5rem',
                    borderBottom: '1px solid var(--card-border)',
                    marginBottom: '0.25rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: statusColor,
                      }} />
                      <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--foreground)' }}>{status}</span>
                      <span style={{
                        fontSize: '0.7rem',
                        background: 'rgba(255,255,255,0.06)',
                        padding: '0.05rem 0.35rem',
                        borderRadius: '10px',
                        color: 'var(--muted)',
                        fontWeight: 600
                      }}>{count}</span>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>
                      Impact: <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>{columnImpact.toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Column Items */}
                  {columnItems.length === 0 ? (
                    <div style={{
                      padding: '2rem 1rem',
                      textAlign: 'center',
                      color: 'var(--muted)',
                      fontSize: '0.75rem',
                      border: '1px dashed rgba(255,255,255,0.03)',
                      borderRadius: '6px',
                      background: 'rgba(0,0,0,0.05)'
                    }}>
                      No {status.toLowerCase()} items
                    </div>
                  ) : (
                    columnItems.map((item) => {
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

                      const impactText = getImpactText(item.type, item.impact);

                      const overdue = isOverdue(item.dueDate, item.status);
                      const thisWeek = isThisWeek(item.dueDate);
                      let dateColor = 'var(--foreground)';
                      let dateBorder = 'var(--card-border)';
                      let dateBg = 'rgba(255, 255, 255, 0.02)';
                      if (overdue) {
                        dateColor = 'var(--danger)';
                        dateBorder = 'rgba(239, 68, 68, 0.4)';
                        dateBg = 'rgba(239, 68, 68, 0.05)';
                      } else if (thisWeek) {
                        dateColor = 'var(--warning)';
                        dateBorder = 'rgba(245, 158, 11, 0.4)';
                        dateBg = 'rgba(245, 158, 11, 0.05)';
                      }

                        return (
                          <div
                            key={item.id}
                            style={{
                              background: 'var(--card)',
                              border: selectedItemIds.has(item.id)
                                ? '1px solid var(--accent)'
                                : '1px solid var(--card-border)',
                              boxShadow: selectedItemIds.has(item.id)
                                ? '0 0 0 1px var(--accent)'
                                : 'none',
                              borderRadius: '8px',
                              padding: '0.75rem',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.6rem',
                              transition: 'all 0.15s ease',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = selectedItemIds.has(item.id)
                                ? 'var(--accent)'
                                : 'rgba(255, 255, 255, 0.15)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = selectedItemIds.has(item.id)
                                ? 'var(--accent)'
                                : 'var(--card-border)';
                            }}
                          >
                            {/* Priority, Score, Type and Impact */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={selectedItemIds.has(item.id)}
                                  onChange={() => handleToggleSelect(item.id)}
                                  style={{
                                    cursor: 'pointer',
                                    width: '14px',
                                    height: '14px',
                                  }}
                                />
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  padding: '0.15rem 0.4rem',
                                  borderRadius: '4px',
                                  fontSize: '0.7rem',
                                  fontWeight: 600,
                                  color: prioColor,
                                  background: prioBg,
                                }}>
                                  {prioLabel} <span style={{ opacity: 0.8, marginLeft: '0.2rem', fontWeight: 400 }}>({item.score})</span>
                                </span>
                                <span style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--muted)' }}>
                                  {impactText}
                                </span>
                              </div>
                              <span style={{
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                color: item.type === 'content' ? 'var(--accent)' : item.type === 'gap' ? '#38bdf8' : item.type === 'backlink' ? 'var(--success)' : item.type === 'health' ? 'var(--danger)' : 'var(--warning)',
                              }}>
                                {item.type}
                              </span>
                            </div>

                          {/* Title & Detail */}
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: '0.15rem', color: 'var(--foreground)', lineHeight: '1.3' }} title={item.title}>
                              {item.title}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '0.2rem' }}>
                              <span style={{
                                display: 'inline-block',
                                fontSize: '0.68rem',
                                color: 'var(--muted)',
                                border: '1px solid var(--card-border)',
                                borderRadius: '3px',
                                padding: '0.05rem 0.25rem',
                                background: 'rgba(255,255,255,0.01)',
                                maxWidth: '120px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }} title={item.sourceLabel}>
                                {item.sourceLabel}
                              </span>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }} title={item.detail}>
                                {item.detail}
                              </span>
                            </div>
                          </div>

                          {/* Recommended Action */}
                          <div style={{
                            fontSize: '0.75rem',
                            color: 'var(--foreground)',
                            opacity: 0.9,
                            borderLeft: '2px solid var(--card-border)',
                            paddingLeft: '0.5rem',
                            margin: '0.2rem 0',
                            lineHeight: '1.3'
                          }}>
                            {item.recommendedAction}
                          </div>

                          {/* Owner & Due Date Fields */}
                          <div style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              <span style={{ fontSize: '0.7rem', color: 'var(--muted)', width: '40px' }}>Owner:</span>
                              <input
                                type="text"
                                placeholder="Assign..."
                                value={item.owner || ''}
                                onChange={(e) => handleMetadataChange(item.id, { owner: e.target.value })}
                                style={{
                                  flex: 1,
                                  padding: '0.2rem 0.35rem',
                                  borderRadius: '4px',
                                  border: '1px solid var(--card-border)',
                                  background: 'rgba(255, 255, 255, 0.02)',
                                  color: 'var(--foreground)',
                                  fontSize: '0.75rem',
                                  outline: 'none',
                                }}
                                onFocus={(e) => {
                                  e.currentTarget.style.borderColor = 'var(--accent)';
                                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
                                }}
                                onBlur={(e) => {
                                  e.currentTarget.style.borderColor = 'var(--card-border)';
                                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.02)';
                                }}
                              />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              <span style={{ fontSize: '0.7rem', color: 'var(--muted)', width: '40px' }}>Due:</span>
                              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                <input
                                  type="date"
                                  value={item.dueDate || ''}
                                  onChange={(e) => handleMetadataChange(item.id, { dueDate: e.target.value })}
                                  style={{
                                    flex: 1,
                                    padding: '0.2rem 0.35rem',
                                    borderRadius: '4px',
                                    border: `1px solid ${dateBorder}`,
                                    background: dateBg,
                                    color: dateColor,
                                    fontSize: '0.75rem',
                                    outline: 'none',
                                    cursor: 'pointer',
                                    colorScheme: 'inherit',
                                  }}
                                  onFocus={(e) => {
                                    e.currentTarget.style.borderColor = 'var(--accent)';
                                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
                                  }}
                                  onBlur={(e) => {
                                    e.currentTarget.style.borderColor = dateBorder;
                                    e.currentTarget.style.backgroundColor = dateBg;
                                  }}
                                />
                                {overdue && (
                                  <span style={{ fontSize: '0.65rem', color: 'var(--danger)', fontWeight: 600 }}>Overdue</span>
                                )}
                                {thisWeek && !overdue && (
                                  <span style={{ fontSize: '0.65rem', color: 'var(--warning)', fontWeight: 600 }}>This Week</span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Notes Preview */}
                          <div>
                            <textarea
                              rows={1}
                              placeholder="Notes..."
                              value={item.notes || ''}
                              onChange={(e) => handleMetadataChange(item.id, { notes: e.target.value })}
                              style={{
                                width: '100%',
                                padding: '0.2rem 0.35rem',
                                borderRadius: '4px',
                                border: '1px solid var(--card-border)',
                                background: 'rgba(255, 255, 255, 0.02)',
                                color: 'var(--foreground)',
                                fontSize: '0.75rem',
                                outline: 'none',
                                resize: 'vertical',
                                minHeight: '26px',
                                lineHeight: '1.2',
                                colorScheme: 'inherit',
                              }}
                              onFocus={(e) => {
                                e.currentTarget.style.borderColor = 'var(--accent)';
                                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
                              }}
                              onBlur={(e) => {
                                e.currentTarget.style.borderColor = 'var(--card-border)';
                                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.02)';
                              }}
                            />
                          </div>

                          {/* Card Footer: View and Quick Move */}
                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginTop: '0.4rem',
                            borderTop: '1px solid var(--card-border)',
                            paddingTop: '0.5rem'
                          }}>
                            <Link
                              href={item.href || '#'}
                              style={{
                                display: 'inline-block',
                                color: 'var(--accent)',
                                textDecoration: 'none',
                                fontWeight: 600,
                                fontSize: '0.72rem',
                                padding: '0.2rem 0.4rem',
                                borderRadius: '4px',
                                background: 'rgba(99, 102, 241, 0.08)',
                                transition: 'background 0.2s',
                              }}
                            >
                              View →
                            </Link>
                            <div style={{ display: 'flex', gap: '0.25rem' }}>
                              {/* Move Left Button */}
                              {status === 'In Progress' && (
                                <button
                                  type="button"
                                  onClick={() => handleStatusChange(item.id, 'Planned')}
                                  style={{
                                    padding: '0.2rem 0.4rem',
                                    borderRadius: '4px',
                                    border: '1px solid var(--card-border)',
                                    background: 'rgba(255, 255, 255, 0.03)',
                                    color: 'var(--muted)',
                                    fontSize: '0.7rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                                    e.currentTarget.style.borderColor = 'var(--accent)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                                    e.currentTarget.style.borderColor = 'var(--card-border)';
                                  }}
                                >
                                  ← Plan
                                </button>
                              )}
                              {status === 'Done' && (
                                <button
                                  type="button"
                                  onClick={() => handleStatusChange(item.id, 'In Progress')}
                                  style={{
                                    padding: '0.2rem 0.4rem',
                                    borderRadius: '4px',
                                    border: '1px solid var(--card-border)',
                                    background: 'rgba(255, 255, 255, 0.03)',
                                    color: 'var(--muted)',
                                    fontSize: '0.7rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                                    e.currentTarget.style.borderColor = 'var(--accent)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                                    e.currentTarget.style.borderColor = 'var(--card-border)';
                                  }}
                                >
                                  ← Reopen
                                </button>
                              )}

                              {/* Move Right Button */}
                              {status === 'Planned' && (
                                <button
                                  type="button"
                                  onClick={() => handleStatusChange(item.id, 'In Progress')}
                                  style={{
                                    padding: '0.2rem 0.4rem',
                                    borderRadius: '4px',
                                    border: '1px solid var(--card-border)',
                                    background: 'rgba(255, 255, 255, 0.03)',
                                    color: 'var(--muted)',
                                    fontSize: '0.7rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                                    e.currentTarget.style.borderColor = 'var(--accent)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                                    e.currentTarget.style.borderColor = 'var(--card-border)';
                                  }}
                                >
                                  Start →
                                </button>
                              )}
                              {status === 'In Progress' && (
                                <button
                                  type="button"
                                  onClick={() => handleStatusChange(item.id, 'Done')}
                                  style={{
                                    padding: '0.2rem 0.4rem',
                                    borderRadius: '4px',
                                    border: '1px solid var(--card-border)',
                                    background: 'rgba(255, 255, 255, 0.03)',
                                    color: 'var(--muted)',
                                    fontSize: '0.7rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                                    e.currentTarget.style.borderColor = 'var(--accent)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                                    e.currentTarget.style.borderColor = 'var(--card-border)';
                                  }}
                                >
                                  Done ✓
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left', minWidth: '1100px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--card-border)', color: 'var(--muted)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '0.6rem 0.5rem', width: '40px' }}>
                    <input
                      type="checkbox"
                      checked={isAllFilteredSelected}
                      onChange={handleSelectAllToggle}
                      style={{ cursor: 'pointer' }}
                    />
                  </th>
                  <th style={{ padding: '0.6rem 0.5rem', width: '100px' }}>Priority</th>
                  <th style={{ padding: '0.6rem 0.5rem', width: '90px' }}>Type</th>
                  <th style={{ padding: '0.6rem 0.5rem', width: '180px' }}>Opportunity</th>
                  <th style={{ padding: '0.6rem 0.5rem', width: '90px' }}>Impact</th>
                  <th style={{ padding: '0.6rem 0.5rem', width: '100px' }}>Source</th>
                  <th style={{ padding: '0.6rem 0.5rem', minWidth: '150px' }}>Recommended Action</th>
                  <th style={{ padding: '0.6rem 0.5rem', width: '110px' }}>Owner</th>
                  <th style={{ padding: '0.6rem 0.5rem', width: '130px' }}>Due Date</th>
                  <th style={{ padding: '0.6rem 0.5rem', width: '150px' }}>Notes</th>
                  <th style={{ padding: '0.6rem 0.5rem', width: '120px' }}>Status</th>
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

                  const impactText = getImpactText(item.type, item.impact);

                  const statusColor = STATUS_COLORS[item.status] || { color: 'var(--foreground)', bg: 'rgba(255,255,255,0.05)' };

                  return (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: '1px solid var(--card-border)',
                        verticalAlign: 'middle',
                        transition: 'background-color 0.15s ease',
                        backgroundColor: selectedItemIds.has(item.id)
                          ? 'rgba(99, 102, 241, 0.04)'
                          : 'transparent',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = selectedItemIds.has(item.id)
                          ? 'rgba(99, 102, 241, 0.08)'
                          : 'rgba(255, 255, 255, 0.01)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = selectedItemIds.has(item.id)
                          ? 'rgba(99, 102, 241, 0.04)'
                          : 'transparent';
                      }}
                    >
                      <td style={{ padding: '0.65rem 0.5rem' }}>
                        <input
                          type="checkbox"
                          checked={selectedItemIds.has(item.id)}
                          onChange={() => handleToggleSelect(item.id)}
                          style={{ cursor: 'pointer' }}
                        />
                      </td>
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
                          color: item.type === 'content' ? 'var(--accent)' : item.type === 'gap' ? '#38bdf8' : item.type === 'backlink' ? 'var(--success)' : item.type === 'health' ? 'var(--danger)' : 'var(--warning)',
                        }}>
                          {item.type}
                        </span>
                      </td>
                      <td style={{ padding: '0.65rem 0.5rem', maxWidth: '180px' }}>
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
                          maxWidth: '100px',
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

                      {/* Owner Column */}
                      <td style={{ padding: '0.65rem 0.5rem' }}>
                        <input
                          type="text"
                          placeholder="Owner..."
                          value={item.owner || ''}
                          onChange={(e) => handleMetadataChange(item.id, { owner: e.target.value })}
                          style={{
                            width: '100%',
                            padding: '0.25rem 0.4rem',
                            borderRadius: '4px',
                            border: '1px solid var(--card-border)',
                            background: 'rgba(255, 255, 255, 0.02)',
                            color: 'var(--foreground)',
                            fontSize: '0.75rem',
                            outline: 'none',
                            colorScheme: 'inherit',
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = 'var(--accent)';
                            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = 'var(--card-border)';
                            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.02)';
                          }}
                        />
                      </td>

                      {/* Due Date Column */}
                      <td style={{ padding: '0.65rem 0.5rem' }}>
                        <input
                          type="date"
                          value={item.dueDate || ''}
                          onChange={(e) => handleMetadataChange(item.id, { dueDate: e.target.value })}
                          style={{
                            width: '100%',
                            padding: '0.25rem 0.4rem',
                            borderRadius: '4px',
                            border: '1px solid var(--card-border)',
                            background: 'rgba(255, 255, 255, 0.02)',
                            color: 'var(--foreground)',
                            fontSize: '0.75rem',
                            outline: 'none',
                            cursor: 'pointer',
                            colorScheme: 'inherit',
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = 'var(--accent)';
                            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = 'var(--card-border)';
                            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.02)';
                          }}
                        />
                      </td>

                      {/* Notes Column */}
                      <td style={{ padding: '0.65rem 0.5rem' }}>
                        <textarea
                          rows={1}
                          placeholder="Add notes..."
                          value={item.notes || ''}
                          onChange={(e) => handleMetadataChange(item.id, { notes: e.target.value })}
                          style={{
                            width: '100%',
                            padding: '0.25rem 0.4rem',
                            borderRadius: '4px',
                            border: '1px solid var(--card-border)',
                            background: 'rgba(255, 255, 255, 0.02)',
                            color: 'var(--foreground)',
                            fontSize: '0.75rem',
                            outline: 'none',
                            resize: 'vertical',
                            minHeight: '26px',
                            lineHeight: '1.2',
                            colorScheme: 'inherit',
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = 'var(--accent)';
                            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = 'var(--card-border)';
                            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.02)';
                          }}
                        />
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

      {/* Floating Bulk Action Command Bar */}
      {selectedItemIds.size > 0 && (
        <>
          <style dangerouslySetInnerHTML={{__html: `
            @keyframes slideUp {
              from { transform: translate(-50%, 100%); opacity: 0; }
              to { transform: translate(-50%, 0); opacity: 1; }
            }
          `}} />
          <div style={{
            position: 'fixed',
            bottom: '2rem',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--card)',
            border: '2px solid var(--accent)',
            borderRadius: '12px',
            padding: '0.75rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            zIndex: 1000,
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.4)',
            flexWrap: 'wrap',
            maxWidth: '95%',
            animation: 'slideUp 0.2s ease-out',
            color: 'var(--foreground)',
          }}>
            {/* Selected count and counters */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderRight: '1px solid var(--card-border)', paddingRight: '1.25rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--foreground)' }}>
                {selectedItemIds.size} Selected
              </span>
              {selectedStats.totalImpact > 0 && (
                <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }} title="Selected Impact">
                  Impact: <strong style={{ color: 'var(--foreground)' }}>{selectedStats.totalImpact.toLocaleString()}</strong>
                </span>
              )}
              {selectedStats.overdueCount > 0 && (
                <span style={{ fontSize: '0.75rem', color: 'var(--danger)', fontWeight: 600 }} title="Selected Overdue">
                  {selectedStats.overdueCount} Overdue
                </span>
              )}
            </div>

            {/* Form Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <select
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value as OpportunityWorkflowStatus | '')}
                style={{
                  padding: '0.35rem 0.6rem',
                  borderRadius: '6px',
                  border: '1px solid var(--card-border)',
                  background: 'rgba(255, 255, 255, 0.02)',
                  color: 'var(--foreground)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value="" style={{ background: 'var(--card)' }}>Status...</option>
                <option value="Planned" style={{ background: 'var(--card)' }}>Planned</option>
                <option value="In Progress" style={{ background: 'var(--card)' }}>In Progress</option>
                <option value="Done" style={{ background: 'var(--card)' }}>Done</option>
              </select>

              <input
                type="text"
                placeholder="Assign Owner..."
                value={bulkOwner}
                onChange={(e) => setBulkOwner(e.target.value)}
                style={{
                  padding: '0.35rem 0.6rem',
                  borderRadius: '6px',
                  border: '1px solid var(--card-border)',
                  background: 'rgba(255, 255, 255, 0.02)',
                  color: 'var(--foreground)',
                  fontSize: '0.75rem',
                  outline: 'none',
                  width: '120px',
                }}
              />

              <input
                type="date"
                value={bulkDueDate}
                onChange={(e) => setBulkDueDate(e.target.value)}
                style={{
                  padding: '0.35rem 0.6rem',
                  borderRadius: '6px',
                  border: '1px solid var(--card-border)',
                  background: 'rgba(255, 255, 255, 0.02)',
                  color: 'var(--foreground)',
                  fontSize: '0.75rem',
                  outline: 'none',
                  cursor: 'pointer',
                  colorScheme: 'inherit',
                }}
              />

              {/* Apply Button */}
              <button
                type="button"
                onClick={handleApplyBulkActions}
                style={{
                  background: 'var(--accent)',
                  color: '#fff',
                  padding: '0.35rem 0.9rem',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--accent-hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--accent)';
                }}
              >
                Apply
              </button>

              {/* Mark Done Shortcut */}
              <button
                type="button"
                onClick={handleBulkMarkDone}
                style={{
                  background: 'rgba(16, 185, 129, 0.12)',
                  color: 'var(--success)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  padding: '0.35rem 0.9rem',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(16, 185, 129, 0.2)';
                  e.currentTarget.style.borderColor = 'var(--success)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(16, 185, 129, 0.12)';
                  e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.3)';
                }}
              >
                Mark Done ✓
              </button>

              {/* Clear Button */}
              <button
                type="button"
                onClick={handleClearSelection}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--card-border)',
                  color: 'var(--muted)',
                  padding: '0.35rem 0.8rem',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--muted)';
                  e.currentTarget.style.color = 'var(--foreground)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--card-border)';
                  e.currentTarget.style.color = 'var(--muted)';
                }}
              >
                Clear
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
