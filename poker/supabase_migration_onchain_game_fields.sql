-- Migration: Add on-chain game status tracking fields to poker.games
-- These fields track the contract registration status of paid games

ALTER TABLE poker.games
  ADD COLUMN IF NOT EXISTS onchain_status text DEFAULT 'active' CHECK (onchain_status IN ('pending', 'active', 'failed')),
  ADD COLUMN IF NOT EXISTS onchain_game_id text,
  ADD COLUMN IF NOT EXISTS onchain_tx_hash text,
  ADD COLUMN IF NOT EXISTS onchain_error text;

-- Create index for faster lookups by onchain_status
CREATE INDEX IF NOT EXISTS games_onchain_status_idx ON poker.games (onchain_status);

-- Create index for faster lookups by onchain_game_id
CREATE INDEX IF NOT EXISTS games_onchain_game_id_idx ON poker.games (onchain_game_id) WHERE onchain_game_id IS NOT NULL;

-- For existing games with buy_in_amount > 0, set status to 'pending' (will need manual activation)
-- For games with buy_in_amount = 0 or NULL, set to 'active' (free games don't need on-chain registration)
UPDATE poker.games
SET onchain_status = CASE 
  WHEN buy_in_amount IS NOT NULL AND buy_in_amount > 0 THEN 'pending'
  ELSE 'active'
END
WHERE onchain_status IS NULL;

