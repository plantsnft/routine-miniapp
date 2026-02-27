'use client';

import { useState } from 'react';
import { authedFetch } from '~/lib/authedFetch';
import { getPasteText } from '~/lib/pasteSupport';

type Game = {
  id: string;
  status: string;
  turn_time_seconds: number;
  turn_order: number[];
  eliminated_fids: number[];
  signups?: Array<{
    fid: number;
    username: string | null;
    display_name: string | null;
    pfp_url: string | null;
  }>;
  prize_amount: number;
};

type JengaAdminControlsProps = {
  game: Game;
  gameId: string;
  token: string;
  onGameUpdate: () => void;
};

const DEFAULT_PFP = 'https://i.imgur.com/1Q9ZQ9u.png';

export default function JengaAdminControls({ game, gameId, token, onGameUpdate }: JengaAdminControlsProps) {
  const [showUpdateTime, setShowUpdateTime] = useState(false);
  const [newTurnTime, setNewTurnTime] = useState<string>('');
  const [updatingTime, setUpdatingTime] = useState(false);
  
  const [showKickPlayer, setShowKickPlayer] = useState(false);
  const [selectedKickFid, setSelectedKickFid] = useState<number | null>(null);
  const [kicking, setKicking] = useState(false);
  
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  
  const [showSettle, setShowSettle] = useState(false);
  const [eligiblePlayers, setEligiblePlayers] = useState<Array<{ fid: number; username: string | null; display_name: string | null; pfp_url: string | null }>>([]);
  const [loadingEligible, setLoadingEligible] = useState(false);
  const [selectedWinnerFid, setSelectedWinnerFid] = useState<string>('');
  const [settling, setSettling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load eligible players for settlement
  const loadEligiblePlayers = async () => {
    setLoadingEligible(true);
    try {
      const res = await authedFetch(`/api/jenga/games/${gameId}/eligible-players`, { method: 'GET' }, token).then((r) => r.json());
      if (res?.ok && res?.data) {
        setEligiblePlayers(res.data);
        if (res.data.length > 0) {
          setSelectedWinnerFid(String(res.data[0].fid));
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load eligible players');
    } finally {
      setLoadingEligible(false);
    }
  };

  const handleUpdateTime = async () => {
    const timeSeconds = parseInt(newTurnTime, 10);
    if (isNaN(timeSeconds) || timeSeconds < 60 || timeSeconds > 3600) {
      setError('Turn time must be between 60 and 3600 seconds (1 minute to 1 hour)');
      return;
    }

    setUpdatingTime(true);
    setError(null);

    try {
      const res = await authedFetch(
        `/api/jenga/games/${gameId}/update-turn-time`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ turnTimeSeconds: timeSeconds }),
        },
        token
      ).then((r) => r.json());

      if (res?.ok) {
        setShowUpdateTime(false);
        setNewTurnTime('');
        await onGameUpdate();
      } else {
        setError(res?.error || 'Failed to update turn time');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update turn time');
    } finally {
      setUpdatingTime(false);
    }
  };

  const handleKickPlayer = async () => {
    if (!selectedKickFid) return;

    setKicking(true);
    setError(null);

    try {
      const res = await authedFetch(
        `/api/jenga/games/${gameId}/kick-player`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fid: selectedKickFid }),
        },
        token
      ).then((r) => r.json());

      if (res?.ok) {
        setShowKickPlayer(false);
        setSelectedKickFid(null);
        await onGameUpdate();
      } else {
        setError(res?.error || 'Failed to kick player');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to kick player');
    } finally {
      setKicking(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    setError(null);

    try {
      const res = await authedFetch(`/api/jenga/games/${gameId}/cancel`, { method: 'POST' }, token).then((r) => r.json());

      if (res?.ok) {
        setShowCancelConfirm(false);
        await onGameUpdate();
      } else {
        setError(res?.error || 'Failed to cancel game');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to cancel game');
    } finally {
      setCancelling(false);
    }
  };

  const handleSettle = async () => {
    if (!selectedWinnerFid) {
      setError('Please select a winner');
      return;
    }

    setSettling(true);
    setError(null);

    try {
      const res = await authedFetch(
        `/api/jenga/games/${gameId}/settle`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ winnerFid: parseInt(selectedWinnerFid, 10), confirmWinner: true }),
        },
        token
      ).then((r) => r.json());

      if (res?.ok) {
        setShowSettle(false);
        setSelectedWinnerFid('');
        await onGameUpdate();
      } else {
        setError(res?.error || 'Failed to settle game');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to settle game');
    } finally {
      setSettling(false);
    }
  };

  const allPlayers = (game.signups || []).filter((s) => 
    (game.turn_order || []).includes(s.fid) || (game.eliminated_fids || []).includes(s.fid)
  );

  return (
    <div className="p-4 border rounded bg-gray-50">
      <div className="text-lg font-semibold mb-4">Admin Controls</div>
      
      {error && (
        <div className="mb-4 text-red-500 text-sm">{error}</div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        {game.status === 'in_progress' && (
          <>
            <button
              onClick={() => setShowUpdateTime(true)}
              className="btn-secondary px-4 py-2 rounded"
            >
              Update Turn Time
            </button>
            <button
              onClick={() => setShowKickPlayer(true)}
              className="btn-secondary px-4 py-2 rounded"
            >
              Kick Player
            </button>
          </>
        )}
        {(game.status === 'signup' || game.status === 'in_progress') && (
          <button
            onClick={() => setShowCancelConfirm(true)}
            className="btn-secondary px-4 py-2 rounded"
          >
            Cancel Game
          </button>
        )}
        {(game.status === 'in_progress' || game.status === 'settled') && (
          <button
            onClick={async () => {
              setShowSettle(true);
              await loadEligiblePlayers();
            }}
            className="btn-primary px-4 py-2 rounded"
          >
            Settle Game
          </button>
        )}
      </div>

      {/* Update Turn Time Modal */}
      {showUpdateTime && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowUpdateTime(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-4">Update Turn Time</h3>
            <div className="mb-4">
              <div className="text-sm text-gray-600 mb-2">Current: {Math.floor(game.turn_time_seconds / 60)} minutes</div>
              <input
                type="number"
                min="60"
                max="3600"
                value={newTurnTime}
                onChange={(e) => setNewTurnTime(e.target.value)}
                onPaste={async (e) => {
                  const text = await getPasteText(e);
                  if (text == null || text === '') return;
                  const num = parseInt(text.replace(/,/g, '').trim(), 10);
                  if (Number.isNaN(num) || num < 60 || num > 3600) {
                    e.preventDefault();
                    return;
                  }
                  e.preventDefault();
                  setNewTurnTime(String(num));
                }}
                placeholder="Enter seconds (60-3600)"
                className="w-full px-3 py-2 border rounded"
              />
              <div className="text-xs text-gray-500 mt-1">Range: 60 seconds (1 min) to 3600 seconds (1 hour)</div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowUpdateTime(false)} className="btn-secondary px-4 py-2 rounded">Cancel</button>
              <button onClick={handleUpdateTime} disabled={updatingTime} className="btn-primary px-4 py-2 rounded disabled:opacity-50">
                {updatingTime ? 'Updating...' : 'Update'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Kick Player Modal */}
      {showKickPlayer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowKickPlayer(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-4">Kick Player</h3>
            <div className="mb-4 max-h-64 overflow-y-auto">
              {allPlayers.map((player) => {
                const isEliminated = (game.eliminated_fids || []).includes(player.fid);
                const isCurrent = player.fid === game.turn_order?.[0];
                return (
                  <div
                    key={player.fid}
                    onClick={() => setSelectedKickFid(player.fid)}
                    className={`p-2 border rounded mb-2 cursor-pointer ${selectedKickFid === player.fid ? 'bg-blue-100 border-blue-500' : ''} ${isEliminated ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      <img src={player.pfp_url || DEFAULT_PFP} alt={player.display_name || player.username || `FID ${player.fid}`} className="w-8 h-8 rounded-full" />
                      <div className="flex-1">
                        <div className="font-semibold">{player.display_name || player.username || `FID ${player.fid}`}</div>
                        {isEliminated && <div className="text-xs text-red-500">ELIMINATED</div>}
                        {isCurrent && <div className="text-xs text-blue-500">CURRENT TURN</div>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowKickPlayer(false)} className="btn-secondary px-4 py-2 rounded">Cancel</button>
              <button onClick={handleKickPlayer} disabled={!selectedKickFid || kicking} className="btn-primary px-4 py-2 rounded disabled:opacity-50">
                {kicking ? 'Kicking...' : 'Kick Player'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirm Modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowCancelConfirm(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-4">Cancel Game</h3>
            <p className="mb-4 text-gray-600">Are you sure you want to cancel this game? This action cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowCancelConfirm(false)} className="btn-secondary px-4 py-2 rounded">No</button>
              <button onClick={handleCancel} disabled={cancelling} className="btn-primary px-4 py-2 rounded disabled:opacity-50" style={{ background: 'var(--fire-1)' }}>
                {cancelling ? 'Cancelling...' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settle Game Modal */}
      {showSettle && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowSettle(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-4">Settle Game</h3>
            <div className="mb-4">
              <div className="text-sm text-gray-600 mb-2">Prize: {game.prize_amount} BETR</div>
              {loadingEligible ? (
                <div className="text-center py-4">Loading eligible players...</div>
              ) : eligiblePlayers.length === 0 ? (
                <div className="text-center py-4 text-gray-500">No eligible players</div>
              ) : (
                <div>
                  <label className="block text-sm font-semibold mb-2">Select Winner:</label>
                  <select
                    value={selectedWinnerFid}
                    onChange={(e) => setSelectedWinnerFid(e.target.value)}
                    className="w-full px-3 py-2 border rounded"
                  >
                    {eligiblePlayers.map((player) => (
                      <option key={player.fid} value={String(player.fid)}>
                        {player.display_name || player.username || `FID ${player.fid}`}
                      </option>
                    ))}
                  </select>
                  {selectedWinnerFid && (
                    <div className="mt-2 flex items-center gap-2">
                      <img
                        src={eligiblePlayers.find((p) => String(p.fid) === selectedWinnerFid)?.pfp_url || DEFAULT_PFP}
                        alt="Winner"
                        className="w-8 h-8 rounded-full"
                      />
                      <div className="text-sm">
                        {eligiblePlayers.find((p) => String(p.fid) === selectedWinnerFid)?.display_name ||
                          eligiblePlayers.find((p) => String(p.fid) === selectedWinnerFid)?.username ||
                          `FID ${selectedWinnerFid}`}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowSettle(false)} className="btn-secondary px-4 py-2 rounded">Cancel</button>
              <button
                onClick={handleSettle}
                disabled={!selectedWinnerFid || settling || eligiblePlayers.length === 0}
                className="btn-primary px-4 py-2 rounded disabled:opacity-50"
              >
                {settling ? 'Settling...' : 'Confirm & Settle'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
