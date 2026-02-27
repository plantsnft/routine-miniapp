-- BETR SUPERBOWL PROPS - Super Bowl Squares game
-- Run in Supabase SQL Editor. Creates poker.superbowl_squares_games, superbowl_squares_claims, superbowl_squares_settlements.

-- ============================================================================
-- poker.superbowl_squares_games – Game instances
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.superbowl_squares_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'BETR SUPERBOWL PROPS',
  total_prize_pool numeric NOT NULL DEFAULT 30000000,
  
  -- Prize distribution percentages (must sum to 1.0)
  prize_q1_pct numeric NOT NULL DEFAULT 0.15,
  prize_q2_pct numeric NOT NULL DEFAULT 0.15,
  prize_halftime_pct numeric NOT NULL DEFAULT 0.30,
  prize_final_pct numeric NOT NULL DEFAULT 0.40,
  
  -- Tier 1: 200M stakers get 3 squares
  tier1_min_stake numeric NOT NULL DEFAULT 200000000,
  tier1_squares_per_user int NOT NULL DEFAULT 3,
  tier1_opens_at timestamptz,
  tier1_closes_at timestamptz,
  
  -- Tier 2: 100M stakers get 2 squares
  tier2_min_stake numeric NOT NULL DEFAULT 100000000,
  tier2_squares_per_user int NOT NULL DEFAULT 2,
  tier2_opens_at timestamptz,
  tier2_closes_at timestamptz,
  
  -- Tier 3: 50M stakers get 1 square
  tier3_min_stake numeric NOT NULL DEFAULT 50000000,
  tier3_squares_per_user int NOT NULL DEFAULT 1,
  tier3_opens_at timestamptz,
  
  -- Square limits
  auto_squares_limit int NOT NULL DEFAULT 90,
  admin_squares_limit int NOT NULL DEFAULT 10,
  
  -- Game status: setup -> claiming -> locked -> settled (or cancelled)
  status text NOT NULL DEFAULT 'setup' CHECK (status IN ('setup', 'claiming', 'locked', 'settled', 'cancelled')),
  
  -- Score results (admin enters after Super Bowl)
  score_q1_team1 int,
  score_q1_team2 int,
  score_q2_team1 int,
  score_q2_team2 int,
  score_halftime_team1 int,
  score_halftime_team2 int,
  score_final_team1 int,
  score_final_team2 int,
  
  -- Randomized row/column numbers (0-9 shuffled), null until randomized
  row_numbers int[],
  col_numbers int[],
  numbers_randomized_at timestamptz,
  
  -- Metadata
  created_by_fid bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  settled_by_fid bigint,
  settled_at timestamptz,
  settle_tx_hash text
);

CREATE INDEX IF NOT EXISTS idx_superbowl_squares_games_status
  ON poker.superbowl_squares_games(status);

CREATE INDEX IF NOT EXISTS idx_superbowl_squares_games_created_at
  ON poker.superbowl_squares_games(created_at DESC);

ALTER TABLE poker.superbowl_squares_games ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_sbs_games" ON poker.superbowl_squares_games;
CREATE POLICY "no_direct_access_sbs_games"
  ON poker.superbowl_squares_games
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.superbowl_squares_games IS 'BETR SUPERBOWL PROPS: 10x10 grid game with tiered staking access and sequential claiming windows';

-- ============================================================================
-- poker.superbowl_squares_claims – Square claims (who owns which square)
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.superbowl_squares_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES poker.superbowl_squares_games(id) ON DELETE CASCADE,
  fid bigint NOT NULL,
  square_index int NOT NULL CHECK (square_index >= 0 AND square_index < 100),
  claim_type text NOT NULL CHECK (claim_type IN ('tier1', 'tier2', 'tier3', 'admin')),
  display_name text,
  pfp_url text,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(game_id, square_index)
);

CREATE INDEX IF NOT EXISTS idx_superbowl_squares_claims_game_id
  ON poker.superbowl_squares_claims(game_id);

CREATE INDEX IF NOT EXISTS idx_superbowl_squares_claims_fid
  ON poker.superbowl_squares_claims(fid);

CREATE INDEX IF NOT EXISTS idx_superbowl_squares_claims_game_fid
  ON poker.superbowl_squares_claims(game_id, fid);

ALTER TABLE poker.superbowl_squares_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_sbs_claims" ON poker.superbowl_squares_claims;
CREATE POLICY "no_direct_access_sbs_claims"
  ON poker.superbowl_squares_claims
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.superbowl_squares_claims IS 'BETR SUPERBOWL PROPS: square claims with tier tracking, one claim per square per game';

-- ============================================================================
-- poker.superbowl_squares_settlements – Settlement records (one per quarter winner)
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.superbowl_squares_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES poker.superbowl_squares_games(id),
  winner_fid bigint NOT NULL,
  quarter text NOT NULL CHECK (quarter IN ('q1', 'q2', 'halftime', 'final')),
  prize_amount numeric NOT NULL,
  square_index int NOT NULL,
  row_digit int NOT NULL,
  col_digit int NOT NULL,
  settled_by_fid bigint NOT NULL,
  settled_at timestamptz NOT NULL DEFAULT now(),
  tx_hash text,
  UNIQUE(game_id, quarter)
);

CREATE INDEX IF NOT EXISTS idx_superbowl_squares_settlements_game_id
  ON poker.superbowl_squares_settlements(game_id);

CREATE INDEX IF NOT EXISTS idx_superbowl_squares_settlements_settled_at
  ON poker.superbowl_squares_settlements(settled_at DESC);

CREATE INDEX IF NOT EXISTS idx_superbowl_squares_settlements_winner_fid
  ON poker.superbowl_squares_settlements(winner_fid);

ALTER TABLE poker.superbowl_squares_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_sbs_settlements" ON poker.superbowl_squares_settlements;
CREATE POLICY "no_direct_access_sbs_settlements"
  ON poker.superbowl_squares_settlements
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.superbowl_squares_settlements IS 'BETR SUPERBOWL PROPS: settlement records per quarter winner with winning digits and tx hash';
