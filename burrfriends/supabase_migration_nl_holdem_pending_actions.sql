-- Phase 40 (NL HOLDEM): Pre-action — store check before turn; applied when turn arrives.
-- Run after #96 (actor_ends_at).
-- Migration #97.

SET search_path = poker;

CREATE TABLE IF NOT EXISTS poker.nl_holdem_pending_actions (
  hand_id uuid NOT NULL REFERENCES poker.nl_holdem_hands(id) ON DELETE CASCADE,
  fid bigint NOT NULL,
  street text NOT NULL,
  action_type text NOT NULL CHECK (action_type IN ('check')),
  PRIMARY KEY (hand_id, fid)
);

COMMENT ON TABLE poker.nl_holdem_pending_actions IS 'Phase 40: Pre-action (check before turn); applied when actor turn arrives';

ALTER TABLE poker.nl_holdem_pending_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_nl_holdem_pending_actions" ON poker.nl_holdem_pending_actions;
CREATE POLICY "no_direct_access_nl_holdem_pending_actions"
  ON poker.nl_holdem_pending_actions
  FOR ALL
  USING (false)
  WITH CHECK (false);

NOTIFY pgrst, 'reload schema';
