'use client';

import { useState, useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import type { GameParticipant } from '~/lib/types';

interface ParticipantListModalProps {
  isOpen: boolean;
  onClose: () => void;
  gameId: string;
  gameTitle?: string;
}

interface ParticipantWithName extends GameParticipant {
  username?: string;
  pfpUrl?: string;
}

export function ParticipantListModal({ isOpen, onClose, gameId, gameTitle }: ParticipantListModalProps) {
  const { token } = useAuth();
  const [participants, setParticipants] = useState<ParticipantWithName[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !token) return;

    const fetchParticipants = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Fetch participants
        const res = await authedFetch(`/api/games/${gameId}/participants`, {
          method: 'GET',
          cache: 'no-store',
        }, token);

        if (!res.ok) {
          throw new Error('Failed to fetch participants');
        }

        const data = await res.json();
        if (!data.ok || !data.data) {
          throw new Error('Invalid response');
        }

        const participantsData: GameParticipant[] = data.data;
        
        // Filter to only show participants who have paid (joined/paid status or have tx_hash)
        const activeParticipants = participantsData.filter(p => {
          const hasPaid = p.status === 'joined' || p.status === 'paid' || p.payment_status === 'paid' || !!(p as any)?.tx_hash;
          return hasPaid;
        });

        // Fetch usernames from Neynar (batch fetch)
        // Note: participants API returns 'fid' field (not 'player_fid')
        const fids = activeParticipants.map(p => {
          // The API returns 'fid' directly in the participant object
          return (p as any).fid || (p as any).player_fid;
        }).filter((fid): fid is number => typeof fid === 'number' && fid > 0);
        
        if (fids.length > 0) {
          try {
            // Fetch usernames via bulk endpoint
            const neynarRes = await authedFetch(`/api/users/bulk?fids=${fids.join(',')}`, {
              method: 'GET',
            }, token);

            if (neynarRes.ok) {
              const neynarData = await neynarRes.json();
              const userMap = new Map();
              
              if (neynarData.ok && neynarData.data) {
                neynarData.data.forEach((user: any) => {
                  userMap.set(user.fid, {
                    username: user.username || user.display_name,
                    pfpUrl: user.avatar_url || user.pfp_url,
                  });
                });
              }

              // Hydrate participants with usernames
              const hydrated = activeParticipants.map(p => {
                // The API returns 'fid' directly in the participant object
                const fid = (p as any).fid || (p as any).player_fid;
                const userInfo = userMap.get(fid);
                return {
                  ...p,
                  username: userInfo?.username,
                  pfpUrl: userInfo?.pfpUrl,
                };
              });

              setParticipants(hydrated);
            } else {
              // If fetch fails, just show FIDs
              setParticipants(activeParticipants);
            }
          } catch (neynarErr) {
            console.warn('Failed to fetch usernames:', neynarErr);
            // Continue with just FIDs if fetch fails
            setParticipants(activeParticipants);
          }
        } else {
          setParticipants([]);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load participants');
        console.error('Error fetching participants:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchParticipants();
  }, [isOpen, gameId, token]);

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
      }}
      onClick={onClose}
    >
      <div
        className="hl-card"
        style={{
          maxWidth: '90%',
          width: '400px',
          maxHeight: '80vh',
          overflow: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-0)' }}>
            {gameTitle ? `Participants - ${gameTitle}` : 'Participants'}
          </h2>
          <button
            onClick={onClose}
            className="text-2xl leading-none"
            style={{ color: 'var(--text-1)' }}
          >
            ×
          </button>
        </div>

        {loading && (
          <p style={{ color: 'var(--text-1)' }}>Loading participants...</p>
        )}

        {error && (
          <p style={{ color: 'var(--fire-2)' }}>Error: {error}</p>
        )}

        {!loading && !error && (
          <>
            {participants.length === 0 ? (
              <p style={{ color: 'var(--text-1)' }}>No participants yet.</p>
            ) : (
              <div className="space-y-2">
                {participants.map((participant) => {
                  // The API returns 'fid' directly in the participant object
                  const fid = (participant as any).fid || (participant as any).player_fid || participant.player_fid;
                  return (
                    <div
                      key={participant.id}
                      className="flex items-center gap-3 p-2 rounded"
                      style={{ backgroundColor: 'var(--bg-1)' }}
                    >
                      {participant.pfpUrl && (
                        <img
                          src={participant.pfpUrl}
                          alt={participant.username || `FID ${fid}`}
                          className="w-8 h-8 rounded-full"
                          style={{ objectFit: 'cover' }}
                          onError={(e) => {
                            // Hide image if it fails to load
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      )}
                      <div className="flex-1">
                        <p style={{ color: 'var(--text-0)', fontWeight: 500 }}>
                          {participant.username || `FID ${fid}`}
                        </p>
                        {participant.status === 'paid' && (
                          <p className="text-xs" style={{ color: 'var(--text-2)' }}>
                            Paid
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

