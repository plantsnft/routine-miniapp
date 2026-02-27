'use client';

/**
 * Shared chat message row with app-wide reactions (👍 ❌ 🔥 😱).
 * Use in all BETR WITH BURR chats for consistent behavior and appearance.
 *
 * Tap/click the message text to show/hide the reaction picker.
 * When collapsed and reactions exist, a compact read-only count summary is shown.
 */

import { useState } from 'react';
import { openFarcasterProfile } from '~/lib/openFarcasterProfile';
import { formatRelativeTime } from '~/lib/utils';

const REACTIONS = [
  { key: 'thumbs_up' as const, emoji: '👍' },
  { key: 'x' as const, emoji: '❌' },
  { key: 'fire' as const, emoji: '🔥' },
  { key: 'scream' as const, emoji: '😱' },
] as const;

export type ChatReactions = {
  thumbs_up: number;
  x: number;
  fire: number;
  scream: number;
};

export type MessageWithReactionsPayload = {
  id: string;
  senderFid: number;
  message: string;
  createdAt: string;
  sender: {
    fid: number;
    username: string | null;
    display_name: string | null;
    pfp_url: string | null;
  };
  reactions?: ChatReactions;
  myReaction?: string | null;
};

const DEFAULT_PFP = 'https://i.imgur.com/BlZ2Lnp.png';

type Props = {
  message: MessageWithReactionsPayload;
  onReactionClick: (messageId: string, reaction: 'thumbs_up' | 'x' | 'fire' | 'scream') => Promise<void>;
  /** Optional: set to true to show reactions in a compact row (e.g. lobby). */
  compact?: boolean;
};

export function MessageWithReactions({ message, onReactionClick, compact }: Props) {
  const reactions = message.reactions ?? { thumbs_up: 0, x: 0, fire: 0, scream: 0 };
  const myReaction = message.myReaction ?? null;
  const [showReactions, setShowReactions] = useState(false);
  const hasReactions = Object.values(reactions).some((c) => c > 0);

  return (
    <div
      style={{
        display: 'flex',
        gap: '8px',
        padding: compact ? '6px 8px' : '8px',
        background: 'var(--bg-1)',
        borderRadius: '6px',
      }}
    >
      <img
        src={message.sender.pfp_url || DEFAULT_PFP}
        alt={message.sender.display_name || message.sender.username || `FID ${message.sender.fid}`}
        style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
          <button
            type="button"
            onClick={() => openFarcasterProfile(message.sender.fid, message.sender.username)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--fire-1)',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontWeight: 600,
              padding: 0,
              textAlign: 'left',
            }}
          >
            {message.sender.display_name || message.sender.username || `FID ${message.sender.fid}`}
          </button>
          <span style={{ fontSize: '0.625rem', color: 'var(--fire-2)' }}>
            {formatRelativeTime(message.createdAt)}
          </span>
        </div>
        <p
          style={{ margin: 0, fontSize: '0.875rem', color: 'var(--fire-1)', wordBreak: 'break-word', cursor: 'pointer' }}
          onClick={() => setShowReactions((s) => !s)}
        >
          {message.message}
        </p>
        {/* Collapsed: read-only count summary when reactions exist */}
        {!showReactions && hasReactions && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
            {REACTIONS.filter(({ key }) => (reactions[key] ?? 0) > 0).map(({ key, emoji }) => (
              <span key={key} style={{ fontSize: '0.75rem', color: 'var(--fire-2)' }}>
                {emoji} {reactions[key]}
              </span>
            ))}
          </div>
        )}
        {/* Expanded: full reaction picker */}
        {showReactions && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', flexWrap: 'wrap' }}>
            {REACTIONS.map(({ key, emoji }) => {
              const count = reactions[key] ?? 0;
              const isMine = myReaction === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    onReactionClick(message.id, key);
                    setShowReactions(false);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '2px',
                    background: isMine ? 'var(--fire-2)' : 'transparent',
                    border: `1px solid ${isMine ? 'var(--fire-1)' : 'var(--fire-2)'}`,
                    borderRadius: '4px',
                    color: 'var(--fire-1)',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    padding: '2px 6px',
                  }}
                  aria-label={`${emoji} ${key}`}
                >
                  <span>{emoji}</span>
                  {count > 0 && <span>{count}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
