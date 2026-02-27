"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "~/components/AuthProvider";
import { authedFetch } from "~/lib/authedFetch";
import { openFarcasterProfile } from "~/lib/openFarcasterProfile";
import { ART_CONTEST_EXAMPLE_CAST_URL } from "~/lib/constants";

type Contest = {
  id: string;
  title?: string;
  status: string;
  is_preview?: boolean;
};

type StatusData = {
  registered: boolean;
  approved: boolean;
  canSubmit: boolean;
  contest: Contest | null;
};

type GalleryEntry = {
  id: string;
  fid: number;
  cast_url: string;
  title: string;
  image_url: string;
  created_at: string;
  username: string | null;
  display_name: string | null;
  pfp_url: string | null;
};

type WinnerEntry = {
  id: string;
  submissionId: string;
  fid: number;
  position: number;
  amountDisplay: string | null;
  title: string | null;
  imageUrl: string | null;
};

const RULES_TITLE = "TO SPINFINITY AND BEYOND ART CONTEST";

export default function ArtContestClient() {
  const { token, status: authStatus } = useAuth();
  const searchParams = useSearchParams();
  const contestIdParam = searchParams.get("contestId")?.trim() || null;

  const [contest, setContest] = useState<Contest | null>(null);
  const [statusData, setStatusData] = useState<StatusData | null>(null);
  const [gallery, setGallery] = useState<GalleryEntry[]>([]);
  const [winners, setWinners] = useState<WinnerEntry[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);

  const [castUrl, setCastUrl] = useState("");
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const [adminSubmissions, setAdminSubmissions] = useState<GalleryEntry[]>([]);
  const [adminWinners, setAdminWinners] = useState<WinnerEntry[]>([]);
  const [closing, setClosing] = useState(false);
  const [settling, setSettling] = useState(false);
  const [winnerPicks, setWinnerPicks] = useState<{ submissionId: string; position: number; amountDisplay: string }[]>([]);
  const [savingWinners, setSavingWinners] = useState(false);

  const [sourceCastUrl, setSourceCastUrl] = useState("");
  const [pullQuotesLoading, setPullQuotesLoading] = useState(false);
  const [quoteCandidates, setQuoteCandidates] = useState<
    { castUrl: string; fid: number; username: string | null; display_name: string | null; text: string; imageUrl: string | null }[]
  >([]);
  const [importingCastUrl, setImportingCastUrl] = useState<string | null>(null);

  const effectiveContestId = contest?.id ?? contestIdParam;

  const loadContest = useCallback(async () => {
    if (contestIdParam) {
      const res = await fetch(`/api/art-contest/contests/${contestIdParam}`);
      const d = await res.json();
      if (d?.ok && d?.data) setContest(d.data);
      else setContest(null);
      return;
    }
    const res = await fetch("/api/art-contest/active");
    const d = await res.json();
    if (d?.ok && d?.data) setContest(d.data);
    else setContest(null);
  }, [contestIdParam]);

  const loadStatus = useCallback(async () => {
    if (!token) return;
    const res = await authedFetch("/api/art-contest/status", { method: "GET" }, token);
    const d = await res.json();
    if (d?.ok && d?.data) setStatusData(d.data);
  }, [token]);

  const loadGallery = useCallback(async () => {
    const url = effectiveContestId
      ? `/api/art-contest/gallery?contestId=${effectiveContestId}`
      : "/api/art-contest/gallery";
    const res = await fetch(url);
    const d = await res.json();
    if (d?.ok && Array.isArray(d?.data)) setGallery(d.data);
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
          authedFetch("/api/art-contest/status", { method: "GET" }, token).then((r) => r.json()),
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
    loadGallery();
  }, [contest?.id, loadGallery]);

  useEffect(() => {
    if (!contest?.id || contest.status !== "settled") return;
    (async () => {
      if (!token || !isAdmin) return;
      try {
        const res = await authedFetch(
          `/api/art-contest/contests/${contest.id}/winners`,
          { method: "GET" },
          token
        );
        const d = await res.json();
        if (d?.ok && Array.isArray(d?.data)) setWinners(d.data);
      } catch {
        // ignore
      }
    })();
  }, [contest?.id, contest?.status, token, isAdmin]);

  const handleSubmit = async () => {
    if (!token || !castUrl.trim() || !title.trim()) {
      setSubmitError("Cast URL and title are required.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);
    try {
      const res = await authedFetch(
        "/api/art-contest/submit",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ castUrl: castUrl.trim(), title: title.trim() }),
        },
        token
      );
      const d = await res.json();
      if (!d?.ok) {
        setSubmitError(d?.error || "Submit failed.");
        return;
      }
      setSubmitSuccess("Submission received.");
      setCastUrl("");
      setTitle("");
      loadGallery();
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
        `/api/art-contest/contests/${contest.id}/close`,
        { method: "POST" },
        token
      );
      const d = await res.json();
      if (d?.ok) {
        await loadContest();
        loadGallery();
      } else alert(d?.error || "Failed to close");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to close");
    } finally {
      setClosing(false);
    }
  };

  const loadAdminSubmissions = async () => {
    if (!contest?.id || !token) return;
    const res = await authedFetch(
      `/api/art-contest/contests/${contest.id}/submissions`,
      { method: "GET" },
      token
    );
    const d = await res.json();
    if (d?.ok && Array.isArray(d?.data)) setAdminSubmissions(d.data);
  };

  const loadAdminWinners = async () => {
    if (!contest?.id || !token) return;
    const res = await authedFetch(
      `/api/art-contest/contests/${contest.id}/winners`,
      { method: "GET" },
      token
    );
    const d = await res.json();
    if (d?.ok && Array.isArray(d?.data)) setAdminWinners(d.data);
  };

  const handlePullQuotes = async () => {
    if (!contest?.id || !token || !sourceCastUrl.trim()) return;
    setPullQuotesLoading(true);
    setQuoteCandidates([]);
    try {
      const res = await authedFetch(
        `/api/art-contest/contests/${contest.id}/pull-quotes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceCastUrl: sourceCastUrl.trim() }),
        },
        token
      );
      const d = await res.json();
      if (d?.ok && d?.data?.candidates) setQuoteCandidates(d.data.candidates);
      else alert(d?.error || "Failed to pull quotes");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to pull quotes");
    } finally {
      setPullQuotesLoading(false);
    }
  };

  const handleImportQuote = async (castUrl: string, destination: "gallery" | "backup") => {
    if (!contest?.id || !token) return;
    setImportingCastUrl(castUrl);
    try {
      const res = await authedFetch(
        `/api/art-contest/contests/${contest.id}/import`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ castUrl, destination }),
        },
        token
      );
      const d = await res.json();
      if (d?.ok) {
        setQuoteCandidates((prev) => prev.filter((c) => c.castUrl !== castUrl));
        if (destination === "gallery") loadGallery();
      } else alert(d?.error || "Import failed");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImportingCastUrl(null);
    }
  };

  const handleSaveWinners = async () => {
    if (!contest?.id || !token || winnerPicks.length !== 14) return;
    setSavingWinners(true);
    try {
      const winners = winnerPicks.map((p) => ({
        submissionId: p.submissionId,
        position: p.position,
        amountDisplay: p.amountDisplay || undefined,
      }));
      const res = await authedFetch(
        `/api/art-contest/contests/${contest.id}/winners`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ winners }),
        },
        token
      );
      const d = await res.json();
      if (d?.ok) {
        setWinnerPicks([]);
        await loadAdminWinners();
      } else alert(d?.error || "Failed to save winners");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to save winners");
    } finally {
      setSavingWinners(false);
    }
  };

  const handleSettle = async () => {
    if (!contest?.id || !token) return;
    setSettling(true);
    try {
      const res = await authedFetch(
        `/api/art-contest/contests/${contest.id}/settle`,
        { method: "POST" },
        token
      );
      const d = await res.json();
      if (d?.ok) {
        await loadContest();
        if (contest?.id && token) {
          const wRes = await authedFetch(`/api/art-contest/contests/${contest.id}/winners`, { method: "GET" }, token);
          const wData = await wRes.json();
          if (wData?.ok && Array.isArray(wData?.data)) setWinners(wData.data);
        }
      } else alert(d?.error || "Failed to settle");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to settle");
    } finally {
      setSettling(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px", maxWidth: "720px", margin: "0 auto" }}>
      <Link href="/clubs/burrfriends/games" className="mb-4 inline-block" style={{ color: "var(--fire-1)" }}>
        ← Back
      </Link>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>
        <Image
          src="/artcontest.png"
          alt={RULES_TITLE}
          width={400}
          height={400}
          style={{ maxWidth: "100%", height: "auto", borderRadius: "16px" }}
          priority
        />
      </div>

      {error && <p style={{ color: "var(--ember-2)", marginBottom: "12px" }}>{error}</p>}

      {/* Collapsible rules */}
      <section style={{ marginBottom: "24px", padding: "16px", background: "var(--bg-2)", borderRadius: "8px" }}>
        <div
          onClick={() => setRulesOpen(!rulesOpen)}
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
          <strong>{RULES_TITLE}</strong>
        </div>
        {rulesOpen && (
          <div style={{ fontSize: "0.875rem", color: "var(--text-1)" }}>
            <p style={{ marginBottom: "8px" }}>$4000+ prize pool. Quote the cast by midnight EST Feb 27. TOP 14 win (one winner per person). 1:1 square preferred. AI allowed but preference for hand-made.</p>
            <p style={{ margin: 0 }}>Example cast: <a href={ART_CONTEST_EXAMPLE_CAST_URL} target="_blank" rel="noopener noreferrer" style={{ color: "var(--fire-1)" }}>{ART_CONTEST_EXAMPLE_CAST_URL}</a></p>
          </div>
        )}
      </section>

      {!contest ? (
        <p style={{ color: "var(--text-1)" }}>No active contest right now.</p>
      ) : (
        <>
          <p style={{ color: "var(--text-1)", marginBottom: "16px" }}>
            {contest.title || RULES_TITLE} · Status: <strong>{contest.status}</strong>
            {contest.is_preview && <span style={{ marginLeft: "8px", color: "var(--fire-1)" }}>(Preview)</span>}
          </p>

          {authStatus !== "authed" ? (
            <p style={{ color: "var(--text-1)" }}>Sign in to submit or view eligibility.</p>
          ) : !statusData?.registered ? (
            <p style={{ color: "var(--text-1)" }}>
              Register for BETR GAMES first.{" "}
              <Link href="/clubs/burrfriends/games" style={{ color: "var(--fire-1)" }}>
                Go to games
              </Link>
            </p>
          ) : !statusData?.approved ? (
            <p style={{ color: "var(--text-1)" }}>Your BETR GAMES registration is pending approval.</p>
          ) : (contest.status === "open" && statusData?.canSubmit) ? (
            <section style={{ marginBottom: "24px" }}>
              <h2 style={{ marginBottom: "8px", fontSize: "1.1rem" }}>Submit</h2>
              {submitSuccess && <p style={{ color: "var(--fire-1)", marginBottom: "8px" }}>{submitSuccess}</p>}
              {submitError && <p style={{ color: "var(--ember-2)", marginBottom: "8px" }}>{submitError}</p>}
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxWidth: "400px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "4px" }}>Cast URL (with image)</label>
                  <input
                    type="url"
                    placeholder={ART_CONTEST_EXAMPLE_CAST_URL}
                    value={castUrl}
                    onChange={(e) => setCastUrl(e.target.value)}
                    style={{ padding: "8px", border: "1px solid #ccc", borderRadius: "6px", width: "100%", color: "#1a1a1a" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "4px" }}>Title</label>
                  <input
                    type="text"
                    placeholder="My artwork title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    style={{ padding: "8px", border: "1px solid #ccc", borderRadius: "6px", width: "100%", color: "#1a1a1a" }}
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
          ) : contest.status === "closed" ? (
            <p style={{ color: "var(--text-1)", marginBottom: "16px" }}>Submissions are closed. Winners will be announced soon.</p>
          ) : null}

          {/* Gallery */}
          <section style={{ marginTop: "24px" }}>
            <h2 style={{ marginBottom: "12px", fontSize: "1.1rem" }}>Gallery</h2>
            {gallery.length === 0 ? (
              <p style={{ color: "var(--text-1)" }}>No submissions yet.</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "16px" }}>
                {gallery.map((entry) => (
                  <div key={entry.id} style={{ background: "var(--bg-2)", borderRadius: "8px", overflow: "hidden" }}>
                    <a href={entry.cast_url} target="_blank" rel="noopener noreferrer" style={{ display: "block" }}>
                      <img
                        src={entry.image_url}
                        alt={entry.title}
                        style={{ width: "100%", aspectRatio: "1", objectFit: "cover" }}
                      />
                    </a>
                    <div style={{ padding: "8px" }}>
                      <p style={{ fontSize: "0.8rem", margin: 0, fontWeight: 600 }}>{entry.title}</p>
                      <button
                        type="button"
                        onClick={() => openFarcasterProfile(entry.fid, entry.username ?? null)}
                        style={{ background: "none", border: "none", padding: 0, color: "var(--fire-1)", cursor: "pointer", fontSize: "0.75rem" }}
                      >
                        @{entry.username || `fid:${entry.fid}`}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Settled: show winners */}
          {contest.status === "settled" && winners.length > 0 && (
            <section style={{ marginTop: "24px", padding: "16px", background: "var(--bg-2)", borderRadius: "8px" }}>
              <h2 style={{ marginBottom: "12px", fontSize: "1.1rem" }}>Winners</h2>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {winners.map((w) => (
                  <li key={w.id} style={{ marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontWeight: 600 }}>#{w.position}</span>
                    <button
                      type="button"
                      onClick={() => openFarcasterProfile(w.fid, null)}
                      style={{ background: "none", border: "none", padding: 0, color: "var(--fire-1)", cursor: "pointer" }}
                    >
                      {w.title || w.submissionId}
                    </button>
                    {w.amountDisplay && <span style={{ color: "var(--text-1)" }}>{w.amountDisplay}</span>}
                  </li>
                ))}
              </ul>
              <Link href="/art-contest" style={{ color: "var(--fire-1)", marginTop: "8px", display: "inline-block" }}>View full gallery</Link>
            </section>
          )}

          {/* Admin */}
          {isAdmin && token && contest.id && (
            <section style={{ marginTop: "32px", padding: "16px", border: "1px solid var(--stroke)", borderRadius: "8px" }}>
              <h2 style={{ marginBottom: "12px", fontSize: "1.1rem" }}>Admin</h2>
              {/* Pull quote casts */}
              <div style={{ marginBottom: "16px" }}>
                <h3 style={{ fontSize: "0.95rem", marginBottom: "8px" }}>Pull quote casts</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxWidth: "480px" }}>
                  <input
                    type="url"
                    placeholder="Source cast URL (e.g. contest announcement)"
                    value={sourceCastUrl}
                    onChange={(e) => setSourceCastUrl(e.target.value)}
                    style={{ padding: "8px", border: "1px solid #ccc", borderRadius: "6px", color: "#1a1a1a" }}
                  />
                  <button
                    type="button"
                    onClick={handlePullQuotes}
                    disabled={pullQuotesLoading || !sourceCastUrl.trim()}
                    className="btn-secondary"
                  >
                    {pullQuotesLoading ? "Loading…" : "Pull quote casts"}
                  </button>
                </div>
                {quoteCandidates.length > 0 && (
                  <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0", display: "flex", flexDirection: "column", gap: "12px" }}>
                    {quoteCandidates.map((c) => (
                      <li
                        key={c.castUrl}
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
                        {c.imageUrl && (
                          <img
                            src={c.imageUrl}
                            alt=""
                            style={{ width: 64, height: 64, objectFit: "cover", borderRadius: "6px" }}
                          />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "0.875rem", fontWeight: 600 }}>
                            @{c.username || `fid:${c.fid}`}
                            {c.display_name && ` (${c.display_name})`}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-1)", marginTop: "2px" }}>
                            {c.text.slice(0, 80)}
                            {c.text.length > 80 ? "…" : ""}
                          </div>
                          <a href={c.castUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.75rem", color: "var(--fire-1)" }}>
                            View cast
                          </a>
                        </div>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button
                            type="button"
                            onClick={() => handleImportQuote(c.castUrl, "gallery")}
                            disabled={importingCastUrl !== null}
                            className="btn-primary"
                            style={{ fontSize: "0.8rem" }}
                          >
                            {importingCastUrl === c.castUrl ? "…" : "Add to gallery"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleImportQuote(c.castUrl, "backup")}
                            disabled={importingCastUrl !== null}
                            className="btn-secondary"
                            style={{ fontSize: "0.8rem" }}
                          >
                            {importingCastUrl === c.castUrl ? "…" : "Add to backup"}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {contest.status === "open" && (
                <button
                  type="button"
                  onClick={handleCloseContest}
                  disabled={closing}
                  className="btn-secondary"
                  style={{ marginRight: "8px", marginBottom: "8px" }}
                >
                  {closing ? "Closing…" : "Close contest"}
                </button>
              )}
              {contest.status === "closed" && (
                <>
                  <button
                    type="button"
                    onClick={() => { loadAdminSubmissions(); loadAdminWinners(); }}
                    className="btn-secondary"
                    style={{ marginRight: "8px", marginBottom: "8px" }}
                  >
                    Load submissions & winners
                  </button>
                  <p style={{ fontSize: "0.875rem", color: "var(--text-1)", marginBottom: "8px" }}>
                    Set 14 winners via API or admin dashboard, then settle.
                  </p>
                  <button
                    type="button"
                    onClick={handleSettle}
                    disabled={settling}
                    className="btn-primary"
                    style={{ marginBottom: "8px" }}
                  >
                    {settling ? "Settling…" : "Settle contest"}
                  </button>
                </>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
