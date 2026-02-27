-- Phase 38 (KILL OR KEEP): Game-level chat messages.
-- Migration #68. Run after supabase_migration_kill_or_keep.sql (#67).

CREATE TABLE IF NOT EXISTS poker.kill_or_keep_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES poker.kill_or_keep_games(id) ON DELETE CASCADE,
  fid bigint NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kill_or_keep_chat_messages_game_id
  ON poker.kill_or_keep_chat_messages(game_id);

CREATE INDEX IF NOT EXISTS idx_kill_or_keep_chat_messages_game_created
  ON poker.kill_or_keep_chat_messages(game_id, created_at DESC);

ALTER TABLE poker.kill_or_keep_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_kill_or_keep_chat" ON poker.kill_or_keep_chat_messages;
CREATE POLICY "no_direct_access_kill_or_keep_chat"
  ON poker.kill_or_keep_chat_messages
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.kill_or_keep_chat_messages IS 'KILL OR KEEP: game-level chat (players + admins)';

NOTIFY pgrst, 'reload schema';
