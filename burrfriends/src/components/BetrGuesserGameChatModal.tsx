'use client';

/**
 * BetrGuesserGameChatModal - Game-level chat for BETR GUESSER (Phase 13.10).
 * Access: has guessed in this game or admin. Only available when game is open.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { isAdmin } from '~/lib/admin';
import { MessageWithReactions, type MessageWithReactionsPayload } from '~/components/MessageWithReactions';

interface BetrGuesserGameChatModalProps {
  gameId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function BetrGuesserGameChatModal({ gameId, isOpen, onClose }: BetrGuesserGameChatModalProps) {
  const { fid, token } = useAuth();
  const [messages, setMessages] = useState<MessageWithReactionsPayload[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [inChatCount, setInChatCount] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);
  const userIsAdmin = fid ? isAdmin(fid) : false;

  const base = gameId ? `/api/betr-guesser/games/${gameId}/chat` : '';

  const loadMessages = useCallback(async () => {
    if (!token || !base) return;
    try {
      const res = await authedFetch(base, { method: 'GET' }, token);
      const data = await res.json();
      if (data?.ok && Array.isArray(data.data)) {
        setMessages(data.data);
      }
    } catch {
      // ignore
    }
  }, [token, base]);

  const sendHeartbeat = useCallback(
    async (inChat: boolean) => {
      if (!token || !base) return;
      try {
        await authedFetch(
          `${base}/heartbeat`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inChat }) },
          token
        );
        const activeRes = await authedFetch(`${base}/active`, { method: 'GET' }, token);
        const activeData = await activeRes.json();
        if (activeData?.ok && activeData.data) {
          setInChatCount(activeData.data.inChatCount ?? 0);
        }
      } catch {
        // ignore
      }
    },
    [token, base]
  );

  useEffect(() => {
    if (!isOpen || !token || !base) return;
    loadMessages();
    sendHeartbeat(true);
    const messageInterval = setInterval(loadMessages, 5000);
    const heartbeatInterval = setInterval(() => sendHeartbeat(true), 30000);
    return () => {
      clearInterval(messageInterval);
      clearInterval(heartbeatInterval);
      sendHeartbeat(false);
    };
  }, [isOpen, token, base, loadMessages, sendHeartbeat]);

  const handleReactionClick = async (messageId: string, reaction: 'thumbs_up' | 'x' | 'fire' | 'scream') => {
    if (!token || !base) return;
    try {
      const res = await authedFetch(
        `${base}/messages/${messageId}/reactions`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reaction }) },
        token
      );
      const data = await res.json();
      if (!res.ok || !data?.ok) return;
      loadMessages();
    } catch {
      // ignore
    }
  };

  const handleSend = async () => {
    if (!token || !base || !input.trim() || sending) return;
    setSending(true);
    try {
      await authedFetch(
        base,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: input.trim() }),
        },
        token
      );
      setInput('');
      await loadMessages();
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (messageId: string) => {
    if (!token || !base || !userIsAdmin || deleting) return;
    setDeleting(messageId);
    try {
      await authedFetch(`${base}/${messageId}`, { method: 'DELETE' }, token);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch {
      // ignore
    } finally {
      setDeleting(null);
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
        background: 'rgba(0, 0, 0, 0.8)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-1)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--stroke)',
          width: '100%',
          maxWidth: '400px',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--stroke)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2 style={{ color: 'var(--fire-1)', fontSize: '1rem', fontWeight: 600, margin: 0 }}>
            Game Chat
          </h2>
          <span style={{ color: 'var(--text-2)', fontSize: '0.75rem' }}>{inChatCount} in chat</span>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--fire-2)',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: '4px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {messages.length === 0 && (
            <p style={{ color: 'var(--text-2)', fontSize: '0.875rem', margin: 0 }}>No messages yet. Say something!</p>
          )}
          {messages.map((msg) => (
            <div key={msg.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '4px' }}>
              <MessageWithReactions
                message={msg}
                onReactionClick={(messageId, reaction) => handleReactionClick(messageId, reaction)}
              />
              {userIsAdmin && (
                <button
                  type="button"
                  onClick={() => handleDelete(msg.id)}
                  disabled={deleting === msg.id}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-2)',
                    fontSize: '0.75rem',
                    cursor: deleting === msg.id ? 'not-allowed' : 'pointer',
                    padding: '0 4px',
                    opacity: deleting === msg.id ? 0.5 : 1,
                    flexShrink: 0,
                  }}
                >
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>

        <div style={{ padding: '12px', borderTop: '1px solid var(--stroke)' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Type a message..."
              maxLength={500}
              style={{
                flex: 1,
                padding: '8px 12px',
                border: '1px solid var(--stroke)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-0)',
                background: 'var(--bg-0)',
              }}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !input.trim()}
              className="btn-primary"
              style={{ minWidth: '80px' }}
            >
              {sending ? '…' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
