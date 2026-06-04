'use client';

import { useState, useEffect } from 'react';
import { clearStore } from '@/lib/storage';
import * as db from '@/lib/db';
import { supabaseEnabled } from '@/lib/supabase/client';
import Card from '@/components/Card';

export default function SettingsPage() {
  const [counts, setCounts] = useState({ keywords: 0, backlinks: 0, competitors: 0 });
  const [confirmClear, setConfirmClear] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [testing, setTesting] = useState(false);
  const [migrating, setMigrating] = useState(false);

  const storageSize = (() => {
    try {
      const raw = localStorage.getItem('serpvault_data') ?? '';
      const bytes = new Blob([raw]).size;
      return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
    } catch { return 'Unknown'; }
  })();

  useEffect(() => {
    Promise.all([db.getKeywords(), db.getBacklinks(), db.getCompetitorPages()]).then(
      ([kws, bls, cps]) => setCounts({ keywords: kws.length, backlinks: bls.length, competitors: cps.length })
    );
  }, []);

  function flash(text: string, type: 'success' | 'error' | 'info' = 'success') {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  }

  function handleClear() {
    clearStore();
    setCounts({ keywords: 0, backlinks: 0, competitors: 0 });
    setConfirmClear(false);
    flash('All local data cleared.');
  }

  async function handleTestConnection() {
    setTesting(true);
    try {
      const result = await db.testConnection();
      if (result.ok) {
        flash(`Connected ✓  — ${result.latencyMs}ms`, 'success');
      } else {
        flash(`Connection failed: ${result.error}`, 'error');
      }
    } catch (e) {
      flash(`Error: ${String(e)}`, 'error');
    }
    setTesting(false);
  }

  async function handleMigrate() {
    setMigrating(true);
    try {
      const result = await db.migrateLocalToSupabase();
      flash(`Migrated ${result.rows.toLocaleString()} rows to Supabase: ${result.tables.join(', ')}`, 'success');
    } catch (e) {
      flash(`Migration failed: ${String(e)}`, 'error');
    }
    setMigrating(false);
  }

  const msgColor = message?.type === 'error' ? '#ef444420' : message?.type === 'info' ? 'rgba(99,102,241,0.1)' : '#10b98120';
  const msgBorder = message?.type === 'error' ? '#ef444450' : message?.type === 'info' ? 'rgba(99,102,241,0.3)' : '#10b98150';
  const msgText = message?.type === 'error' ? 'var(--danger)' : message?.type === 'info' ? 'var(--accent)' : 'var(--success)';

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.3rem' }}>Settings</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>Manage your Supabase connection and local data cache.</p>
      </div>

      {message && (
        <div style={{ background: msgColor, border: `1px solid ${msgBorder}`, borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1.25rem', fontSize: '0.875rem', color: msgText }}>
          {message.text}
        </div>
      )}

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <Card title="Keywords" value={counts.keywords} />
        <Card title="Backlinks" value={counts.backlinks} />
        <Card title="Competitor Pages" value={counts.competitors} />
        <Card title="Local Cache" value={storageSize} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        {/* Supabase Status */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>Supabase Connection</h2>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: '999px', background: supabaseEnabled ? '#10b98122' : '#ef444422', color: supabaseEnabled ? 'var(--success)' : 'var(--danger)' }}>
              {supabaseEnabled ? '● Connected' : '○ Not configured'}
            </span>
          </div>
          {supabaseEnabled ? (
            <>
              <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '1rem' }}>
                Project: <code style={{ background: 'rgba(99,102,241,0.1)', padding: '0.1rem 0.3rem', borderRadius: '3px', fontSize: '0.78rem' }}>
                  {process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('https://', '').split('.')[0]}
                </code>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button
                  onClick={handleTestConnection}
                  disabled={testing}
                  style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '7px', padding: '0.5rem 1.25rem', cursor: testing ? 'wait' : 'pointer', fontWeight: 600, fontSize: '0.85rem', opacity: testing ? 0.6 : 1 }}
                >
                  {testing ? 'Testing…' : 'Test Connection'}
                </button>
                <button
                  onClick={handleMigrate}
                  disabled={migrating}
                  style={{ background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', borderRadius: '7px', padding: '0.5rem 1.25rem', cursor: migrating ? 'wait' : 'pointer', fontWeight: 600, fontSize: '0.85rem', opacity: migrating ? 0.6 : 1 }}
                >
                  {migrating ? 'Migrating…' : 'Migrate Local → Supabase'}
                </button>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.75rem' }}>
                "Migrate" uploads all localStorage data to Supabase. Safe to run multiple times — uses upsert.
              </p>
            </>
          ) : (
            <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
              Add <code style={{ fontSize: '0.78rem' }}>NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
              <code style={{ fontSize: '0.78rem' }}>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to{' '}
              <code style={{ fontSize: '0.78rem' }}>.env.local</code> and restart the dev server.
            </p>
          )}
        </div>

        {/* Local cache */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Local Browser Cache</h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '1rem' }}>
            SERPVault caches data in <code style={{ fontSize: '0.78rem', background: 'rgba(99,102,241,0.1)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>localStorage</code> for fast loads.
            Clearing this does <strong>not</strong> delete data from Supabase.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {!confirmClear ? (
              <button onClick={() => setConfirmClear(true)} style={{ background: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)', borderRadius: '7px', padding: '0.5rem 1.25rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
                Clear Local Cache
              </button>
            ) : (
              <>
                <button onClick={handleClear} style={{ background: 'var(--danger)', border: 'none', color: '#fff', borderRadius: '7px', padding: '0.5rem 1.25rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
                  Yes, Clear Cache
                </button>
                <button onClick={() => setConfirmClear(false)} style={{ background: 'var(--card)', border: '1px solid var(--card-border)', color: 'var(--muted)', borderRadius: '7px', padding: '0.5rem 1.25rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>

        <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>About SERPVault</h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>Version 1.0 — Next.js · TypeScript · Tailwind · Supabase</p>
        </div>
      </div>
    </div>
  );
}
