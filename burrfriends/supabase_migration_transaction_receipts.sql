-- Migration: Add transaction receipt columns for refunds and payouts
-- This enables proof of funds movement for canceled and settled games
-- Run this in Supabase SQL Editor

-- Add refund columns to participants table
ALTER TABLE poker.participants 
  ADD COLUMN IF NOT EXISTS refund_tx_hash text,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

-- Add payout columns to participants table
ALTER TABLE poker.participants 
  ADD COLUMN IF NOT EXISTS payout_tx_hash text,
  ADD COLUMN IF NOT EXISTS payout_amount numeric,
  ADD COLUMN IF NOT EXISTS paid_out_at timestamptz;

-- Add settlement tx hash to games table (optional - if settlement is a single tx)
ALTER TABLE poker.games 
  ADD COLUMN IF NOT EXISTS settle_tx_hash text;

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS participants_refund_tx_hash_idx ON poker.participants (refund_tx_hash) WHERE refund_tx_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS participants_payout_tx_hash_idx ON poker.participants (payout_tx_hash) WHERE payout_tx_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS games_settle_tx_hash_idx ON poker.games (settle_tx_hash) WHERE settle_tx_hash IS NOT NULL;

-- Comments for documentation
COMMENT ON COLUMN poker.participants.refund_tx_hash IS 'Transaction hash for refund when game is cancelled';
COMMENT ON COLUMN poker.participants.refunded_at IS 'Timestamp when refund transaction was confirmed';
COMMENT ON COLUMN poker.participants.payout_tx_hash IS 'Transaction hash for payout when game is settled';
COMMENT ON COLUMN poker.participants.payout_amount IS 'Amount paid out to this participant (in human-readable format)';
COMMENT ON COLUMN poker.participants.paid_out_at IS 'Timestamp when payout transaction was confirmed';
COMMENT ON COLUMN poker.games.settle_tx_hash IS 'Transaction hash for game settlement (if settlement is a single transaction)';

