-- Poker Mini App - Create poker schema and tables
-- This migration creates a separate poker schema to isolate from existing public.* tables (Catwalk)
-- Run this in Supabase SQL Editor
-- DO NOT modify public.* tables

-- Create poker schema
CREATE SCHEMA IF NOT EXISTS poker;

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. poker.clubs – Poker clubs (code-only creation, no UI)
CREATE TABLE IF NOT EXISTS poker.clubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  owner_fid bigint NOT NULL,
  name text NOT NULL,
  description text,
  inserted_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clubs_owner_fid_idx ON poker.clubs (owner_fid);

-- 2. poker.club_members – Club membership
CREATE TABLE IF NOT EXISTS poker.club_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES poker.clubs(id) ON DELETE CASCADE,
  fid bigint NOT NULL, -- Using 'fid' to match plan (not 'member_fid')
  inserted_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(club_id, fid) -- Enforces one membership per club per user
);

CREATE INDEX IF NOT EXISTS club_members_club_id_idx ON poker.club_members (club_id);
CREATE INDEX IF NOT EXISTS club_members_fid_idx ON poker.club_members (fid);

-- 3. poker.games – Poker game instances
CREATE TABLE IF NOT EXISTS poker.games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES poker.clubs(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  buy_in_amount numeric NOT NULL, -- Human-readable amount (e.g., 0.1 for 0.1 ETH)
  buy_in_currency text NOT NULL DEFAULT 'ETH', -- 'ETH' or 'USDC'
  game_date timestamptz NOT NULL,
  max_participants integer,
  
  -- Encrypted ClubGG credentials (AES-GCM)
  creds_ciphertext text, -- base64 encoded ciphertext
  creds_iv text, -- base64 encoded IV
  creds_version integer DEFAULT 1,
  
  status text NOT NULL DEFAULT 'open', -- 'open', 'full', 'in_progress', 'completed', 'cancelled'
  inserted_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS games_club_id_idx ON poker.games (club_id);
CREATE INDEX IF NOT EXISTS games_status_idx ON poker.games (status);
CREATE INDEX IF NOT EXISTS games_game_date_idx ON poker.games (game_date);

-- 4. poker.participants – Players in games
CREATE TABLE IF NOT EXISTS poker.participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES poker.games(id) ON DELETE CASCADE,
  fid bigint NOT NULL,
  
  status text NOT NULL DEFAULT 'joined', -- 'joined', 'paid', 'refunded', 'settled'
  tx_hash text, -- Blockchain transaction hash for payment
  paid_at timestamptz, -- Timestamp when payment was confirmed
  
  inserted_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(game_id, fid) -- One participation per game per user
);

CREATE INDEX IF NOT EXISTS participants_game_id_idx ON poker.participants (game_id);
CREATE INDEX IF NOT EXISTS participants_fid_idx ON poker.participants (fid);
CREATE INDEX IF NOT EXISTS participants_status_idx ON poker.participants (status);
CREATE INDEX IF NOT EXISTS participants_tx_hash_idx ON poker.participants (tx_hash) WHERE tx_hash IS NOT NULL;

-- Unique partial index to prevent duplicate tx_hash per game (idempotency)
-- This enforces: same tx_hash cannot be used twice for the same game
CREATE UNIQUE INDEX IF NOT EXISTS participants_game_tx_hash_unique 
  ON poker.participants (game_id, tx_hash) 
  WHERE tx_hash IS NOT NULL;

-- 5. poker.audit_log – Optional audit logging for poker operations
CREATE TABLE IF NOT EXISTS poker.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL, -- 'refund', 'settle', 'member_added', 'member_removed', etc.
  actor_fid bigint NOT NULL, -- Who performed the action
  target_fid bigint, -- Optional: target user (for member operations)
  game_id uuid REFERENCES poker.games(id) ON DELETE SET NULL,
  club_id uuid REFERENCES poker.clubs(id) ON DELETE SET NULL,
  metadata jsonb, -- Additional context
  inserted_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_event_type_idx ON poker.audit_log (event_type);
CREATE INDEX IF NOT EXISTS audit_log_actor_fid_idx ON poker.audit_log (actor_fid);
CREATE INDEX IF NOT EXISTS audit_log_inserted_at_idx ON poker.audit_log (inserted_at);

-- Create updated_at trigger function (if not exists)
CREATE OR REPLACE FUNCTION poker.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers to all tables with updated_at column
DROP TRIGGER IF EXISTS set_updated_at_clubs ON poker.clubs;
CREATE TRIGGER set_updated_at_clubs
  BEFORE UPDATE ON poker.clubs
  FOR EACH ROW
  EXECUTE FUNCTION poker.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_club_members ON poker.club_members;
CREATE TRIGGER set_updated_at_club_members
  BEFORE UPDATE ON poker.club_members
  FOR EACH ROW
  EXECUTE FUNCTION poker.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_games ON poker.games;
CREATE TRIGGER set_updated_at_games
  BEFORE UPDATE ON poker.games
  FOR EACH ROW
  EXECUTE FUNCTION poker.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_participants ON poker.participants;
CREATE TRIGGER set_updated_at_participants
  BEFORE UPDATE ON poker.participants
  FOR EACH ROW
  EXECUTE FUNCTION poker.set_updated_at();

-- Grant permissions (if using RLS, we'll use service role for all operations)
-- For MVP, we use service role client-side, so no RLS needed
-- But we can prepare for future RLS if needed

COMMENT ON SCHEMA poker IS 'Poker mini app tables - isolated from public schema (Catwalk)';
COMMENT ON TABLE poker.clubs IS 'Poker clubs - created only via seed scripts, not via UI';
COMMENT ON TABLE poker.club_members IS 'Club membership - one row per club per user';
COMMENT ON TABLE poker.games IS 'Poker game instances with encrypted ClubGG credentials';
COMMENT ON TABLE poker.participants IS 'Game participants with payment status and tx_hash';
COMMENT ON TABLE poker.audit_log IS 'Audit log for sensitive operations (refunds, settlements, membership changes)';

