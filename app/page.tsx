'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import * as db from '@/lib/db';
import { filterRowsBySite, getSelectedSite, siteSelectionLabel, type SiteSelection, getSelectedProjectId } from '@/lib/storage';
import type { UploadRecord, KeywordRecord, BacklinkRecord, CompetitorPageRecord, KeywordGapRecord, DedupeReport } from '@/lib/types';
import Card from '@/components/Card';
import { buildOpportunityQueue } from '@/lib/opportunity-queue';
import { BarChart2, Search } from 'lucide-react';

export default function DashboardPage() {
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [keywords, setKeywords] = useState<KeywordRecord[]>([]);
  const [backlinks, setBacklinks] = useState<BacklinkRecord[]>([]);
  const [competitors, setCompetitors] = useState<CompetitorPageRecord[]>([]);
  const [gaps, setGaps] = useState<KeywordGapRecord[]>([]);
  const [dedupeReports, setDedupeReports] = useState<DedupeReport[]>([]);
  const [selectedSite, setSelectedSiteState] = useState<SiteSelection>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'content' | 'gap' | 'backlink' | 'competitor'>('all');

  useEffect(() => {
    const site = getSelectedSite();
    setSelectedSiteState(site);

    Promise.all([
      db.getUploads(),
      db.getKeywords(),
      db.getBacklinks(),
      db.getCompetitorPages(),
      db.getKeywordGaps(),
      db.getDedupeReports(),
    ]).then(([u, kw, bl, cp, kg, dr]) => {
      setUploads(u); setKeywords(kw); setBacklinks(bl);
      setCompetitors(cp); setGaps(kg); setDedupeReports(dr);
    }).finally(() => setLoading(false));
  }, []);

  const selectedProjectId = getSelectedProjectId();
  const scopedUploads = selectedProjectId
    ? uploads.filter((u) => u.projectId === selectedProjectId)
    : uploads;

  const scopedKeywords = filterRowsBySite(keywords, selectedSite);
  const scopedBacklinks = filterRowsBySite(backlinks, selectedSite);
  const scopedGaps = filterRowsBySite(gaps, selectedSite);
  const scopedCompetitors = filterRowsBySite(competitors, selectedSite);
  const tagged = scopedKeywords.filter((k) => k.tag && k.tag !== 'Ignore');
  const highScore = scopedKeywords.filter((k) => (k.opportunityScore ?? 0) >= 70).length;
  const recentUploads = scopedUploads.slice(0, 5);
  const scopeLabel = siteSelectionLabel(selectedSite);

  const queue = useMemo(() => {
    return buildOpportunityQueue(scopedKeywords, scopedGaps, scopedBacklinks, scopedCompetitors);
  }, [scopedKeywords, scopedGaps, scopedBacklinks, scopedCompetitors]);

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.3rem' }}>SEO Command Center</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>Your private SEO research database. Upload CSVs to get started.</p>
      </div>
      <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '0.9rem 1rem', marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
          Active Project / Site
        </div>
        <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{scopeLabel}</div>
        <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
          This scope controls keyword, content, and export views. All Projects shows the full local dataset.
        </div>
      </div>

      {!loading && uploads.length === 0 && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '12px', padding: '2.5rem', textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚀</div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Welcome to SERPVault</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.875rem', maxWidth: '420px', margin: '0 auto 1.5rem' }}>
            Upload CSV exports from SEMrush, Ahrefs, Moz, or any SEO tool. Data is stored in your Supabase database.
          </p>
          <Link href="/upload" style={{ display: 'inline-block', background: 'var(--accent)', color: '#fff', padding: '0.6rem 1.5rem', borderRadius: '7px', textDecoration: 'none', fontWeight: 600, fontSize: '0.875rem' }}>
            Upload Your First CSV →
          </Link>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <Card title="Total Uploads" value={loading ? '…' : scopedUploads.length} sub={selectedSite ? 'in active project' : 'CSV files imported'} />
        <Card title="Keywords" value={loading ? '…' : scopedKeywords.length} sub={selectedSite ? 'in active project' : 'across all reports'} />
        <Card title="Backlinks" value={loading ? '…' : scopedBacklinks.length} sub={selectedSite ? 'in active project' : 'across all reports'} />
        <Card title="Competitor Pages" value={loading ? '…' : scopedCompetitors.length} sub={selectedSite ? 'in active project' : 'indexed'} />
        <Card title="Keyword Gaps" value={loading ? '…' : scopedGaps.length} sub={selectedSite ? 'in active project' : 'gap opportunities'} />
        <Card title="Tagged Rows" value={loading ? '…' : tagged.length} sub="items tagged" accent />
        <Card title="High Opportunity" value={loading ? '…' : highScore} sub="score ≥ 70" accent />
        <Card title="Dedupe Reports" value={loading ? '…' : dedupeReports.length} sub="created" />
      </div>

      {/* Opportunity Queue Section */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>Opportunity Queue</h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: '0.15rem' }}>
              Prioritized action items generated from keyword, gap, competitor page, and backlink data.
            </p>
          </div>

          {!loading && uploads.length > 0 && queue.length > 0 && (
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              {(
                [
                  { id: 'all', label: 'All', count: queue.length },
                  { id: 'content', label: 'Content', count: queue.filter((x) => x.type === 'content').length },
                  { id: 'gap', label: 'Keyword Gaps', count: queue.filter((x) => x.type === 'gap').length },
                  { id: 'backlink', label: 'Backlinks', count: queue.filter((x) => x.type === 'backlink').length },
                  { id: 'competitor', label: 'Competitors', count: queue.filter((x) => x.type === 'competitor').length },
                ] as const
              ).map((tabOption) => {
                const isActive = activeTab === tabOption.id;
                return (
                  <button
                    key={tabOption.id}
                    onClick={() => setActiveTab(tabOption.id)}
                    style={{
                      padding: '0.35rem 0.75rem',
                      borderRadius: '20px',
                      border: '1px solid',
                      borderColor: isActive ? 'var(--accent)' : 'var(--card-border)',
                      background: isActive ? 'var(--accent)' : 'rgba(255,255,255,0.02)',
                      color: isActive ? '#fff' : 'var(--muted)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      outline: 'none',
                    }}
                  >
                    {tabOption.label} <span style={{ opacity: 0.8, marginLeft: '0.2rem', fontWeight: 400 }}>({tabOption.count})</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {loading ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.875rem' }}>
            Loading opportunities…
          </div>
        ) : uploads.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', background: 'rgba(255,255,255,0.01)', borderRadius: '8px', border: '1px dashed var(--card-border)' }}>
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
              <BarChart2 size={24} />
            </div>
            <h4 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.25rem' }}>No Data Available</h4>
            <p style={{ color: 'var(--muted)', fontSize: '0.82rem', marginBottom: '1.25rem', maxWidth: '400px', margin: '0.25rem auto 1.25rem' }}>
              Upload search volume, gap, competitor, or backlink CSV reports to generate ranked tasks.
            </p>
            <Link href="/upload" style={{ display: 'inline-block', background: 'var(--accent)', color: '#fff', padding: '0.45rem 1.2rem', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 600, textDecoration: 'none' }}>
              Go to Upload Center
            </Link>
          </div>
        ) : queue.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', background: 'rgba(255,255,255,0.01)', borderRadius: '8px', border: '1px dashed var(--card-border)' }}>
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
            <h4 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.25rem' }}>No opportunities in active project</h4>
            <p style={{ color: 'var(--muted)', fontSize: '0.82rem', maxWidth: '480px', margin: '0.25rem auto 0' }}>
              The active project scope <strong>{scopeLabel}</strong> has no eligible opportunities. Try uploading keyword gap, competitor, backlink, or high-scoring keyword reports and assign them to this project.
            </p>
          </div>
        ) : (
          <>
            {(() => {
              const filteredItems = activeTab === 'all' ? queue : queue.filter((x) => x.type === activeTab);
              const topItems = filteredItems.slice(0, 10);

              if (filteredItems.length === 0) {
                return (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.82rem' }}>
                    No opportunities of type <strong>{activeTab === 'content' ? 'Content' : activeTab === 'gap' ? 'Keyword Gaps' : activeTab === 'backlink' ? 'Backlinks' : 'Competitors'}</strong> in this project scope.
                  </div>
                );
              }

              return (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left', minWidth: '700px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--card-border)', color: 'var(--muted)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        <th style={{ padding: '0.6rem 0.5rem', width: '130px' }}>Priority</th>
                        <th style={{ padding: '0.6rem 0.5rem', width: '220px' }}>Opportunity</th>
                        <th style={{ padding: '0.6rem 0.5rem', width: '110px' }}>Impact</th>
                        <th style={{ padding: '0.6rem 0.5rem', width: '120px' }}>Source</th>
                        <th style={{ padding: '0.6rem 0.5rem' }}>Recommended Action</th>
                        <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right', width: '80px' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topItems.map((item) => {
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

                        return (
                          <tr key={item.id} style={{ borderBottom: '1px solid var(--card-border)', verticalAlign: 'middle' }}>
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
                            <td style={{ padding: '0.65rem 0.5rem', maxWidth: '220px' }}>
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
                                maxWidth: '110px',
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
                  {filteredItems.length > 10 && (
                    <div style={{ marginTop: '0.75rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--muted)' }}>
                      Showing top 10 of {filteredItems.length} opportunities.
                    </div>
                  )}
                </div>
              );
            })()}
          </>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '1.25rem' }}>
          <h2 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recent Uploads</h2>
          {recentUploads.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{loading ? 'Loading…' : 'No uploads yet.'}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {recentUploads.map((u) => (
                <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '0.4rem 0', borderBottom: '1px solid var(--card-border)' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{u.filename}</span>
                  <span style={{ color: 'var(--muted)' }}>{u.cleanedRowCount.toLocaleString()} rows</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '1.25rem' }}>
          <h2 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Quick Actions</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {[
              { href: '/upload', label: '↑ Upload new CSV files' },
              { href: '/keywords', label: '◈ Browse keyword database' },
              { href: '/content', label: '✎ View content opportunities' },
              { href: '/backlinks', label: '⛓ Browse backlink targets' },
              { href: '/export', label: '⤓ Export action plans' },
            ].map((item) => (
              <Link key={item.href} href={item.href} style={{ display: 'block', padding: '0.5rem 0.75rem', background: 'rgba(99,102,241,0.08)', borderRadius: '6px', color: 'var(--foreground)', textDecoration: 'none', fontSize: '0.85rem' }}>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
