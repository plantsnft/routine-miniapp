"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useAuth } from "~/components/AuthProvider";
import { authedFetch } from "~/lib/authedFetch";
import { openFarcasterProfile } from "~/lib/openFarcasterProfile";
import { WEEKEND_GAME_PLAY_URL, WEEKEND_GAME_CREATOR } from "~/lib/constants";

const ADVANTAGE_COPY =
  "Your advantage is you get to choose two people in your next game — @burr.eth will be sending you a private DC.";
const BULLIED_RULE = "BULLIED: 3 go in, 1 or none advance.";

type Status = {
  registered: boolean;
  approved?: boolean;
  rejected?: boolean;
  canSubmit: boolean;
  registrationClosed?: boolean;
  myBestScore: number | null;
  myRank?: number;
};
type LeaderboardEntry = {
  rank: number | null;
  fid: number;
  best_score: number | null;
  best_cast_url: string | null;
  username?: string | null;
  display_name?: string | null;
  pfp_url?: string | null;
};
type Submitter = { fid: number; best_score: number; best_cast_url: string | null; username?: string | null; display_name?: string | null; pfp_url?: string | null };

type PoolPlayer = { fid: number; username?: string | null; display_name?: string | null };
type WinnerPick = {
  winner_fid: number;
  position: number;
  username?: string | null;
  display_name?: string | null;
  pick_1_fid: number | null;
  pick_2_fid: number | null;
  submitted_at: string | null;
  pick_1_username?: string | null;
  pick_2_username?: string | null;
};
type PicksData = {
  roundId: string;
  roundLabel: string | null;
  roundStatus?: string;
  picksLockedAt?: string | null;
  winners: WinnerPick[];
};

