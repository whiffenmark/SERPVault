'use client';

import { useState } from 'react';
import { getStore } from '@/lib/storage';
import {
  exportKeywordsCSV,
  exportBacklinksCSV,
  exportContentPlanCSV,
  exportBacklinkTargetsCSV,
  exportActionPlanMD,
} from '@/lib/export';

interface ExportCard {
  title: string;
  description: string;
  icon: string;
  action: () => void;
  countLabel: () => string;
}

export default function ExportPage() {
  const [message, setMessage] = useState('');

  function run(fn: () => void) {
    try {
      fn();
      setMessage('✓ Export started — check your downloads folder.');
    } catch (e) {
      setMessage(`Error: ${String(e)}`);
    }
    setTimeout(() => setMessage(''), 4000);
  }

  const cards: ExportCard[] = [
    {
      title: 'All Keywords CSV',
      description: 'Export every keyword with volume, KD, CPC, intent, tag, and opportunity score.',
      icon: '◈',
      action: () => run(() => exportKeywordsCSV(getStore().keywords)),
      countLabel: () => `${getStore().keywords.length.toLocaleString()} keywords`,
    },
    {
      title: 'All Backlinks CSV',
      description: 'Export every backlink with source/target URLs, anchor text, DA, tag, and score.',
      icon: '⛓',
      action: () => run(() => exportBacklinksCSV(getStore().backlinks)),
      countLabel: () => `${getStore().backlinks.length.toLocaleString()} backlinks`,
    },
    {
      title: 'Content Plan CSV',
      description: 'Export only tagged (non-Ignore) keywords as a prioritized content calendar.',
      icon: '✎',
      action: () => run(() => exportContentPlanCSV(getStore().keywords)),
      countLabel: () => `${getStore().keywords.filter((k) => k.tag && k.tag !== 'Ignore').length.toLocaleString()} tagged keywords`,
    },
    {
      title: 'Backlink Targets CSV',
      description: 'Export rows tagged as "Backlink Target" — your link acquisition hit list.',
      icon: '🎯',
      action: () => run(() => exportBacklinkTargetsCSV(getStore().backlinks)),
      countLabel: () => `${getStore().backlinks.filter((b) => b.tag === 'Backlink Target').length.toLocaleString()} targets`,
    },
    {
      title: 'Action Plan Markdown',
      description: 'Export a formatted Markdown action plan with top keywords, backlinks, and competitor pages.',
      icon: '📋',
      action: () => {
        const store = getStore();
        run(() => exportActionPlanMD(store.keywords, store.backlinks, store.competitorPages));
      },
      countLabel: () => 'Full action plan',
    },
  ];

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.3rem' }}>Export Center</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>
          Download cleaned CSVs, content plans, and action plans from your stored data.
        </p>
      </div>

      {message && (
        <div style={{ background: '#10b98120', border: '1px solid #10b98150', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1.25rem', fontSize: '0.875rem', color: 'var(--success)' }}>
          {message}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {cards.map((card) => (
          <div
            key={card.title}
            style={{
              background: 'var(--card)',
              border: '1px solid var(--card-border)',
              borderRadius: '10px',
              padding: '1.25rem 1.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1.5rem',
            }}
          >
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '1.5rem', marginTop: '0.1rem' }}>{card.icon}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.25rem' }}>{card.title}</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '0.2rem' }}>{card.description}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>{card.countLabel()}</div>
              </div>
            </div>
            <button
              onClick={card.action}
              style={{
                flexShrink: 0,
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: '7px',
                padding: '0.5rem 1.25rem',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.85rem',
                whiteSpace: 'nowrap',
              }}
            >
              ⤓ Export
            </button>
          </div>
        ))}
      </div>

      <div style={{ marginTop: '2rem', background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '1.25rem' }}>
        <h2 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Tip: Tag first, then export
        </h2>
        <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
          Visit the Keyword Database, Backlink Opportunities, or Content Opportunities pages to tag rows first.
          Exports like "Content Plan" and "Backlink Targets" are filtered by your tags.
        </p>
      </div>
    </div>
  );
}
