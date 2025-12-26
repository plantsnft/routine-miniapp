-- Migration: Add gating_type column to poker.games table
-- This column is required for game creation and was missing from the original schema
-- Run this in Supabase SQL Editor

-- Add gating_type column if it doesn't exist
ALTER TABLE poker.games
  ADD COLUMN IF NOT EXISTS gating_type text NOT NULL DEFAULT 'open';

-- Add comment for documentation
COMMENT ON COLUMN poker.games.gating_type IS 'Game gating type: open (free), entry_fee (paid), or stake_threshold (staking required)';

-- Update existing rows that might have NULL gating_type (shouldn't happen with NOT NULL, but safe guard)
UPDATE poker.games
SET gating_type = CASE 
  WHEN buy_in_amount IS NOT NULL AND buy_in_amount > 0 THEN 'entry_fee'
  ELSE 'open'
END
WHERE gating_type IS NULL;

-- Note: PostgREST schema cache will refresh automatically after this migration
-- If you still see the error, you may need to wait a few seconds for the cache to refresh
-- Or contact Supabase support to manually refresh the schema cache