export default function WeekendGameClient() {
  const { token, fid: currentFid, status: authStatus } = useAuth();
  const searchParams = useSearchParams();
  const urlRoundId = searchParams.get("roundId")?.trim() || null;
  const [status, setStatus] = useState<Status | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [submitters, setSubmitters] = useState<Submitter[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [score, setScore] = useState("");
  const [proofKind, setProofKind] = useState<"screenshot" | "cast">("cast");
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [castUrl, setCastUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);
  const [resultModalData, setResultModalData] = useState<{
    success: boolean;
    score?: number;
    typedScore?: number;
    rank?: number;
    isNewBest?: boolean;
    error?: string;
  } | null>(null);

  const [activeRounds, setActiveRounds] = useState<{ id: string; status: string; round_label?: string | null }[]>([]);
  const [closingRound, setClosingRound] = useState(false);
  const [closeRoundError, setCloseRoundError] = useState<string | null>(null);

  const [howToPlayOpen, setHowToPlayOpen] = useState(false);
  const [alivePlayers, setAlivePlayers] = useState<{ fid: number; username?: string; display_name?: string; pfp_url?: string }[]>([]);

  const [settleFids, setSettleFids] = useState(["", "", "", "", ""]);
  const [settling, setSettling] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);

  const [createRoundLabel, setCreateRoundLabel] = useState("");
  const [createRoundCloseAt, setCreateRoundCloseAt] = useState("");
  const [creatingRound, setCreatingRound] = useState(false);
  const [createRoundError, setCreateRoundError] = useState<string | null>(null);

  const [winnerPicksRoundId, setWinnerPicksRoundId] = useState<string | null>(null);
  const [pick1Fid, setPick1Fid] = useState("");
  const [pick2Fid, setPick2Fid] = useState("");
  const [submittingPicks, setSubmittingPicks] = useState(false);
  const [picksError, setPicksError] = useState<string | null>(null);
  const [settledRoundsForPicks, setSettledRoundsForPicks] = useState<{ id: string; round_label: string | null }[]>([]);
  const [pickPool, setPickPool] = useState<PoolPlayer[]>([]);
  const [winnerPicksData, setWinnerPicksData] = useState<PicksData | null>(null);
  const [adminPicksRoundId, setAdminPicksRoundId] = useState<string | null>(null);
  const [adminPicksData, setAdminPicksData] = useState<PicksData | null>(null);
  const [adminPickPool, setAdminPickPool] = useState<PoolPlayer[]>([]);
  const [lockingPicks, setLockingPicks] = useState(false);
  const [lockPicksError, setLockPicksError] = useState<string | null>(null);

  // Phase 30: Merge a specific round by ID when ?roundId=xxx (e.g. preview rounds).
  const mergeSpecificRound = async (
    rounds: { id: string; status: string; round_label?: string | null }[]
  ): Promise<{ id: string; status: string; round_label?: string | null }[]> => {
    if (!urlRoundId) return rounds;
    if (rounds.some((r) => r.id === urlRoundId)) return rounds;
    try {
      const res = await fetch(`/api/weekend-game/rounds/${urlRoundId}`);
      const d = await res.json();
      if (d?.ok && d?.data) {
        return [...rounds, { id: d.data.id, status: d.data.status, round_label: d.data.round_label ?? null }];
      }
    } catch {
      /* ignore */
    }
    return rounds;
  };

  useEffect(() => {
    fetch("/api/weekend-game/rounds/settled")
      .then((r) => r.json())
      .then((d) => d?.ok && Array.isArray(d?.data) && setSettledRoundsForPicks(d.data))
      .catch(() => {});
  }, []);

  // Auto-select first settled round for picks (so picks fetch runs; winners of that round + admins see Top 5 section)
  useEffect(() => {
    if (settledRoundsForPicks.length >= 1 && !winnerPicksRoundId) {
      setWinnerPicksRoundId(settledRoundsForPicks[0].id);
    }
  }, [settledRoundsForPicks, winnerPicksRoundId]);

  useEffect(() => {
    if (authStatus !== "authed" || !token) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const [st, lb, adm, rounds, alive] = await Promise.all([
          authedFetch("/api/weekend-game/status", { method: "GET" }, token).then((r) => r.json()),
          fetch("/api/weekend-game/leaderboard").then((r) => r.json()),
          authedFetch("/api/admin/status", { method: "GET" }, token).then((r) => r.json()),
          fetch("/api/weekend-game/rounds/active").then((r) => r.json()),
          authedFetch("/api/betr-games/tournament/alive", { method: "GET" }, token)
            .then((r) => r.json())
            .catch(() => null),
        ]);
        if (st?.ok && st?.data) setStatus(st.data);
        if (lb?.ok && Array.isArray(lb?.data)) setLeaderboard(lb.data);
        if (adm?.ok && adm?.data?.isAdmin) setIsAdmin(true);
        if (rounds?.ok && Array.isArray(rounds?.data)) {
          const merged = await mergeSpecificRound(rounds.data);
          setActiveRounds(merged);
        }
        if (alive?.ok && Array.isArray(alive?.data?.players)) setAlivePlayers(alive.data.players);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [authStatus, token, urlRoundId]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const lb = await fetch("/api/weekend-game/leaderboard").then((r) => r.json());
        if (!cancelled && lb?.ok && Array.isArray(lb?.data)) setLeaderboard(lb.data);
      } catch {
        // ignore
      }
    };
    const id = setInterval(tick, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [authStatus, token]);

  useEffect(() => {
    if (token && isAdmin) {
      authedFetch("/api/weekend-game/submitters", { method: "GET" }, token)
        .then((r) => r.json())
        .then((d) => d?.ok && d?.data && setSubmitters(d.data))
        .catch(() => {});
    }
  }, [token, isAdmin]);

  // Fetch pick pool when round is selected (winners or admin)
  useEffect(() => {
    if (!token || !winnerPicksRoundId) {
      setPickPool([]);
      return;
    }
    let cancelled = false;
    authedFetch(`/api/weekend-game/rounds/${winnerPicksRoundId}/pick-pool`, { method: "GET" }, token)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d?.ok && Array.isArray(d?.data?.pool)) setPickPool(d.data.pool);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [token, winnerPicksRoundId]);

  // Fetch and poll winner picks for selected round (winners see each other in real time)
  const fetchPicks = (roundId: string) => {
    if (!token) return;
    authedFetch(`/api/weekend-game/rounds/${roundId}/picks`, { method: "GET" }, token)
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok && d?.data && winnerPicksRoundId === roundId) setWinnerPicksData(d.data);
      })
      .catch(() => {});
  };
  useEffect(() => {
    if (!token || !winnerPicksRoundId) {
      setWinnerPicksData(null);
      return;
    }
    fetchPicks(winnerPicksRoundId);
    const interval = setInterval(() => fetchPicks(winnerPicksRoundId), 8000);
    return () => clearInterval(interval);
  }, [token, winnerPicksRoundId]);

  // Admin: fetch picks and pick pool for "View winner picks" round
  useEffect(() => {
    if (!token || !isAdmin || !adminPicksRoundId) {
      setAdminPicksData(null);
      setAdminPickPool([]);
      return;
    }
    Promise.all([
      authedFetch(`/api/weekend-game/rounds/${adminPicksRoundId}/picks`, { method: "GET" }, token).then((r) => r.json()),
      authedFetch(`/api/weekend-game/rounds/${adminPicksRoundId}/pick-pool`, { method: "GET" }, token).then((r) => r.json()),
    ]).then(([picksRes, poolRes]) => {
      if (picksRes?.ok && picksRes?.data) setAdminPicksData(picksRes.data);
      if (poolRes?.ok && Array.isArray(poolRes?.data?.pool)) setAdminPickPool(poolRes.data.pool);
    }).catch(() => {});
  }, [token, isAdmin, adminPicksRoundId]);

  const handlePlay = async () => {
    try {
      const { sdk } = await import("@farcaster/miniapp-sdk");
      try {
        await sdk.actions.openMiniApp({ url: WEEKEND_GAME_PLAY_URL });
        return;
      } catch {
        // openMiniApp failed, try openUrl (web)
      }
      try {
        await sdk.actions.openUrl(WEEKEND_GAME_PLAY_URL);
        return;
      } catch {
        // fall through to window.open
      }
    } catch {
      // sdk not available
    }
    window.open(WEEKEND_GAME_PLAY_URL, "_blank", "noopener,noreferrer");
  };

  const handleSubmit = async () => {
    if (!token) return;
    const s = parseInt(score.trim(), 10);
    if (isNaN(s) || s < 0 || s > 1_000_000) {
      setSubmitError("Enter a valid score (0–1,000,000).");
      return;
    }
    if (proofKind === "screenshot") {
      if (!screenshotFile) {
        setSubmitError("Upload a screenshot of your 3D Tunnel Racer result.");
        return;
      }
    } else {
      if (!castUrl.trim()) {
        setSubmitError("Paste the cast URL where you shared your result.");
        return;
      }
    }
    setSubmitting(true);
    setSubmitError(null);
    setResultModalData(null);
    try {
      let r: Response;
      if (proofKind === "screenshot" && screenshotFile) {
        const form = new FormData();
        form.set("score", String(s));
        form.set("image", screenshotFile);
        r = await authedFetch("/api/weekend-game/submit", { method: "POST", body: form }, token);
      } else {
        r = await authedFetch("/api/weekend-game/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ score: s, castUrl: castUrl.trim() }),
        }, token);
      }
      const d = await r.json();
      if (!r.ok || !d?.ok) {
        setResultModalData({ success: false, error: d?.error || "Submit failed." });
        setShowResultModal(true);
        return;
      }
      setResultModalData({
        success: true,
        score: d?.data?.savedScore ?? s,
        typedScore: s,
        rank: d?.data?.rank,
        isNewBest: d?.data?.isNewBest,
      });
      setShowResultModal(true);
      setScore("");
      setCastUrl("");
      setScreenshotFile(null);
      if (status) {
        setStatus({
          ...status,
          myBestScore: d?.data?.isNewBest ? (d?.data?.savedScore ?? s) : status.myBestScore,
          myRank: d?.data?.rank ?? status.myRank,
        });
      }
      if (d?.data?.isNewBest) {
        const lb = await fetch("/api/weekend-game/leaderboard").then((res) => res.json());
        if (lb?.ok && Array.isArray(lb?.data)) setLeaderboard(lb.data);
      }
    } catch (e) {
      setResultModalData({ success: false, error: e instanceof Error ? e.message : "Submit failed." });
      setShowResultModal(true);
    } finally {
      setSubmitting(false);
    }
  };

  const refetchActiveRounds = () => {
    fetch("/api/weekend-game/rounds/active")
      .then((r) => r.json())
      .then(async (d) => {
        if (d?.ok && Array.isArray(d?.data)) {
          const merged = await mergeSpecificRound(d.data);
          setActiveRounds(merged);
        }
      })
      .catch(() => {});
  };

  const handleCloseRound = async () => {
    const openRound = activeRounds.find((r) => r.status === "open");
    if (!openRound || !token) return;
    setClosingRound(true);
    setCloseRoundError(null);
    try {
      const r = await authedFetch(`/api/weekend-game/rounds/${openRound.id}/close`, { method: "POST" }, token);
      const d = await r.json();
      if (!r.ok || !d?.ok) {
        setCloseRoundError(d?.error || "Failed to close round.");
        return;
      }
      refetchActiveRounds();
    } catch (e) {
      setCloseRoundError(e instanceof Error ? e.message : "Failed to close round.");
    } finally {
      setClosingRound(false);
    }
  };

  const handleSettle = async () => {
    if (!token) return;
    const fids = settleFids.map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n) && n > 0);
    if (fids.length !== 5) {
      setSettleError("Enter exactly 5 winner FIDs (positions 1–5).");
      return;
    }
    const openRound = activeRounds.find((r) => r.status === "open");
    const closedRound = activeRounds.find((r) => r.status === "closed");
    const roundToSettle = closedRound ?? openRound;
    if (!roundToSettle) {
      setSettleError("No round to settle.");
      return;
    }
    setSettling(true);
    setSettleError(null);
    try {
      const r = await authedFetch("/api/weekend-game/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roundId: roundToSettle.id,
          winners: fids.map((fid, i) => ({ fid, amount: 0, position: i + 1 })),
        }),
      }, token);
      const d = await r.json();
      if (!r.ok || !d?.ok) {
        setSettleError(d?.error || "Failed to settle.");
        return;
      }
      setSettleFids(["", "", "", "", ""]);
      refetchActiveRounds();
      fetch("/api/weekend-game/rounds/settled")
        .then((r) => r.json())
        .then((d) => d?.ok && Array.isArray(d?.data) && setSettledRoundsForPicks(d.data))
        .catch(() => {});
    } catch (e) {
      setSettleError(e instanceof Error ? e.message : "Failed to settle.");
    } finally {
      setSettling(false);
    }
  };

  const handleCreateRound = async () => {
    if (!token) return;
    const label = createRoundLabel.trim();
    if (!label) {
      setCreateRoundError("Round label is required.");
      return;
    }
    const closeAt = createRoundCloseAt.trim();
    if (!closeAt) {
      setCreateRoundError("Set submissions close time.");
      return;
    }
    const t = new Date(closeAt).getTime();
    if (isNaN(t) || t <= Date.now()) {
      setCreateRoundError("Submissions close time must be in the future.");
      return;
    }
    setCreatingRound(true);
    setCreateRoundError(null);
    try {
      const r = await authedFetch("/api/weekend-game/rounds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prizeAmount: 0,
          submissionsCloseAt: closeAt,
          roundLabel: label,
        }),
      }, token);
      const d = await r.json();
      if (!r.ok || !d?.ok) {
        setCreateRoundError(d?.error || "Failed to create round.");
        return;
      }
      setCreateRoundLabel("");
      setCreateRoundCloseAt("");
      refetchActiveRounds();
    } catch (e) {
      setCreateRoundError(e instanceof Error ? e.message : "Failed to create round.");
    } finally {
      setCreatingRound(false);
    }
  };

  const picksEditable =
    (winnerPicksData?.picksLockedAt == null || winnerPicksData?.picksLockedAt === "") &&
    winnerPicksData?.roundStatus !== "settled";

  useEffect(() => {
    if (!picksEditable || currentFid == null || !winnerPicksData?.winners) return;
    const my = winnerPicksData.winners.find((w) => w.winner_fid === currentFid);
    if (my) {
      setPick1Fid(my.pick_1_fid != null ? String(my.pick_1_fid) : "");
      setPick2Fid(my.pick_2_fid != null ? String(my.pick_2_fid) : "");
    }
  }, [winnerPicksData, currentFid, picksEditable]);

  const handleLockPicks = async () => {
    if (!token || !winnerPicksRoundId) return;
    setLockingPicks(true);
    setLockPicksError(null);
    try {
      const r = await authedFetch(`/api/weekend-game/rounds/${winnerPicksRoundId}/lock-picks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }, token);
      const d = await r.json();
      if (!r.ok || !d?.ok) {
        setLockPicksError(d?.error || "Failed to lock picks.");
        return;
      }
      fetchPicks(winnerPicksRoundId);
    } catch (e) {
      setLockPicksError(e instanceof Error ? e.message : "Failed to lock picks.");
    } finally {
      setLockingPicks(false);
    }
  };

  const handleSubmitPicks = async () => {
    if (!token || !winnerPicksRoundId || !picksEditable) return;
    const p1 = pick1Fid ? parseInt(pick1Fid, 10) : 0;
    const p2 = pick2Fid ? parseInt(pick2Fid, 10) : 0;
    const has1 = !isNaN(p1) && p1 > 0;
    const has2 = !isNaN(p2) && p2 > 0;
    setSubmittingPicks(true);
    setPicksError(null);
    try {
      const body: { roundId: string; pick1Fid?: number; pick2Fid?: number } = { roundId: winnerPicksRoundId };
      if (has1) body.pick1Fid = p1;
      if (has2) body.pick2Fid = p2;
      const r = await authedFetch("/api/weekend-game/picks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }, token);
      const d = await r.json();
      if (!r.ok || !d?.ok) {
        setPicksError(d?.error || "Failed to save picks.");
        return;
      }
      setPick1Fid("");
      setPick2Fid("");
      fetchPicks(winnerPicksRoundId);
      setPickPool([]);
      if (token) {
        authedFetch(`/api/weekend-game/rounds/${winnerPicksRoundId}/pick-pool`, { method: "GET" }, token)
          .then((res) => res.json())
          .then((data) => data?.ok && Array.isArray(data?.data?.pool) && setPickPool(data.data.pool))
          .catch(() => {});
      }
    } catch (e) {
      setPicksError(e instanceof Error ? e.message : "Failed to save picks.");
    } finally {
      setSubmittingPicks(false);
    }
  };

  const myPicks = currentFid != null ? winnerPicksData?.winners?.find((w) => w.winner_fid === currentFid) : undefined;
  const poolLabel = (p: PoolPlayer) => p.display_name || p.username || `FID ${p.fid}`;
  const canSavePicks = picksEditable;

  // Merged leaderboard: scored players (from API, sorted by score desc) + DNP (alive but no score)
  const mergedLeaderboard = useMemo(() => {
    const scoredFids = new Set(leaderboard.map((e) => e.fid));
    const dnpEntries: LeaderboardEntry[] = alivePlayers
      .filter((p) => !scoredFids.has(p.fid))
      .map((p) => ({
        rank: null,
        fid: p.fid,
        best_score: null,
        best_cast_url: null,
        username: p.username ?? null,
        display_name: p.display_name ?? null,
        pfp_url: p.pfp_url ?? null,
      }));
    const entries = [...leaderboard, ...dnpEntries];
    const totalCount = entries.length;
    const bottomCount = Math.ceil(totalCount * 0.1);
    return { entries, totalCount, bottomCount };
  }, [leaderboard, alivePlayers]);

  if (authStatus === "loading" || loading) {
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
        <Image src="/remix.png" alt="REMIX 3D Tunnel Racer" width={400} height={400} style={{ maxWidth: "100%", height: "auto", borderRadius: "16px" }} priority />
      </div>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "8px" }}>WEEKEND GAME - REMIX 3D Tunnel Racer</h1>
      <p style={{ color: "var(--text-1)", marginBottom: "16px" }}>
        Play 3D Tunnel Racer on Remix, submit your score here.
      </p>

      {error && <p style={{ color: "var(--ember-2)", marginBottom: "12px" }}>{error}</p>}

      <div style={{ marginBottom: "24px" }}>
        <button type="button" onClick={handlePlay} className="btn-primary">
          Play 3D Tunnel Racer
        </button>
      </div>

      <section style={{ marginBottom: "24px", padding: "16px", background: "var(--bg-2)", borderRadius: "8px" }}>
        <div
          className="neon-teal-header"
          onClick={() => setHowToPlayOpen(!howToPlayOpen)}
          style={{ marginBottom: howToPlayOpen ? "12px" : 0 }}
        >
          <span style={{ fontSize: "0.75rem", transition: "transform 0.2s", display: "inline-block", transform: howToPlayOpen ? "rotate(90deg)" : "rotate(0deg)" }}>&#9654;</span>
          How to Play
        </div>
        {howToPlayOpen && (
          <p style={{ fontSize: "0.875rem", color: "var(--text-1)" }}>
            Play 3D Tunnel Racer on Remix (link above). Higher score is better. Submit your best score with a screenshot or a cast URL. Unlimited submissions; only your best counts.
          </p>
        )}
      </section>

      {authStatus !== "authed" ? (
        <p style={{ color: "var(--text-1)" }}>Sign in to play.</p>
      ) : !status?.registered ? (
        <p style={{ color: "var(--text-1)" }}>
          {status?.registrationClosed
            ? "You are not registered for BETR GAMES and registration is closed."
            : (
              <>
                Register for BETR GAMES first.{" "}
                <Link href="/clubs/burrfriends/games" style={{ color: "var(--fire-1)" }}>
                  Go to games
                </Link>
              </>
            )}
        </p>
      ) : !status?.canSubmit ? (
        <div style={{ marginBottom: "20px", padding: "12px 16px", background: "var(--bg-2)", borderRadius: "8px", border: "1px solid var(--stroke)" }}>
          <p style={{ margin: 0, fontSize: "1rem", color: "var(--text-1)" }}>
            {status?.rejected
              ? "Your BETR GAMES registration was not approved."
              : "Your BETR GAMES registration is pending approval."}
            {status?.approved && !status?.rejected && !status?.canSubmit && " You are not active in BETR GAMES."}
          </p>
        </div>
      ) : (
        <>
          {Array.isArray(activeRounds) && !activeRounds.some((r) => r.status === "open") && (
            <div style={{ marginBottom: "20px", padding: "12px 16px", background: "var(--bg-2)", borderRadius: "8px", border: "1px solid var(--stroke)" }}>
              <p style={{ margin: 0, fontSize: "1rem", color: "var(--text-1)" }}>
                This game has been closed for submissions and the results are in process.
              </p>
            </div>
          )}

          {(status?.myBestScore != null || status?.myRank) && (
            <div style={{ marginBottom: "20px", padding: "12px 16px", background: "rgba(20, 184, 166, 0.1)", borderRadius: "8px", border: "1px solid rgba(20, 184, 166, 0.3)" }}>
              <p style={{ margin: 0, fontSize: "1rem" }}>
                Your best: <strong style={{ color: "var(--fire-1)" }}>{status?.myBestScore ?? "—"}</strong>
                {status?.myRank != null && <> · Rank: <strong style={{ color: "var(--fire-1)" }}>#{status.myRank}</strong></>}
              </p>
            </div>
          )}

          <section style={{ marginBottom: "24px" }}>
            <h2 className="neon-teal-header" style={{ marginBottom: "8px" }}>Submit Result</h2>
            <p style={{ fontSize: "0.875rem", color: "var(--text-1)", marginBottom: "12px" }}>
              Upload your score via a screenshot or cast URL.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxWidth: "400px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "4px" }}>Your score</label>
                <input
                  type="number"
                  min={0}
                  max={1000000}
                  placeholder="0–1,000,000"
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                  style={{ padding: "8px", border: "1px solid #ccc", borderRadius: "6px", width: "100%", color: "#1a1a1a" }}
                />
              </div>
              <div>
                <span style={{ fontSize: "0.875rem", marginRight: "8px" }}>Verify with:</span>
                <button
                  type="button"
                  onClick={() => { setProofKind("screenshot"); setCastUrl(""); }}
                  style={{
                    marginRight: "8px",
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: `1px solid ${proofKind === "screenshot" ? "var(--fire-1)" : "#555"}`,
                    background: proofKind === "screenshot" ? "rgba(255,100,50,0.15)" : "transparent",
                    color: proofKind === "screenshot" ? "var(--fire-1)" : "var(--text-1)",
                    cursor: "pointer",
                    fontSize: "0.875rem",
                  }}
                >
                  Screenshot
                </button>
                <button
                  type="button"
                  onClick={() => { setProofKind("cast"); setScreenshotFile(null); }}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: `1px solid ${proofKind === "cast" ? "var(--fire-1)" : "#555"}`,
                    background: proofKind === "cast" ? "rgba(255,100,50,0.15)" : "transparent",
                    color: proofKind === "cast" ? "var(--fire-1)" : "var(--text-1)",
                    cursor: "pointer",
                    fontSize: "0.875rem",
                  }}
                >
                  Cast link
                </button>
              </div>
              {proofKind === "screenshot" && (
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "4px" }}>Upload screenshot</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => { const f = e.target.files?.[0]; setScreenshotFile(f || null); }}
                    style={{ fontSize: "0.875rem" }}
                  />
                </div>
              )}
              {proofKind === "cast" && (
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "4px" }}>Cast URL</label>
                  <input
                    type="text"
                    placeholder="https://warpcast.com/.../0x..."
                    value={castUrl}
                    onChange={(e) => setCastUrl(e.target.value)}
                    style={{ padding: "8px", border: "1px solid #ccc", borderRadius: "6px", width: "100%", color: "#1a1a1a" }}
                  />
                </div>
              )}
              <button onClick={handleSubmit} disabled={submitting} className="btn-primary" style={{ alignSelf: "flex-start" }}>
                {submitting ? "Submitting…" : "Submit"}
              </button>
            </div>
            {submitError && <p style={{ color: "var(--ember-2)", marginTop: "8px", fontSize: "0.875rem" }}>{submitError}</p>}
          </section>
        </>
      )}

      <section style={{ marginBottom: "24px" }}>
        <h2 style={{ fontSize: "1rem", marginBottom: "8px" }}>Leaderboard</h2>
        <p style={{ fontSize: "0.75rem", color: "var(--text-1)", marginTop: "-4px", marginBottom: "8px" }}>
          Higher score = better rank. Top 5 get an advantage.
        </p>
        {mergedLeaderboard.entries.length === 0 ? (
          <p style={{ color: "var(--text-1)" }}>No results yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #333" }}>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>#</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Player</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>Score</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Proof</th>
                </tr>
              </thead>
              <tbody>
                {mergedLeaderboard.entries.map((e, idx) => {
                  const isDnp = e.best_score === null;
                  const isBottom10 = idx >= mergedLeaderboard.totalCount - mergedLeaderboard.bottomCount;
                  const isFirstBottom10 = idx === mergedLeaderboard.totalCount - mergedLeaderboard.bottomCount && mergedLeaderboard.bottomCount > 0;
                  return (
                    <React.Fragment key={e.fid}>
                      {idx === 5 && (
                        <tr>
                          <td colSpan={4} style={{ padding: 0, borderBottom: "3px solid #14B8A6" }} />
                        </tr>
                      )}
                      <tr style={{
                        borderBottom: "1px solid #222",
                        background: "transparent",
                      }}>
                        <td style={{ padding: "6px 8px" }}>{isDnp ? "—" : (e.rank ?? idx + 1)}</td>
                        <td style={{ padding: "6px 8px" }}>
                          <span
                            style={{ cursor: "pointer" }}
                            onClick={() => openFarcasterProfile(e.fid, e.username ?? null)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openFarcasterProfile(e.fid, e.username ?? null); } }}
                          >
                            {e.pfp_url && <img src={e.pfp_url} alt="" style={{ width: 20, height: 20, borderRadius: 10, marginRight: 6, verticalAlign: "middle" }} />}
                            {e.display_name || e.username || `FID ${e.fid}`}
                            {idx === 0 && <span style={{ marginLeft: "8px", color: "#fbbf24", fontWeight: 700, fontSize: "0.75rem" }}>5M $BETR</span>}
                            {idx === 1 && <span style={{ marginLeft: "8px", color: "#d1d5db", fontWeight: 700, fontSize: "0.75rem" }}>3M $BETR</span>}
                          </span>
                        </td>
                        <td style={{ textAlign: "right", padding: "6px 8px", color: isDnp ? "#ef4444" : "inherit" }}>
                          {isDnp ? "DNP" : (e.best_score ?? "—")}
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          {isDnp ? "—" : (e.best_cast_url ? <a href={e.best_cast_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--fire-1)" }}>Cast</a> : "Screenshot")}
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div style={{ marginBottom: "12px", textAlign: "center" }}>
        <p style={{ fontSize: "0.85rem", color: "#14B8A6", fontWeight: 600, margin: 0 }}>
          1st = 5M $BETR &middot; 2nd = 3M $BETR &middot; Top 5 get an advantage
        </p>
        <p style={{
          fontSize: "0.9rem",
          fontWeight: 700,
          color: "#D946EF",
          margin: "6px 0 0 0",
          textShadow: "0 0 8px rgba(217,70,239,0.6), 0 0 20px rgba(217,70,239,0.3)",
          letterSpacing: "0.05em",
        }}>
          DOUBLED IF BETR BELIEVER
        </p>
      </div>

      <p style={{ fontSize: "0.75rem", color: "var(--text-1)", marginBottom: "8px" }}>
        Scores will be verified by the game creator {WEEKEND_GAME_CREATOR}.
      </p>
      <p style={{ fontSize: "0.75rem", color: "var(--text-1)", marginBottom: "24px" }}>
        This leaderboard is for entertainment purposes only and will be verified upon game closure.
      </p>

      {/* Winners: advantage copy + BULLIED rule + picks from pool; editable until game ended */}
      {authStatus === "authed" && settledRoundsForPicks.length > 0 && (isAdmin || (winnerPicksData?.winners?.some((w) => w.winner_fid === currentFid) ?? false)) && (
        <section style={{ marginBottom: "24px", padding: "16px", background: "rgba(20, 184, 166, 0.12)", borderRadius: "8px", border: "1px solid rgba(20, 184, 166, 0.6)" }}>
          <h2 style={{ fontSize: "1rem", marginBottom: "8px" }}>Top 5 winners</h2>
          <p style={{ margin: 0, marginBottom: "8px", fontSize: "1rem", color: "var(--text-1)" }}>{ADVANTAGE_COPY}</p>
          <p style={{ margin: 0, marginBottom: "12px", fontSize: "0.875rem", color: "var(--text-1)", fontWeight: 600 }}>{BULLIED_RULE}</p>
          <p style={{ fontSize: "0.875rem", color: "var(--text-1)", marginBottom: "12px" }}>
            {picksEditable
              ? "You can change or clear your picks until the game is ended."
              : "Picks are locked; the game has ended."}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxWidth: "400px" }}>
            {settledRoundsForPicks.length !== 1 && (
              <select
                value={winnerPicksRoundId ?? ""}
                onChange={(e) => setWinnerPicksRoundId(e.target.value || null)}
                style={{ padding: "8px", border: "1px solid #555", borderRadius: "6px", background: "var(--bg-2)", color: "var(--text-1)" }}
              >
                <option value="">Select round</option>
                {settledRoundsForPicks.map((r) => (
                  <option key={r.id} value={r.id}>{r.round_label || r.id}</option>
                ))}
              </select>
            )}
            <div>
              <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "4px" }}>Pick 1</label>
              {picksEditable ? (
                <select
                  value={pick1Fid}
                  onChange={(e) => setPick1Fid(e.target.value)}
                  style={{ padding: "8px", border: "1px solid #555", borderRadius: "6px", background: "var(--bg-2)", color: "var(--text-1)", width: "100%" }}
                >
                  <option value="">— Choose from pool —</option>
                  {pickPool.filter((p) => p.fid !== (pick2Fid ? parseInt(pick2Fid, 10) : 0)).map((p) => (
                    <option key={p.fid} value={String(p.fid)}>{poolLabel(p)}</option>
                  ))}
                </select>
              ) : (
                <p style={{ margin: 0, padding: "8px", background: "var(--bg-2)", borderRadius: "6px", fontSize: "0.875rem" }}>
                  {myPicks?.pick_1_username ?? (myPicks?.pick_1_fid != null ? `FID ${myPicks.pick_1_fid}` : "—")}
                </p>
              )}
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.875rem", marginBottom: "4px" }}>Pick 2</label>
              {picksEditable ? (
                <select
                  value={pick2Fid}
                  onChange={(e) => setPick2Fid(e.target.value)}
                  style={{ padding: "8px", border: "1px solid #555", borderRadius: "6px", background: "var(--bg-2)", color: "var(--text-1)", width: "100%" }}
                >
                  <option value="">— Choose from pool —</option>
                  {pickPool.filter((p) => p.fid !== (pick1Fid ? parseInt(pick1Fid, 10) : 0)).map((p) => (
                    <option key={p.fid} value={String(p.fid)}>{poolLabel(p)}</option>
                  ))}
                </select>
              ) : (
                <p style={{ margin: 0, padding: "8px", background: "var(--bg-2)", borderRadius: "6px", fontSize: "0.875rem" }}>
                  {myPicks?.pick_2_username ?? (myPicks?.pick_2_fid != null ? `FID ${myPicks.pick_2_fid}` : "—")}
                </p>
              )}
            </div>
            {picksEditable && (
              <>
                <button onClick={handleSubmitPicks} disabled={submittingPicks || !winnerPicksRoundId} className="btn-primary" style={{ alignSelf: "flex-start" }}>
                  {submittingPicks ? "Saving…" : "Save picks"}
                </button>
                {picksError && <p style={{ color: "var(--ember-2)", fontSize: "0.875rem" }}>{picksError}</p>}
                {isAdmin && picksEditable && winnerPicksRoundId && winnerPicksData?.winners?.length === 5 && (
                  <>
                    <button onClick={handleLockPicks} disabled={lockingPicks} className="btn-secondary" style={{ alignSelf: "flex-start" }}>
                      {lockingPicks ? "Locking…" : "Lock picks"}
                    </button>
                    {lockPicksError && <p style={{ color: "var(--ember-2)", fontSize: "0.875rem" }}>{lockPicksError}</p>}
                  </>
                )}
              </>
            )}
          </div>
          {winnerPicksData?.winners && winnerPicksData.winners.length > 0 && (
            <div style={{ marginTop: "16px" }}>
              <h3 style={{ fontSize: "0.875rem", marginBottom: "8px" }}>Winner picks (live)</h3>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #333" }}>
                      <th style={{ textAlign: "left", padding: "4px 8px" }}>Winner</th>
                      <th style={{ textAlign: "left", padding: "4px 8px" }}>Pick 1</th>
                      <th style={{ textAlign: "left", padding: "4px 8px" }}>Pick 2</th>
                    </tr>
                  </thead>
                  <tbody>
                    {winnerPicksData.winners.map((w) => (
                      <tr key={w.winner_fid} style={{ borderBottom: "1px solid #222" }}>
                        <td style={{ padding: "4px 8px" }}>
                          <span
                            style={{ cursor: "pointer" }}
                            onClick={() => openFarcasterProfile(w.winner_fid, w.username ?? null)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openFarcasterProfile(w.winner_fid, w.username ?? null); } }}
                          >
                            {w.display_name || w.username || `FID ${w.winner_fid}`}
                          </span>
                        </td>
                        <td style={{ padding: "4px 8px" }}>{w.pick_1_username ?? (w.pick_1_fid != null ? `FID ${w.pick_1_fid}` : "—")}</td>
                        <td style={{ padding: "4px 8px" }}>{w.pick_2_username ?? (w.pick_2_fid != null ? `FID ${w.pick_2_fid}` : "—")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {isAdmin && (
        <section style={{ marginTop: "24px", padding: "16px", background: "var(--bg-2)", borderRadius: "8px", border: "1px solid var(--stroke)" }}>
          <h2 style={{ fontSize: "1rem", marginBottom: "12px" }}>Admin</h2>
          <p style={{ fontSize: "0.875rem", color: "var(--text-1)", marginBottom: "12px" }}>Submitters: {submitters.length}</p>
          {activeRounds.some((r) => r.status === "open") && (
            <>
              <button onClick={handleCloseRound} disabled={closingRound} className="btn-secondary" style={{ marginBottom: "12px", marginRight: "12px" }}>
                {closingRound ? "Closing…" : "End game"}
              </button>
              {closeRoundError && <p style={{ color: "var(--ember-2)", fontSize: "0.875rem", marginBottom: "12px" }}>{closeRoundError}</p>}
            </>
          )}
          <div style={{ marginBottom: "12px" }}>
            <p style={{ fontSize: "0.875rem", marginBottom: "4px" }}>Settle (5 winner FIDs, position 1–5)</p>
            {[0, 1, 2, 3, 4].map((i) => (
              <input
                key={i}
                type="number"
                placeholder={`Position ${i + 1} FID`}
                value={settleFids[i]}
                onChange={(e) => setSettleFids((prev) => { const n = [...prev]; n[i] = e.target.value; return n; })}
                style={{ width: "120px", padding: "6px 8px", marginRight: "8px", marginBottom: "8px", fontSize: "0.875rem" }}
              />
            ))}
            <button onClick={handleSettle} disabled={settling} className="btn-primary" style={{ display: "block", marginTop: "8px" }}>
              {settling ? "Settling…" : "Settle round"}
            </button>
            {settleError && <p style={{ color: "var(--ember-2)", fontSize: "0.875rem", marginTop: "8px" }}>{settleError}</p>}
          </div>
          <div style={{ marginBottom: "16px" }}>
            <p style={{ fontSize: "0.875rem", marginBottom: "4px" }}>Create game (round label required)</p>
            <input
              type="text"
              placeholder="Round label (required)"
              value={createRoundLabel}
              onChange={(e) => setCreateRoundLabel(e.target.value)}
              style={{ width: "200px", padding: "6px 8px", marginRight: "8px", marginBottom: "8px" }}
            />
            <input
              type="datetime-local"
              placeholder="Submissions close"
              value={createRoundCloseAt}
              onChange={(e) => setCreateRoundCloseAt(e.target.value)}
              style={{ padding: "6px 8px", marginRight: "8px", marginBottom: "8px" }}
            />
            <button onClick={handleCreateRound} disabled={creatingRound || !createRoundLabel.trim()} className="btn-secondary">
              {creatingRound ? "Creating…" : "Create game"}
            </button>
            {createRoundError && <p style={{ color: "var(--ember-2)", fontSize: "0.875rem", marginTop: "8px" }}>{createRoundError}</p>}
          </div>
          <div>
            <p style={{ fontSize: "0.875rem", marginBottom: "4px" }}>View winner picks</p>
            <select
              value={adminPicksRoundId ?? ""}
              onChange={(e) => setAdminPicksRoundId(e.target.value || null)}
              style={{ padding: "6px 8px", marginRight: "8px", marginBottom: "8px", minWidth: "200px" }}
            >
              <option value="">Select round</option>
              {settledRoundsForPicks.map((r) => (
                <option key={r.id} value={r.id}>{r.round_label || r.id}</option>
              ))}
            </select>
            {adminPicksData?.winners && adminPicksData.winners.length > 0 && (
              <div style={{ marginTop: "8px", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #333" }}>
                      <th style={{ textAlign: "left", padding: "4px 8px" }}>Winner</th>
                      <th style={{ textAlign: "left", padding: "4px 8px" }}>Pick 1</th>
                      <th style={{ textAlign: "left", padding: "4px 8px" }}>Pick 2</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminPicksData.winners.map((w) => (
                      <tr key={w.winner_fid} style={{ borderBottom: "1px solid #222" }}>
                        <td style={{ padding: "4px 8px" }}>
                          <span
                            style={{ cursor: "pointer" }}
                            onClick={() => openFarcasterProfile(w.winner_fid, w.username ?? null)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openFarcasterProfile(w.winner_fid, w.username ?? null); } }}
                          >
                            {w.display_name || w.username || `FID ${w.winner_fid}`}
                          </span>
                        </td>
                        <td style={{ padding: "4px 8px" }}>{w.pick_1_username ?? (w.pick_1_fid != null ? `FID ${w.pick_1_fid}` : "—")}</td>
                        <td style={{ padding: "4px 8px" }}>{w.pick_2_username ?? (w.pick_2_fid != null ? `FID ${w.pick_2_fid}` : "—")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {adminPicksRoundId && (
              <div style={{ marginTop: "12px" }}>
                <p style={{ fontSize: "0.875rem", marginBottom: "4px" }}>Pick pool ({adminPickPool.length}) — active players still available to pick</p>
                {adminPickPool.length === 0 ? (
                  <p style={{ fontSize: "0.8rem", color: "var(--text-1)" }}>No one left in pool (all picked or round has no label).</p>
                ) : (
                  <p style={{ fontSize: "0.8rem", color: "var(--text-1)" }}>
                    {adminPickPool.map((p) => poolLabel(p)).join(", ")}
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {showResultModal && resultModalData && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1001,
          }}
          onClick={() => setShowResultModal(false)}
        >
          <div
            style={{
              background: "#1a1a1a",
              padding: "24px 32px",
              borderRadius: "12px",
              maxWidth: "400px",
              textAlign: "center",
              border: "1px solid #333",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {resultModalData.success ? (
              <>
                <h3 style={{ color: "var(--fire-1)", marginBottom: "16px", fontSize: "1.25rem" }}>
                  {resultModalData.isNewBest ? "New Personal Best!" : "Submitted!"}
                </h3>
                <p style={{ marginBottom: "12px", fontSize: "1rem" }}>
                  Score <strong style={{ color: "var(--fire-1)" }}>{resultModalData.score}</strong> recorded.
                </p>
                {resultModalData.rank != null && (
                  <p style={{ marginBottom: "0", fontSize: "1rem" }}>
                    Your rank: <strong style={{ color: "var(--fire-1)" }}>#{resultModalData.rank}</strong>
                  </p>
                )}
                {resultModalData.typedScore != null && resultModalData.score != null && resultModalData.typedScore > resultModalData.score && (
                  <p style={{ marginTop: "12px", fontSize: "0.85rem", color: "var(--ember-2)" }}>
                    Your proof shows a score of {resultModalData.score}. Upload a screenshot of your higher score to update.
                  </p>
                )}
              </>
            ) : (
              <>
                <h3 style={{ color: "var(--ember-2)", marginBottom: "16px", fontSize: "1.25rem" }}>Submission Failed</h3>
                <p style={{ marginBottom: "0", fontSize: "0.9rem", color: "var(--text-1)" }}>{resultModalData.error}</p>
              </>
            )}
            <button onClick={() => setShowResultModal(false)} className="btn-primary" style={{ marginTop: "20px", minWidth: "100px" }}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
