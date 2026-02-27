-- Migration: Add refund lock columns to burrfriends_participants table
-- Purpose: Enable atomic locking mechanism for refund operations to prevent double refunds
-- Date: 2026-01-16

-- Add refund lock columns to burrfriends_participants table
ALTER TABLE poker.burrfriends_participants 
ADD COLUMN IF NOT EXISTS refund_lock_id TEXT,
ADD COLUMN IF NOT EXISTS refund_locked_at TIMESTAMPTZ;

-- Optional: Index for lock queries (improves performance when checking for existing locks)
CREATE INDEX IF NOT EXISTS idx_burrfriends_participants_refund_lock 
ON poker.burrfriends_participants(game_id, fid) 
WHERE refund_lock_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN poker.burrfriends_participants.refund_lock_id IS 'Lock ID for preventing concurrent refund broadcasts. Set before broadcasting refund transaction, cleared after tx_hash is persisted.';
COMMENT ON COLUMN poker.burrfriends_participants.refund_locked_at IS 'Lock expiration timestamp (5 minutes from acquisition). Allows automatic cleanup of stuck locks.';
