"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "~/components/AuthProvider";
import { authedFetch } from "~/lib/authedFetch";
import { openFarcasterProfile } from "~/lib/openFarcasterProfile";
import { MandatoryClubGGStepsModal } from "~/components/MandatoryClubGGStepsModal";

const SIGNUP_WINDOW_MS = 30 * 60 * 1000;

type Contest = {
  id: string;
  title?: string;
  status: string;
  is_preview?: boolean;
  clubgg_url?: string;
  qc_url?: string | null;
  starts_at?: string | null;
};

function isBeforeStart(contest: Contest | null): boolean {
  if (!contest?.starts_at) return false;
  return Date.now() < new Date(contest.starts_at).getTime();
}
function isWithinSignupWindow(contest: Contest | null): boolean {
  if (!contest?.starts_at) return true;
  const start = new Date(contest.starts_at).getTime();
  return Date.now() >= start && Date.now() <= start + SIGNUP_WINDOW_MS;
}
function isPastSignupWindow(contest: Contest | null): boolean {
  if (!contest?.starts_at) return false;
  return Date.now() > new Date(contest.starts_at).getTime() + SIGNUP_WINDOW_MS;
}

type StatusData = {
  stakeEligible?: boolean;
  stakedAmount?: string;
  canSubmit: boolean;
  contest: Contest | null;
};

type CastEntry = {
  id: string;
  fid: number;
  cast_url: string;
  title: string | null;
  created_at: string;
  name: string;
  username: string | null;
  display_name: string | null;
};

const RULES_TITLE = "SUNDAY HIGH STAKES ARE BETR";

