-- NFT Prizes & Giveaway Wheel Feature - Database Migration
-- Run this in Supabase SQL Editor
-- This migration adds support for NFT prizes and giveaway wheel game type

-- Add game type and prize columns to poker.games
ALTER TABLE poker.games
ADD COLUMN IF NOT EXISTS game_type text DEFAULT 'poker', -- 'poker' | 'giveaway_wheel'
ADD COLUMN IF NOT EXISTS prize_type text DEFAULT 'tokens', -- 'tokens', 'nfts', 'mixed'
ADD COLUMN IF NOT EXISTS wheel_background_color text DEFAULT '#FF3B1A',
ADD COLUMN IF NOT EXISTS wheel_segment_type text DEFAULT 'equal', -- 'equal' | 'weighted'
ADD COLUMN IF NOT EXISTS wheel_image_urls text[], -- Array of image URLs for wheel decoration
ADD COLUMN IF NOT EXISTS wheel_participant_weights jsonb, -- Map of participant FID to weight: {"318447": 2, "123456": 1}
ADD COLUMN IF NOT EXISTS wheel_removed_participants bigint[], -- Array of FIDs removed before spin
ADD COLUMN IF NOT EXISTS wheel_winner_fid bigint, -- Winner FID (set after spin)
ADD COLUMN IF NOT EXISTS wheel_spun_at timestamptz; -- Timestamp when wheel was spun

-- Create game_prizes table (CRITICAL: Already added to VALID_POKER_TABLES in pokerDb.ts)
CREATE TABLE IF NOT EXISTS poker.game_prizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES poker.games(id) ON DELETE CASCADE,
  winner_position integer NOT NULL, -- 1 = first place, 2 = second place, etc.
  token_amount numeric, -- Token prize amount (null if no token prize)
  token_currency text, -- Currency (USDC, etc.)
  nft_contract_address text, -- NFT contract address (null if no NFT)
  nft_token_id numeric, -- NFT token ID (null if no NFT)
  nft_metadata jsonb, -- NFT metadata (name, image, etc.)
  inserted_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(game_id, winner_position, nft_contract_address, nft_token_id)
);

CREATE INDEX IF NOT EXISTS game_prizes_game_id_idx ON poker.game_prizes (game_id);
CREATE INDEX IF NOT EXISTS game_prizes_winner_position_idx ON poker.game_prizes (winner_position);

-- Add updated_at trigger for game_prizes table
DROP TRIGGER IF EXISTS set_updated_at_game_prizes ON poker.game_prizes;
CREATE TRIGGER set_updated_at_game_prizes
  BEFORE UPDATE ON poker.game_prizes
  FOR EACH ROW
  EXECUTE FUNCTION poker.set_updated_at();

-- Add comments
COMMENT ON COLUMN poker.games.game_type IS 'Game type: poker or giveaway_wheel';
COMMENT ON COLUMN poker.games.prize_type IS 'Prize type: tokens, nfts, or mixed';
COMMENT ON TABLE poker.game_prizes IS 'Prize configuration per winner position';
