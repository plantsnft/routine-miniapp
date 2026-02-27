-- BUDDY UP - Group Chat Messages
-- Run in Supabase SQL Editor. Creates poker.buddy_up_chat_messages.

-- ============================================================================
-- poker.buddy_up_chat_messages – Chat messages per group
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.buddy_up_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES poker.buddy_up_groups(id) ON DELETE CASCADE,
  sender_fid bigint NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_buddy_up_chat_messages_group_id
  ON poker.buddy_up_chat_messages(group_id);

CREATE INDEX IF NOT EXISTS idx_buddy_up_chat_messages_group_created
  ON poker.buddy_up_chat_messages(group_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_buddy_up_chat_messages_sender_fid
  ON poker.buddy_up_chat_messages(sender_fid);

ALTER TABLE poker.buddy_up_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_chat_messages" ON poker.buddy_up_chat_messages;
CREATE POLICY "no_direct_access_chat_messages"
  ON poker.buddy_up_chat_messages
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.buddy_up_chat_messages IS 'BUDDY UP: chat messages per group, accessible by group members and admins';
