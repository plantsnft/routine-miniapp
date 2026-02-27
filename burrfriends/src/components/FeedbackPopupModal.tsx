"use client";

/**
 * Phase 43: User Feedback – Submit feedback or view own tickets + replies.
 * Phase 29.2: Beta Testing tab (first) – password gate, preview games list, TEST links, Go Live for admins.
 */

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "~/components/AuthProvider";
import { authedFetch } from "~/lib/authedFetch";
import { isAdmin } from "~/lib/admin";
import { openFarcasterProfile } from "~/lib/openFarcasterProfile";
import { getPreviewGameUrl } from "~/lib/previewGameUrl";

const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25 MB

interface FeedbackTicket {
  id: string;
  message: string;
  status: string;
  created_at: string;
  reply_count: number;
  latest_reply_at: string;
  images: string[];
}

interface PreviewGame {
  table: string;
  gameType: string;
  id: string;
  title: string;
  prize_amount?: number;
  status?: string;
}

interface FeedbackDetail extends FeedbackTicket {
  fid: number;
  replies: Array<{ id: string; fid: number; message: string; created_at: string }>;
}

type Profile = { display_name?: string; username?: string; avatar_url?: string };
const DEFAULT_PFP = "https://i.imgur.com/1Q9ZQ9u.png";

function displayName(p: Profile | undefined, fid: number): string {
  if (!p) return `FID ${fid}`;
  return p.display_name || p.username || `FID ${fid}`;
}

interface FeedbackPopupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatDate(s: string): string {
  try {
    const d = new Date(s);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return d.toLocaleDateString();
  } catch {
    return s;
  }
}

