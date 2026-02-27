-- STEAL OR NO STEAL - Games, signups, rounds, matches, and settlements
-- Run in Supabase SQL Editor. Creates poker.steal_no_steal_* tables.

-- ============================================================================
-- poker.steal_no_steal_games – Game instances
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.steal_no_steal_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'STEAL OR NO STEAL',
  prize_amount numeric NOT NULL,
  decision_time_seconds integer NOT NULL DEFAULT 600 CHECK (decision_time_seconds >= 60 AND decision_time_seconds <= 3600),
  status text NOT NULL DEFAULT 'signup' CHECK (status IN ('signup', 'in_progress', 'settled', 'cancelled')),
  current_round int NOT NULL DEFAULT 1,
  staking_min_amount numeric,
  min_players_to_start integer,
  signup_closes_at timestamptz,
  start_condition text CHECK (start_condition IS NULL OR start_condition IN ('players', 'time', 'either')),
  started_at timestamptz,
  settled_by_fid bigint,
  settled_at timestamptz,
  settle_tx_hash text,
  created_by_fid bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_steal_no_steal_games_status
  ON poker.steal_no_steal_games(status);

CREATE INDEX IF NOT EXISTS idx_steal_no_steal_games_created_at
  ON poker.steal_no_steal_games(created_at DESC);

ALTER TABLE poker.steal_no_steal_games ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_games" ON poker.steal_no_steal_games;
CREATE POLICY "no_direct_access_games"
  ON poker.steal_no_steal_games
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.steal_no_steal_games IS 'STEAL OR NO STEAL: 2-player negotiation game. Player A holds briefcase, Player B decides steal/no_steal.';

-- ============================================================================
-- poker.steal_no_steal_signups – User signups per game
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.steal_no_steal_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES poker.steal_no_steal_games(id) ON DELETE CASCADE,
  fid bigint NOT NULL,
  username text,
  display_name text,
  pfp_url text,
  signed_up_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(game_id, fid)
);

CREATE INDEX IF NOT EXISTS idx_steal_no_steal_signups_game_id
  ON poker.steal_no_steal_signups(game_id);

CREATE INDEX IF NOT EXISTS idx_steal_no_steal_signups_fid
  ON poker.steal_no_steal_signups(fid);

ALTER TABLE poker.steal_no_steal_signups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_signups" ON poker.steal_no_steal_signups;
CREATE POLICY "no_direct_access_signups"
  ON poker.steal_no_steal_signups
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.steal_no_steal_signups IS 'STEAL OR NO STEAL: user signups per game with cached profiles';

-- ============================================================================
-- poker.steal_no_steal_rounds – Round instances per game
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.steal_no_steal_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES poker.steal_no_steal_games(id) ON DELETE CASCADE,
  round_number int NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(game_id, round_number)
);

CREATE INDEX IF NOT EXISTS idx_steal_no_steal_rounds_game_id
  ON poker.steal_no_steal_rounds(game_id);

CREATE INDEX IF NOT EXISTS idx_steal_no_steal_rounds_game_round
  ON poker.steal_no_steal_rounds(game_id, round_number);

ALTER TABLE poker.steal_no_steal_rounds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_rounds" ON poker.steal_no_steal_rounds;
CREATE POLICY "no_direct_access_rounds"
  ON poker.steal_no_steal_rounds
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.steal_no_steal_rounds IS 'STEAL OR NO STEAL: round instances with status tracking';

-- ============================================================================
-- poker.steal_no_steal_matches – 2-player matches within rounds
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.steal_no_steal_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES poker.steal_no_steal_rounds(id) ON DELETE CASCADE,
  match_number int NOT NULL,
  player_a_fid bigint NOT NULL,
  player_b_fid bigint NOT NULL,
  briefcase_amount numeric NOT NULL,
  decision_deadline timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'decided', 'timeout')),
  decision text CHECK (decision IS NULL OR decision IN ('steal', 'no_steal')),
  decided_at timestamptz,
  winner_fid bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(round_id, match_number)
);

CREATE INDEX IF NOT EXISTS idx_steal_no_steal_matches_round_id
  ON poker.steal_no_steal_matches(round_id);

CREATE INDEX IF NOT EXISTS idx_steal_no_steal_matches_player_a
  ON poker.steal_no_steal_matches(player_a_fid);

CREATE INDEX IF NOT EXISTS idx_steal_no_steal_matches_player_b
  ON poker.steal_no_steal_matches(player_b_fid);

CREATE INDEX IF NOT EXISTS idx_steal_no_steal_matches_round_status
  ON poker.steal_no_steal_matches(round_id, status);

ALTER TABLE poker.steal_no_steal_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_matches" ON poker.steal_no_steal_matches;
CREATE POLICY "no_direct_access_matches"
  ON poker.steal_no_steal_matches
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.steal_no_steal_matches IS 'STEAL OR NO STEAL: 2-player matches. Player A (holder) vs Player B (decider). Status: active -> decided/timeout.';

-- ============================================================================
-- poker.steal_no_steal_settlements – Settlement records (one per winner)
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.steal_no_steal_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES poker.steal_no_steal_games(id),
  winner_fid bigint NOT NULL,
  prize_amount numeric NOT NULL,
  position int,
  settled_by_fid bigint NOT NULL,
  settled_at timestamptz NOT NULL DEFAULT now(),
  tx_hash text,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_steal_no_steal_settlements_game_id
  ON poker.steal_no_steal_settlements(game_id);

CREATE INDEX IF NOT EXISTS idx_steal_no_steal_settlements_settled_at
  ON poker.steal_no_steal_settlements(settled_at DESC);

ALTER TABLE poker.steal_no_steal_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_settlements" ON poker.steal_no_steal_settlements;
CREATE POLICY "no_direct_access_settlements"
  ON poker.steal_no_steal_settlements
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.steal_no_steal_settlements IS 'STEAL OR NO STEAL: settlement records with winner and payout tx hash';
