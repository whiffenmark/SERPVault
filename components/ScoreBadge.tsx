interface Props {
  score: number;
}

export default function ScoreBadge({ score }: Props) {
  const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: '36px',
        padding: '0.15rem 0.5rem',
        borderRadius: '999px',
        fontSize: '0.75rem',
        fontWeight: 700,
        background: color + '22',
        color,
        border: `1px solid ${color}44`,
      }}
    >
      {score}
    </span>
  );
}
