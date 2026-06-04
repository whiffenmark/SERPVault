'use client';

import { useState, useEffect } from 'react';
import { getStore, clearStore } from '@/lib/storage';
import type { AppStore } from '@/lib/types';
import Card from '@/components/Card';

export default function SettingsPage() {
  const [store, setStore] = useState<AppStore | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setStore(getStore());
  }, []);

  function handleClear() {
    clearStore();
    setStore(getStore());
    setConfirmClear(false);
    setMessage('All data cleared successfully.');
    setTimeout(() => setMessage(''), 4000);
  }

  const storageSize = (() => {
    try {
      const raw = localStorage.getItem('serpvault_data') ?? '';
      const bytes = new Blob([raw]).size;
      return bytes > 1024 * 1024
        ? `${(bytes / 1024 / 1024).toFixed(2)} MB`
        : `${(bytes / 1024).toFixed(1)} KB`;
    } catch {
      return 'Unknown';
    }
  })();

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.3rem' }}>Settings</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>
          Manage your local data storage and Supabase connection.
        </p>
      </div>

      {message && (
        <div style={{ background: '#10b98120', border: '1px solid #10b98150', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1.25rem', fontSize: '0.875rem', color: 'var(--success)' }}>
          {message}
        </div>
      )}

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <Card title="Keywords" value={store?.keywords.length ?? 0} />
        <Card title="Backlinks" value={store?.backlinks.length ?? 0} />
        <Card title="Competitor Pages" value={store?.competitorPages.length ?? 0} />
        <Card title="Storage Used" value={storageSize} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Data Storage</h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '1rem' }}>
            All data is stored in your browser&apos;s <code style={{ background: 'rgba(99,102,241,0.15)', padding: '0.1rem 0.3rem', borderRadius: '3px', fontSize: '0.78rem' }}>localStorage</code>.
            No data is sent to any server. Raw uploaded files are never stored — only the parsed CSV rows.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {!confirmClear ? (
              <button
                onClick={() => setConfirmClear(true)}
                style={{ background: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)', borderRadius: '7px', padding: '0.5rem 1.25rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
              >
                Clear All Data
              </button>
            ) : (
              <>
                <button
                  onClick={handleClear}
                  style={{ background: 'var(--danger)', border: 'none', color: '#fff', borderRadius: '7px', padding: '0.5rem 1.25rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
                >
                  Yes, Delete Everything
                </button>
                <button
                  onClick={() => setConfirmClear(false)}
                  style={{ background: 'var(--card)', border: '1px solid var(--card-border)', color: 'var(--muted)', borderRadius: '7px', padding: '0.5rem 1.25rem', cursor: 'pointer', fontSize: '0.85rem' }}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>

        <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Supabase Integration <span style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--muted)', marginLeft: '0.4rem' }}>Optional</span></h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>
            Add Supabase credentials to sync data across devices. The app works fully without it.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <div>
              <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: '0.25rem' }}>
                NEXT_PUBLIC_SUPABASE_URL
              </label>
              <input
                readOnly
                value={process.env.NEXT_PUBLIC_SUPABASE_URL ? '✓ Configured' : 'Not set — add to .env.local'}
                style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--card-border)', borderRadius: '6px', padding: '0.4rem 0.75rem', color: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'var(--success)' : 'var(--muted)', fontSize: '0.82rem', width: '100%' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: '0.25rem' }}>
                NEXT_PUBLIC_SUPABASE_ANON_KEY
              </label>
              <input
                readOnly
                value={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '✓ Configured' : 'Not set — add to .env.local'}
                style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--card-border)', borderRadius: '6px', padding: '0.4rem 0.75rem', color: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'var(--success)' : 'var(--muted)', fontSize: '0.82rem', width: '100%' }}
              />
            </div>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.75rem' }}>
            See the README for full Supabase setup instructions. Run the schema at <code style={{ fontSize: '0.72rem', background: 'rgba(99,102,241,0.15)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>supabase/schema.sql</code>.
          </p>
        </div>

        <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>About SERPVault</h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
            Version 1.0 MVP — Built with Next.js, TypeScript, Tailwind CSS. All data stays in your browser.
          </p>
        </div>
      </div>
    </div>
  );
}
