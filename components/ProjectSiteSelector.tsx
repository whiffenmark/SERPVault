'use client';

import { useEffect, useState } from 'react';
import { getSelectedSite, setSelectedSite, type SiteSelection } from '@/lib/storage';

export default function ProjectSiteSelector() {
  const [selected, setSelected] = useState<SiteSelection>(null);
  const [domain, setDomain] = useState('');
  const [location, setLocation] = useState('');
  const [niche, setNiche] = useState('');
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    const s = getSelectedSite();
    setSelected(s);
    if (s) {
      setDomain(s.domain);
      setLocation(s.location);
      setNiche(s.niche);
    }
  }, []);

  const save = () => {
    if (!domain.trim()) return;
    const site: SiteSelection = {
      domain: domain.trim(),
      location: location.trim() || '-',
      niche: niche.trim() || '-',
    };
    setSelectedSite(site);
    setSelected(site);
    setShowForm(false);
    // Reload to apply filters in other views (simple approach, no context)
    window.location.reload();
  };

  const clear = () => {
    setSelectedSite(null);
    setSelected(null);
    setDomain('');
    setLocation('');
    setNiche('');
    setShowForm(false);
    window.location.reload();
  };

  return (
    <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--card-border)', fontSize: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
        <span style={{ color: 'var(--muted)', fontWeight: 600 }}>PROJECT / SITE</span>
        {selected && (
          <button onClick={clear} style={{ fontSize: '0.65rem', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>Clear</button>
        )}
      </div>

      {selected && !showForm ? (
        <div style={{ background: 'var(--card)', padding: '0.4rem 0.5rem', borderRadius: '4px', fontSize: '0.7rem', lineHeight: 1.3 }}>
          <div><strong>Domain:</strong> {selected.domain}</div>
          <div><strong>Location:</strong> {selected.location}</div>
          <div><strong>Niche:</strong> {selected.niche}</div>
          <button onClick={() => setShowForm(true)} style={{ marginTop: '0.25rem', fontSize: '0.65rem', padding: '0.1rem 0.4rem', border: '1px solid var(--card-border)', borderRadius: '3px', background: 'transparent', color: 'var(--foreground)', cursor: 'pointer' }}>Change</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <input
            type="text"
            placeholder="Domain (e.g. example.com)"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            style={{ fontSize: '0.75rem', padding: '0.35rem 0.5rem', border: '1px solid var(--card-border)', borderRadius: '4px', background: 'var(--background)' }}
          />
          <input
            type="text"
            placeholder="Location / Country"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            style={{ fontSize: '0.75rem', padding: '0.35rem 0.5rem', border: '1px solid var(--card-border)', borderRadius: '4px', background: 'var(--background)' }}
          />
          <input
            type="text"
            placeholder="Niche"
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            style={{ fontSize: '0.75rem', padding: '0.35rem 0.5rem', border: '1px solid var(--card-border)', borderRadius: '4px', background: 'var(--background)' }}
          />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={save} style={{ flex: 1, fontSize: '0.7rem', padding: '0.3rem', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Save & Filter</button>
            {selected && <button onClick={() => setShowForm(false)} style={{ fontSize: '0.7rem', padding: '0.3rem', background: 'transparent', border: '1px solid var(--card-border)', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>}
          </div>
          <div style={{ fontSize: '0.6rem', color: 'var(--muted)' }}>Filters keywords & content by these values from uploads.</div>
        </div>
      )}
    </div>
  );
}
