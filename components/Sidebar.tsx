'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sun, Moon } from 'lucide-react';
import ProjectSiteSelector from './ProjectSiteSelector';

const nav = [
  { href: '/', label: 'Dashboard', icon: '⌂' },
  { href: '/upload', label: 'Upload CSVs', icon: '↑' },
  { href: '/uploads', label: 'Upload Library', icon: '▤' },
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
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const currentTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    setTheme(currentTheme);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('serpvault_theme', nextTheme);
  };

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
        overflow: 'hidden',
        height: '100%',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '0 1.25rem 0.5rem' }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent)', letterSpacing: '-0.01em' }}>
            SERP<span style={{ color: 'var(--foreground)' }}>Vault</span>
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: '2px' }}>Private SEO Command Center</div>
        </div>
        <ProjectSiteSelector />

        <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--card-border)', marginBottom: '0.75rem' }}>
          <button
            type="button"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={toggleTheme}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              background: 'rgba(99,102,241,0.08)',
              border: '1px solid var(--card-border)',
              borderRadius: '6px',
              color: 'var(--foreground)',
              cursor: 'pointer',
              fontSize: '0.78rem',
              padding: '0.45rem 0.75rem',
              transition: 'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(99,102,241,0.15)';
              e.currentTarget.style.borderColor = 'var(--accent)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(99,102,241,0.08)';
              e.currentTarget.style.borderColor = 'var(--card-border)';
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}>
              {theme === 'dark' ? (
                <>
                  <Sun size={14} style={{ color: 'var(--accent)' }} />
                  <span>Switch to Light</span>
                </>
              ) : (
                <>
                  <Moon size={14} style={{ color: 'var(--accent)' }} />
                  <span>Switch to Dark</span>
                </>
              )}
            </span>
          </button>
        </div>
      </div>

      <nav
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          padding: '0 0.5rem',
          flex: '1 1 auto',
          overflowY: 'auto',
        }}
      >
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

      <div style={{ borderTop: '1px solid var(--card-border)', flexShrink: 0, padding: '0.75rem 1.25rem 1rem', marginTop: 'auto' }}>
        <div style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>
          Data stored locally in browser
        </div>
      </div>
    </aside>
  );
}
