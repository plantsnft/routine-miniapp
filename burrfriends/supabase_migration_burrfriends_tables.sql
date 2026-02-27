-- Burrfriends Mini App - Create separate tables for burrfriends games
-- Run this in Supabase SQL Editor (project: https://supabase.com/dashboard/project/bfjinpptqwoemnavthon)
-- This creates 3 separate tables in poker schema: burrfriends_games, burrfriends_participants, burrfriends_game_results
-- All burrfriends data is isolated from poker data

-- ============================================================================
-- 1. poker.burrfriends_games – Burrfriends game instances
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.burrfriends_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES poker.clubs(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  buy_in_amount numeric NOT NULL, -- Human-readable amount (e.g., 0.1 for 0.1 BETR)
  buy_in_currency text NOT NULL DEFAULT 'BETR', -- BETR instead of ETH
  game_date timestamptz, -- NULL allowed for "start when table is full" games
  
  -- Encrypted ClubGG credentials (AES-GCM)
  creds_ciphertext text, -- base64 encoded ciphertext
  creds_iv text, -- base64 encoded IV
  creds_version integer DEFAULT 1,
  
  -- Game configuration
  max_participants integer,
  game_type text NOT NULL DEFAULT 'standard' CHECK (game_type IN ('standard', 'large_event')),
  registration_close_minutes integer NOT NULL DEFAULT 0 CHECK (registration_close_minutes >= 0),
  gating_type text NOT NULL DEFAULT 'open',
  
  -- On-chain status fields (for paid games)
  onchain_status text DEFAULT 'active' CHECK (onchain_status IN ('pending', 'active', 'failed')),
  onchain_game_id text,
  onchain_tx_hash text,
  onchain_error text,
  
  -- Settlement tracking
  settle_tx_hash text,
  
  -- Payout configuration (stored as integer array for basis points)
  payout_bps integer[], -- Array of basis points for payout distribution (e.g., [10000] for winner-take-all)
  
  status text NOT NULL DEFAULT 'open', -- 'open', 'full', 'in_progress', 'completed', 'cancelled', 'settled'
  inserted_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for burrfriends_games
CREATE INDEX IF NOT EXISTS burrfriends_games_club_id_idx ON poker.burrfriends_games (club_id);
CREATE INDEX IF NOT EXISTS burrfriends_games_status_idx ON poker.burrfriends_games (status);
CREATE INDEX IF NOT EXISTS burrfriends_games_game_date_idx ON poker.burrfriends_games (game_date);
CREATE INDEX IF NOT EXISTS burrfriends_games_onchain_status_idx ON poker.burrfriends_games (onchain_status);
CREATE INDEX IF NOT EXISTS burrfriends_games_onchain_game_id_idx ON poker.burrfriends_games (onchain_game_id) WHERE onchain_game_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS burrfriends_games_settle_tx_hash_idx ON poker.burrfriends_games (settle_tx_hash) WHERE settle_tx_hash IS NOT NULL;

-- Add update trigger
DROP TRIGGER IF EXISTS set_updated_at_burrfriends_games ON poker.burrfriends_games;
CREATE TRIGGER set_updated_at_burrfriends_games
  BEFORE UPDATE ON poker.burrfriends_games
  FOR EACH ROW
  EXECUTE FUNCTION poker.set_updated_at();

-- Enable RLS
ALTER TABLE poker.burrfriends_games ENABLE ROW LEVEL SECURITY;

-- Basic RLS policy (viewable by everyone, writable by service role)
CREATE POLICY "Burrfriends games are viewable by everyone" ON poker.burrfriends_games
  FOR SELECT USING (true);

-- ============================================================================
-- 2. poker.burrfriends_participants – Players in burrfriends games
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.burrfriends_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES poker.burrfriends_games(id) ON DELETE CASCADE,
  fid bigint NOT NULL,
  
  status text NOT NULL DEFAULT 'joined', -- 'joined', 'paid', 'refunded', 'settled'
  tx_hash text, -- Blockchain transaction hash for payment
  paid_at timestamptz, -- Timestamp when payment was confirmed
  
  -- Refund tracking
  refund_tx_hash text,
  refunded_at timestamptz,
  
  -- Payout tracking
  payout_tx_hash text,
  payout_amount numeric,
  paid_out_at timestamptz,
  
  inserted_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(game_id, fid) -- One participation per game per user
);

-- Indexes for burrfriends_participants
CREATE INDEX IF NOT EXISTS burrfriends_participants_game_id_idx ON poker.burrfriends_participants (game_id);
CREATE INDEX IF NOT EXISTS burrfriends_participants_fid_idx ON poker.burrfriends_participants (fid);
CREATE INDEX IF NOT EXISTS burrfriends_participants_status_idx ON poker.burrfriends_participants (status);
CREATE INDEX IF NOT EXISTS burrfriends_participants_tx_hash_idx ON poker.burrfriends_participants (tx_hash) WHERE tx_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS burrfriends_participants_refund_tx_hash_idx ON poker.burrfriends_participants (refund_tx_hash) WHERE refund_tx_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS burrfriends_participants_payout_tx_hash_idx ON poker.burrfriends_participants (payout_tx_hash) WHERE payout_tx_hash IS NOT NULL;

-- Unique partial index for idempotency (prevents duplicate tx_hash per game)
CREATE UNIQUE INDEX IF NOT EXISTS burrfriends_participants_game_tx_hash_unique 
  ON poker.burrfriends_participants (game_id, tx_hash) 
  WHERE tx_hash IS NOT NULL;

-- Add update trigger
DROP TRIGGER IF EXISTS set_updated_at_burrfriends_participants ON poker.burrfriends_participants;
CREATE TRIGGER set_updated_at_burrfriends_participants
  BEFORE UPDATE ON poker.burrfriends_participants
  FOR EACH ROW
  EXECUTE FUNCTION poker.set_updated_at();

-- Enable RLS
ALTER TABLE poker.burrfriends_participants ENABLE ROW LEVEL SECURITY;

-- Basic RLS policy (viewable by everyone, writable by service role)
CREATE POLICY "Burrfriends participants are viewable by everyone" ON poker.burrfriends_participants
  FOR SELECT USING (true);

-- ============================================================================
-- 3. poker.burrfriends_game_results – Game results for burrfriends games
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.burrfriends_game_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES poker.burrfriends_games(id) ON DELETE CASCADE,
  player_fid bigint NOT NULL,
  position integer,
  payout_amount numeric,
  payout_currency text,
  net_profit numeric,
  inserted_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for burrfriends_game_results
CREATE INDEX IF NOT EXISTS burrfriends_game_results_game_id_idx ON poker.burrfriends_game_results (game_id);
CREATE INDEX IF NOT EXISTS burrfriends_game_results_player_fid_idx ON poker.burrfriends_game_results (player_fid);

-- Add update trigger
DROP TRIGGER IF EXISTS set_updated_at_burrfriends_game_results ON poker.burrfriends_game_results;
CREATE TRIGGER set_updated_at_burrfriends_game_results
  BEFORE UPDATE ON poker.burrfriends_game_results
  FOR EACH ROW
  EXECUTE FUNCTION poker.set_updated_at();

-- Enable RLS
ALTER TABLE poker.burrfriends_game_results ENABLE ROW LEVEL SECURITY;

-- Basic RLS policy (viewable by everyone, writable by service role)
CREATE POLICY "Burrfriends game results are viewable by everyone" ON poker.burrfriends_game_results
  FOR SELECT USING (true);

-- ============================================================================
-- Comments for documentation
-- ============================================================================
COMMENT ON TABLE poker.burrfriends_games IS 'Burrfriends game instances - separate from poker.games';
COMMENT ON TABLE poker.burrfriends_participants IS 'Burrfriends game participants with payment status and tx_hash - separate from poker.participants';
COMMENT ON TABLE poker.burrfriends_game_results IS 'Burrfriends game results - separate from poker.game_results';

COMMENT ON COLUMN poker.burrfriends_games.buy_in_currency IS 'Currency for buy-in (BETR for burrfriends games)';
COMMENT ON COLUMN poker.burrfriends_games.payout_bps IS 'Array of basis points for payout distribution (e.g., [10000] = winner-take-all, [6000, 4000] = 60/40 split)';
COMMENT ON COLUMN poker.burrfriends_participants.tx_hash IS 'Blockchain transaction hash for payment (authoritative source for payment verification)';
COMMENT ON COLUMN poker.burrfriends_participants.refund_tx_hash IS 'Transaction hash for refund when game is cancelled';
COMMENT ON COLUMN poker.burrfriends_participants.payout_tx_hash IS 'Transaction hash for payout when game is settled';
COMMENT ON COLUMN poker.burrfriends_participants.payout_amount IS 'Amount paid out to this participant (in human-readable format)';
