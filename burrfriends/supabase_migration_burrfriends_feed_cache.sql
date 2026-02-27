-- Burrfriends Mini App - Create channel feed cache table
-- Run this in Supabase SQL Editor (project: https://supabase.com/dashboard/project/bfjinpptqwoemnavthon)
-- This creates a table in poker schema: burrfriends_channel_feed_cache
-- Used to cache the Burrfriends Farcaster channel feed to reduce Neynar API calls

-- ============================================================================
-- poker.burrfriends_channel_feed_cache – Cache for Burrfriends channel feed
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.burrfriends_channel_feed_cache (
  channel_id text PRIMARY KEY DEFAULT 'burrfrens',
  as_of timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for efficient queries by timestamp
CREATE INDEX IF NOT EXISTS idx_burrfriends_channel_feed_cache_as_of 
  ON poker.burrfriends_channel_feed_cache(as_of DESC);

-- RLS: Allow public read access (for API endpoints)
ALTER TABLE poker.burrfriends_channel_feed_cache ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public read access
CREATE POLICY "Allow public read access" 
  ON poker.burrfriends_channel_feed_cache
  FOR SELECT
  USING (true);

-- Policy: Allow service role to insert/update (for cron jobs)
CREATE POLICY "Allow service role insert/update" 
  ON poker.burrfriends_channel_feed_cache
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Comment
COMMENT ON TABLE poker.burrfriends_channel_feed_cache IS 'Cache for Burrfriends Farcaster channel feed (burrfrens). Stores last 10 casts and channel stats. Refreshed daily via cron job (0 1 * * *).';
