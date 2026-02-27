-- Phase 40 (NL HOLDEM): Play tables for deal/act/showdown. Run in Supabase SQL Editor.
-- Migration #87. Creates poker.nl_holdem_stacks, nl_holdem_hands, nl_holdem_hole_cards, nl_holdem_hand_actions.

SET search_path = poker;

-- ============================================================================
-- poker.nl_holdem_stacks – Current stack per player per game
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.nl_holdem_stacks (
  game_id uuid NOT NULL REFERENCES poker.nl_holdem_games(id) ON DELETE CASCADE,
  fid bigint NOT NULL,
  stack numeric NOT NULL DEFAULT 0,
  PRIMARY KEY (game_id, fid)
);

CREATE INDEX IF NOT EXISTS idx_nl_holdem_stacks_game_id
  ON poker.nl_holdem_stacks(game_id);

ALTER TABLE poker.nl_holdem_stacks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_nl_holdem_stacks" ON poker.nl_holdem_stacks;
CREATE POLICY "no_direct_access_nl_holdem_stacks"
  ON poker.nl_holdem_stacks
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.nl_holdem_stacks IS 'Phase 40: NL HOLDEM stack per (game_id, fid); created when game goes in_progress';

-- ============================================================================
-- poker.nl_holdem_hands – One row per hand
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.nl_holdem_hands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES poker.nl_holdem_games(id) ON DELETE CASCADE,
  hand_number int NOT NULL,
  dealer_seat_index int NOT NULL,
  sb_seat_index int NOT NULL,
  bb_seat_index int NOT NULL,
  community_cards text[] NOT NULL DEFAULT '{}',
  deck_remainder text[] NOT NULL DEFAULT '{}',
  pot numeric NOT NULL DEFAULT 0,
  current_street text NOT NULL DEFAULT 'preflop' CHECK (current_street IN ('preflop', 'flop', 'turn', 'river', 'showdown')),
  current_bet numeric NOT NULL DEFAULT 0,
  min_raise numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'showdown', 'complete')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nl_holdem_hands_game_id_created_at
  ON poker.nl_holdem_hands(game_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_nl_holdem_hands_one_active_per_game
  ON poker.nl_holdem_hands(game_id)
  WHERE status IN ('active', 'showdown');

ALTER TABLE poker.nl_holdem_hands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_nl_holdem_hands" ON poker.nl_holdem_hands;
CREATE POLICY "no_direct_access_nl_holdem_hands"
  ON poker.nl_holdem_hands
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.nl_holdem_hands IS 'Phase 40: NL HOLDEM hand state; deck_remainder used for flop/turn/river';

-- ============================================================================
-- poker.nl_holdem_hole_cards – Hole cards per player per hand (secret until showdown)
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.nl_holdem_hole_cards (
  hand_id uuid NOT NULL REFERENCES poker.nl_holdem_hands(id) ON DELETE CASCADE,
  fid bigint NOT NULL,
  cards text[] NOT NULL,
  PRIMARY KEY (hand_id, fid)
);

CREATE INDEX IF NOT EXISTS idx_nl_holdem_hole_cards_hand_id
  ON poker.nl_holdem_hole_cards(hand_id);

ALTER TABLE poker.nl_holdem_hole_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_nl_holdem_hole_cards" ON poker.nl_holdem_hole_cards;
CREATE POLICY "no_direct_access_nl_holdem_hole_cards"
  ON poker.nl_holdem_hole_cards
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.nl_holdem_hole_cards IS 'Phase 40: NL HOLDEM hole cards; API returns only for requester';

-- ============================================================================
-- poker.nl_holdem_hand_actions – Betting history per hand
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.nl_holdem_hand_actions (
  hand_id uuid NOT NULL REFERENCES poker.nl_holdem_hands(id) ON DELETE CASCADE,
  fid bigint NOT NULL,
  action_type text NOT NULL CHECK (action_type IN ('post_sb', 'post_bb', 'fold', 'check', 'call', 'bet', 'raise', 'all_in')),
  amount numeric NOT NULL DEFAULT 0,
  sequence int NOT NULL,
  street text NOT NULL CHECK (street IN ('preflop', 'flop', 'turn', 'river'))
);

CREATE INDEX IF NOT EXISTS idx_nl_holdem_hand_actions_hand_id_sequence
  ON poker.nl_holdem_hand_actions(hand_id, sequence);

ALTER TABLE poker.nl_holdem_hand_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_nl_holdem_hand_actions" ON poker.nl_holdem_hand_actions;
CREATE POLICY "no_direct_access_nl_holdem_hand_actions"
  ON poker.nl_holdem_hand_actions
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.nl_holdem_hand_actions IS 'Phase 40: NL HOLDEM actions per hand; street required for round completion';

NOTIFY pgrst, 'reload schema';
