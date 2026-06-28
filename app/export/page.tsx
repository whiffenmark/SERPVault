'use client';

import { useEffect, useState } from 'react';
import * as db from '@/lib/db';
import {
  filterRowsBySite,
  getSelectedSite,
  siteSelectionLabel,
  siteSelectionSlug,
  type SiteSelection,
} from '@/lib/storage';
import {
  exportKeywordsCSV,
  exportBacklinksCSV,
  exportContentPlanCSV,
  exportBacklinkTargetsCSV,
  exportActionPlanMD,
  exportHermesContentPlanCSV,
  exportHermesContentPlanMD,
} from '@/lib/export';

export default function ExportPage() {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [selectedSite, setSelectedSiteState] = useState<SiteSelection>(null);
  const [counts, setCounts] = useState({
    keywords: 'Loading...',
    backlinks: 'Loading...',
    taggedKeywords: 'Loading...',
    hermesKeywords: 'Loading...',
    backlinkTargets: 'Loading...',
  });

  useEffect(() => {
    const site = getSelectedSite();
    setSelectedSiteState(site);

    Promise.all([db.getKeywords(), db.getBacklinks()]).then(([kws, bls]) => {
      const scopedKeywords = filterRowsBySite(kws, site);
      const scopedBacklinks = filterRowsBySite(bls, site);
      const hermes = scopedKeywords.filter((k) => {
        const r = k.raw || {};
        return !!(r.cluster || r.Cluster || r['Cluster'] || r.page_target || r['page target'] || r.pageTarget);
      });

      setCounts({
        keywords: `${scopedKeywords.length.toLocaleString()} keywords`,
        backlinks: `${scopedBacklinks.length.toLocaleString()} backlinks`,
        taggedKeywords: `${scopedKeywords.filter((k) => k.tag && k.tag !== 'Ignore').length.toLocaleString()} tagged keywords`,
        hermesKeywords: hermes.length > 0 ? `${hermes.length.toLocaleString()} Hermes keywords` : 'No Hermes data',
        backlinkTargets: `${scopedBacklinks.filter((b) => b.tag === 'Backlink Target').length.toLocaleString()} targets`,
      });
    });
  }, []);

  const scopeLabel = siteSelectionLabel(selectedSite);
  const scopeSlug = siteSelectionSlug(selectedSite);

  async function scopedKeywords() {
    return filterRowsBySite(await db.getKeywords(), selectedSite);
  }

  async function scopedBacklinks() {
    return filterRowsBySite(await db.getBacklinks(), selectedSite);
  }

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
      title: 'All Keywords CSV',
      icon: '◈',
      description: 'Every keyword with volume, KD, CPC, intent, tag, and opportunity score.',
      count: counts.keywords,
      action: () => run('kw', async () => exportKeywordsCSV(await scopedKeywords(), scopeSlug)),
    },
    {
      title: 'All Backlinks CSV',
      icon: '⛓',
      description: 'Every backlink with source/target URLs, anchor text, DA, tag, and score.',
      count: counts.backlinks,
      action: () => run('bl', async () => exportBacklinksCSV(await scopedBacklinks(), scopeSlug)),
    },
    {
      title: 'Content Plan CSV',
      icon: '✎',
      description: 'Only tagged (non-Ignore) keywords as a prioritized content calendar.',
      count: counts.taggedKeywords,
      action: () => run('cp', async () => exportContentPlanCSV(await scopedKeywords(), scopeSlug)),
    },
    {
      title: 'Hermes Content Plan CSV',
      icon: '📋',
      description: 'Hermes keyword_report data (cluster/page_target) exported as CSV. Uses only existing keyword data with safe raw fallbacks.',
      count: counts.hermesKeywords,
      action: () => run('hcsv', async () => exportHermesContentPlanCSV(await scopedKeywords(), scopeSlug)),
    },
    {
      title: 'Hermes Content Plan Markdown',
      icon: '📝',
      description: 'Grouped Cluster → Page Target Markdown matching the Hermes planner view. Helpful empty state included when no data.',
      count: counts.hermesKeywords,
      action: () => run('hmd', async () => exportHermesContentPlanMD(await scopedKeywords(), scopeLabel, scopeSlug)),
    },
    {
      title: 'Backlink Targets CSV',
      icon: '🎯',
      description: 'Rows tagged as "Backlink Target" — your link acquisition hit list.',
      count: counts.backlinkTargets,
      action: () => run('bt', async () => exportBacklinkTargetsCSV(await scopedBacklinks(), scopeSlug)),
    },
    {
      title: 'Action Plan Markdown',
      icon: '📋',
      description: 'Formatted Markdown action plan with top keywords, backlinks, and competitor pages.',
      action: () => run('md', async () => {
        const [kws, bls, cps] = await Promise.all([db.getKeywords(), db.getBacklinks(), db.getCompetitorPages()]);
        exportActionPlanMD(
          filterRowsBySite(kws, selectedSite),
          filterRowsBySite(bls, selectedSite),
          filterRowsBySite(cps, selectedSite),
          scopeLabel,
          scopeSlug
        );
      }),
      count: 'Full action plan',
    },
  ];

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.3rem' }}>Export Center</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>Download cleaned CSVs, content plans, and action plans from your stored data.</p>
      </div>
      <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '0.9rem 1rem', marginBottom: '1.25rem' }}>
        <div style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
          Export scope
        </div>
        <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{scopeLabel}</div>
        <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
          The selected Project / Site controls keyword, content, and action plan exports. All Projects exports everything.
        </div>
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
                <div style={{ fontSize: '0.72rem', color: 'var(--accent)', marginTop: '0.35rem', fontWeight: 600 }}>{card.count}</div>
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
        <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>Visit the Keyword Database or Backlink Opportunities pages to tag rows first. Content Plan and Backlink Target exports are filtered by your tags. Hermes exports use only rows with cluster/page_target fields from raw data.</p>
      </div>
      {/* Hermes empty state helper note */}
      <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--muted)', textAlign: 'center' }}>
        Hermes exports show “No Hermes data” when no keyword rows contain cluster / page_target / serpvault_tag etc.
      </div>
    </div>
  );
}
