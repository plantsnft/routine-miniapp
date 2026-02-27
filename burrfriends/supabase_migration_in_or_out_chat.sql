-- Phase 35 (IN OR OUT): Game-level chat messages.
-- Migration #63. Run after supabase_migration_in_or_out_room_timer.sql (#62).

CREATE TABLE IF NOT EXISTS poker.in_or_out_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES poker.in_or_out_games(id) ON DELETE CASCADE,
  fid bigint NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_in_or_out_chat_messages_game_id
  ON poker.in_or_out_chat_messages(game_id);

CREATE INDEX IF NOT EXISTS idx_in_or_out_chat_messages_game_created
  ON poker.in_or_out_chat_messages(game_id, created_at DESC);

ALTER TABLE poker.in_or_out_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_in_or_out_chat" ON poker.in_or_out_chat_messages;
CREATE POLICY "no_direct_access_in_or_out_chat"
  ON poker.in_or_out_chat_messages
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.in_or_out_chat_messages IS 'IN OR OUT: game-level chat (all players and admins can see/post)';
