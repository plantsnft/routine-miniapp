-- App-wide chat reactions: TAKE FROM THE PILE
-- Run after supabase_migration_take_from_the_pile_chat.sql. Creates poker.take_from_the_pile_chat_reactions.

CREATE TABLE IF NOT EXISTS poker.take_from_the_pile_chat_reactions (
  message_id uuid NOT NULL REFERENCES poker.take_from_the_pile_chat_messages(id) ON DELETE CASCADE,
  fid bigint NOT NULL,
  reaction text NOT NULL CHECK (reaction IN ('thumbs_up', 'x', 'fire', 'scream')),
  PRIMARY KEY (message_id, fid)
);

CREATE INDEX IF NOT EXISTS idx_take_from_the_pile_chat_reactions_message_id
  ON poker.take_from_the_pile_chat_reactions(message_id);

ALTER TABLE poker.take_from_the_pile_chat_reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "no_direct_access_take_from_the_pile_chat_reactions" ON poker.take_from_the_pile_chat_reactions;
CREATE POLICY "no_direct_access_take_from_the_pile_chat_reactions"
  ON poker.take_from_the_pile_chat_reactions FOR ALL USING (false) WITH CHECK (false);

COMMENT ON TABLE poker.take_from_the_pile_chat_reactions IS 'App-wide chat reactions (👍❌🔥😱) per message; one per user per message';
