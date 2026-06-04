'use client';

import { useState } from 'react';
import * as db from '@/lib/db';
import {
  exportKeywordsCSV,
  exportBacklinksCSV,
  exportContentPlanCSV,
  exportBacklinkTargetsCSV,
  exportActionPlanMD,
} from '@/lib/export';

export default function ExportPage() {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try {
      await fn();
      setMessage('✓ Export started — check your downloads folder.');
    } catch (e) {
      setMessage(`Error: ${String(e)}`);
    }
    setBusy('');
    setTimeout(() => setMessage(''), 4000);
  }

  const cards = [
    {
      title: 'All Keywords CSV', icon: '◈',
      description: 'Every keyword with volume, KD, CPC, intent, tag, and opportunity score.',
      action: () => run('kw', async () => exportKeywordsCSV(await db.getKeywords())),
      countFn: async () => `${(await db.getKeywords()).length.toLocaleString()} keywords`,
    },
    {
      title: 'All Backlinks CSV', icon: '⛓',
      description: 'Every backlink with source/target URLs, anchor text, DA, tag, and score.',
      action: () => run('bl', async () => exportBacklinksCSV(await db.getBacklinks())),
      countFn: async () => `${(await db.getBacklinks()).length.toLocaleString()} backlinks`,
    },
    {
      title: 'Content Plan CSV', icon: '✎',
      description: 'Only tagged (non-Ignore) keywords as a prioritized content calendar.',
      action: () => run('cp', async () => exportContentPlanCSV(await db.getKeywords())),
      countFn: async () => {
        const kws = await db.getKeywords();
        return `${kws.filter((k) => k.tag && k.tag !== 'Ignore').length.toLocaleString()} tagged keywords`;
      },
    },
    {
      title: 'Backlink Targets CSV', icon: '🎯',
      description: 'Rows tagged as "Backlink Target" — your link acquisition hit list.',
      action: () => run('bt', async () => exportBacklinkTargetsCSV(await db.getBacklinks())),
      countFn: async () => {
        const bls = await db.getBacklinks();
        return `${bls.filter((b) => b.tag === 'Backlink Target').length.toLocaleString()} targets`;
      },
    },
    {
      title: 'Action Plan Markdown', icon: '📋',
      description: 'Formatted Markdown action plan with top keywords, backlinks, and competitor pages.',
      action: () => run('md', async () => {
        const [kws, bls, cps] = await Promise.all([db.getKeywords(), db.getBacklinks(), db.getCompetitorPages()]);
        exportActionPlanMD(kws, bls, cps);
      }),
      countFn: async () => 'Full action plan',
    },
  ];

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.3rem' }}>Export Center</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>Download cleaned CSVs, content plans, and action plans from your stored data.</p>
      </div>
      {message && (
        <div style={{ background: '#10b98120', border: '1px solid #10b98150', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1.25rem', fontSize: '0.875rem', color: 'var(--success)' }}>
          {message}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {cards.map((card) => (
          <div key={card.title} style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1.5rem' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '1.5rem', marginTop: '0.1rem' }}>{card.icon}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.25rem' }}>{card.title}</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{card.description}</div>
              </div>
            </div>
            <button
              onClick={card.action}
              disabled={!!busy}
              style={{ flexShrink: 0, background: busy ? 'var(--card-border)' : 'var(--accent)', color: '#fff', border: 'none', borderRadius: '7px', padding: '0.5rem 1.25rem', cursor: busy ? 'wait' : 'pointer', fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap' }}
            >
              {busy ? '…' : '⤓ Export'}
            </button>
          </div>
        ))}
      </div>
      <div style={{ marginTop: '2rem', background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '1.25rem' }}>
        <h2 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tip: Tag first, then export</h2>
        <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>Visit the Keyword Database or Backlink Opportunities pages to tag rows first. Content Plan and Backlink Target exports are filtered by your tags.</p>
      </div>
    </div>
  );
}
