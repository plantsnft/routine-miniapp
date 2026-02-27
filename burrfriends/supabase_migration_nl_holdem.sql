-- Phase 40 (NL HOLDEM): In-app No-Limit Hold'em Sit & Go. Run in Supabase SQL Editor.
-- Migration #85. Creates poker.nl_holdem_games, poker.nl_holdem_signups.

SET search_path = poker;

-- ============================================================================
-- poker.nl_holdem_games – Game instances
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.nl_holdem_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'NL HOLDEM',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'settled', 'cancelled')),
  is_preview boolean NOT NULL DEFAULT false,
  created_by_fid bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  community text NOT NULL DEFAULT 'betr' CHECK (community IN ('betr', 'minted_merch')),
  starting_stacks int NOT NULL DEFAULT 1500,
  blind_duration_minutes int NOT NULL DEFAULT 10,
  blind_increase_pct int NOT NULL DEFAULT 25,
  starting_small_blind int NOT NULL DEFAULT 10,
  reshuffle_type text NOT NULL DEFAULT 'hands' CHECK (reshuffle_type IN ('time', 'hands')),
  reshuffle_interval int NOT NULL DEFAULT 10,
  number_of_winners int NOT NULL DEFAULT 1,
  prize_amounts numeric[] NOT NULL DEFAULT ARRAY[1000000]::numeric[],
  prize_currency text NOT NULL DEFAULT 'BETR',
  staking_min_amount numeric NULL,
  game_password text NULL,
  max_participants int NOT NULL DEFAULT 9,
  seat_order_fids bigint[] NULL
);

CREATE INDEX IF NOT EXISTS idx_nl_holdem_games_status
  ON poker.nl_holdem_games(status);

CREATE INDEX IF NOT EXISTS idx_nl_holdem_games_created_at
  ON poker.nl_holdem_games(created_at DESC);

ALTER TABLE poker.nl_holdem_games ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_nl_holdem_games" ON poker.nl_holdem_games;
CREATE POLICY "no_direct_access_nl_holdem_games"
  ON poker.nl_holdem_games
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.nl_holdem_games IS 'Phase 40: NL HOLDEM in-app Sit & Go; config: stacks, blinds, reshuffle, prizes, staking';

-- ============================================================================
-- poker.nl_holdem_signups – Players who joined the game
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.nl_holdem_signups (
  game_id uuid NOT NULL REFERENCES poker.nl_holdem_games(id) ON DELETE CASCADE,
  fid bigint NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, fid)
);

CREATE INDEX IF NOT EXISTS idx_nl_holdem_signups_game_id
  ON poker.nl_holdem_signups(game_id);

ALTER TABLE poker.nl_holdem_signups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_nl_holdem_signups" ON poker.nl_holdem_signups;
CREATE POLICY "no_direct_access_nl_holdem_signups"
  ON poker.nl_holdem_signups
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.nl_holdem_signups IS 'Phase 40: NL HOLDEM signups (join); UNIQUE game_id, fid';

NOTIFY pgrst, 'reload schema';
