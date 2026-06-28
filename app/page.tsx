'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import * as db from '@/lib/db';
import { filterRowsBySite, getSelectedSite, siteSelectionLabel, type SiteSelection } from '@/lib/storage';
import type { UploadRecord, KeywordRecord, BacklinkRecord, CompetitorPageRecord, KeywordGapRecord, DedupeReport } from '@/lib/types';
import Card from '@/components/Card';

export default function DashboardPage() {
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [keywords, setKeywords] = useState<KeywordRecord[]>([]);
  const [backlinks, setBacklinks] = useState<BacklinkRecord[]>([]);
  const [competitors, setCompetitors] = useState<CompetitorPageRecord[]>([]);
  const [gaps, setGaps] = useState<KeywordGapRecord[]>([]);
  const [dedupeReports, setDedupeReports] = useState<DedupeReport[]>([]);
  const [selectedSite, setSelectedSiteState] = useState<SiteSelection>(null);
  const [loading, setLoading] = useState(true);

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

  const scopedKeywords = filterRowsBySite(keywords, selectedSite);
  const scopedBacklinks = filterRowsBySite(backlinks, selectedSite);
  const scopedGaps = filterRowsBySite(gaps, selectedSite);
  const scopedCompetitors = filterRowsBySite(competitors, selectedSite);
  const tagged = scopedKeywords.filter((k) => k.tag && k.tag !== 'Ignore');
  const highScore = scopedKeywords.filter((k) => (k.opportunityScore ?? 0) >= 70).length;
  const recentUploads = uploads.slice(0, 5);
  const scopeLabel = siteSelectionLabel(selectedSite);

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
        <Card title="Total Uploads" value={loading ? '…' : uploads.length} sub="CSV files imported" />
        <Card title="Keywords" value={loading ? '…' : scopedKeywords.length} sub={selectedSite ? 'in active project' : 'across all reports'} />
        <Card title="Backlinks" value={loading ? '…' : scopedBacklinks.length} sub={selectedSite ? 'in active project' : 'across all reports'} />
        <Card title="Competitor Pages" value={loading ? '…' : scopedCompetitors.length} sub={selectedSite ? 'in active project' : 'indexed'} />
        <Card title="Keyword Gaps" value={loading ? '…' : scopedGaps.length} sub={selectedSite ? 'in active project' : 'gap opportunities'} />
        <Card title="Tagged Rows" value={loading ? '…' : tagged.length} sub="items tagged" accent />
        <Card title="High Opportunity" value={loading ? '…' : highScore} sub="score ≥ 70" accent />
        <Card title="Dedupe Reports" value={loading ? '…' : dedupeReports.length} sub="created" />
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
