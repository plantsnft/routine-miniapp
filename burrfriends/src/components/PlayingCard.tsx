'use client';

const SUIT_SYMBOLS: Record<string, string> = { h: '♥', d: '♦', c: '♣', s: '♠' };
const RED_SUITS = new Set(['h', 'd']);

type PlayingCardProps = {
  code: string;
  size?: 'sm' | 'md';
  style?: React.CSSProperties;
};

export function PlayingCard({ code, size = 'sm', style }: PlayingCardProps) {
  const s = String(code).trim();
  if (s.length < 2) return <span style={style}>{s}</span>;
  const rank = s.slice(0, -1).toUpperCase();
  const suitKey = s.slice(-1).toLowerCase();
  const suitSym = SUIT_SYMBOLS[suitKey] ?? s.slice(-1);
  const isRed = RED_SUITS.has(suitKey);

  const fontSize = size === 'sm' ? '0.75rem' : '0.85rem';
  const padding = size === 'sm' ? '4px 6px' : '6px 8px';

  return (
    <span
      style={{
        background: 'var(--bg-0)',
        color: isRed ? '#dc2626' : 'var(--text-0)',
        padding,
        borderRadius: '6px',
        fontSize,
        border: '1px solid var(--stroke)',
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: size === 'sm' ? 28 : 34,
        ...style,
      }}
    >
      {rank}{suitSym}
    </span>
  );
}
