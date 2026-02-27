-- Phase 19: Lobby Chat (1M BETR Stakers Only)
-- Migration #45
-- Run AFTER all previous migrations (see Infrastructure → Supabase → Running migrations)

-- Presence tracking table
CREATE TABLE IF NOT EXISTS poker.lobby_presence (
  fid BIGINT PRIMARY KEY,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  in_chat BOOLEAN NOT NULL DEFAULT FALSE,
  username TEXT,
  display_name TEXT,
  pfp_url TEXT
);

COMMENT ON TABLE poker.lobby_presence IS 'Tracks active users in the app for lobby chat presence';
COMMENT ON COLUMN poker.lobby_presence.fid IS 'User Farcaster ID';
COMMENT ON COLUMN poker.lobby_presence.last_seen_at IS 'Last heartbeat timestamp - users active within 60s are considered online';
COMMENT ON COLUMN poker.lobby_presence.in_chat IS 'TRUE if user has chat modal open';

-- Chat messages table
CREATE TABLE IF NOT EXISTS poker.lobby_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_fid BIGINT NOT NULL,
  message TEXT NOT NULL CHECK (char_length(message) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE poker.lobby_chat_messages IS 'Global lobby chat messages for 1M+ BETR stakers';
COMMENT ON COLUMN poker.lobby_chat_messages.sender_fid IS 'FID of user who sent the message';
COMMENT ON COLUMN poker.lobby_chat_messages.message IS 'Message content (max 500 chars)';

-- Index for efficient cleanup and ordering
CREATE INDEX IF NOT EXISTS idx_lobby_chat_messages_created_at 
  ON poker.lobby_chat_messages(created_at DESC);

-- Index for presence queries (active users)
CREATE INDEX IF NOT EXISTS idx_lobby_presence_last_seen_at 
  ON poker.lobby_presence(last_seen_at DESC);

-- RLS (service role only - deny all for anon/authenticated)
ALTER TABLE poker.lobby_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE poker.lobby_chat_messages ENABLE ROW LEVEL SECURITY;
