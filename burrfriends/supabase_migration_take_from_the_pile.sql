-- TAKE FROM THE PILE - Phase 37: Single-instance game (5M BETR pile, turn order, take amount).
-- Run in Supabase SQL Editor. Creates poker.take_from_the_pile_games, take_from_the_pile_picks,
-- take_from_the_pile_events, take_from_the_pile_settlements.
-- Migration #65. Eligible = betr_games_tournament_players status = 'alive' (community 'betr').

SET search_path = poker;

-- ============================================================================
-- poker.take_from_the_pile_games – Game instances
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.take_from_the_pile_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'TAKE FROM THE PILE',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'settled', 'cancelled')),
  is_preview boolean NOT NULL DEFAULT false,
  created_by_fid bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  community text NOT NULL DEFAULT 'betr' CHECK (community IN ('betr', 'minted_merch')),
  prize_pool_amount numeric NOT NULL DEFAULT 5000000,
  current_pot_amount numeric NOT NULL DEFAULT 5000000,
  turn_order_fids bigint[] NOT NULL DEFAULT '{}',
  current_turn_ends_at timestamptz NULL,
  timer_paused_at timestamptz NULL,
  timer_paused_remaining_seconds int NULL,
  pick_deadline_minutes int NOT NULL DEFAULT 60
);

CREATE INDEX IF NOT EXISTS idx_take_from_the_pile_games_status
  ON poker.take_from_the_pile_games(status);

CREATE INDEX IF NOT EXISTS idx_take_from_the_pile_games_created_at
  ON poker.take_from_the_pile_games(created_at DESC);

ALTER TABLE poker.take_from_the_pile_games ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_take_from_the_pile_games" ON poker.take_from_the_pile_games;
CREATE POLICY "no_direct_access_take_from_the_pile_games"
  ON poker.take_from_the_pile_games
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.take_from_the_pile_games IS 'TAKE FROM THE PILE: single-instance game, 5M pot, turn order, take amount';

-- ============================================================================
-- poker.take_from_the_pile_picks – Each take (game_id, fid, amount_taken)
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.take_from_the_pile_picks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES poker.take_from_the_pile_games(id) ON DELETE CASCADE,
  fid bigint NOT NULL,
  amount_taken numeric NOT NULL CHECK (amount_taken >= 0),
  taken_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_take_from_the_pile_picks_game_id
  ON poker.take_from_the_pile_picks(game_id);

CREATE INDEX IF NOT EXISTS idx_take_from_the_pile_picks_fid
  ON poker.take_from_the_pile_picks(fid);

ALTER TABLE poker.take_from_the_pile_picks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_take_from_the_pile_picks" ON poker.take_from_the_pile_picks;
CREATE POLICY "no_direct_access_take_from_the_pile_picks"
  ON poker.take_from_the_pile_picks
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.take_from_the_pile_picks IS 'TAKE FROM THE PILE: each take (amount) per game';

-- ============================================================================
-- poker.take_from_the_pile_events – Ordered timeline (pick or skip) for Results
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.take_from_the_pile_events (
  game_id uuid NOT NULL REFERENCES poker.take_from_the_pile_games(id) ON DELETE CASCADE,
  sequence int NOT NULL,
  fid bigint NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('pick', 'skip')),
  amount_taken numeric NULL,
  PRIMARY KEY (game_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_take_from_the_pile_events_game_id
  ON poker.take_from_the_pile_events(game_id);

ALTER TABLE poker.take_from_the_pile_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_take_from_the_pile_events" ON poker.take_from_the_pile_events;
CREATE POLICY "no_direct_access_take_from_the_pile_events"
  ON poker.take_from_the_pile_events
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.take_from_the_pile_events IS 'TAKE FROM THE PILE: order they took + skips for Results';

-- ============================================================================
-- poker.take_from_the_pile_settlements – Filled at Settle (fid -> amount)
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.take_from_the_pile_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES poker.take_from_the_pile_games(id) ON DELETE CASCADE,
  fid bigint NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_take_from_the_pile_settlements_game_id
  ON poker.take_from_the_pile_settlements(game_id);

ALTER TABLE poker.take_from_the_pile_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_take_from_the_pile_settlements" ON poker.take_from_the_pile_settlements;
CREATE POLICY "no_direct_access_take_from_the_pile_settlements"
  ON poker.take_from_the_pile_settlements
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.take_from_the_pile_settlements IS 'TAKE FROM THE PILE: payout snapshot at settle (manual pay)';

NOTIFY pgrst, 'reload schema';
