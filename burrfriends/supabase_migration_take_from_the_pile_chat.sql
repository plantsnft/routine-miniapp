-- Phase 37 (TAKE FROM THE PILE): Game-level chat messages.
-- Migration #66. Run after supabase_migration_take_from_the_pile.sql (#65).

CREATE TABLE IF NOT EXISTS poker.take_from_the_pile_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES poker.take_from_the_pile_games(id) ON DELETE CASCADE,
  fid bigint NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_take_from_the_pile_chat_messages_game_id
  ON poker.take_from_the_pile_chat_messages(game_id);

CREATE INDEX IF NOT EXISTS idx_take_from_the_pile_chat_messages_game_created
  ON poker.take_from_the_pile_chat_messages(game_id, created_at DESC);

ALTER TABLE poker.take_from_the_pile_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_take_from_the_pile_chat" ON poker.take_from_the_pile_chat_messages;
CREATE POLICY "no_direct_access_take_from_the_pile_chat"
  ON poker.take_from_the_pile_chat_messages
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.take_from_the_pile_chat_messages IS 'TAKE FROM THE PILE: game-level chat (players + admins)';

NOTIFY pgrst, 'reload schema';
