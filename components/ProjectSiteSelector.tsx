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
  const [showModal, setShowModal] = useState(false);

  // Manual form state (used only inside modal)
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

    // Auto-generate options from uploaded data
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

    const opts: SiteOption[] = Array.from(unique.values()).map((site) => ({
      key: `${site.domain}|${site.location}|${site.niche}`,
      site,
      label: `${site.domain} / ${site.location} / ${site.niche}`,
    }));

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
    setShowModal(false);
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
    setShowModal(false);
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

      {/* Compact dropdown selector only */}
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

      {/* Small Manage/Advanced button - opens modal */}
      <div style={{ marginTop: '0.35rem' }}>
        <button
          onClick={() => setShowModal(true)}
          style={{
            fontSize: '0.6rem',
            color: 'var(--accent)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            textDecoration: 'underline',
          }}
        >
          Manage / Advanced
        </button>
      </div>

      {!selected && options.length > 0 && (
        <div style={{ fontSize: '0.55rem', color: 'var(--muted)', marginTop: '0.2rem' }}>
          Auto from uploads • {options.length} projects
        </div>
      )}

      {/* Modal for manual/advanced entry */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--card)',
              border: '1px solid var(--card-border)',
              borderRadius: '10px',
              padding: '1.25rem',
              width: 'min(420px, 92vw)',
              boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '0.75rem', fontSize: '0.95rem' }}>Advanced Project / Site Filter</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <input
                type="text"
                placeholder="Domain (e.g. example.com)"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                style={{ fontSize: '0.8rem', padding: '0.45rem 0.6rem', border: '1px solid var(--card-border)', borderRadius: '6px', background: 'var(--background)' }}
              />
              <input
                type="text"
                placeholder="Location / Country"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                style={{ fontSize: '0.8rem', padding: '0.45rem 0.6rem', border: '1px solid var(--card-border)', borderRadius: '6px', background: 'var(--background)' }}
              />
              <input
                type="text"
                placeholder="Niche"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                style={{ fontSize: '0.8rem', padding: '0.45rem 0.6rem', border: '1px solid var(--card-border)', borderRadius: '6px', background: 'var(--background)' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem' }}>
              <button
                onClick={saveManual}
                style={{ flex: 1, fontSize: '0.8rem', padding: '0.5rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}
              >
                Save & Filter
              </button>
              <button
                onClick={() => setShowModal(false)}
                style={{ fontSize: '0.8rem', padding: '0.5rem', background: 'transparent', border: '1px solid var(--card-border)', borderRadius: '6px', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>

            <div style={{ marginTop: '0.75rem', fontSize: '0.65rem', color: 'var(--muted)', lineHeight: 1.4 }}>
              Manual entry overrides the dropdown. Values are matched against uploaded CSV fields (domain, location/country, niche). Use “All Projects” in the sidebar dropdown for no filter.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
