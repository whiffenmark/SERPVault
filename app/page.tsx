'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getStore } from '@/lib/storage';
import type { AppStore } from '@/lib/types';
import Card from '@/components/Card';

export default function DashboardPage() {
  const [store, setStore] = useState<AppStore | null>(null);

  useEffect(() => {
    setStore(getStore());
  }, []);

  const uploads = store?.uploads ?? [];
  const keywords = store?.keywords ?? [];
  const backlinks = store?.backlinks ?? [];
  const competitors = store?.competitorPages ?? [];
  const gaps = store?.keywordGaps ?? [];
  const dedupeReports = store?.dedupeReports ?? [];

  const tagged = keywords.filter((k) => k.tag && k.tag !== 'Ignore');
  const highScore = keywords.filter((k) => (k.opportunityScore ?? 0) >= 70).length;
  const recentUploads = [...uploads].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)).slice(0, 5);

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.3rem' }}>SEO Command Center</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>
          Your private SEO research database. Upload CSVs to get started.
        </p>
      </div>

      {uploads.length === 0 && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '12px', padding: '2.5rem', textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚀</div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Welcome to SERPVault</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.875rem', maxWidth: '420px', margin: '0 auto 1.5rem' }}>
            Upload CSV exports from SEMrush, Ahrefs, Moz, or any SEO tool.
            Your data is stored privately in your browser — no server required.
          </p>
          <Link
            href="/upload"
            style={{
              display: 'inline-block',
              background: 'var(--accent)',
              color: '#fff',
              padding: '0.6rem 1.5rem',
              borderRadius: '7px',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '0.875rem',
            }}
          >
            Upload Your First CSV →
          </Link>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <Card title="Total Uploads" value={uploads.length} sub="CSV files imported" />
        <Card title="Keywords" value={keywords.length} sub="across all reports" />
        <Card title="Backlinks" value={backlinks.length} sub="across all reports" />
        <Card title="Competitor Pages" value={competitors.length} sub="indexed" />
        <Card title="Keyword Gaps" value={gaps.length} sub="gap opportunities" />
        <Card title="Tagged Rows" value={tagged.length} sub="items tagged" accent />
        <Card title="High Opportunity" value={highScore} sub="score ≥ 70" accent />
        <Card title="Dedupe Reports" value={dedupeReports.length} sub="created" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '1.25rem' }}>
          <h2 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Recent Uploads
          </h2>
          {recentUploads.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>No uploads yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {recentUploads.map((u) => (
                <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '0.4rem 0', borderBottom: '1px solid var(--card-border)' }}>
                  <span style={{ color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{u.filename}</span>
                  <span style={{ color: 'var(--muted)' }}>{u.cleanedRowCount.toLocaleString()} rows</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '1.25rem' }}>
          <h2 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Quick Actions
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {[
              { href: '/upload', label: '↑ Upload new CSV files' },
              { href: '/keywords', label: '◈ Browse keyword database' },
              { href: '/content', label: '✎ View content opportunities' },
              { href: '/backlinks', label: '⛓ Browse backlink targets' },
              { href: '/export', label: '⤓ Export action plans' },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'block',
                  padding: '0.5rem 0.75rem',
                  background: 'rgba(99,102,241,0.08)',
                  borderRadius: '6px',
                  color: 'var(--foreground)',
                  textDecoration: 'none',
                  fontSize: '0.85rem',
                }}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
