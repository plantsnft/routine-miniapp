-- App-wide chat reactions: BUDDY UP
-- Run after supabase_migration_buddy_up_chat.sql. Creates poker.buddy_up_chat_reactions.

CREATE TABLE IF NOT EXISTS poker.buddy_up_chat_reactions (
  message_id uuid NOT NULL REFERENCES poker.buddy_up_chat_messages(id) ON DELETE CASCADE,
  fid bigint NOT NULL,
  reaction text NOT NULL CHECK (reaction IN ('thumbs_up', 'x', 'fire', 'scream')),
  PRIMARY KEY (message_id, fid)
);

CREATE INDEX IF NOT EXISTS idx_buddy_up_chat_reactions_message_id
  ON poker.buddy_up_chat_reactions(message_id);

ALTER TABLE poker.buddy_up_chat_reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "no_direct_access_buddy_up_chat_reactions" ON poker.buddy_up_chat_reactions;
CREATE POLICY "no_direct_access_buddy_up_chat_reactions"
  ON poker.buddy_up_chat_reactions FOR ALL USING (false) WITH CHECK (false);

COMMENT ON TABLE poker.buddy_up_chat_reactions IS 'App-wide chat reactions (👍❌🔥😱) per message; one per user per message';
