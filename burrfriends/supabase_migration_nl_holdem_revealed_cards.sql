-- Phase 40 (NL HOLDEM): Voluntary and showdown card reveal — players can show cards after hand ends.
-- Run after #97 (pending_actions).
-- Migration #98.

SET search_path = poker;

CREATE TABLE IF NOT EXISTS poker.nl_holdem_hand_revealed_cards (
  hand_id uuid NOT NULL REFERENCES poker.nl_holdem_hands(id) ON DELETE CASCADE,
  fid bigint NOT NULL,
  cards text[] NOT NULL,
  PRIMARY KEY (hand_id, fid)
);

COMMENT ON TABLE poker.nl_holdem_hand_revealed_cards IS 'Phase 40: Cards revealed at showdown or voluntarily after hand; spectators see these';

ALTER TABLE poker.nl_holdem_hand_revealed_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_nl_holdem_hand_revealed_cards" ON poker.nl_holdem_hand_revealed_cards;
CREATE POLICY "no_direct_access_nl_holdem_hand_revealed_cards"
  ON poker.nl_holdem_hand_revealed_cards
  FOR ALL
  USING (false)
  WITH CHECK (false);

NOTIFY pgrst, 'reload schema';
