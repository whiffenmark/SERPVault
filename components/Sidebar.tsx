'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ProjectSiteSelector from './ProjectSiteSelector';

const nav = [
  { href: '/', label: 'Dashboard', icon: '⌂' },
  { href: '/upload', label: 'Upload CSVs', icon: '↑' },
  { href: '/keywords', label: 'Keyword Database', icon: '◈' },
  { href: '/competitor-pages', label: 'Competitor Pages', icon: '◉' },
  { href: '/backlinks', label: 'Backlink Opportunities', icon: '⛓' },
  { href: '/dedupe', label: 'Dedupe Reports', icon: '⧉' },
  { href: '/content', label: 'Content Opportunities', icon: '✎' },
  { href: '/export', label: 'Export Center', icon: '⤓' },
  { href: '/settings', label: 'Settings', icon: '⚙' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: '220px',
        minWidth: '220px',
        background: 'var(--card)',
        borderRight: '1px solid var(--card-border)',
        display: 'flex',
        flexDirection: 'column',
        padding: '1rem 0',
        overflowY: 'auto',
      }}
    >
      <div style={{ padding: '0 1.25rem 1.25rem', borderBottom: '1px solid var(--card-border)', marginBottom: '0.75rem' }}>
        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent)', letterSpacing: '-0.01em' }}>
          SERP<span style={{ color: 'var(--foreground)' }}>Vault</span>
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: '2px' }}>Private SEO Command Center</div>
        <ProjectSiteSelector />
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '0 0.5rem' }}>
        {nav.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.625rem',
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                fontSize: '0.85rem',
                fontWeight: active ? 600 : 400,
                color: active ? 'var(--foreground)' : 'var(--muted)',
                background: active ? 'rgba(99,102,241,0.15)' : 'transparent',
                textDecoration: 'none',
                transition: 'all 0.15s',
                borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
              }}
            >
              <span style={{ fontSize: '1rem', width: '18px', textAlign: 'center' }}>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div style={{ marginTop: 'auto', padding: '1rem 1.25rem', borderTop: '1px solid var(--card-border)', fontSize: '0.7rem', color: 'var(--muted)' }}>
        Data stored locally in browser
      </div>
    </aside>
  );
}
