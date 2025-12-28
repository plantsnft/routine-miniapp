'use client';

import { useState, useEffect, use, useRef } from 'react';
import Link from 'next/link';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { isClubOwnerOrAdmin } from '~/lib/permissions';
import type { Club, Game } from '~/lib/types';
import { getEffectiveMaxParticipants, getGameBadges } from '~/lib/game-registration';
import { RegistrationInfoBadge } from '~/components/RegistrationInfoBadge';
import { JoinHellfireBanner } from '~/components/JoinHellfireBanner';
import { AdminRequests } from '~/components/AdminRequests';
import { HELLFIRE_CLUB_SLUG } from '~/lib/constants';
import { HellfireTitle } from '~/components/HellfireTitle';
import { PaymentButton } from '~/components/PaymentButton';
import { ParticipantListModal } from '~/components/ParticipantListModal';
import { GameCountdownTimer } from '~/components/GameCountdownTimer';
import { isPaidGame } from '~/lib/games';

// Wrapper component to auto-trigger payment when game is set
function PaymentButtonWrapper({ 
  game, 
  playerFid, 
  onSuccess, 
  onError,
  buttonRef 
}: { 
  game: Game; 
  playerFid: number; 
  onSuccess: (txHash: string, password: string | null) => void;
  onError: (error: string) => void;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
}) {
  useEffect(() => {
    // Auto-trigger payment when component mounts (after a small delay to ensure button is rendered)
    const timer = setTimeout(() => {
      if (buttonRef.current) {
        buttonRef.current.click();
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [buttonRef]);

  return (
    <div style={{ position: 'absolute', left: '-9999px', opacity: 0, pointerEvents: 'none' }}>
      <PaymentButton
        game={game}
        playerFid={playerFid}
        onSuccess={onSuccess}
        onError={onError}
        buttonRef={buttonRef}
      />
    </div>
  );
}

export default function ClubGamesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { token, fid, status: authStatus, retry } = useAuth();
  const [club, setClub] = useState<Club | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserFid, setCurrentUserFid] = useState<number | null>(null);
  const [participantCountsByGame, setParticipantCountsByGame] = useState<Record<string, number>>({});
  const [showHistory, setShowHistory] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [showAdminRequests, setShowAdminRequests] = useState(false);
  const [selectedGameForParticipants, setSelectedGameForParticipants] = useState<Game | null>(null);
  const [gameForPayment, setGameForPayment] = useState<Game | null>(null);
  const paymentButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (authStatus === 'loading') {
      // Still loading - wait
      setLoading(true);
      setError(null);
      return;
    }

    if (authStatus === 'authed' && token) {
      loadData();
    } else if (authStatus === 'error') {
      // Auth failed - show retry option
      setError(null); // Clear any previous errors
      setLoading(false);
    }
  }, [slug, authStatus, token, fid]);

  const loadData = async () => {
    if (!token || authStatus !== 'authed') {
      // Don't set error here - let the useEffect handle state
      setLoading(false);
      return;
    }

    try {
      // Fetch club (requires auth)
      const clubsRes = await authedFetch('/api/clubs', { method: 'GET' }, token);
      
      if (!clubsRes.ok) {
        const errorText = await clubsRes.clone().text();
        throw new Error(`Failed to fetch clubs: ${clubsRes.status} ${errorText.substring(0, 100)}`);
      }
      const clubsData = await clubsRes.json();
      const foundClub = clubsData.data?.find((c: Club) => c.slug === slug);
      
      if (!foundClub) {
        setError('Club not found');
        return;
      }
      setClub(foundClub);

      // Fetch games (requires auth) - force fresh data, no cache
      const gamesRes = await authedFetch(`/api/games?club_id=${foundClub.id}`, { 
        method: 'GET',
        cache: 'no-store',
      }, token);
      if (!gamesRes.ok) throw new Error('Failed to fetch games');
      const gamesData = await gamesRes.json();
      const gamesList = gamesData.data || [];
      setGames(gamesList);

      // Get current user FID from auth context
      if (fid) {
        setCurrentUserFid(fid);
        
        // Use participant_count and viewer_has_joined from games API response (no N+1 queries)
        // These fields are correctly keyed by gameId from the server
        const countsMap: Record<string, number> = {};
        
        for (const game of gamesList) {
          // Use participant_count from API (already filtered to status='joined')
          countsMap[game.id] = game.participant_count ?? 0;
        }
        
        setParticipantCountsByGame(countsMap);
        
        // Check admin status and load pending requests count
        try {
          const adminRes = await authedFetch('/api/admin/status', { method: 'GET' }, token);
          if (adminRes.ok) {
            const adminData = await adminRes.json();
            if (adminData.ok && adminData.data) {
              setIsAdmin(adminData.data.isAdmin || false);
              
              // If admin, load pending requests count
              if (adminData.data.isAdmin) {
                const requestsRes = await authedFetch('/api/game-requests?status=pending', { method: 'GET' }, token);
                if (requestsRes.ok) {
                  const requestsData = await requestsRes.json();
                  if (requestsData.ok && requestsData.data) {
                    setPendingRequestsCount(requestsData.data.length || 0);
                  }
                }
              }
            }
          }
        } catch (err) {
          // Silently fail - admin check is optional
          console.error('Failed to check admin status:', err);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const isOwner = currentUserFid && club && isClubOwnerOrAdmin(currentUserFid, club);

  // Show loading state while auth is loading or data is loading
  if (authStatus === 'loading' || (loading && !club && !error)) {
    return (
      <main className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}>
        <div className="max-w-4xl mx-auto">
          <p style={{ color: 'var(--text-1)' }}>{authStatus === 'loading' ? 'Signing in...' : 'Loading...'}</p>
        </div>
      </main>
    );
  }

  // Show error state with retry if auth failed
  if (authStatus === 'error') {
    return (
      <main className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}>
        <div className="max-w-4xl mx-auto">
          <p className="mb-4" style={{ color: 'var(--ember-2)' }}>Authentication failed. Please try again.</p>
          <button
            onClick={retry}
            className="btn-primary"
          >
            Retry sign-in
          </button>
          <Link href="/" className="mt-4 ml-4 inline-block text-ember hover:underline transition-colors" style={{ color: 'var(--ember-1)' }}>
            ← Back to Home
          </Link>
        </div>
      </main>
    );
  }

  // Show error if club not found or other error
  if (error || !club) {
    return (
      <main className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}>
        <div className="max-w-4xl mx-auto">
          <p style={{ color: 'var(--ember-2)' }}>Error: {error || 'Club not found'}</p>
          <Link href="/" className="mt-4 inline-block text-ember hover:underline transition-colors" style={{ color: 'var(--ember-1)' }}>
            ← Back to Home
          </Link>
        </div>
      </main>
    );
  }

  // Hellfire Club GG URL (same URL that the old green button used)
  // This is the source of truth for the Hellfire club deep link
  const hellfireHref = 'https://clubgg.app.link/nPkZsgIq9Yb';

  // Only show banner for Hellfire club
  const isHellfireClub = slug === HELLFIRE_CLUB_SLUG || club.slug === HELLFIRE_CLUB_SLUG;

  // Banner items for rotating carousel (only used for Hellfire club)
  const bannerItems = isHellfireClub ? [
    {
      title: 'Request to join the group chat',
      subtitle: 'Send a message to Tormental',
      isAction: true,
      onClick: async () => {
        // This will be handled in the banner component using useMiniApp
        // The actual composeCast call happens there
      },
    },
    {
      title: 'View Hellfire Poker Club on Club GG',
      href: hellfireHref,
    },
  ] : [];

  return (
    <main className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}>
      <div className="max-w-4xl mx-auto">
        {/* Header - centered at top */}
        <div className="text-center mb-2" style={{ minHeight: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px', maxWidth: '100%', overflow: 'hidden', boxSizing: 'border-box' }}>
          {slug === HELLFIRE_CLUB_SLUG ? (
            <div style={{ width: '100%', maxWidth: '100%', overflow: 'hidden', boxSizing: 'border-box' }}>
              <HellfireTitle text="Hellfire Poker Club" />
            </div>
          ) : (
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-0)' }}>
              {club.name}
            </h1>
          )}
          {slug !== HELLFIRE_CLUB_SLUG && (
            <Link href="/clubs" className="text-ember hover:underline mt-2 inline-block transition-colors" style={{ color: 'var(--ember-1)' }}>
              ← Back to Clubs
            </Link>
          )}
        </div>

        {/* Buttons row - Create/Request, Previous Games, and Club GG */}
        <div className="text-center mb-6" style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {isAdmin ? (
            <>
                    <Link
                      href={`/clubs/${slug}/games/new`}
                      className="btn-primary"
                      style={{ 
                        padding: '5px 10px', 
                        fontSize: '9px', // 35% smaller (14px * 0.65 = 9.1px, rounded to 9px)
                        display: 'inline-block',
                        minHeight: 'auto'
                      }}
                    >
                      Create New Game
                    </Link>
              {pendingRequestsCount > 0 && (
                <button
                  onClick={() => setShowAdminRequests(true)}
                  className="btn-primary relative"
                  style={{ 
                    padding: '5px 10px',
                    fontSize: '9px', // 35% smaller (14px * 0.65 = 9.1px, rounded to 9px)
                    minHeight: 'auto',
                    background: 'linear-gradient(135deg, var(--ember-0) 0%, var(--ember-1) 100%)'
                  }}
                >
                  Requests ({pendingRequestsCount})
                </button>
              )}
            </>
          ) : (
            <button
              onClick={async () => {
                try {
                  const { sdk } = await import('@farcaster/miniapp-sdk');
                  if (sdk?.actions?.composeCast) {
                    // Get the mini app URL - use the current page URL or a specific games page
                    const miniAppUrl = typeof window !== 'undefined' 
                      ? window.location.origin + '/clubs/hellfire/games'
                      : 'https://poker-swart.vercel.app/clubs/hellfire/games';
                    
                    await sdk.actions.composeCast({
                      text: 'i would like to play hellfire poker club who is with me? CC: @tormental',
                      embeds: [miniAppUrl],
                    });
                  } else {
                    alert('This feature requires Warpcast. Please open this mini app in Warpcast to share.');
                  }
                } catch (error) {
                  console.error('Failed to open cast composer:', error);
                  alert('Failed to open cast composer. Please try again.');
                }
              }}
              className="btn-primary"
              style={{ 
                padding: '5px 10px',
                fontSize: '9px', // 35% smaller (14px * 0.65 = 9.1px, rounded to 9px)
                display: 'inline-block',
                minHeight: 'auto'
              }}
            >
              Request a Game
            </button>
          )}
          
          {/* Previous Games button */}
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="btn-secondary"
            style={{ 
              padding: '5px 10px', 
              fontSize: '9px',
              minHeight: 'auto'
            }}
          >
            {showHistory ? '← Back to Active Games' : 'Previous Games'}
          </button>
          
          {/* Club GG button - only for Hellfire club */}
          {isHellfireClub && (
            <Link
              href={hellfireHref}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary"
              style={{ 
                padding: '5px 10px', 
                fontSize: '9px',
                display: 'inline-block',
                minHeight: 'auto'
              }}
            >
              Club GG
            </Link>
          )}
        </div>


        {/* Admin Requests Modal (admin only) */}
        <AdminRequests
          isOpen={showAdminRequests}
          onClose={() => {
            setShowAdminRequests(false);
            // Reload pending count
            if (token && isAdmin) {
              authedFetch('/api/game-requests?status=pending', { method: 'GET' }, token)
                .then(r => r.json())
                .then(data => {
                  if (data.ok && data.data) {
                    setPendingRequestsCount(data.data.length || 0);
                  }
                })
                .catch(() => {});
            }
          }}
        />

        {(() => {
          // Filter games based on history view
          const activeGames = games.filter((g: Game) => 
            g.status !== 'cancelled' && g.status !== 'settled' && g.status !== 'completed'
          );
          const historyGames = games.filter((g: Game) => 
            g.status === 'cancelled' || g.status === 'settled' || g.status === 'completed'
          );
          const displayGames = showHistory ? historyGames : activeGames;

          if (displayGames.length === 0) {
            return (
              <div className="hl-card text-center">
                <p className="text-primary mb-4" style={{ color: 'var(--text-1)' }}>
                  {showHistory ? 'No game history yet.' : 'No games yet.'}
                </p>
                {isOwner && !showHistory && (
                  <Link
                    href={`/clubs/${slug}/games/new`}
                    className="btn-primary"
                  >
                    Create First Game
                  </Link>
                )}
              </div>
            );
          }

          return (
            <div className="space-y-4">
              {displayGames.map((game) => {
                const participantCount = game.participant_count ?? participantCountsByGame[game.id] ?? 0;
                const badges = getGameBadges(game, participantCount);
                // Pulsing glow is based on registration being open, not "In progress" status
                const registrationOpen = (game as any).registrationOpen !== false; // Default to true if not set
                const isActive = registrationOpen && badges.primaryLabel !== 'Settled' && badges.primaryLabel !== 'Cancelled' && badges.primaryLabel !== 'Closed';
                const isInactive = badges.primaryLabel && (badges.primaryLabel === 'Settled' || badges.primaryLabel === 'Cancelled' || badges.primaryLabel === 'Closed');
                // Check if user has joined - if so, use green glow instead of red
                const hasJoined = game.viewer_has_joined === true;
                
                return (
              <Link
                key={game.id}
                href={`/games/${game.id}`}
                className="block"
                style={{ textDecoration: 'none', cursor: 'pointer' }}
              >
                <div
                  className={`hl-card ${hasJoined && isActive ? 'hl-card--joined' : isActive ? 'hl-card--active' : isInactive ? 'hl-card--inactive' : ''}`}
                  style={{ transition: 'transform 0.2s ease-out, box-shadow 0.2s ease-out' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                      <h2 className="text-lg font-semibold text-primary" style={{ color: 'var(--text-0)', fontWeight: 600, margin: 0 }}>{game.title || 'Untitled Game'}</h2>
                      <GameCountdownTimer game={game} />
                    </div>
                    {game.description && (
                      <p className="text-sm text-secondary mb-2" style={{ color: 'var(--text-1)' }}>{game.description}</p>
                    )}
                    <div className="flex items-center gap-2 mb-2" style={{ flexWrap: 'nowrap' }}>
                      {badges.primaryLabel && (
                        <span className={`hl-badge ${
                          badges.primaryLabel === 'Open' ? '' :
                          badges.primaryLabel === 'Registration open' ? 'hl-badge--fire' :
                          badges.primaryLabel === 'In progress' ? 'hl-badge--fire' :
                          badges.primaryLabel === 'Registration closed' ? 'hl-badge--muted' :
                          badges.primaryLabel === 'Settled' ? 'hl-badge--muted' :
                          badges.primaryLabel === 'Cancelled' ? 'hl-badge--muted' :
                          badges.primaryLabel === 'Closed' ? 'hl-badge--muted' :
                          ''
                        }`}>
                          {badges.primaryLabel}
                        </span>
                      )}
                      {(badges.primaryLabel === 'Registration open' || badges.primaryLabel === 'Open') && (
                        <RegistrationInfoBadge game={game} participantCount={participantCount} />
                      )}
                      {currentUserFid && isPaidGame(game) && game.entry_fee_amount && !game.viewer_has_joined ? (
                        <span 
                          className={`hl-badge ${game.gating_type === 'open' ? '' : 'hl-badge--fire'}`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const registrationOpen = (game as any).registrationOpen !== false;
                            if (registrationOpen) {
                              setGameForPayment(game);
                            }
                          }}
                          style={{ cursor: 'pointer' }}
                        >
                          {game.gating_type === 'open' ? 'Open' : `$${game.entry_fee_amount || 0} Entry Fee`}
                        </span>
                      ) : (
                        <span className={`hl-badge ${
                          game.gating_type === 'open' ? '' : 'hl-badge--fire'
                        }`}>
                          {game.gating_type === 'open' ? 'Open' : `$${game.entry_fee_amount || 0} Entry Fee`}
                        </span>
                      )}
                    </div>
                    {/* Participant count and spots open - clickable to show participants */}
                    <div 
                      className="text-xs text-tertiary mb-2 flex items-center gap-2 flex-wrap" 
                      style={{ 
                        color: 'var(--text-2)',
                        cursor: 'pointer',
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setSelectedGameForParticipants(game);
                      }}
                    >
                      <span>
                        {(() => {
                          const participantCount = game.participant_count ?? participantCountsByGame[game.id] ?? 0;
                          // Use effectiveMaxParticipants from API (enriched by enrichGameWithRegistrationStatus), 
                          // fallback to helper function if missing (shouldn't happen in normal flow)
                          const effectiveMax = game.effectiveMaxParticipants ?? getEffectiveMaxParticipants({
                            game_type: game.game_type,
                            max_participants: game.max_participants,
                          });
                          // Use spotsOpen from API, fallback to calculated value
                          const spots = game.spotsOpen ?? (effectiveMax !== null && effectiveMax !== undefined ? Math.max(effectiveMax - participantCount, 0) : null);
                          
                          if (effectiveMax !== null && effectiveMax !== undefined) {
                            return (
                              <>
                                {participantCount}/{effectiveMax} joined • {spots} spots open
                              </>
                            );
                          } else {
                            // Only show "Unlimited" for truly unlimited games (legacy edge case, not large_event)
                            return <span>Unlimited spots</span>;
                          }
                        })()}
                      </span>
                      {/* Already Joined Badge - inline with participant count, green style */}
                      {currentUserFid && (() => {
                        // Use viewer_has_joined from API response (correctly keyed by gameId)
                        const hasJoined = game.viewer_has_joined === true;
                        // Only show badge if viewer has joined THIS specific game
                        return hasJoined ? (
                          <span 
                            className="hl-badge hl-badge--green" 
                            style={{ cursor: 'default' }} 
                            onClick={(e) => e.stopPropagation()}
                          >
                            ✓ You&apos;ve joined
                          </span>
                        ) : null;
                      })()}
                    </div>
                  </div>
                </div>
              </Link>
              );
              })}
            </div>
          );
        })()}


        {/* Join Hellfire Banner - moved below games (only for Hellfire club) */}
        {isHellfireClub && bannerItems.length > 0 && (
          <div className="mb-4">
            <JoinHellfireBanner items={bannerItems} />
          </div>
        )}

        {/* Participant List Modal */}
        {selectedGameForParticipants && (
          <ParticipantListModal
            isOpen={!!selectedGameForParticipants}
            onClose={() => setSelectedGameForParticipants(null)}
            gameId={selectedGameForParticipants.id}
            gameTitle={selectedGameForParticipants.title || undefined}
          />
        )}

        {/* Hidden PaymentButton - triggered when entry fee badge is clicked */}
        {gameForPayment && currentUserFid && (
          <PaymentButtonWrapper
            game={gameForPayment}
            playerFid={currentUserFid}
            onSuccess={() => {
              setGameForPayment(null);
              loadData();
            }}
            onError={(error) => {
              alert(error);
              console.error('Payment error:', error);
              setGameForPayment(null);
            }}
            buttonRef={paymentButtonRef}
          />
        )}
      </div>
    </main>
  );
}
