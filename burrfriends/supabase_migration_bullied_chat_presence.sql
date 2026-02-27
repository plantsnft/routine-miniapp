-- Phase 33 (BULLIED): Chat presence for admin "active in chat" counts
-- Migration #60
-- Run AFTER supabase_migration_bullied_roulette_wheel.sql (#59)
-- See Infrastructure → Supabase → Running migrations

CREATE TABLE IF NOT EXISTS poker.bullied_chat_presence (
  fid BIGINT NOT NULL,
  group_id UUID NOT NULL REFERENCES poker.bullied_groups(id) ON DELETE CASCADE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (fid, group_id)
);

COMMENT ON TABLE poker.bullied_chat_presence IS 'Tracks users currently viewing a BULLIED group chat; active = last_seen_at within 60s';
COMMENT ON COLUMN poker.bullied_chat_presence.fid IS 'Farcaster ID of user in that group chat';
COMMENT ON COLUMN poker.bullied_chat_presence.group_id IS 'Group whose chat the user is viewing';
COMMENT ON COLUMN poker.bullied_chat_presence.last_seen_at IS 'Last heartbeat timestamp';

CREATE INDEX IF NOT EXISTS idx_bullied_chat_presence_group_last_seen
  ON poker.bullied_chat_presence(group_id, last_seen_at DESC);

ALTER TABLE poker.bullied_chat_presence ENABLE ROW LEVEL SECURITY;

-- Deny all for anon/authenticated; APIs use service role
CREATE POLICY "deny_all_bullied_chat_presence" ON poker.bullied_chat_presence
  FOR ALL USING (false);
