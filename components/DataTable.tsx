'use client';

import { useState, useMemo } from 'react';
import type { Tag } from '@/lib/types';

const TAGS: Tag[] = ['Money Page', 'Blog Post', 'City Page', 'Backlink Target', 'Link Bait', 'Ignore'];

const TAG_COLORS: Record<Tag, string> = {
  'Money Page': '#10b981',
  'Blog Post': '#6366f1',
  'City Page': '#f59e0b',
  'Backlink Target': '#3b82f6',
  'Link Bait': '#ec4899',
  Ignore: '#64748b',
};

export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
  sortKey?: (row: T) => number | string;
  width?: string;
}

interface DataTableProps<T extends { id: string; tag?: Tag }> {
  columns: Column<T>[];
  rows: T[];
  onTagChange?: (id: string, tag: Tag | undefined) => void;
  pageSize?: number;
}

export default function DataTable<T extends { id: string; tag?: Tag }>({
  columns,
  rows,
  onTagChange,
  pageSize = 50,
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const [tagFilter, setTagFilter] = useState<Tag | 'All'>('All');

  const filtered = useMemo(() => {
    let result = rows;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((r) =>
        Object.values(r as Record<string, unknown>).some((v) => String(v).toLowerCase().includes(q))
      );
    }
    if (tagFilter !== 'All') {
      result = result.filter((r) => r.tag === tagFilter);
    }
    if (sortCol) {
      const col = columns.find((c) => c.key === sortCol);
      result = [...result].sort((a, b) => {
        const av = col?.sortKey ? col.sortKey(a) : String((a as Record<string, unknown>)[sortCol] ?? '');
        const bv = col?.sortKey ? col.sortKey(b) : String((b as Record<string, unknown>)[sortCol] ?? '');
        if (typeof av === 'number' && typeof bv === 'number') {
          return sortDir === 'asc' ? av - bv : bv - av;
        }
        return sortDir === 'asc'
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av));
      });
    }
    return result;
  }, [rows, search, sortCol, sortDir, tagFilter, columns]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const pageRows = filtered.slice(page * pageSize, (page + 1) * pageSize);

  function handleSort(key: string) {
    if (sortCol === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(key);
      setSortDir('desc');
    }
    setPage(0);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          style={{
            background: 'var(--card)',
            border: '1px solid var(--card-border)',
            borderRadius: '6px',
            padding: '0.4rem 0.75rem',
            color: 'var(--foreground)',
            fontSize: '0.85rem',
            width: '220px',
            outline: 'none',
          }}
        />
        <select
          value={tagFilter}
          onChange={(e) => { setTagFilter(e.target.value as Tag | 'All'); setPage(0); }}
          style={{
            background: 'var(--card)',
            border: '1px solid var(--card-border)',
            borderRadius: '6px',
            padding: '0.4rem 0.75rem',
            color: 'var(--foreground)',
            fontSize: '0.85rem',
            outline: 'none',
          }}
        >
          <option value="All">All Tags</option>
          {TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <span style={{ fontSize: '0.8rem', color: 'var(--muted)', marginLeft: 'auto' }}>
          {filtered.length.toLocaleString()} rows
        </span>
      </div>

      <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--card-border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--card-border)', background: 'rgba(45,49,72,0.5)' }}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  style={{
                    padding: '0.6rem 0.875rem',
                    textAlign: 'left',
                    color: 'var(--muted)',
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    width: col.width,
                    userSelect: 'none',
                  }}
                >
                  {col.label}
                  {sortCol === col.key && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                </th>
              ))}
              {onTagChange && (
                <th style={{ padding: '0.6rem 0.875rem', textAlign: 'left', color: 'var(--muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                  Tag
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr
                key={row.id}
                style={{
                  borderBottom: '1px solid var(--card-border)',
                  background: i % 2 === 0 ? 'transparent' : 'rgba(26,29,46,0.4)',
                }}
              >
                {columns.map((col) => (
                  <td key={col.key} style={{ padding: '0.55rem 0.875rem', color: 'var(--foreground)', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '')}
                  </td>
                ))}
                {onTagChange && (
                  <td style={{ padding: '0.55rem 0.875rem' }}>
                    <select
                      value={row.tag ?? ''}
                      onChange={(e) => onTagChange(row.id, (e.target.value as Tag) || undefined)}
                      style={{
                        background: row.tag ? TAG_COLORS[row.tag] + '22' : 'var(--card)',
                        border: `1px solid ${row.tag ? TAG_COLORS[row.tag] : 'var(--card-border)'}`,
                        borderRadius: '4px',
                        padding: '0.2rem 0.4rem',
                        color: row.tag ? TAG_COLORS[row.tag] : 'var(--muted)',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        outline: 'none',
                      }}
                    >
                      <option value="">— No tag —</option>
                      {TAGS.map((t) => <option key={t} value={t} style={{ background: 'var(--card)', color: TAG_COLORS[t] }}>{t}</option>)}
                    </select>
                  </td>
                )}
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={columns.length + (onTagChange ? 1 : 0)} style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)' }}>
                  No rows found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'flex-end', fontSize: '0.82rem' }}>
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            style={{ padding: '0.3rem 0.75rem', background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '5px', color: 'var(--foreground)', cursor: page === 0 ? 'not-allowed' : 'pointer', opacity: page === 0 ? 0.4 : 1 }}
          >
            ← Prev
          </button>
          <span style={{ color: 'var(--muted)' }}>
            Page {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            style={{ padding: '0.3rem 0.75rem', background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '5px', color: 'var(--foreground)', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', opacity: page >= totalPages - 1 ? 0.4 : 1 }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
