'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { FRAMEDL_BETR_PLAY_URL, FRAMEDL_MINIAPP_LAUNCH_URL } from '~/lib/constants';

// Plan 12.18: FRAMEDL advantage (score ≤ 2) — practice URL and copy
const REMIX_PRACTICE_URL = 'https://play.remix.gg/games/1ecca8f5-107c-4e0d-9b99-d75b3371fd2b';
const ADVANTAGE_COPY = 'Congrats! Your performance has earned you an advantage for the next game. Shhhh, keep it a secret. The next game will be the REMIX game — 3d tunnel racer by @spaceman-ngu. The bottom 10% will be eliminated. Link to practice:';

// Shared advantage copy with "3D Tunnel Racer" bold and teal (modal + persistent block stay in sync)
const advantageCopyJsx = (
  <>
    Congrats! Your performance has earned you an advantage for the next game. Shhhh, keep it a secret. The next game will be the REMIX game — <strong style={{ color: 'var(--fire-1)', fontWeight: 700 }}>3D Tunnel Racer</strong> by @spaceman-ngu. The bottom 10% will be eliminated. Link to practice:
  </>
);

const NEON_TEAL_BORDER = '1px solid rgba(20, 184, 166, 0.6)';
const NEON_TEAL_GLOW = '0 0 15px #14B8A6, 0 0 30px rgba(20, 184, 166, 0.4)';

type Status = { registered: boolean; approved?: boolean; rejected?: boolean; canSubmit: boolean; myBestScore: number | null; myRank?: number; registrationClosed?: boolean };
type LeaderboardEntry = { rank: number | null; fid: number; best_score: number | null; best_cast_url: string | null; username?: string | null; display_name?: string | null; pfp_url?: string | null };
type Submitter = { fid: number; best_score: number; best_cast_url: string | null; username?: string | null; display_name?: string | null; pfp_url?: string | null };

