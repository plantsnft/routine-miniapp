-- Phase 19.3: Cache staking verification to avoid RPC rate limits
-- Migration #46
-- Run AFTER migration #45 (supabase_migration_lobby_chat.sql)

-- Add stake_verified_at column to cache when staking was last verified via RPC
-- This avoids hitting Base RPC rate limits (429 errors) from frequent polling
ALTER TABLE poker.lobby_presence 
ADD COLUMN IF NOT EXISTS stake_verified_at TIMESTAMPTZ;

COMMENT ON COLUMN poker.lobby_presence.stake_verified_at IS 
'When staking was last verified via RPC - cached for 5 minutes to avoid rate limits';
