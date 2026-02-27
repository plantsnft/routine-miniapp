"use client";

/**
 * LobbyChatModal - Global lobby chat for 1M+ BETR stakers
 * 
 * Phase 19: Lobby Chat
 * Phase 19.2: UI improvements - newest at top, inline messages, active users popup
 */

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "~/components/AuthProvider";
import { authedFetch } from "~/lib/authedFetch";
import { isAdmin } from "~/lib/admin";
import { MessageWithReactions, type MessageWithReactionsPayload } from "~/components/MessageWithReactions";
import { openFarcasterProfile } from "~/lib/openFarcasterProfile";
import { getPasteText } from "~/lib/pasteSupport";

type ActiveUser = {
  fid: number;
  username: string | null;
  display_name: string | null;
  pfp_url: string | null;
  in_chat: boolean;
};

const DEFAULT_PFP = "https://i.imgur.com/1Q9ZQ9u.png";

interface LobbyChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LobbyChatModal({ isOpen, onClose }: LobbyChatModalProps) {
  const { fid, token } = useAuth();
  const [messages, setMessages] = useState<MessageWithReactionsPayload[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [activeCount, setActiveCount] = useState(0);
  const [inChatCount, setInChatCount] = useState(0);
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [showActiveUsersPopup, setShowActiveUsersPopup] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const userIsAdmin = fid ? isAdmin(fid) : false;

  // Load chat messages
  const loadMessages = useCallback(async () => {
    if (!token) return;
    try {
      const res = await authedFetch("/api/lobby/chat", { method: "GET" }, token);
      const data = await res.json();
      if (data?.ok && Array.isArray(data.data)) {
        setMessages(data.data);
      }
    } catch {
      // Ignore errors
    }
  }, [token]);

  // Send heartbeat
  const sendHeartbeat = useCallback(async (inChat: boolean) => {
    if (!token) return;
    try {
      const res = await authedFetch(
        "/api/lobby/heartbeat",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inChat }),
        },
        token
      );
      const data = await res.json();
      if (data?.ok && data.data) {
        setActiveCount(data.data.activeCount || 0);
        setInChatCount(data.data.inChatCount || 0);
        if (Array.isArray(data.data.activeUsers)) {
          setActiveUsers(data.data.activeUsers);
        }
      }
    } catch {
      // Ignore errors
    }
  }, [token]);

  // Initial load and polling when open
  useEffect(() => {
    if (!isOpen || !token) return;

    // Initial load
    loadMessages();
    sendHeartbeat(true);

    // Poll messages every 5s
    const messageInterval = setInterval(loadMessages, 5000);
    
    // Heartbeat every 30s
    const heartbeatInterval = setInterval(() => sendHeartbeat(true), 30000);

    return () => {
      clearInterval(messageInterval);
      clearInterval(heartbeatInterval);
      // Send heartbeat with inChat: false when closing
      sendHeartbeat(false);
    };
  }, [isOpen, token, loadMessages, sendHeartbeat]);

  const handleReactionClick = async (messageId: string, reaction: "thumbs_up" | "x" | "fire" | "scream") => {
    if (!token) return;
    try {
      const res = await authedFetch(
        `/api/lobby/chat/messages/${messageId}/reactions`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reaction }) },
        token
      );
      const data = await res.json();
      if (!res.ok || !data.ok) return;
      loadMessages();
    } catch (e) {
      console.error("Failed to set reaction:", e);
    }
  };

  // Send message
  const handleSend = async () => {
    if (!token || !input.trim() || sending) return;
    setSending(true);
    try {
      await authedFetch(
        "/api/lobby/chat",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: input.trim() }),
        },
        token
      );
      setInput("");
      // Refresh messages
      await loadMessages();
    } catch {
      // Ignore errors
    } finally {
      setSending(false);
    }
  };

  // Delete message (admin only)
  const handleDelete = async (messageId: string) => {
    if (!token || !userIsAdmin || deleting) return;
    setDeleting(messageId);
    try {
      await authedFetch(
        `/api/lobby/chat/${messageId}`,
        { method: "DELETE" },
        token
      );
      // Remove from local state
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch {
      // Ignore errors
    } finally {
      setDeleting(null);
    }
  };

  // Format relative time
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.8)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--bg-1)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--stroke)",
          width: "100%",
          maxWidth: "400px",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--stroke)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <h2 style={{ color: "var(--fire-1)", fontSize: "1rem", fontWeight: 600, margin: 0 }}>
              Lobby Chat
            </h2>
            <button
              type="button"
              onClick={() => setShowActiveUsersPopup(true)}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--fire-2)",
                fontSize: "0.75rem",
                margin: "4px 0 0 0",
                padding: 0,
                cursor: "pointer",
                textDecoration: "underline",
                textUnderlineOffset: "2px",
              }}
            >
              {activeCount} active • {inChatCount} in chat
            </button>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--fire-2)",
              fontSize: "1.5rem",
              cursor: "pointer",
              padding: "4px",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* In-chat ducklings row: PFPs of everyone currently in the chat (including current user), no names */}
        {activeUsers.filter((u) => u.in_chat).length > 0 && (
          <div
            className="lobby-ducklings-row"
            style={{
              display: "flex",
              flexDirection: "row",
              flexWrap: "wrap",
              gap: "6px",
              padding: "8px 16px",
              borderBottom: "1px solid var(--stroke)",
              minHeight: "40px",
              alignItems: "center",
            }}
          >
            {activeUsers
              .filter((u) => u.in_chat)
              .map((u) => (
                <img
                  key={u.fid}
                  src={u.pfp_url || DEFAULT_PFP}
                  alt=""
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    flexShrink: 0,
                    objectFit: "cover",
                  }}
                />
              ))}
          </div>
        )}

        {/* Messages - newest at top */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "12px",
            minHeight: "200px",
            maxHeight: "400px",
          }}
        >
          {messages.length === 0 ? (
            <p style={{ color: "var(--fire-2)", fontSize: "0.875rem", textAlign: "center", paddingTop: "40px" }}>
              No messages yet. Start the conversation!
            </p>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} style={{ marginBottom: "10px", display: "flex", alignItems: "flex-start", gap: "8px" }}>
                <MessageWithReactions
                  message={msg}
                  onReactionClick={(messageId, reaction) => handleReactionClick(messageId, reaction)}
                  compact
                />
                {userIsAdmin && (
                  <button
                    onClick={() => handleDelete(msg.id)}
                    disabled={deleting === msg.id}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--fire-3)",
                      fontSize: "0.7rem",
                      cursor: deleting === msg.id ? "not-allowed" : "pointer",
                      padding: "0 4px",
                      opacity: deleting === msg.id ? 0.5 : 1,
                      flexShrink: 0,
                    }}
                    title="Delete message"
                  >
                    🗑️
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {/* Input */}
        <div
          style={{
            padding: "12px",
            borderTop: "1px solid var(--stroke)",
            display: "flex",
            gap: "8px",
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={async (e) => {
              const el = e.currentTarget;
              const start = el.selectionStart ?? 0;
              const end = el.selectionEnd ?? input.length;
              const text = await getPasteText(e);
              if (text != null && text !== "") {
                e.preventDefault();
                setInput((prev) => prev.slice(0, start) + text + prev.slice(end));
              }
            }}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Type a message..."
            maxLength={500}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--stroke)",
              background: "var(--bg-2)",
              color: "var(--fire-1)",
              fontSize: "0.875rem",
            }}
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="btn-primary"
            style={{
              padding: "10px 16px",
              opacity: sending || !input.trim() ? 0.5 : 1,
            }}
          >
            Send
          </button>
        </div>
      </div>

      {/* Active Users Popup */}
      {showActiveUsersPopup && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.9)",
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={() => setShowActiveUsersPopup(false)}
        >
          <div
            style={{
              background: "var(--bg-1)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--stroke)",
              width: "100%",
              maxWidth: "320px",
              maxHeight: "70vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Popup Header */}
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--stroke)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3 style={{ color: "var(--fire-1)", fontSize: "0.9rem", fontWeight: 600, margin: 0 }}>
                Active Users ({activeCount})
              </h3>
              <button
                onClick={() => setShowActiveUsersPopup(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--fire-2)",
                  fontSize: "1.25rem",
                  cursor: "pointer",
                  padding: "4px",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            {/* User List */}
            <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
              {activeUsers.length === 0 ? (
                <p style={{ color: "var(--fire-3)", fontSize: "0.85rem", textAlign: "center", padding: "20px 0" }}>
                  No active users
                </p>
              ) : (
                activeUsers.map((user) => (
                  <div
                    key={user.fid}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "8px",
                      borderRadius: "var(--radius-md)",
                      cursor: "pointer",
                      marginBottom: "4px",
                      background: user.in_chat ? "rgba(45, 212, 191, 0.1)" : "transparent",
                      border: user.in_chat ? "1px solid rgba(45, 212, 191, 0.3)" : "1px solid transparent",
                    }}
                    onClick={() => openFarcasterProfile(user.fid, user.username)}
                  >
                    <img
                      src={user.pfp_url || DEFAULT_PFP}
                      alt=""
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        color: "var(--fire-1)",
                        fontSize: "0.85rem",
                        fontWeight: 500,
                        margin: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}>
                        {user.display_name || user.username || `FID: ${user.fid}`}
                      </p>
                      {user.username && (
                        <p style={{
                          color: "var(--fire-3)",
                          fontSize: "0.75rem",
                          margin: "2px 0 0 0",
                        }}>
                          @{user.username}
                        </p>
                      )}
                    </div>
                    {user.in_chat && (
                      <span style={{
                        color: "rgba(45, 212, 191, 1)",
                        fontSize: "0.7rem",
                        fontWeight: 500,
                        flexShrink: 0,
                      }}>
                        in chat
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LobbyChatModal;