export default function SundayHighStakesClient() {
  const { token, status: authStatus } = useAuth();
  const searchParams = useSearchParams();
  const contestIdParam = searchParams.get("contestId")?.trim() || null;

  const [contest, setContest] = useState<Contest | null>(null);
  const [statusData, setStatusData] = useState<StatusData | null>(null);
  const [casts, setCasts] = useState<CastEntry[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);

  const [castUrl, setCastUrl] = useState("");
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<{ password: string; clubggUrl: string } | null>(null);
  const [showMandatoryModal, setShowMandatoryModal] = useState<{
    gameTitle: string;
    password: string;
    clubggUrl: string;
  } | null>(null);

  const [closing, setClosing] = useState(false);
  const [qcUrlEdit, setQcUrlEdit] = useState("");
  const [savingQcUrl, setSavingQcUrl] = useState(false);
  const [qcUrlError, setQcUrlError] = useState<string | null>(null);
  const [startsAtEdit, setStartsAtEdit] = useState("");
  const [savingStartsAt, setSavingStartsAt] = useState(false);
  const [startsAtError, setStartsAtError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [verifySubmitting, setVerifySubmitting] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const submitFormRef = useRef<HTMLDivElement>(null);

  const [referenceCast, setReferenceCast] = useState<{
    castUrl: string;
    text: string;
    author: { fid: number; username: string; display_name: string; pfp_url: string };
    images: string[];
    embeds: { url?: string }[];
  } | null>(null);
  const [referenceCastLoading, setReferenceCastLoading] = useState(false);
  const [referenceCastError, setReferenceCastError] = useState<string | null>(null);

  const effectiveContestId = contest?.id ?? contestIdParam;

  const loadContest = useCallback(async () => {
    if (contestIdParam) {
      const res = await fetch(`/api/sunday-high-stakes/contests/${contestIdParam}`);
      const d = await res.json();
      if (d?.ok && d?.data) setContest(d.data);
      else setContest(null);
      return;
    }
    const res = await fetch("/api/sunday-high-stakes/active");
    const d = await res.json();
    if (d?.ok && d?.data) setContest(d.data);
    else setContest(null);
  }, [contestIdParam]);

  const loadStatus = useCallback(async () => {
    if (!token) return;
    const res = await authedFetch("/api/sunday-high-stakes/status", { method: "GET" }, token);
    const d = await res.json();
    if (d?.ok && d?.data) setStatusData(d.data);
  }, [token]);

  const loadCasts = useCallback(async () => {
    const url = effectiveContestId
      ? `/api/sunday-high-stakes/casts?contestId=${effectiveContestId}`
      : "/api/sunday-high-stakes/casts";
    const res = await fetch(url);
    const d = await res.json();
    if (d?.ok && Array.isArray(d?.data)) setCasts(d.data);
  }, [effectiveContestId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        await loadContest();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadContest]);

  useEffect(() => {
    if (authStatus !== "authed" || !token) return;
    (async () => {
      try {
        const [st, adm] = await Promise.all([
          authedFetch("/api/sunday-high-stakes/status", { method: "GET" }, token).then((r) => r.json()),
          authedFetch("/api/admin/status", { method: "GET" }, token).then((r) => r.json()),
        ]);
        if (st?.ok && st?.data) setStatusData(st.data);
        if (adm?.ok && adm?.data?.isAdmin) setIsAdmin(true);
      } catch {
        // ignore
      }
    })();
  }, [authStatus, token]);

  useEffect(() => {
    if (!contest?.id) return;
    loadCasts();
  }, [contest?.id, loadCasts]);

  useEffect(() => {
    setQcUrlEdit(contest?.qc_url ?? "");
  }, [contest?.qc_url]);

  useEffect(() => {
    if (!contest?.starts_at) return;
    const s = contest.starts_at;
    const start = new Date(s).getTime();
    if (Date.now() >= start + SIGNUP_WINDOW_MS) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [contest?.starts_at]);

  useEffect(() => {
    if (!contest?.qc_url || !effectiveContestId) {
      setReferenceCast(null);
      setReferenceCastError(null);
      return;
    }
    let cancelled = false;
    setReferenceCastLoading(true);
    setReferenceCastError(null);
    fetch(`/api/sunday-high-stakes/reference-cast?contestId=${encodeURIComponent(effectiveContestId)}`)
      .then((res) => res.json())
      .then((d) => {
        if (cancelled) return;
        if (d?.ok && d?.data) setReferenceCast(d.data);
        else setReferenceCastError(d?.error ?? "Could not load reference cast.");
      })
      .catch(() => {
        if (!cancelled) setReferenceCastError("Could not load reference cast.");
      })
      .finally(() => {
        if (!cancelled) setReferenceCastLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [contest?.id, contest?.qc_url, effectiveContestId]);

  useEffect(() => {
    if (!contest?.starts_at) {
      setStartsAtEdit("");
      return;
    }
    const d = new Date(contest.starts_at);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    setStartsAtEdit(`${y}-${m}-${day}T${h}:${min}`);
  }, [contest?.starts_at]);

  const handleSaveQcUrl = async () => {
    if (!contest?.id || !token) return;
    setSavingQcUrl(true);
    setQcUrlError(null);
    try {
      const res = await authedFetch(
        `/api/sunday-high-stakes/contests/${contest.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ qcUrl: qcUrlEdit.trim() || null }),
        },
        token
      );
      const d = await res.json();
      if (d?.ok) {
        await loadContest();
      } else {
        setQcUrlError(d?.error ?? "Failed to update QC URL");
      }
    } catch (e) {
      setQcUrlError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSavingQcUrl(false);
    }
  };

  const handleSaveStartsAt = async () => {
    if (!contest?.id || !token) return;
    setSavingStartsAt(true);
    setStartsAtError(null);
    try {
      const value = startsAtEdit.trim() ? new Date(startsAtEdit).toISOString() : null;
      const res = await authedFetch(
        `/api/sunday-high-stakes/contests/${contest.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startsAt: value }),
        },
        token
      );
      const d = await res.json();
      if (d?.ok) {
        await loadContest();
      } else {
        setStartsAtError(d?.error ?? "Failed to update start time");
      }
    } catch (e) {
      setStartsAtError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSavingStartsAt(false);
    }
  };

  const handleShare = async () => {
    try {
      const { sdk } = await import("@farcaster/miniapp-sdk");
      if (sdk?.actions?.composeCast) {
        const { APP_URL } = await import("~/lib/constants");
        const text = `I am playing in the ${contest?.title ?? RULES_TITLE}.`;
        const url = APP_URL + "/sunday-high-stakes";
        await sdk.actions.composeCast({ text, embeds: [url] });
      } else {
        alert("This feature requires Warpcast. Please open this mini app in Warpcast to share.");
      }
    } catch (e) {
      console.error("Share failed:", e);
      alert("Failed to open cast composer. Please try again.");
    }
  };

  const handleVerifyAndSubmit = async () => {
    if (!token) return;
    setVerifySubmitting(true);
    setVerifyError(null);
    try {
      const res = await authedFetch("/api/sunday-high-stakes/verify-and-submit", { method: "POST" }, token);
      const d = await res.json();
      if (!d?.ok) {
        setVerifyError(d?.error ?? "Verify and submit failed.");
        return;
      }
      const password = d.data?.password ?? "";
      const clubggUrl = d.data?.clubggUrl ?? "";
      setSubmitSuccess({ password, clubggUrl });
      setShowMandatoryModal({
        gameTitle: contest?.title ?? RULES_TITLE,
        password,
        clubggUrl,
      });
      loadCasts();
    } catch (e) {
      setVerifyError(e instanceof Error ? e.message : "Verify and submit failed.");
    } finally {
      setVerifySubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!token || !castUrl.trim()) {
      setSubmitError("Cast URL is required.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);
    try {
      const res = await authedFetch(
        "/api/sunday-high-stakes/submit",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ castUrl: castUrl.trim(), title: title.trim() || undefined }),
        },
        token
      );
      const d = await res.json();
      if (!d?.ok) {
        setSubmitError(d?.error || "Submit failed.");
        return;
      }
      const password = d.data?.password ?? "";
      const clubggUrl = d.data?.clubggUrl ?? "";
      setSubmitSuccess({ password, clubggUrl });
      setShowMandatoryModal({
        gameTitle: contest?.title ?? RULES_TITLE,
        password,
        clubggUrl,
      });
      setCastUrl("");
      setTitle("");
      loadCasts();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Submit failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseContest = async () => {
    if (!contest?.id || !token) return;
    setClosing(true);
    try {
      const res = await authedFetch(
        `/api/sunday-high-stakes/contests/${contest.id}/close`,
        { method: "POST" },
        token
      );
      const d = await res.json();
      if (d?.ok) {
        await loadContest();
        loadCasts();
      } else alert(d?.error || "Failed to close");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to close");
    } finally {
      setClosing(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4" style={{ color: "var(--text-0)" }}>
        Loading…
      </div>
    );
  }

  return (
    <div className="p-4" style={{ maxWidth: "800px", margin: "0 auto" }}>
      <Link
        href="/clubs/burrfriends/games"
        style={{ display: "inline-block", marginBottom: "16px", color: "var(--fire-1)", textDecoration: "none" }}
      >
        ← Back to games
      </Link>

      <div style={{ marginBottom: "24px" }}>
        <Image
          src="/sundayhighstakes.png"
          alt={RULES_TITLE}
          width={400}
          height={400}
          style={{ maxWidth: "100%", height: "auto", borderRadius: "12px", marginBottom: "12px" }}
        />
        <h1 style={{ margin: "0 0 8px", fontSize: "1.5rem" }}>{RULES_TITLE}</h1>
      </div>

      {contest?.qc_url && (
        <section
          style={{
            marginBottom: "16px",
            padding: "16px",
            background: "var(--bg-2)",
            borderRadius: "8px",
            border: "1px solid var(--stroke)",
          }}
        >
          <h2 style={{ margin: "0 0 12px", fontSize: "1.1rem" }}>Reference cast (quote this)</h2>
          {referenceCastLoading && (
            <p style={{ color: "var(--text-1)", margin: 0 }}>Loading reference cast…</p>
          )}
          {referenceCastError && !referenceCastLoading && (
            <div>
              <p style={{ color: "var(--fire-2)", marginBottom: "8px" }}>{referenceCastError}</p>
              <a
                href={contest.qc_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--fire-1)", fontSize: "0.875rem" }}
              >
                Open on Warpcast →
              </a>
            </div>
          )}
          {referenceCast && !referenceCastLoading && (
            <div>
              <div style={{ display: "flex", alignItems: "center", marginBottom: "12px" }}>
                {referenceCast.author.pfp_url && (
                  <img
                    src={referenceCast.author.pfp_url}
                    alt={referenceCast.author.display_name || referenceCast.author.username || "Author"}
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "50%",
                      marginRight: "10px",
                    }}
                  />
                )}
                <div>
                  <div style={{ fontWeight: 600, color: "var(--text-0)" }}>
                    {referenceCast.author.display_name || referenceCast.author.username || `FID ${referenceCast.author.fid}`}
                  </div>
                  {referenceCast.author.username && (
                    <div style={{ fontSize: "0.875rem", color: "var(--text-1)" }}>@{referenceCast.author.username}</div>
                  )}
                </div>
              </div>
              <div style={{ marginBottom: "12px", whiteSpace: "pre-wrap", wordBreak: "break-word", color: "var(--text-1)", fontSize: "0.875rem" }}>
                {referenceCast.text || "(No text)"}
              </div>
              {referenceCast.images.length > 0 && (
                <div style={{ marginBottom: "12px" }}>
                  {referenceCast.images.map((src, idx) => (
                    <img
                      key={idx}
                      src={src}
                      alt={`Reference cast image ${idx + 1}`}
                      style={{ maxWidth: "100%", borderRadius: "8px", marginBottom: "8px", display: "block" }}
                    />
                  ))}
                </div>
              )}
              <a
                href={referenceCast.castUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--fire-1)", fontSize: "0.875rem" }}
              >
                Open on Warpcast →
              </a>
            </div>
          )}
        </section>
      )}

      <section
        style={{
          marginBottom: "16px",
          padding: "12px",
          background: "var(--bg-2)",
          borderRadius: "8px",
          border: "1px solid var(--stroke)",
        }}
      >
        <div
          onClick={() => setRulesOpen(!rulesOpen)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setRulesOpen(!rulesOpen)}
          style={{
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: rulesOpen ? "12px" : 0,
          }}
        >
          <span
            style={{
              fontSize: "0.75rem",
              transition: "transform 0.2s",
              display: "inline-block",
              transform: rulesOpen ? "rotate(90deg)" : "rotate(0deg)",
            }}
          >
            &#9654;
          </span>
          <strong>How it works</strong>
        </div>
        {rulesOpen && (
          <div style={{ fontSize: "0.875rem", color: "var(--text-1)" }}>
            <p style={{ marginBottom: "8px" }}>
              Post a cast with your art (must include an image). Submit the cast URL below. Once accepted, you’ll get the password and link to play on Club GG.
            </p>
          </div>
        )}
      </section>

      {error && <p style={{ color: "var(--ember-2)" }}>{error}</p>}

      {!contest ? (
        <p style={{ color: "var(--text-1)" }}>No active SUNDAY HIGH STAKES contest right now.</p>
      ) : (
        <>
          <p style={{ color: "var(--text-1)", marginBottom: "16px" }}>
            {contest.title || RULES_TITLE} · Status: <strong>{contest.status}</strong>
            {contest.is_preview && <span style={{ marginLeft: "8px", color: "var(--fire-1)" }}>(Preview)</span>}
          </p>

          {contest.status === "open" && isBeforeStart(contest) && (
            <div style={{ marginBottom: "24px", padding: "16px", background: "var(--bg-2)", borderRadius: "8px", border: "1px solid var(--stroke)" }}>
              <p style={{ marginBottom: "8px", fontWeight: 600 }}>Starts in</p>
              <p style={{ fontSize: "1.25rem", color: "var(--fire-1)", fontVariantNumeric: "tabular-nums" }}>
                {(() => {
                  const start = new Date(contest.starts_at!).getTime();
                  const d = Math.max(0, start - now);
                  const totalSec = Math.floor(d / 1000);
                  const h = Math.floor(totalSec / 3600);
                  const m = Math.floor((totalSec % 3600) / 60);
                  const s = totalSec % 60;
                  if (h > 0) return `${h}h ${m}m`;
                  if (m > 0) return `${m}m ${s}s`;
                  return `${s}s`;
                })()}
              </p>
              <p style={{ fontSize: "0.875rem", color: "var(--text-1)" }}>You can paste your cast URL below and submit when ready; if it&apos;s before the game starts, you&apos;ll see an error.</p>
            </div>
          )}

          {contest.status === "open" && isPastSignupWindow(contest) && (
            <p style={{ color: "var(--text-1)", marginBottom: "24px", padding: "12px", background: "var(--bg-2)", borderRadius: "8px" }}>
              Game in progress — no more signups.
            </p>
          )}

          {authStatus !== "authed" ? (
            <p style={{ color: "var(--text-1)" }}>Sign in to submit or view eligibility.</p>
          ) : !statusData ? (
            <p style={{ color: "var(--text-1)" }}>Checking eligibility…</p>
          ) : !statusData.canSubmit && !statusData.stakeEligible ? (
            <p style={{ color: "var(--text-1)" }}>
              You need 1M BETR staked to sign up. Your staked amount: {statusData.stakedAmount ?? "0"}.
            </p>
          ) : (statusData?.canSubmit || statusData?.stakeEligible) && contest.status === "open" && !isPastSignupWindow(contest) ? (
            <>
              <p style={{ color: "var(--text-1)", marginBottom: "12px" }}>
                <button
                  type="button"
                  onClick={() => submitFormRef.current?.scrollIntoView({ behavior: "smooth" })}
                  className="btn-primary"
                  style={{ fontSize: "0.9rem" }}
                >
                  Sign up here
                </button>
              </p>
            <section ref={submitFormRef} style={{ marginBottom: "24px" }}>
              {submitSuccess && (
                <div
                  style={{
                    marginBottom: "16px",
                    padding: "16px",
                    background: "var(--bg-2)",
                    borderRadius: "8px",
                    border: "1px solid var(--fire-1)",
                  }}
                >
                  <p style={{ color: "var(--fire-1)", marginBottom: "8px", fontWeight: 600 }}>
                    Submission received!
                  </p>
                  <p style={{ marginBottom: "4px", fontSize: "0.875rem" }}>
                    <strong>Password:</strong> <code style={{ background: "var(--bg-0)", padding: "2px 6px", borderRadius: "4px" }}>{submitSuccess.password}</code>
                  </p>
                  <a
                    href={submitSuccess.clubggUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary"
                    style={{ display: "inline-block", marginTop: "8px" }}
                  >
                    Play on Club GG →
                  </a>
                  <button
                    type="button"
                    onClick={handleShare}
                    className="btn-secondary"
                    style={{ display: "inline-block", marginTop: "8px", marginLeft: "8px", fontSize: "0.875rem" }}
                  >
                    Share
                  </button>
                </div>
              )}
              {submitError && <p style={{ color: "var(--ember-2)", marginBottom: "8px" }}>{submitError}</p>}
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxWidth: "400px" }}>
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: "0.75rem", color: "var(--fire-1)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "4px" }}>
                    Paste your URL here
                  </p>
                  <span className="neon-submit-arrow" style={{ display: "block" }}>⬇</span>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "4px" }}>
                    Cast URL (must include an image)
                  </label>
                  <input
                    type="url"
                    placeholder="https://warpcast.com/..."
                    value={castUrl}
                    onChange={(e) => setCastUrl(e.target.value)}
                    style={{
                      padding: "8px",
                      border: "1px solid #ccc",
                      borderRadius: "6px",
                      width: "100%",
                      color: "#1a1a1a",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "4px" }}>
                    Title (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="My cast title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    style={{
                      padding: "8px",
                      border: "1px solid #ccc",
                      borderRadius: "6px",
                      width: "100%",
                      color: "#1a1a1a",
                    }}
                  />
                </div>
                <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="btn-primary"
              >
                {submitting ? "Submitting…" : "Submit"}
              </button>
              </div>
            </section>
            </>
          ) : contest.status === "closed" ? (
            <p style={{ color: "var(--text-1)", marginBottom: "16px" }}>Submissions are closed.</p>
          ) : null}

          {showMandatoryModal && (
            <MandatoryClubGGStepsModal
              gameTitle={showMandatoryModal.gameTitle}
              password={showMandatoryModal.password}
              clubggUrl={showMandatoryModal.clubggUrl}
              onClose={() => setShowMandatoryModal(null)}
            />
          )}

          {/* Casts list — the cast the person made (links only) */}
          <section style={{ marginTop: "24px" }}>
            <h2 style={{ marginBottom: "12px", fontSize: "1.1rem" }}>Submitted casts</h2>
            {casts.length === 0 ? (
              <p style={{ color: "var(--text-1)" }}>No submissions yet.</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
                {casts.map((entry) => (
                  <li
                    key={entry.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "12px",
                      background: "var(--bg-2)",
                      borderRadius: "8px",
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => openFarcasterProfile(entry.fid, entry.username ?? null)}
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        color: "var(--fire-1)",
                        cursor: "pointer",
                        fontSize: "0.875rem",
                        fontWeight: 600,
                      }}
                    >
                      {entry.name}
                    </button>
                    {entry.title && (
                      <span style={{ fontSize: "0.875rem", color: "var(--text-1)" }}>· {entry.title}</span>
                    )}
                    <a
                      href={entry.cast_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: "0.8rem", color: "var(--fire-1)", marginLeft: "auto" }}
                    >
                      View cast →
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Check my quote cast & stake — beta feature, bottom of page */}
          {authStatus === "authed" && statusData?.canSubmit && contest.status === "open" && !isPastSignupWindow(contest) && (
            <section style={{ marginTop: "32px", textAlign: "center" }}>
              <button
                type="button"
                onClick={handleVerifyAndSubmit}
                disabled={verifySubmitting}
                className="btn-secondary"
                style={{ fontSize: "0.875rem" }}
              >
                {verifySubmitting ? "Checking…" : "Check my quote cast & stake"}
              </button>
              {verifyError && <p style={{ color: "var(--fire-2)", marginTop: "8px", fontSize: "0.875rem" }}>{verifyError}</p>}
              <p style={{ color: "var(--text-1)", fontSize: "0.75rem", marginTop: "6px" }}>(in beta — not working well)</p>
            </section>
          )}

          {/* Admin */}
          {isAdmin && token && contest.id && (contest.status === "open" || contest.status === "closed") && (
            <section
              style={{
                marginTop: "32px",
                padding: "16px",
                border: "1px solid var(--stroke)",
                borderRadius: "8px",
              }}
            >
              <h2 style={{ marginBottom: "12px", fontSize: "1.1rem" }}>Admin</h2>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "4px" }}>
                  QC URL (reference cast — submissions must be quote of this cast)
                </label>
                <input
                  type="url"
                  value={qcUrlEdit}
                  onChange={(e) => setQcUrlEdit(e.target.value)}
                  placeholder="https://warpcast.com/... or https://farcaster.xyz/..."
                  style={{
                    width: "100%",
                    maxWidth: "400px",
                    padding: "8px",
                    borderRadius: "6px",
                    border: "1px solid var(--stroke)",
                    color: "var(--text-1)",
                    marginBottom: "8px",
                  }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={handleSaveQcUrl}
                    disabled={savingQcUrl}
                    className="btn-secondary"
                  >
                    {savingQcUrl ? "Saving…" : "Save QC URL"}
                  </button>
                  {qcUrlError && (
                    <span style={{ fontSize: "0.875rem", color: "var(--ember-2)" }}>{qcUrlError}</span>
                  )}
                </div>
              </div>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "4px" }}>
                  Start time (optional — submissions allowed 30 min after start)
                </label>
                <input
                  type="datetime-local"
                  value={startsAtEdit}
                  onChange={(e) => setStartsAtEdit(e.target.value)}
                  style={{
                    width: "100%",
                    maxWidth: "280px",
                    padding: "8px",
                    borderRadius: "6px",
                    border: "1px solid var(--stroke)",
                    color: "var(--text-1)",
                    marginBottom: "8px",
                  }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={handleSaveStartsAt}
                    disabled={savingStartsAt}
                    className="btn-secondary"
                  >
                    {savingStartsAt ? "Saving…" : "Save start time"}
                  </button>
                  {startsAtError && (
                    <span style={{ fontSize: "0.875rem", color: "var(--ember-2)" }}>{startsAtError}</span>
                  )}
                </div>
              </div>
              {contest.status === "open" && (
                <button
                  type="button"
                  onClick={handleCloseContest}
                  disabled={closing}
                  className="btn-secondary"
                >
                  {closing ? "Closing…" : "Close contest"}
                </button>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
