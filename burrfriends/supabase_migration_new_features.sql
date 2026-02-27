-- Migration: Add new fields for enhanced game features
-- Run this in Supabase SQL Editor after the base schema

-- Add reward/payout configuration fields to games table
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS total_reward_amount numeric,
  ADD COLUMN IF NOT EXISTS reward_currency text DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS num_payouts integer,
  ADD COLUMN IF NOT EXISTS is_prefunded boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS prefunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS staking_token_contract text,
  ADD COLUMN IF NOT EXISTS farcaster_cast_url text,
  ADD COLUMN IF NOT EXISTS settled_at timestamptz,
  ADD COLUMN IF NOT EXISTS can_settle_at timestamptz;

-- Add payment tracking to game_participants
ALTER TABLE public.game_participants
  ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS payment_tx_hash text,
  ADD COLUMN IF NOT EXISTS payment_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS join_tx_hash text,
  ADD COLUMN IF NOT EXISTS buy_in_amount numeric,
  ADD COLUMN IF NOT EXISTS payout_terms_signed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS payout_terms_tx_hash text;

-- Add indexes for new fields
CREATE INDEX IF NOT EXISTS games_can_settle_at_idx ON public.games (can_settle_at) WHERE can_settle_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS game_participants_payment_status_idx ON public.game_participants (payment_status);
CREATE INDEX IF NOT EXISTS game_participants_payout_terms_signed_idx ON public.game_participants (payout_terms_signed);

-- Comments for documentation
COMMENT ON COLUMN public.games.total_reward_amount IS 'Total reward pool amount (owner can prefund)';
COMMENT ON COLUMN public.games.reward_currency IS 'Currency for rewards (USD, ETH, USDC, etc.)';
COMMENT ON COLUMN public.games.num_payouts IS 'Number of positions that receive payouts';
COMMENT ON COLUMN public.games.is_prefunded IS 'Whether owner has prefunded the reward pool';
COMMENT ON COLUMN public.games.prefunded_at IS 'Timestamp when game was prefunded';
COMMENT ON COLUMN public.games.staking_token_contract IS 'Token contract address for staking requirement check';
COMMENT ON COLUMN public.games.settled_at IS 'Timestamp when game was settled (status set to completed)';
COMMENT ON COLUMN public.games.can_settle_at IS 'Earliest timestamp when game can be settled (scheduled_time or 30 mins after creation)';

COMMENT ON COLUMN public.game_participants.payment_status IS 'Entry fee payment status: pending, paid, refunded, failed';
COMMENT ON COLUMN public.game_participants.payment_tx_hash IS 'Transaction hash for entry fee payment (legacy field)';
COMMENT ON COLUMN public.game_participants.join_tx_hash IS 'Transaction hash/reference string for entry fee payment';
COMMENT ON COLUMN public.game_participants.payment_confirmed_at IS 'Timestamp when payment was confirmed';
COMMENT ON COLUMN public.game_participants.buy_in_amount IS 'Entry fee amount paid by participant (matches game.entry_fee_amount for paid games)';
COMMENT ON COLUMN public.game_participants.payout_terms_signed IS 'Whether player signed tx accepting payout terms';
COMMENT ON COLUMN public.game_participants.payout_terms_tx_hash IS 'Transaction hash for payout terms signature';

-- Add missing fields to payouts table
ALTER TABLE public.payouts
  ADD COLUMN IF NOT EXISTS recipient_wallet_address text,
  ADD COLUMN IF NOT EXISTS notes text;

COMMENT ON COLUMN public.payouts.recipient_wallet_address IS 'Wallet address for payout recipient (from users.wallet_address)';
COMMENT ON COLUMN public.payouts.notes IS 'Optional notes/remarks for the payout';

