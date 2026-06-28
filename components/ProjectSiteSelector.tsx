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
  const [isManualOverride, setIsManualOverride] = useState(false);

  const knownDomains = Array.from(
    new Set(
      options
        .map((opt) => opt.site?.domain)
        .filter((d): d is string => !!d && d !== '-')
    )
  ).sort((a, b) => a.localeCompare(b));

  const handleDomainSelect = (selectedDomain: string) => {
    setDomain(selectedDomain);

    // Find available locations and niches for the selected domain
    const availableLocs = options
      .filter((opt) => opt.site?.domain === selectedDomain)
      .map((opt) => opt.site?.location)
      .filter((l): l is string => !!l);
    const availableNiches = options
      .filter((opt) => opt.site?.domain === selectedDomain)
      .map((opt) => opt.site?.niche)
      .filter((n): n is string => !!n);

    // Set default location/niche if not already valid/compatible
    if (location !== '-' && !availableLocs.includes(location)) {
      setLocation('-');
    }
    if (niche !== '-' && !availableNiches.includes(niche)) {
      setNiche('-');
    }
  };

  const isSaveDisabled = !isManualOverride
    ? (!domain || !knownDomains.includes(domain))
    : !domain.trim();

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
          onClick={() => {
            const isManual = selected ? !knownDomains.includes(selected.domain) : false;
            setIsManualOverride(isManual);
            setShowModal(true);
          }}
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

            {!isManualOverride ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--muted)' }}>Domain</label>
                  <select
                    value={knownDomains.includes(domain) ? domain : ''}
                    onChange={(e) => handleDomainSelect(e.target.value)}
                    style={{
                      fontSize: '0.8rem',
                      padding: '0.45rem 0.6rem',
                      border: '1px solid var(--card-border)',
                      borderRadius: '6px',
                      background: 'var(--background)',
                      color: 'var(--foreground)',
                      cursor: 'pointer',
                      width: '100%',
                    }}
                  >
                    <option value="" disabled>Select domain</option>
                    {knownDomains.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                {domain && knownDomains.includes(domain) ? (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--muted)' }}>Location / Country</label>
                      <select
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        style={{
                          fontSize: '0.8rem',
                          padding: '0.45rem 0.6rem',
                          border: '1px solid var(--card-border)',
                          borderRadius: '6px',
                          background: 'var(--background)',
                          color: 'var(--foreground)',
                          cursor: 'pointer',
                          width: '100%',
                        }}
                      >
                        <option value="-">Any location</option>
                        {Array.from(
                          new Set(
                            options
                              .filter((opt) => opt.site?.domain === domain)
                              .map((opt) => opt.site?.location)
                              .filter((l): l is string => !!l && l !== '-')
                          )
                        ).sort((a, b) => a.localeCompare(b)).map((loc) => (
                          <option key={loc} value={loc}>
                            {loc}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--muted)' }}>Niche</label>
                      <select
                        value={niche}
                        onChange={(e) => setNiche(e.target.value)}
                        style={{
                          fontSize: '0.8rem',
                          padding: '0.45rem 0.6rem',
                          border: '1px solid var(--card-border)',
                          borderRadius: '6px',
                          background: 'var(--background)',
                          color: 'var(--foreground)',
                          cursor: 'pointer',
                          width: '100%',
                        }}
                      >
                        <option value="-">Any niche</option>
                        {Array.from(
                          new Set(
                            options
                              .filter((opt) => opt.site?.domain === domain)
                              .map((opt) => opt.site?.niche)
                              .filter((n): n is string => !!n && n !== '-')
                          )
                        ).sort((a, b) => a.localeCompare(b)).map((nich) => (
                          <option key={nich} value={nich}>
                            {nich}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '0.7rem', color: 'var(--muted)', fontStyle: 'italic', marginTop: '0.25rem' }}>
                    Please select a domain to configure location and niche filters.
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--accent)', marginBottom: '0.25rem' }}>
                  Manual Override Mode
                </div>
                <input
                  type="text"
                  placeholder="Domain (e.g. example.com)"
                  value={domain === '-' ? '' : domain}
                  onChange={(e) => setDomain(e.target.value)}
                  style={{ fontSize: '0.8rem', padding: '0.45rem 0.6rem', border: '1px solid var(--card-border)', borderRadius: '6px', background: 'var(--background)', color: 'var(--foreground)' }}
                />
                <input
                  type="text"
                  placeholder="Location / Country"
                  value={location === '-' ? '' : location}
                  onChange={(e) => setLocation(e.target.value)}
                  style={{ fontSize: '0.8rem', padding: '0.45rem 0.6rem', border: '1px solid var(--card-border)', borderRadius: '6px', background: 'var(--background)', color: 'var(--foreground)' }}
                />
                <input
                  type="text"
                  placeholder="Niche"
                  value={niche === '-' ? '' : niche}
                  onChange={(e) => setNiche(e.target.value)}
                  style={{ fontSize: '0.8rem', padding: '0.45rem 0.6rem', border: '1px solid var(--card-border)', borderRadius: '6px', background: 'var(--background)', color: 'var(--foreground)' }}
                />
              </div>
            )}

            <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px dashed var(--card-border)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem', color: 'var(--muted)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isManualOverride}
                  onChange={(e) => {
                    setIsManualOverride(e.target.checked);
                    if (!e.target.checked) {
                      if (selected && knownDomains.includes(selected.domain)) {
                        setDomain(selected.domain);
                        setLocation(selected.location);
                        setNiche(selected.niche);
                      } else {
                        setDomain('');
                        setLocation('');
                        setNiche('');
                      }
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                />
                Enable manual override (for custom/unlisted domains)
              </label>
            </div>

            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem' }}>
              <button
                disabled={isSaveDisabled}
                onClick={saveManual}
                style={{
                  flex: 1,
                  fontSize: '0.8rem',
                  padding: '0.5rem',
                  background: isSaveDisabled ? 'var(--card-border)' : 'var(--accent)',
                  color: isSaveDisabled ? 'var(--muted)' : '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: isSaveDisabled ? 'not-allowed' : 'pointer',
                  fontWeight: 500
                }}
              >
                Save & Filter
              </button>
              <button
                onClick={() => setShowModal(false)}
                style={{ fontSize: '0.8rem', padding: '0.5rem', background: 'transparent', border: '1px solid var(--card-border)', color: 'var(--foreground)', borderRadius: '6px', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>

            <div style={{ marginTop: '0.75rem', fontSize: '0.65rem', color: 'var(--muted)', lineHeight: 1.4 }}>
              Values are matched against uploaded CSV fields (domain, location/country, niche). Use “All Projects” in the sidebar dropdown for no filter.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
