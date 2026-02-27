-- Phase 40 (NL HOLDEM): Game-level chat. Run after supabase_migration_nl_holdem.sql (#85).
-- Migration #86. Creates poker.nl_holdem_chat_messages, nl_holdem_chat_presence, nl_holdem_chat_reactions.

CREATE TABLE IF NOT EXISTS poker.nl_holdem_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES poker.nl_holdem_games(id) ON DELETE CASCADE,
  fid bigint NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nl_holdem_chat_messages_game_id
  ON poker.nl_holdem_chat_messages(game_id);

CREATE INDEX IF NOT EXISTS idx_nl_holdem_chat_messages_game_created
  ON poker.nl_holdem_chat_messages(game_id, created_at DESC);

ALTER TABLE poker.nl_holdem_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_nl_holdem_chat_messages" ON poker.nl_holdem_chat_messages;
CREATE POLICY "no_direct_access_nl_holdem_chat_messages"
  ON poker.nl_holdem_chat_messages
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- Presence for unread count (chat_last_seen_at)
CREATE TABLE IF NOT EXISTS poker.nl_holdem_chat_presence (
  game_id uuid NOT NULL REFERENCES poker.nl_holdem_games(id) ON DELETE CASCADE,
  fid bigint NOT NULL,
  chat_last_seen_at timestamptz NULL,
  PRIMARY KEY (game_id, fid)
);

ALTER TABLE poker.nl_holdem_chat_presence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_nl_holdem_chat_presence" ON poker.nl_holdem_chat_presence;
CREATE POLICY "no_direct_access_nl_holdem_chat_presence"
  ON poker.nl_holdem_chat_presence
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- Reactions (app-wide: thumbs_up, x, fire, scream)
CREATE TABLE IF NOT EXISTS poker.nl_holdem_chat_reactions (
  message_id uuid NOT NULL REFERENCES poker.nl_holdem_chat_messages(id) ON DELETE CASCADE,
  fid bigint NOT NULL,
  reaction text NOT NULL CHECK (reaction IN ('thumbs_up', 'x', 'fire', 'scream')),
  PRIMARY KEY (message_id, fid)
);

CREATE INDEX IF NOT EXISTS idx_nl_holdem_chat_reactions_message_id
  ON poker.nl_holdem_chat_reactions(message_id);

ALTER TABLE poker.nl_holdem_chat_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_nl_holdem_chat_reactions" ON poker.nl_holdem_chat_reactions;
CREATE POLICY "no_direct_access_nl_holdem_chat_reactions"
  ON poker.nl_holdem_chat_reactions
  FOR ALL
  USING (false)
  WITH CHECK (false);

NOTIFY pgrst, 'reload schema';
