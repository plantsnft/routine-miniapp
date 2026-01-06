-- Supabase schema for portal caching and user tracking
-- 
-- This schema is for documentation purposes only.
-- Execute these statements in your Supabase SQL editor to create the tables.

-- Table: portal_users
-- Tracks when users last accessed the portal
CREATE TABLE IF NOT EXISTS portal_users (
  fid bigint PRIMARY KEY,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Table: channel_feed_cache
-- Caches channel feed responses to reduce Neynar API calls
CREATE TABLE IF NOT EXISTS channel_feed_cache (
  channel_id text PRIMARY KEY,
  as_of timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Table: engagement_cache
-- Caches engagement verification results per user and channel
CREATE TABLE IF NOT EXISTS engagement_cache (
  fid bigint NOT NULL,
  channel_id text NOT NULL,
  as_of timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fid, channel_id)
);

-- Table: eligible_casts
-- Stores casts from channels that are eligible for engagement rewards
CREATE TABLE IF NOT EXISTS eligible_casts (
  cast_hash text PRIMARY KEY,
  author_fid bigint NOT NULL,
  created_at timestamptz NOT NULL,
  parent_url text NOT NULL,
  text text, -- nullable for safety
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

-- Table: engagements
-- Stores user engagements (likes, recasts, replies) with casts
CREATE TABLE IF NOT EXISTS engagements (
  id bigserial PRIMARY KEY,
  user_fid bigint NOT NULL,
  cast_hash text NOT NULL,
  engagement_type text NOT NULL CHECK (engagement_type IN ('like', 'recast', 'reply')),
  engaged_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN ('webhook', 'backfill', 'manual')),
  UNIQUE(user_fid, cast_hash, engagement_type)
);

-- Table: app_state
-- Key-value store for application state (cursors, timestamps, etc.)
CREATE TABLE IF NOT EXISTS app_state (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Table: reply_map
-- Maps reply casts to their parent casts for engagement tracking
CREATE TABLE IF NOT EXISTS reply_map (
  reply_hash text PRIMARY KEY,
  user_fid bigint NOT NULL,
  parent_cast_hash text NOT NULL REFERENCES eligible_casts(cast_hash) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Table: eligible_casts_sync_state
-- Tracks last sync timestamp per cast for engagement backfill
CREATE TABLE IF NOT EXISTS eligible_casts_sync_state (
  cast_hash text PRIMARY KEY REFERENCES eligible_casts(cast_hash) ON DELETE CASCADE,
  last_synced_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS portal_users_last_seen_idx ON portal_users (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS engagement_cache_asof_idx ON engagement_cache (as_of DESC);
CREATE INDEX IF NOT EXISTS eligible_casts_parent_url_idx ON eligible_casts (parent_url);
CREATE INDEX IF NOT EXISTS eligible_casts_created_at_idx ON eligible_casts (created_at DESC);
CREATE INDEX IF NOT EXISTS eligible_casts_last_seen_at_idx ON eligible_casts (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS engagements_user_fid_idx ON engagements (user_fid);
CREATE INDEX IF NOT EXISTS engagements_cast_hash_idx ON engagements (cast_hash);
CREATE INDEX IF NOT EXISTS engagements_engaged_at_idx ON engagements (engaged_at DESC);
CREATE INDEX IF NOT EXISTS eligible_casts_sync_state_last_synced_at_idx ON eligible_casts_sync_state (last_synced_at);
CREATE INDEX IF NOT EXISTS reply_map_parent_cast_hash_idx ON reply_map (parent_cast_hash);
CREATE INDEX IF NOT EXISTS reply_map_user_fid_idx ON reply_map (user_fid);
CREATE INDEX IF NOT EXISTS reply_map_user_parent_idx ON reply_map (user_fid, parent_cast_hash);

-- Add ON DELETE CASCADE to eligible_casts_sync_state for automatic cleanup
-- Note: This may require dropping and recreating the foreign key if it already exists
-- ALTER TABLE eligible_casts_sync_state DROP CONSTRAINT IF EXISTS eligible_casts_sync_state_cast_hash_fkey;
-- ALTER TABLE eligible_casts_sync_state ADD CONSTRAINT eligible_casts_sync_state_cast_hash_fkey 
--   FOREIGN KEY (cast_hash) REFERENCES eligible_casts(cast_hash) ON DELETE CASCADE;
