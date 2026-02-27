-- App-wide chat reactions: BULLIED
-- Run after supabase_migration_bullied.sql (which creates bullied_chat_messages). Creates poker.bullied_chat_reactions.

CREATE TABLE IF NOT EXISTS poker.bullied_chat_reactions (
  message_id uuid NOT NULL REFERENCES poker.bullied_chat_messages(id) ON DELETE CASCADE,
  fid bigint NOT NULL,
  reaction text NOT NULL CHECK (reaction IN ('thumbs_up', 'x', 'fire', 'scream')),
  PRIMARY KEY (message_id, fid)
);

CREATE INDEX IF NOT EXISTS idx_bullied_chat_reactions_message_id
  ON poker.bullied_chat_reactions(message_id);

ALTER TABLE poker.bullied_chat_reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "no_direct_access_bullied_chat_reactions" ON poker.bullied_chat_reactions;
CREATE POLICY "no_direct_access_bullied_chat_reactions"
  ON poker.bullied_chat_reactions FOR ALL USING (false) WITH CHECK (false);

COMMENT ON TABLE poker.bullied_chat_reactions IS 'App-wide chat reactions (👍❌🔥😱) per message; one per user per message';
