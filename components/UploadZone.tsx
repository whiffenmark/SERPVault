'use client';

import { useState, useRef, useCallback } from 'react';

interface UploadZoneProps {
  onFiles: (files: File[]) => void;
  loading?: boolean;
}

export default function UploadZone({ onFiles, loading }: UploadZoneProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = Array.from(e.dataTransfer.files).filter((f) => f.name.endsWith('.csv'));
      if (files.length) onFiles(files);
    },
    [onFiles]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((f) => f.name.endsWith('.csv'));
    if (files.length) onFiles(files);
    e.target.value = '';
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--card-border)'}`,
        borderRadius: '12px',
        padding: '3rem 2rem',
        textAlign: 'center',
        cursor: loading ? 'wait' : 'pointer',
        background: dragging ? 'rgba(99,102,241,0.07)' : 'var(--card)',
        transition: 'all 0.2s',
        userSelect: 'none',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        multiple
        onChange={handleChange}
        style={{ display: 'none' }}
      />
      <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📁</div>
      {loading ? (
        <div style={{ color: 'var(--accent)', fontWeight: 500 }}>Processing files…</div>
      ) : (
        <>
          <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '0.35rem' }}>
            Drop CSV files here, or click to browse
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
            Supports SEMrush, Ahrefs, Moz, and any standard SEO CSV export.
            <br />Auto-detects report type from filename and columns.
          </div>
        </>
      )}
    </div>
  );
}
