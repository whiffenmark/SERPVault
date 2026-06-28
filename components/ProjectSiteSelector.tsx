'use client';

import { useEffect, useState } from 'react';
import { getSelectedSite, setSelectedSite, type SiteSelection, getStore } from '@/lib/storage';

type SiteOption = {
  key: string;
  site: SiteSelection;
  label: string;
};

export default function ProjectSiteSelector() {
  const [selected, setSelected] = useState<SiteSelection>(null);
  const [options, setOptions] = useState<SiteOption[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Manual form state (for advanced)
  const [domain, setDomain] = useState('');
  const [location, setLocation] = useState('');
  const [niche, setNiche] = useState('');

  useEffect(() => {
    const s = getSelectedSite();
    setSelected(s);
    if (s) {
      setDomain(s.domain);
      setLocation(s.location);
      setNiche(s.niche);
    }

    // Auto-generate options from uploaded data (domain + location + niche from raw rows)
    const store = getStore();
    const unique = new Map<string, NonNullable<SiteSelection>>();

    const addFromRows = (rows: any[]) => {
      rows.forEach((row: any) => {
        const r = row.raw || {};
        const d = (r.domain ?? r.Domain ?? row.domain ?? '-').toString().trim();
        const l = (r.location ?? r.Location ?? r.country ?? row.country ?? row.location ?? '-').toString().trim();
        const n = (r.niche ?? r.Niche ?? '-').toString().trim();
        if (d !== '-' || l !== '-' || n !== '-') {
          const key = `${d}|${l}|${n}`;
          if (!unique.has(key)) {
            unique.set(key, {
              domain: d || '-',
              location: l || '-',
              niche: n || '-',
            });
          }
        }
      });
    };

    addFromRows(store.keywords || []);
    addFromRows(store.keywordGaps || []);
    // Could extend to other record types if they have the fields

    const opts: SiteOption[] = Array.from(unique.values()).map((site) => ({
      key: `${site.domain}|${site.location}|${site.niche}`,
      site,
      label: `${site.domain} / ${site.location} / ${site.niche}`,
    }));

    // Sort by domain then location
    opts.sort((a, b) => a.label.localeCompare(b.label));
    setOptions(opts);
  }, []);

  const selectSite = (site: SiteSelection) => {
    setSelectedSite(site);
    setSelected(site);
    if (site) {
      setDomain(site.domain);
      setLocation(site.location);
      setNiche(site.niche);
    } else {
      setDomain('');
      setLocation('');
      setNiche('');
    }
    setShowAdvanced(false);
    window.location.reload();
  };

  const saveManual = () => {
    if (!domain.trim()) return;
    const site: SiteSelection = {
      domain: domain.trim(),
      location: location.trim() || '-',
      niche: niche.trim() || '-',
    };
    selectSite(site);
  };

  const clear = () => {
    setSelectedSite(null);
    setSelected(null);
    setDomain('');
    setLocation('');
    setNiche('');
    setShowAdvanced(false);
    window.location.reload();
  };

  const selectedLabel = selected
    ? `${selected.domain} / ${selected.location} / ${selected.niche}`
    : 'All Projects';

  return (
    <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--card-border)', fontSize: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
        <span style={{ color: 'var(--muted)', fontWeight: 600 }}>PROJECT / SITE</span>
        {selected && (
          <button onClick={clear} style={{ fontSize: '0.65rem', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
            Clear
          </button>
        )}
      </div>

      {/* Compact dropdown selector */}
      <select
        value={selected ? `${selected.domain}|${selected.location}|${selected.niche}` : ''}
        onChange={(e) => {
          if (!e.target.value) {
            selectSite(null);
          } else {
            const opt = options.find((o) => o.key === e.target.value);
            if (opt) selectSite(opt.site);
          }
        }}
        style={{
          width: '100%',
          fontSize: '0.72rem',
          padding: '0.35rem 0.5rem',
          border: '1px solid var(--card-border)',
          borderRadius: '4px',
          background: 'var(--background)',
          color: 'var(--foreground)',
          cursor: 'pointer',
        }}
      >
        <option value="">All Projects</option>
        {options.map((opt) => (
          <option key={opt.key} value={opt.key}>
            {opt.label}
          </option>
        ))}
      </select>

      {selected && (
        <div style={{ marginTop: '0.25rem', fontSize: '0.65rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Selected: {selectedLabel}
        </div>
      )}

      {/* Advanced manual filter toggle (collapsed by default) */}
      <div style={{ marginTop: '0.35rem' }}>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          style={{
            fontSize: '0.6rem',
            color: 'var(--accent)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          {showAdvanced ? '− Hide advanced' : '+ Advanced filter (manual)'}
        </button>
      </div>

      {showAdvanced && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.35rem', paddingTop: '0.35rem', borderTop: '1px solid var(--card-border)' }}>
          <input
            type="text"
            placeholder="Domain (e.g. example.com)"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            style={{ fontSize: '0.7rem', padding: '0.3rem 0.45rem', border: '1px solid var(--card-border)', borderRadius: '4px', background: 'var(--background)' }}
          />
          <input
            type="text"
            placeholder="Location / Country"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            style={{ fontSize: '0.7rem', padding: '0.3rem 0.45rem', border: '1px solid var(--card-border)', borderRadius: '4px', background: 'var(--background)' }}
          />
          <input
            type="text"
            placeholder="Niche"
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            style={{ fontSize: '0.7rem', padding: '0.3rem 0.45rem', border: '1px solid var(--card-border)', borderRadius: '4px', background: 'var(--background)' }}
          />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={saveManual} style={{ flex: 1, fontSize: '0.65rem', padding: '0.25rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              Save & Filter
            </button>
            <button onClick={() => setShowAdvanced(false)} style={{ fontSize: '0.65rem', padding: '0.25rem', background: 'transparent', border: '1px solid var(--card-border)', borderRadius: '4px', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
          <div style={{ fontSize: '0.55rem', color: 'var(--muted)' }}>Manual entry (auto options preferred from uploads).</div>
        </div>
      )}

      {!showAdvanced && (
        <div style={{ fontSize: '0.55rem', color: 'var(--muted)', marginTop: '0.2rem' }}>
          Auto from uploads • {options.length} projects
        </div>
      )}
    </div>
  );
}