export function FeedbackPopupModal({ isOpen, onClose }: FeedbackPopupModalProps) {
  const { token, fid } = useAuth();
  const [tab, setTab] = useState<"beta" | "submit" | "my">("beta");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [tickets, setTickets] = useState<FeedbackTicket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<FeedbackDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [replyProfiles, setReplyProfiles] = useState<Record<number, Profile>>({});

  // Phase 29.2: Beta Testing
  const [betaUnlocked, setBetaUnlocked] = useState(false);
  const [betaPassword, setBetaPassword] = useState("");
  const [betaVerifying, setBetaVerifying] = useState(false);
  const [betaVerifyError, setBetaVerifyError] = useState<string | null>(null);
  const [previewGames, setPreviewGames] = useState<PreviewGame[]>([]);
  const [previewGamesLoading, setPreviewGamesLoading] = useState(false);
  const [goLiveId, setGoLiveId] = useState<string | null>(null);

  const checkBetaStatus = useCallback(async () => {
    if (!token) return;
    try {
      const res = await authedFetch("/api/beta/status", { method: "GET" }, token);
      const data = await res.json();
      if (data?.ok && data?.data?.hasAccess) {
        setBetaUnlocked(true);
      }
    } catch {
      setBetaUnlocked(false);
    }
  }, [token]);

  const loadPreviewGames = useCallback(async () => {
    if (!token || !betaUnlocked) return;
    setPreviewGamesLoading(true);
    try {
      const res = await authedFetch("/api/beta/preview-games", { method: "GET" }, token);
      const data = await res.json();
      if (data?.ok && Array.isArray(data?.data)) {
        setPreviewGames(data.data);
      } else {
        setPreviewGames([]);
      }
    } catch {
      setPreviewGames([]);
    } finally {
      setPreviewGamesLoading(false);
    }
  }, [token, betaUnlocked]);

  const handleBetaUnlock = async () => {
    if (!token) return;
    const pwd = betaPassword.trim();
    if (!pwd) {
      setBetaVerifyError("Enter password");
      return;
    }
    setBetaVerifying(true);
    setBetaVerifyError(null);
    try {
      const res = await authedFetch("/api/beta/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pwd }),
      }, token);
      const data = await res.json();
      if (res.ok && data?.ok) {
        setBetaUnlocked(true);
        setBetaVerifyError(null);
        loadPreviewGames();
      } else {
        setBetaVerifyError(data?.error || "Invalid password");
      }
    } catch {
      setBetaVerifyError("Verification failed");
    } finally {
      setBetaVerifying(false);
    }
  };

  const handleGoLive = async (table: string, id: string) => {
    if (!token) return;
    setGoLiveId(id);
    try {
      const res = await authedFetch("/api/admin/preview-games/go-live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table, id }),
      }, token);
      const data = await res.json();
      if (res.ok && data?.ok) {
        loadPreviewGames();
      }
    } catch (e) {
      console.error("Go live failed:", e);
    } finally {
      setGoLiveId(null);
    }
  };

  const loadTickets = useCallback(async () => {
    if (!token) return;
    setLoadingTickets(true);
    try {
      const res = await authedFetch("/api/feedback", { method: "GET" }, token);
      const data = await res.json();
      if (data?.ok && data?.data?.tickets) {
        setTickets(data.data.tickets);
      }
    } catch {
      setTickets([]);
    } finally {
      setLoadingTickets(false);
    }
  }, [token]);

  const loadDetail = useCallback(async (id: string) => {
    if (!token) return;
    setLoadingDetail(true);
    try {
      const res = await authedFetch(`/api/feedback/${id}`, { method: "GET" }, token);
      const data = await res.json();
      if (data?.ok && data?.data) {
        const d = { ...data.data, images: data.data.images ?? [] } as FeedbackDetail;
        setDetail(d);
        const replyFids = (d.replies ?? []).map((r) => r.fid).filter((n) => n > 0);
        if (replyFids.length > 0) {
          try {
            const bulkRes = await authedFetch(`/api/users/bulk?fids=${[...new Set(replyFids)].join(",")}`, { method: "GET" }, token);
            const bulkData = await bulkRes.json();
            if (bulkRes.ok && Array.isArray(bulkData?.data)) {
              const next: Record<number, Profile> = {};
              bulkData.data.forEach((u: { fid: number; display_name?: string; username?: string; avatar_url?: string }) => {
                next[u.fid] = { display_name: u.display_name, username: u.username, avatar_url: u.avatar_url };
              });
              setReplyProfiles(next);
            }
          } catch {
            setReplyProfiles({});
          }
        } else {
          setReplyProfiles({});
        }
      } else {
        setDetail(null);
        setReplyProfiles({});
      }
    } catch {
      setDetail(null);
      setReplyProfiles({});
    } finally {
      setLoadingDetail(false);
    }
  }, [token]);

  useEffect(() => {
    if (isOpen && betaUnlocked && token) {
      loadPreviewGames();
    }
  }, [isOpen, betaUnlocked, token, loadPreviewGames]);

  useEffect(() => {
    if (isOpen && tab === "beta" && token) {
      checkBetaStatus();
    }
  }, [isOpen, tab, token, checkBetaStatus]);

  useEffect(() => {
    if (isOpen && tab === "my" && token) {
      loadTickets();
    }
  }, [isOpen, tab, token, loadTickets]);

  useEffect(() => {
    if (expandedId && token) {
      loadDetail(expandedId);
    } else {
      setDetail(null);
      setReplyProfiles({});
    }
  }, [expandedId, token, loadDetail]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    const valid: File[] = [];
    let err = "";
    for (let i = 0; i < Math.min(selected.length, MAX_IMAGES); i++) {
      const f = selected[i];
      if (f.size > MAX_IMAGE_BYTES) {
        err = `"${f.name}" exceeds 25 MB.`;
        break;
      }
      valid.push(f);
    }
    if (err) {
      setSubmitError(err);
    } else {
      setSubmitError(null);
      setFiles(valid.slice(0, MAX_IMAGES));
    }
    e.target.value = "";
  };

  const handleSubmit = async () => {
    if (!token) return;
    const trimmed = message.trim();
    if (!trimmed) {
      setSubmitError("Message is required.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);
    try {
      const form = new FormData();
      form.set("message", trimmed);
      files.forEach((f, i) => form.set(`image${i}`, f));
      const res = await authedFetch("/api/feedback", { method: "POST", body: form }, token);
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setSubmitError(data?.error || "Submit failed.");
        return;
      }
      setSubmitSuccess(true);
      setMessage("");
      setFiles([]);
      setTab("my");
      loadTickets();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Submit failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
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
          maxWidth: "420px",
          maxHeight: "85vh",
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
          <h2 style={{ color: "var(--fire-1)", fontSize: "1rem", fontWeight: 600, margin: 0 }}>
            Feedback
          </h2>
          <button
            type="button"
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

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--stroke)" }}>
          <button
            type="button"
            onClick={() => setTab("beta")}
            style={{
              flex: 1,
              padding: "10px",
              background: tab === "beta" ? "rgba(45, 212, 191, 0.15)" : "transparent",
              border: "none",
              borderBottom: tab === "beta" ? "2px solid var(--fire-1)" : "none",
              color: "var(--text-0)",
              fontSize: "0.9rem",
              cursor: "pointer",
            }}
          >
            Beta Testing
          </button>
          <button
            type="button"
            onClick={() => { setTab("submit"); setSubmitError(null); setSubmitSuccess(false); }}
            style={{
              flex: 1,
              padding: "10px",
              background: tab === "submit" ? "rgba(45, 212, 191, 0.15)" : "transparent",
              border: "none",
              borderBottom: tab === "submit" ? "2px solid var(--fire-1)" : "none",
              color: "var(--text-0)",
              fontSize: "0.9rem",
              cursor: "pointer",
            }}
          >
            Submit Feedback
          </button>
          <button
            type="button"
            onClick={() => setTab("my")}
            style={{
              flex: 1,
              padding: "10px",
              background: tab === "my" ? "rgba(45, 212, 191, 0.15)" : "transparent",
              border: "none",
              borderBottom: tab === "my" ? "2px solid var(--fire-1)" : "none",
              color: "var(--text-0)",
              fontSize: "0.9rem",
              cursor: "pointer",
            }}
          >
            My Feedback
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
          {tab === "beta" && (
            <>
              {!betaUnlocked ? (
                <>
                  <p style={{ color: "var(--text-1)", fontSize: "0.9rem", marginBottom: "12px" }}>
                    Enter the beta password to access preview games.
                  </p>
                  <input
                    type="password"
                    value={betaPassword}
                    onChange={(e) => { setBetaPassword(e.target.value); setBetaVerifyError(null); }}
                    placeholder="Password"
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: "8px",
                      border: "1px solid var(--stroke)",
                      background: "var(--bg-2)",
                      color: "var(--text-0)",
                      fontSize: "0.9rem",
                      boxSizing: "border-box",
                    }}
                  />
                  {betaVerifyError && (
                    <p style={{ color: "#ef4444", fontSize: "0.85rem", marginTop: "8px" }}>{betaVerifyError}</p>
                  )}
                  <button
                    type="button"
                    onClick={handleBetaUnlock}
                    disabled={betaVerifying}
                    className="btn-primary"
                    style={{ marginTop: "16px", width: "100%" }}
                  >
                    {betaVerifying ? "Verifying..." : "Unlock"}
                  </button>
                </>
              ) : (
                <>
                  {previewGamesLoading ? (
                    <p style={{ color: "var(--text-2)" }}>Loading preview games...</p>
                  ) : previewGames.length === 0 ? (
                    <p style={{ color: "var(--text-2)", fontSize: "0.9rem" }}>No preview games right now.</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {previewGames.map((game) => (
                        <div
                          key={`${game.table}-${game.id}`}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "10px 12px",
                            background: "var(--bg-2)",
                            borderRadius: "8px",
                            border: "1px solid var(--stroke)",
                          }}
                        >
                          <div>
                            <div style={{ color: "var(--text-0)", fontSize: "0.875rem", fontWeight: 500 }}>{game.title}</div>
                            <div style={{ color: "var(--text-2)", fontSize: "0.7rem" }}>{game.gameType}</div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <a
                              href={getPreviewGameUrl(game.table, game.id, game.title)}
                              style={{
                                color: "var(--fire-1)",
                                fontSize: "0.875rem",
                                fontWeight: 600,
                                textDecoration: "none",
                              }}
                            >
                              TEST
                            </a>
                            {isAdmin(fid ?? 0) && (
                              <button
                                onClick={() => handleGoLive(game.table, game.id)}
                                disabled={goLiveId === game.id}
                                className="btn-secondary"
                                style={{ fontSize: "0.75rem", padding: "6px 12px" }}
                              >
                                {goLiveId === game.id ? "Going live..." : "Go Live"}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {tab === "submit" && (
            <>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe your feedback..."
                rows={4}
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "8px",
                  border: "1px solid var(--stroke)",
                  background: "var(--bg-2)",
                  color: "var(--text-0)",
                  fontSize: "0.9rem",
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
              <div style={{ marginTop: "12px" }}>
                <label
                  style={{
                    display: "block",
                    color: "var(--text-1)",
                    fontSize: "0.8rem",
                    marginBottom: "6px",
                  }}
                >
                  Photos (optional, up to 5, 25 MB each)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileChange}
                  style={{ fontSize: "0.85rem" }}
                />
                {files.length > 0 && (
                  <div style={{ marginTop: "8px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {files.map((f, i) => (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "4px 8px",
                          background: "var(--bg-2)",
                          borderRadius: "6px",
                          fontSize: "0.8rem",
                        }}
                      >
                        <span style={{ color: "var(--text-1)", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {f.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeFile(i)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#ef4444",
                            cursor: "pointer",
                            fontSize: "0.9rem",
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {submitError && (
                <p style={{ color: "#ef4444", fontSize: "0.85rem", marginTop: "8px" }}>{submitError}</p>
              )}
              {submitSuccess && (
                <p style={{ color: "var(--fire-1)", fontSize: "0.85rem", marginTop: "8px" }}>
                  Feedback submitted. Check &quot;My Feedback&quot; for updates.
                </p>
              )}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="btn-primary"
                style={{ marginTop: "16px", width: "100%" }}
              >
                {submitting ? "Submitting..." : "Submit"}
              </button>
            </>
          )}

          {tab === "my" && (
            <>
              {loadingTickets ? (
                <p style={{ color: "var(--text-2)" }}>Loading...</p>
              ) : tickets.length === 0 ? (
                <p style={{ color: "var(--text-2)", fontSize: "0.9rem" }}>No feedback yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {tickets.map((t) => (
                    <div
                      key={t.id}
                      style={{
                        border: "1px solid var(--stroke)",
                        borderRadius: "8px",
                        overflow: "hidden",
                        background: "var(--bg-2)",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                        style={{
                          width: "100%",
                          padding: "12px",
                          textAlign: "left",
                          background: "none",
                          border: "none",
                          color: "var(--text-0)",
                          cursor: "pointer",
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.9rem",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {t.message.length > 60 ? t.message.slice(0, 60) + "…" : t.message}
                        </span>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-2)" }}>
                          {formatDate(t.created_at)} · {t.status} · {t.reply_count} repl{t.reply_count === 1 ? "y" : "ies"}
                        </span>
                      </button>
                      {expandedId === t.id && (
                        <div
                          style={{
                            padding: "12px",
                            borderTop: "1px solid var(--stroke)",
                            fontSize: "0.9rem",
                          }}
                        >
                          {loadingDetail ? (
                            <p style={{ color: "var(--text-2)" }}>Loading...</p>
                          ) : detail ? (
                            <>
                              <p style={{ color: "var(--text-0)", marginBottom: "10px", whiteSpace: "pre-wrap" }}>
                                {detail.message}
                              </p>
                              {detail.images.length > 0 && (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "12px" }}>
                                  {detail.images.map((url, i) => (
                                    <a
                                      key={i}
                                      href={url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{ display: "block" }}
                                    >
                                      <img
                                        src={url}
                                        alt=""
                                        style={{
                                          width: 60,
                                          height: 60,
                                          objectFit: "cover",
                                          borderRadius: "6px",
                                        }}
                                      />
                                    </a>
                                  ))}
                                </div>
                              )}
                              {detail.replies.length > 0 && (
                                <div style={{ marginTop: "12px" }}>
                                  <div style={{ color: "var(--text-2)", fontSize: "0.75rem", marginBottom: "6px" }}>
                                    Replies
                                  </div>
                                  {detail.replies.map((r) => (
                                    <div
                                      key={r.id}
                                      style={{
                                        padding: "8px 10px",
                                        background: "var(--bg-0)",
                                        borderRadius: "6px",
                                        marginBottom: "6px",
                                        borderLeft: isAdmin(r.fid) ? "3px solid var(--fire-1)" : "none",
                                      }}
                                    >
                                      <div
                                        style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px", cursor: "pointer" }}
                                        onClick={() => openFarcasterProfile(r.fid, replyProfiles[r.fid]?.username ?? null)}
                                      >
                                        <img
                                          src={replyProfiles[r.fid]?.avatar_url || DEFAULT_PFP}
                                          alt=""
                                          style={{ width: 20, height: 20, borderRadius: "50%", objectFit: "cover" }}
                                        />
                                        <span style={{ color: "var(--text-0)", fontWeight: 500, fontSize: "0.8rem" }}>
                                          {displayName(replyProfiles[r.fid], r.fid)}
                                        </span>
                                        {isAdmin(r.fid) && (
                                          <span
                                            style={{
                                              background: "var(--fire-1)",
                                              color: "var(--bg-0)",
                                              padding: "2px 6px",
                                              borderRadius: "4px",
                                              fontSize: "0.65rem",
                                              fontWeight: 600,
                                            }}
                                          >
                                            Admin
                                          </span>
                                        )}
                                        <span style={{ color: "var(--text-2)", fontSize: "0.75rem" }}>
                                          · {formatDate(r.created_at)}
                                        </span>
                                      </div>
                                      <p style={{ color: "var(--text-0)", margin: 0, whiteSpace: "pre-wrap" }}>
                                        {r.message}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
                          ) : null}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
