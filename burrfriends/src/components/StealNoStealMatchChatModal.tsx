'use client';

/**
 * StealNoStealMatchChatModal - Admin View Chat modal for a specific match.
 * Admins can read and send messages. Same pattern as BULLIED admin group chat.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { MessageWithReactions, type MessageWithReactionsPayload } from '~/components/MessageWithReactions';

interface StealNoStealMatchChatModalProps {
  gameId: string;
  matchId: string;
  matchLabel: string; // e.g. "Match 1: Player A vs Player B"
  isOpen: boolean;
  onClose: () => void;
}

export function StealNoStealMatchChatModal({ gameId, matchId, matchLabel, isOpen, onClose }: StealNoStealMatchChatModalProps) {
  const { token } = useAuth();
  const [messages, setMessages] = useState<MessageWithReactionsPayload[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const fetchChat = useCallback(async () => {
    if (!token || !gameId || !matchId) return;
    setLoading(true);
    try {
      const res = await authedFetch(`/api/steal-no-steal/games/${gameId}/matches/${matchId}/chat`, { method: 'GET' }, token).then((r) => r.json());
      if (res?.ok && Array.isArray(res.data)) setMessages(res.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [token, gameId, matchId]);

  useEffect(() => {
    if (!isOpen) return;
    void fetchChat();
  }, [isOpen, fetchChat]);

  useEffect(() => {
    if (!isOpen || !token || !gameId || !matchId) return;
    const interval = setInterval(fetchChat, 8000);
    return () => clearInterval(interval);
  }, [isOpen, token, gameId, matchId, fetchChat]);

  const handleSend = async () => {
    if (!token || !input.trim()) return;
    setSending(true);
    try {
      await authedFetch(`/api/steal-no-steal/games/${gameId}/matches/${matchId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input.trim() }),
      }, token);
      setInput('');
      await fetchChat();
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  };

  const handleReactionClick = async (messageId: string, reaction: 'thumbs_up' | 'x' | 'fire' | 'scream') => {
    if (!token) return;
    try {
      await authedFetch(
        `/api/steal-no-steal/games/${gameId}/matches/${matchId}/chat/messages/${messageId}/reactions`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reaction }) },
        token
      );
      await fetchChat();
    } catch {
      // ignore
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={onClose}
      role="presentation"
    >
      <div
        style={{
          maxWidth: '90%',
          width: '500px',
          maxHeight: '90vh',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-1)',
          borderRadius: '8px',
          border: '1px solid var(--stroke)',
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`${matchLabel} Chat`}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ color: 'var(--fire-1)', margin: 0, fontSize: '1rem' }}>{matchLabel} Chat</h2>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--fire-1)', fontSize: '24px', cursor: 'pointer', padding: 0, lineHeight: 1 }}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !sending && input.trim()) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Type a message..."
            maxLength={1000}
            disabled={sending}
            style={{
              flex: 1,
              padding: '8px',
              border: '1px solid var(--stroke)',
              borderRadius: '6px',
              background: 'var(--bg-2)',
              color: 'var(--fire-1)',
              fontSize: '0.875rem',
            }}
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={sending || !input.trim()}
            style={{
              padding: '8px 16px',
              background: 'var(--fire-1)',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: sending || !input.trim() ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              fontSize: '0.875rem',
            }}
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
        <div
          style={{
            flex: 1,
            maxHeight: '50vh',
            overflowY: 'auto',
            padding: '8px',
            background: 'var(--bg-2)',
            borderRadius: '6px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {loading ? (
            <p style={{ color: 'var(--fire-2)', fontSize: '0.875rem', textAlign: 'center', padding: '16px', margin: 0 }}>Loading chat...</p>
          ) : messages.length === 0 ? (
            <p style={{ color: 'var(--fire-2)', fontSize: '0.875rem', textAlign: 'center', padding: '16px', margin: 0 }}>No messages yet.</p>
          ) : (
            messages.map((msg) => (
              <MessageWithReactions key={msg.id} message={msg} onReactionClick={handleReactionClick} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
