-- STEAL OR NO STEAL - Chat Messages
-- Run in Supabase SQL Editor. Creates poker.steal_no_steal_chat_messages.

-- ============================================================================
-- poker.steal_no_steal_chat_messages – Chat messages per match
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.steal_no_steal_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES poker.steal_no_steal_matches(id) ON DELETE CASCADE,
  sender_fid bigint NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_steal_no_steal_chat_messages_match_id
  ON poker.steal_no_steal_chat_messages(match_id);

CREATE INDEX IF NOT EXISTS idx_steal_no_steal_chat_messages_match_created
  ON poker.steal_no_steal_chat_messages(match_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_steal_no_steal_chat_messages_sender_fid
  ON poker.steal_no_steal_chat_messages(sender_fid);

ALTER TABLE poker.steal_no_steal_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_chat_messages" ON poker.steal_no_steal_chat_messages;
CREATE POLICY "no_direct_access_chat_messages"
  ON poker.steal_no_steal_chat_messages
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.steal_no_steal_chat_messages IS 'STEAL OR NO STEAL: chat messages per match, accessible by players in match and admins';
