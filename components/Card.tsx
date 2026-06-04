interface CardProps {
  title: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
}

export default function Card({ title, value, sub, accent }: CardProps) {
  return (
    <div
      style={{
        background: 'var(--card)',
        border: `1px solid ${accent ? 'var(--accent)' : 'var(--card-border)'}`,
        borderRadius: '10px',
        padding: '1.25rem 1.5rem',
        minWidth: '140px',
      }}
    >
      <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {title}
      </div>
      <div style={{ fontSize: '1.75rem', fontWeight: 700, color: accent ? 'var(--accent)' : 'var(--foreground)', lineHeight: 1 }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      {sub && (
        <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.3rem' }}>{sub}</div>
      )}
    </div>
  );
}
