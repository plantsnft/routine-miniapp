'use client';

type Props = { isOpen: boolean; onClose: () => void };

export function JengaHowToPlayModal({ isOpen, onClose }: Props) {
  if (!isOpen) return null;
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="hl-card"
        style={{ maxWidth: 400, padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 12px 0', color: 'var(--text-0)' }}>How to Play JENGA</h3>
        <p style={{ margin: '0 0 8px 0', color: 'var(--text-2)', fontSize: '0.85rem' }}><strong>Rules</strong></p>
        <ul style={{ margin: '0 0 12px 0', paddingLeft: 20, color: 'var(--text-1)', fontSize: '0.9rem', lineHeight: 1.6 }}>
          <li>Remove <strong>one block</strong> from allowed levels (not the top; not the level below if the top is incomplete).</li>
          <li>Place it on <strong>top</strong> of the tower. Your turn ends 10s after you place, or when the next player touches the tower.</li>
          <li>If you still hold a block when your turn ends, put it back—unless that would make the tower fall.</li>
          <li><strong>One hand only.</strong> You may tap blocks to find a loose one.</li>
        </ul>
        <p style={{ margin: '0 0 8px 0', color: 'var(--text-2)', fontSize: '0.85rem' }}><strong>Game over</strong></p>
        <ul style={{ margin: '0 0 12px 0', paddingLeft: 20, color: 'var(--text-1)', fontSize: '0.9rem', lineHeight: 1.6 }}>
          <li>Tower falls, or <strong>any block</strong> (other than the one you moved) falls, or a <strong>pushed block hits the tower</strong> → game over, <strong>loser = you</strong>.</li>
        </ul>
        <p style={{ margin: '0 0 8px 0', color: 'var(--text-2)', fontSize: '0.85rem' }}><strong>Controls</strong></p>
        <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--text-1)', fontSize: '0.9rem', lineHeight: 1.6 }}>
          <li><strong>Tap</strong> = quick press to push the block out; it is placed on top if it doesn&apos;t hit the tower.</li>
          <li><strong>Pull</strong> = hold ~0.3s, then drag to the <strong>yellow drop zone</strong> (it appears when you pull) and release to place.</li>
          <li>Use <strong>⟲ / ⟳</strong> or pinch to <strong>rotate</strong>. <strong>Stability %</strong> (top-right) shows how stable the tower is.</li>
        </ul>
        <button type="button" onClick={onClose} className="btn-primary" style={{ marginTop: 16 }}>
          Got it
        </button>
      </div>
    </div>
  );
}
