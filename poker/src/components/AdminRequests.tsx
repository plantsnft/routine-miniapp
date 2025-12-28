'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { useRouter } from 'next/navigation';
import { formatDate } from '~/lib/utils';

interface GameRequest {
  id: string;
  requester_fid: number;
  status: 'pending' | 'approved' | 'rejected';
  payload: any;
  prefund_tx_hash: string;
  created_game_id: string | null;
  approved_by_fid: number | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

interface AdminRequestsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AdminRequests({ isOpen, onClose }: AdminRequestsProps) {
  const { token } = useAuth();
  const router = useRouter();
  const [requests, setRequests] = useState<GameRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null); // request ID being processed
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && token) {
      loadRequests();
    }
  }, [isOpen, token]);

  const loadRequests = async () => {
    if (!token) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const res = await authedFetch('/api/game-requests?status=pending', {
        method: 'GET',
      }, token);
      
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to load requests');
      }
      
      setRequests(data.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (requestId: string) => {
    if (!token) return;
    
    setProcessing(requestId);
    setError(null);
    setSuccessMessage(null);
    
    try {
      const res = await authedFetch(`/api/game-requests/${requestId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, token);
      
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to approve request');
      }
      
      setSuccessMessage(`Game created! ID: ${data.data.gameId}`);
      
      // Reload requests
      await loadRequests();
      
      // Optionally navigate to the game
      if (data.data.gameId) {
        setTimeout(() => {
          router.push(`/games/${data.data.gameId}`);
          onClose();
        }, 1500);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to approve request');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (requestId: string, reason?: string) => {
    if (!token) return;
    
    setProcessing(requestId);
    setError(null);
    setSuccessMessage(null);
    
    try {
      const res = await authedFetch(`/api/game-requests/${requestId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejection_reason: reason || null }),
      }, token);
      
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to reject request');
      }
      
      setSuccessMessage('Request rejected');
      
      // Reload requests
      await loadRequests();
    } catch (err: any) {
      setError(err.message || 'Failed to reject request');
    } finally {
      setProcessing(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-zinc-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-black dark:text-zinc-100">Game Requests</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              ✕
            </button>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-800 dark:text-red-200">
              {error}
            </div>
          )}

          {successMessage && (
            <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-800 dark:text-green-200">
              {successMessage}
            </div>
          )}

          {loading ? (
            <div className="text-center py-8 text-black dark:text-zinc-100">Loading requests...</div>
          ) : requests.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-zinc-400">
              No pending requests
            </div>
          ) : (
            <div className="space-y-4">
              {requests.map((request) => (
                <div
                  key={request.id}
                  className="border border-gray-200 dark:border-zinc-700 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-semibold text-black dark:text-zinc-100">
                          Request #{request.id.substring(0, 8)}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-zinc-400">
                          by FID {request.requester_fid}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600 dark:text-zinc-400 mb-2">
                        Created: {formatDate(request.created_at)}
                      </div>
                      <div className="text-xs font-mono text-gray-600 dark:text-zinc-400 mb-2">
                        Prefund: {request.prefund_tx_hash.substring(0, 20)}...
                      </div>
                    </div>
                  </div>

                  <div className="mb-4 p-3 bg-gray-50 dark:bg-zinc-900 rounded-lg">
                    <div className="text-sm text-black dark:text-zinc-100">
                      <div><strong>Title:</strong> {request.payload.title || 'N/A'}</div>
                      {request.payload.entry_fee_amount && (
                        <div>
                          <strong>Entry Fee:</strong> {request.payload.entry_fee_amount} {request.payload.entry_fee_currency || 'USDC'}
                        </div>
                      )}
                      {request.payload.max_participants && (
                        <div>
                          <strong>Max Players:</strong> {request.payload.max_participants}
                        </div>
                      )}
                      {request.payload.scheduled_time && (
                        <div>
                          <strong>Scheduled:</strong> {formatDate(request.payload.scheduled_time)}
                        </div>
                      )}
                      {request.payload.clubgg_link && (
                        <div>
                          <strong>ClubGG:</strong> <a href={request.payload.clubgg_link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{request.payload.clubgg_link}</a>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(request.id)}
                      disabled={processing === request.id}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {processing === request.id ? 'Processing...' : 'Approve'}
                    </button>
                    <button
                      onClick={() => handleReject(request.id)}
                      disabled={processing === request.id}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {processing === request.id ? 'Processing...' : 'Reject'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