export default function RemixBetrClient() {
  const { token, status: authStatus } = useAuth();
  const searchParams = useSearchParams();
  const urlRoundId = searchParams.get('roundId')?.trim() || null;
  const [status, setStatus] = useState<Status | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [submitters, setSubmitters] = useState<Submitter[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [score, setScore] = useState('');
  const [proofKind, setProofKind] = useState<'screenshot' | 'cast'>('cast');
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [castUrl, setCastUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const [linkCopied, setLinkCopied] = useState(false);
  const [howToPlayOpen, setHowToPlayOpen] = useState(false);

  // Plan 12.11: active rounds for Close round button and "closed" message; 12.11 cancel round
  const [activeRounds, setActiveRounds] = useState<{ id: string; status: string }[]>([]);
  const [closingRound, setClosingRound] = useState(false);
  const [closeRoundError, setCloseRoundError] = useState<string | null>(null);
  const [cancellingRound, setCancellingRound] = useState(false);
  const [cancelRoundError, setCancelRoundError] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  // Settle round (advantage only): winners = all with score 1 or 2, single "1st" group
  const [settling, setSettling] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);

  // 12.17.2: Modal state for submit results
  const [showResultModal, setShowResultModal] = useState(false);
  // Plan 12.18: Advantage popup when submitted score ≤ 2
  const [showAdvantageModal, setShowAdvantageModal] = useState(false);
  // Plan 12.18: Practice in-app overlay (iframe); primary flow does not use openUrl/window.open
  const [showPracticeOverlay, setShowPracticeOverlay] = useState(false);
  const [resultModalData, setResultModalData] = useState<{
    success: boolean;
    score?: number;
    rank?: number;
    isNewBest?: boolean;
    error?: string;
  } | null>(null);

  // Phase 29: Fetch a specific round by ID and merge into activeRounds (dedup by id).
  // Used when ?roundId=xxx is in the URL so preview rounds appear as active.
  const mergeSpecificRound = async (rounds: { id: string; status: string }[]): Promise<{ id: string; status: string }[]> => {
    if (!urlRoundId) return rounds;
    // Already in the list?
    if (rounds.some((r) => r.id === urlRoundId)) return rounds;
    try {
      const res = await fetch(`/api/remix-betr/rounds/${urlRoundId}`);
      const d = await res.json();
      if (d?.ok && d?.data) {
        return [...rounds, { id: d.data.id, status: d.data.status }];
      }
    } catch { /* ignore */ }
    return rounds;
  };

  useEffect(() => {
    if (authStatus !== 'authed' || !token) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const [st, lb, adm, rounds] = await Promise.all([
          authedFetch('/api/remix-betr/status', { method: 'GET' }, token).then((r) => r.json()),
          fetch('/api/remix-betr/leaderboard').then((r) => r.json()),
          authedFetch('/api/admin/status', { method: 'GET' }, token).then((r) => r.json()),
          fetch('/api/remix-betr/rounds/active').then((r) => r.json()),
        ]);
        if (st?.ok && st?.data) setStatus(st.data);
        if (lb?.ok && Array.isArray(lb?.data)) setLeaderboard(lb.data);
        if (adm?.ok && adm?.data?.isAdmin) setIsAdmin(true);
        if (rounds?.ok && Array.isArray(rounds?.data)) {
          const merged = await mergeSpecificRound(rounds.data);
          setActiveRounds(merged);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [authStatus, token, urlRoundId]);

  // Fetch active rounds on mount (for "closed" message when no open round); refetched when authed above too
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/remix-betr/rounds/active');
        const d = await r.json();
        if (d?.ok && Array.isArray(d?.data)) {
          const merged = await mergeSpecificRound(d.data);
          setActiveRounds(merged);
        }
      } catch { /* ignore */ }
    })();
  }, [urlRoundId]);

  // Poll leaderboard every 30s so other users' new bests appear within 0–30s.
  useEffect(() => {
    if (authStatus !== 'authed' || !token) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const lb = await fetch('/api/remix-betr/leaderboard').then((r) => r.json());
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

  // Load submitters count for admin section
  useEffect(() => {
    if (token && isAdmin) {
      authedFetch('/api/remix-betr/submitters', { method: 'GET' }, token)
        .then((r) => r.json())
        .then((d) => d?.ok && d?.data && setSubmitters(d.data))
        .catch(() => {});
    }
  }, [token, isAdmin]);

  // Phase 12.1: FRAMEDL BETR - validate attempts 1-6 or X (7), lower is better
  const handleSubmit = async () => {
    if (!token) return;
    // Parse X/x → 7
    const raw = score.trim();
    const s = raw.toLowerCase() === 'x' ? 7 : parseInt(raw, 10);
    // Validate attempts range 1-7 (7 = X / failed)
    if (isNaN(s) || s < 1 || s > 7) {
      setSubmitError('Enter valid attempts (1-6, or X if you didn\u2019t solve it).');
      return;
    }
    if (proofKind === 'screenshot') {
      if (!screenshotFile) {
        setSubmitError('Upload a screenshot of your FRAMEDL result.');
        return;
      }
    } else {
      if (!castUrl.trim()) {
        setSubmitError('Paste the cast URL where you shared your FRAMEDL result.');
        return;
      }
    }
    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);
    try {
      let r: Response;
      if (proofKind === 'screenshot' && screenshotFile) {
        const form = new FormData();
        form.set('score', String(s));
        form.set('image', screenshotFile);
        r = await authedFetch('/api/remix-betr/submit', { method: 'POST', body: form }, token);
      } else {
        r = await authedFetch('/api/remix-betr/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ score: s, castUrl: castUrl.trim() }),
        }, token);
      }
      const d = await r.json();
      if (!r.ok || !d?.ok) {
        // 12.17.2: Show error in modal
        setResultModalData({ success: false, error: d?.error || 'Submit failed.' });
        setShowResultModal(true);
        return;
      }
      // 12.17.2: Show success in modal
      setResultModalData({
        success: true,
        score: s,
        rank: d?.data?.rank,
        isNewBest: d?.data?.isNewBest,
      });
      setShowResultModal(true);
      if (s <= 2) setShowAdvantageModal(true);
      setScore('');
      setCastUrl('');
      setScreenshotFile(null);
      // Phase 12.1: Lower is better - update myBestScore if new score is lower
      if (status) {
        const isNewBest = status.myBestScore === null || s < status.myBestScore;
        setStatus({ ...status, myBestScore: isNewBest ? s : status.myBestScore, myRank: d?.data?.rank ?? status.myRank });
      }
      // Reduce immediate refetches: only refresh leaderboard if this was a new best.
      if (d?.data?.isNewBest) {
        const lb = await fetch('/api/remix-betr/leaderboard').then((res) => res.json());
        if (lb?.ok && Array.isArray(lb?.data)) setLeaderboard(lb.data);
      }
    } catch (e) {
      // 12.17.2: Show error in modal
      setResultModalData({ success: false, error: e instanceof Error ? e.message : 'Submit failed.' });
      setShowResultModal(true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleShare = async () => {
    try {
      const { sdk } = await import('@farcaster/miniapp-sdk');
      if (sdk?.actions?.composeCast) {
        const { APP_URL } = await import('~/lib/constants');
        const { buildShareText } = await import('~/lib/og-helpers');
        const url = APP_URL + '/remix-betr';
        const text = buildShareText(
          'FRAMEDL BETR',
          null, // FRAMEDL doesn't have prize per game
          null
        );
        await sdk.actions.composeCast({
          text,
          embeds: [url],
        });
      } else {
        alert('This feature requires Warpcast. Please open this mini app in Warpcast to share.');
      }
    } catch (error) {
      console.error('Failed to open cast composer:', error);
      alert('Failed to open cast composer. Please try again.');
    }
  };

  const refetchActiveRounds = () => {
    (async () => {
      try {
        const r = await fetch('/api/remix-betr/rounds/active');
        const d = await r.json();
        if (d?.ok && Array.isArray(d?.data)) {
          const merged = await mergeSpecificRound(d.data);
          setActiveRounds(merged);
        }
      } catch { /* ignore */ }
    })();
  };

  const handleCloseRound = async () => {
    const openRound = activeRounds.find((r) => r.status === 'open');
    if (!openRound || !token) return;
    setClosingRound(true);
    setCloseRoundError(null);
    try {
      const r = await authedFetch(`/api/remix-betr/rounds/${openRound.id}/close`, { method: 'POST' }, token);
      const d = await r.json();
      if (!r.ok || !d?.ok) {
        setCloseRoundError(d?.error || 'Failed to close round.');
        return;
      }
      refetchActiveRounds();
    } catch (e) {
      setCloseRoundError(e instanceof Error ? e.message : 'Failed to close round.');
    } finally {
      setClosingRound(false);
    }
  };

  // Plan 12.11: Cancel round (open or closed); confirmation modal, then POST cancel API and refetch
  const roundToCancel = activeRounds.find((r) => r.status === 'open') ?? activeRounds.find((r) => r.status === 'closed');
  const roundToSettle = activeRounds.find((r) => r.status === 'closed');
  const submittersSorted = [...submitters].sort((a, b) => a.best_score - b.best_score); // best (lowest) first
  // Winners = everyone who scored 1 or 2 (single "1st" group, no 2nd/3rd)
  const winnersToSettle = submittersSorted.filter((s) => s.best_score >= 1 && s.best_score <= 2);
  const handleCancelRoundConfirm = async () => {
    if (!roundToCancel || !token) return;
    setCancellingRound(true);
    setCancelRoundError(null);
    setShowCancelConfirm(false);
    try {
      const r = await authedFetch(`/api/remix-betr/rounds/${roundToCancel.id}/cancel`, { method: 'POST' }, token);
      const d = await r.json();
      if (!r.ok || !d?.ok) {
        setCancelRoundError(d?.error || 'Failed to cancel round.');
        return;
      }
      refetchActiveRounds();
    } catch (e) {
      setCancelRoundError(e instanceof Error ? e.message : 'Failed to cancel round.');
    } finally {
      setCancellingRound(false);
    }
  };

  const handleSettleRound = async () => {
    if (!roundToSettle || !token || winnersToSettle.length === 0) return;
    setSettleError(null);
    setSettling(true);
    try {
      const r = await authedFetch('/api/remix-betr/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roundId: roundToSettle.id,
          winners: winnersToSettle.map((w) => ({ fid: w.fid, amount: 0, position: 1 })),
        }),
      }, token);
      const d = await r.json();
      if (!r.ok || !d?.ok) {
        setSettleError(d?.error || 'Settle failed.');
        return;
      }
      refetchActiveRounds();
    } catch (e) {
      setSettleError(e instanceof Error ? e.message : 'Settle failed.');
    } finally {
      setSettling(false);
    }
  };

  const handleCopyGameUrl = async () => {
    try {
      const { APP_URL } = await import('~/lib/constants');
      const url = APP_URL + '/remix-betr';
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    } catch {
      const { APP_URL } = await import('~/lib/constants');
      alert('Copy failed. URL: ' + (APP_URL + '/remix-betr'));
    }
  };

  // 12.16: Open FRAMEDL miniapp directly when in Farcaster; fallback to web URL
  const handlePlayFramedl = async () => {
    try {
      const { sdk } = await import('@farcaster/miniapp-sdk');
      try {
        await sdk.actions.openMiniApp({ url: FRAMEDL_MINIAPP_LAUNCH_URL });
        return;
      } catch {
        // openMiniApp failed, try openUrl (web)
      }
      try {
        await sdk.actions.openUrl(FRAMEDL_BETR_PLAY_URL);
        return;
      } catch {
        // fall through to window.open
      }
    } catch {
      // sdk import failed or not in miniapp
    }
    window.open(FRAMEDL_BETR_PLAY_URL, '_blank', 'noopener,noreferrer');
  };

  // Plan 12.18: Open Practice in-app overlay (iframe); user stays in BETR WITH BURR
  const handleOpenPractice = () => {
    setShowPracticeOverlay(true);
  };

  // Plan 12.18: Fallback if iframe is blocked — open in new window
  const handleOpenPracticeInNewWindow = async () => {
    try {
      const { sdk } = await import('@farcaster/miniapp-sdk');
      try {
        await sdk.actions.openUrl(REMIX_PRACTICE_URL);
        return;
      } catch {
        // fall through to window.open
      }
    } catch {
      // sdk import failed or not in miniapp
    }
    window.open(REMIX_PRACTICE_URL, '_blank', 'noopener,noreferrer');
  };

  if (authStatus === 'loading' || loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: '720px', margin: '0 auto' }}>
      <Link href="/clubs/burrfriends/games" className="mb-4 inline-block" style={{ color: 'var(--fire-1)' }}>
        ← Back
      </Link>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
        <Image src="/FRAMEDL.png" alt="FRAMEDL" width={400} height={400} style={{ maxWidth: '100%', height: 'auto', borderRadius: '16px' }} priority />
      </div>
      <p style={{ color: 'var(--text-1)', marginBottom: '16px', textAlign: 'center' }}>Play FRAMEDL, submit your result here.</p>

      {error && <p style={{ color: 'var(--ember-2)', marginBottom: '12px' }}>{error}</p>}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={handlePlayFramedl}
          className="btn-primary"
          style={{ display: 'inline-block' }}
        >
          Play FRAMEDL
        </button>
        <button
          type="button"
          onClick={handleShare}
          className="btn-secondary"
          style={{ display: 'inline-block' }}
        >
          Share
        </button>
        <button
          type="button"
          onClick={handleCopyGameUrl}
          className="btn-secondary"
          style={{ display: 'inline-block', padding: '6px 12px', fontSize: '0.875rem', minHeight: 'auto' }}
        >
          {linkCopied ? 'Copied!' : 'Copy link'}
        </button>
      </div>

      {/* Phase 12.1: How to Play FRAMEDL — collapsible, collapsed by default */}
      <section style={{ marginBottom: '24px', padding: '16px', background: 'var(--bg-2)', borderRadius: '8px' }}>
        <div
          className="neon-teal-header"
          onClick={() => setHowToPlayOpen(!howToPlayOpen)}
          style={{ marginBottom: howToPlayOpen ? '12px' : 0 }}
        >
          <span style={{ fontSize: '0.75rem', transition: 'transform 0.2s', display: 'inline-block', transform: howToPlayOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>&#9654;</span>
          How to Play FRAMEDL
        </div>
        {howToPlayOpen && (
          <>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-1)', marginBottom: '8px' }}>
              <strong>Objective:</strong> Guess the hidden 5-letter word in 6 tries or less. Each guess must be a valid English word.
            </p>
            <ul style={{ fontSize: '0.875rem', color: 'var(--text-1)', marginLeft: '16px', marginBottom: '12px', listStyle: 'none', padding: 0 }}>
              <li style={{ marginBottom: '4px' }}>🟩 <strong>Green</strong> = Correct letter in the right spot</li>
              <li style={{ marginBottom: '4px' }}>🟨 <strong>Yellow</strong> = Correct letter in the wrong spot</li>
              <li style={{ marginBottom: '4px' }}>⬜ <strong>Gray</strong> = Letter not in the word</li>
            </ul>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-1)' }}>
              <strong>Tips:</strong> Start with common vowels (A, E, I, O, U). Use different letters in your first few guesses. Letters can appear more than once!
            </p>
          </>
        )}
      </section>

      {authStatus !== 'authed' ? (
        <p style={{ color: 'var(--text-1)' }}>Ineligible to play this game.</p>
      ) : !status?.registered ? (
        <p style={{ color: 'var(--text-1)' }}>
          {status?.registrationClosed
            ? 'You are not registered for BETR GAMES and registration is closed.'
            : (
                <>
                  Register for BETR GAMES first.{' '}
                  <Link href="/clubs/burrfriends/games" style={{ color: 'var(--fire-1)' }}>
                    Go to games
                  </Link>
                </>
              )}
        </p>
      ) : !status?.canSubmit ? (
        <div style={{ marginBottom: '20px', padding: '12px 16px', background: 'var(--bg-2)', borderRadius: '8px', border: '1px solid var(--stroke)' }}>
          <p style={{ margin: 0, fontSize: '1rem', color: 'var(--text-1)' }}>
            {status?.rejected
              ? 'Your BETR GAMES registration was not approved.'
              : 'Your BETR GAMES registration is pending approval. You\u2019ll be able to play once an admin approves your registration.'}
          </p>
        </div>
      ) : (
        <>
          {/* Plan 12.11: When round is closed (no open round), show message; include zero rounds */}
          {Array.isArray(activeRounds) && !activeRounds.some((r) => r.status === 'open') && (
            <div style={{ marginBottom: '20px', padding: '12px 16px', background: 'var(--bg-2)', borderRadius: '8px', border: '1px solid var(--stroke)' }}>
              <p style={{ margin: 0, fontSize: '1rem', color: 'var(--text-1)' }}>
                This game has been closed for submissions and the results are in process.
              </p>
            </div>
          )}
          {/* Plan 12.18: Persistent advantage block (myBestScore ≤ 2) — only for users who earned it */}
          {status?.myBestScore != null && status.myBestScore <= 2 && (
            <div style={{ marginBottom: '20px', padding: '16px', background: 'rgba(20, 184, 166, 0.12)', borderRadius: '8px', border: NEON_TEAL_BORDER, boxShadow: NEON_TEAL_GLOW }}>
              <p style={{ margin: 0, marginBottom: '12px', fontSize: '1rem', color: 'var(--text-1)' }}>
                {advantageCopyJsx}
              </p>
              <button onClick={handleOpenPractice} className="btn-primary" style={{ minWidth: '100px' }}>
                Practice
              </button>
            </div>
          )}
          {/* 12.17.3: Your best score displayed prominently above the submit form */}
          {(status?.myBestScore != null || status?.myRank) && (
            <div style={{ marginBottom: '20px', padding: '12px 16px', background: 'rgba(20, 184, 166, 0.1)', borderRadius: '8px', border: '1px solid rgba(20, 184, 166, 0.3)' }}>
              <p style={{ margin: 0, fontSize: '1rem' }}>
                Your best: <strong style={{ color: 'var(--fire-1)' }}>{status?.myBestScore === 7 ? 'X' : (status?.myBestScore ?? '—')} attempts</strong>
                {status?.myRank != null && <> · Rank: <strong style={{ color: 'var(--fire-1)' }}>#{status.myRank}</strong></>}
              </p>
            </div>
          )}

          <section style={{ marginBottom: '24px' }}>
            <h2 className="neon-teal-header" style={{ marginBottom: '8px', cursor: 'default' }}>Submit Result</h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-1)', marginBottom: '12px' }}>
              Provide your attempts (1-6, or X if you didn&apos;t solve it) and exactly one: a screenshot of your FRAMEDL result, or a cast URL where you shared your result.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '400px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px' }}>Your attempts (1-6, or X)</label>
                <input
                  type="text"
                  placeholder="1-6 or X"
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                  style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '6px', width: '100%', color: '#1a1a1a' }}
                />
              </div>
              <div>
                <span style={{ fontSize: '0.875rem', marginRight: '8px' }}>Verify with:</span>
                <button
                  type="button"
                  onClick={() => { setProofKind('screenshot'); setCastUrl(''); }}
                  style={{
                    marginRight: '8px',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: `1px solid ${proofKind === 'screenshot' ? 'var(--fire-1)' : '#555'}`,
                    background: proofKind === 'screenshot' ? 'rgba(255,100,50,0.15)' : 'transparent',
                    color: proofKind === 'screenshot' ? 'var(--fire-1)' : 'var(--text-1)',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                  }}
                >
                  Screenshot
                </button>
                <button
                  type="button"
                  onClick={() => { setProofKind('cast'); setScreenshotFile(null); }}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: `1px solid ${proofKind === 'cast' ? 'var(--fire-1)' : '#555'}`,
                    background: proofKind === 'cast' ? 'rgba(255,100,50,0.15)' : 'transparent',
                    color: proofKind === 'cast' ? 'var(--fire-1)' : 'var(--text-1)',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                  }}
                >
                  Cast link
                </button>
              </div>
              {proofKind === 'screenshot' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px' }}>Upload a screenshot of your result</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => { const f = e.target.files?.[0]; setScreenshotFile(f || null); }}
                    style={{ fontSize: '0.875rem' }}
                  />
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-1)', marginTop: '4px' }}>Screenshot the FRAMEDL result screen.</p>
                </div>
              )}
              {proofKind === 'cast' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px' }}>Paste the link to a cast where you shared your result</label>
                  <input
                    type="text"
                    placeholder="https://warpcast.com/.../0x... or cast hash"
                    value={castUrl}
                    onChange={(e) => setCastUrl(e.target.value)}
                    style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '6px', width: '100%', color: '#1a1a1a' }}
                  />
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-1)', marginTop: '4px' }}>Share your FRAMEDL result in a cast, then paste the cast link here.</p>
                </div>
              )}
              {/* Neon arrow pointing to submit button */}
              <div className="neon-arrow" style={{ alignSelf: 'flex-start', paddingLeft: '16px' }}>
                ▼
              </div>
              <button onClick={handleSubmit} disabled={submitting} className="btn-primary" style={{ alignSelf: 'flex-start' }}>
                {submitting ? 'Submitting…' : 'Submit'}
              </button>
            </div>
            {submitError && <p style={{ color: 'var(--ember-2)', marginTop: '8px', fontSize: '0.875rem' }}>{submitError}</p>}
          </section>
        </>
      )}

      <section style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1rem', marginBottom: '8px' }}>Leaderboard</h2>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-1)', marginTop: '-4px', marginBottom: '8px' }}>
          Score a 2 or less to receive an advantage on the next game
        </p>
        {leaderboard.length === 0 ? (
          <p style={{ color: 'var(--text-1)' }}>No results yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #333' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>#</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>Player</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px' }}>Attempts</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>Proof</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((e, i) => {
                  const isDnp = e.best_score === null;
                  const nextEntry = leaderboard[i + 1];
                  // Show neon divider between score <=2 and >=3 (or DNP)
                  const showDivider = !isDnp && e.best_score != null && e.best_score <= 2 && nextEntry && (nextEntry.best_score === null || nextEntry.best_score >= 3);
                  return (
                    <React.Fragment key={e.fid}>
                      <tr style={{ borderBottom: '1px solid #222', opacity: isDnp ? 0.5 : 1 }}>
                        <td style={{ padding: '6px 8px' }}>{isDnp ? '\u2014' : e.rank}</td>
                        <td style={{ padding: '6px 8px' }}>
                          {e.pfp_url && <img src={e.pfp_url} alt="" style={{ width: 20, height: 20, borderRadius: 10, marginRight: 6, verticalAlign: 'middle' }} />}
                          {e.display_name || e.username || `FID ${e.fid}`}
                        </td>
                        <td style={{ textAlign: 'right', padding: '6px 8px' }}>{isDnp ? 'DNP' : (e.best_score === 7 ? 'X' : e.best_score)}</td>
                        <td style={{ padding: '6px 8px' }}>
                          {isDnp ? '\u2014' : (e.best_cast_url ? <a href={e.best_cast_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--fire-1)' }}>Cast</a> : 'Screenshot')}
                        </td>
                      </tr>
                      {showDivider && (
                        <tr>
                          <td colSpan={4} style={{ padding: 0 }}>
                            <div className="neon-teal-divider" />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isAdmin && (
        <section>
          {activeRounds.some((r) => r.status === 'open') && (
            <>
              <button
                onClick={handleCloseRound}
                disabled={closingRound}
                className="btn-secondary"
                style={{ marginBottom: '12px', marginRight: '12px' }}
              >
                {closingRound ? 'Closing…' : 'Close round'}
              </button>
              {closeRoundError && <p style={{ color: 'var(--ember-2)', fontSize: '0.875rem', marginBottom: '12px' }}>{closeRoundError}</p>}
            </>
          )}
          {roundToCancel && (
            <>
              <button
                onClick={() => setShowCancelConfirm(true)}
                disabled={cancellingRound}
                className="btn-secondary"
                style={{ marginBottom: '12px', marginRight: '12px' }}
              >
                {cancellingRound ? 'Cancelling…' : 'Cancel round'}
              </button>
              {cancelRoundError && <p style={{ color: 'var(--ember-2)', fontSize: '0.875rem', marginBottom: '12px' }}>{cancelRoundError}</p>}
            </>
          )}
          {roundToSettle && (
            <>
              <div style={{ marginTop: '16px', padding: '12px', background: 'var(--bg-2)', borderRadius: '8px', border: '1px solid var(--stroke)' }}>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-1)', margin: '0 0 8px 0' }}>Settle round (advantage only): mark as settled so the round appears in history. No BETR payout. Winners = everyone who scored 1 or 2 (single 1st place).</p>
                {winnersToSettle.length === 0 ? (
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-2)' }}>No winners (need at least one player with score 1 or 2).</p>
                ) : (
                  <>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-1)', marginBottom: '12px' }}>
                      <strong>Winners (score 1 or 2):</strong> {winnersToSettle.map((s) => s.display_name || s.username || `FID ${s.fid}`).join(', ')}
                    </div>
                    <button onClick={handleSettleRound} disabled={settling} className="btn-primary" style={{ fontSize: '0.875rem' }}>
                      {settling ? 'Settling…' : 'Settle round (no payout)'}
                    </button>
                    {settleError && <p style={{ color: 'var(--ember-2)', fontSize: '0.875rem', marginTop: '8px' }}>{settleError}</p>}
                  </>
                )}
              </div>
            </>
          )}
          <p style={{ fontSize: '0.875rem', color: 'var(--text-1)', marginTop: '8px' }}>Submitters: {submitters.length}</p>
        </section>
      )}

      {/* Plan 12.11: Cancel round confirmation modal */}
      {showCancelConfirm && roundToCancel && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowCancelConfirm(false)}
        >
          <div
            style={{
              background: '#1a1a1a',
              padding: '24px 32px',
              borderRadius: '12px',
              maxWidth: '400px',
              textAlign: 'center',
              border: '1px solid #333',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ marginBottom: '20px', fontSize: '1rem', color: 'var(--text-1)' }}>
              Cancel this round? This cannot be undone. The round will no longer appear as active.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button onClick={handleCancelRoundConfirm} className="btn-primary" style={{ minWidth: '80px' }}>
                Yes, cancel round
              </button>
              <button onClick={() => setShowCancelConfirm(false)} className="btn-secondary" style={{ minWidth: '80px' }}>
                No
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 12.17.2: Submit result modal — zIndex 1001 so it appears above advantage modal (1000) when both open */}
      {showResultModal && resultModalData && (
        <div 
          style={{ 
            position: 'fixed', 
            inset: 0, 
            background: 'rgba(0,0,0,0.75)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            zIndex: 1001 
          }}
          onClick={() => {
            setShowResultModal(false);
            if (resultModalData?.success && resultModalData?.score != null && resultModalData.score <= 2) {
              setShowAdvantageModal(true);
            }
          }}
        >
          <div 
            style={{ 
              background: '#1a1a1a', 
              padding: '24px 32px', 
              borderRadius: '12px', 
              maxWidth: '400px', 
              textAlign: 'center',
              border: '1px solid #333'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {resultModalData.success ? (
              <>
                <h3 style={{ color: 'var(--fire-1)', marginBottom: '16px', fontSize: '1.25rem' }}>
                  {resultModalData.isNewBest ? '🎉 New Personal Best!' : '✓ Submitted!'}
                </h3>
                <p style={{ marginBottom: '12px', fontSize: '1rem' }}>
                  Thank you for submitting. Your score of <strong style={{ color: 'var(--fire-1)' }}>{resultModalData.score === 7 ? 'X' : resultModalData.score}</strong> has been added to the leaderboard. Results will be shared when the game is closed.
                </p>
                {resultModalData.rank != null && (
                  <p style={{ marginBottom: '0', fontSize: '1rem' }}>
                    Your rank: <strong style={{ color: 'var(--fire-1)' }}>#{resultModalData.rank}</strong>
                  </p>
                )}
              </>
            ) : (
              <>
                <h3 style={{ color: 'var(--ember-2)', marginBottom: '16px', fontSize: '1.25rem' }}>Submission Failed</h3>
                <p style={{ marginBottom: '0', fontSize: '0.9rem', color: 'var(--text-1)' }}>{resultModalData.error}</p>
              </>
            )}
            <button 
              onClick={() => {
                setShowResultModal(false);
                if (resultModalData?.success && resultModalData?.score != null && resultModalData.score <= 2) {
                  setShowAdvantageModal(true);
                }
              }} 
              className="btn-primary" 
              style={{ marginTop: '20px', minWidth: '100px' }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Plan 12.18: Advantage modal (score ≤ 2) — zIndex 1000 so result modal (1001) appears on top when both open */}
      {showAdvantageModal && (
        <div 
          style={{ 
            position: 'fixed', 
            inset: 0, 
            background: 'rgba(0,0,0,0.75)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            zIndex: 1000 
          }}
          onClick={() => setShowAdvantageModal(false)}
        >
          <div 
            style={{ 
              background: '#1a1a1a', 
              padding: '24px 32px', 
              borderRadius: '12px', 
              maxWidth: '420px', 
              textAlign: 'center',
              border: NEON_TEAL_BORDER,
              boxShadow: NEON_TEAL_GLOW
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ marginBottom: '16px', fontSize: '1rem', color: 'var(--text-1)' }}>
              {advantageCopyJsx}
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={handleOpenPractice} className="btn-primary" style={{ minWidth: '100px' }}>
                Practice
              </button>
              <button onClick={() => setShowAdvantageModal(false)} className="btn-secondary" style={{ minWidth: '80px' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Plan 12.18: Practice in-app overlay — iframe, Close, optional "Open in new window" fallback */}
      {showPracticeOverlay && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1002,
          }}
          onClick={() => setShowPracticeOverlay(false)}
        >
          <div
            style={{
              background: '#1a1a1a',
              borderRadius: '12px',
              padding: '16px',
              border: NEON_TEAL_BORDER,
              boxShadow: NEON_TEAL_GLOW,
              width: 'min(90vw, 720px)',
              height: 'min(85vh, 560px)',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-1)' }}>Practice</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={handleOpenPracticeInNewWindow}
                  className="btn-secondary"
                  style={{ fontSize: '0.75rem', padding: '4px 8px', minHeight: 'auto' }}
                >
                  Open in new window
                </button>
                <button type="button" onClick={() => setShowPracticeOverlay(false)} className="btn-secondary" style={{ minWidth: '60px' }}>
                  Close
                </button>
              </div>
            </div>
            <iframe
              src={REMIX_PRACTICE_URL}
              title="Practice"
              style={{ flex: 1, width: '100%', minHeight: 0, border: 'none', borderRadius: '8px' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
