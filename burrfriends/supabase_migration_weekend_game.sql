-- Phase 30: WEEKEND GAME - REMIX 3D Tunnel Racer
-- Run in Supabase SQL Editor. Creates poker.weekend_game_scores, weekend_game_rounds,
-- weekend_game_settlements, weekend_game_leaderboard_cache, weekend_game_winner_picks.

-- ============================================================================
-- poker.weekend_game_scores – Best verified score per FID (higher = better)
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.weekend_game_scores (
  fid bigint PRIMARY KEY,
  best_score int NOT NULL,
  best_cast_hash text,
  best_cast_url text,
  best_submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_weekend_game_scores_best_score
  ON poker.weekend_game_scores(best_score DESC);

ALTER TABLE poker.weekend_game_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "no_direct_access_weekend_scores"
  ON poker.weekend_game_scores
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.weekend_game_scores IS 'WEEKEND GAME: best score per FID; higher = better';

-- ============================================================================
-- poker.weekend_game_rounds – Round instances (open → closed → settled)
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.weekend_game_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'settled', 'cancelled')),
  prize_amount numeric NOT NULL,
  round_label text,
  submissions_close_at timestamptz NOT NULL,
  created_by_fid bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  settled_at timestamptz,
  settle_tx_hashes text[],
  is_preview boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_weekend_game_rounds_status
  ON poker.weekend_game_rounds(status);

CREATE INDEX IF NOT EXISTS idx_weekend_game_rounds_submissions_close_at
  ON poker.weekend_game_rounds(submissions_close_at);

CREATE INDEX IF NOT EXISTS idx_weekend_game_rounds_created_at
  ON poker.weekend_game_rounds(created_at DESC);

ALTER TABLE poker.weekend_game_rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "no_direct_access_weekend_rounds"
  ON poker.weekend_game_rounds
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.weekend_game_rounds IS 'WEEKEND GAME: discrete rounds; 5 winners per round, advantage only (no BETR payout)';

-- ============================================================================
-- poker.weekend_game_settlements – 5 rows per round (position 1-5)
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.weekend_game_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_label text,
  winner_fid bigint NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  position int NOT NULL CHECK (position >= 1 AND position <= 5),
  chosen_by_fid bigint NOT NULL,
  chosen_at timestamptz NOT NULL DEFAULT now(),
  tx_hash text,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_weekend_game_settlements_chosen_at
  ON poker.weekend_game_settlements(chosen_at DESC);

CREATE INDEX IF NOT EXISTS idx_weekend_game_settlements_winner_fid
  ON poker.weekend_game_settlements(winner_fid);

ALTER TABLE poker.weekend_game_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "no_direct_access_weekend_settlements"
  ON poker.weekend_game_settlements
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.weekend_game_settlements IS 'WEEKEND GAME: 5 winners per round; amount 0 (advantage only)';

-- ============================================================================
-- poker.weekend_game_leaderboard_cache – Single-row cache (30 min TTL)
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.weekend_game_leaderboard_cache (
  id text PRIMARY KEY DEFAULT 'default',
  as_of timestamptz,
  payload jsonb
);

ALTER TABLE poker.weekend_game_leaderboard_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "no_direct_access_weekend_leaderboard_cache"
  ON poker.weekend_game_leaderboard_cache
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.weekend_game_leaderboard_cache IS 'WEEKEND GAME: cached leaderboard; ORDER BY best_score DESC';

-- ============================================================================
-- poker.weekend_game_winner_picks – Each of 5 winners can set 2 picks for BULLIED
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.weekend_game_winner_picks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES poker.weekend_game_rounds(id) ON DELETE CASCADE,
  winner_fid bigint NOT NULL,
  pick_1_fid bigint,
  pick_2_fid bigint,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(round_id, winner_fid)
);

CREATE INDEX IF NOT EXISTS idx_weekend_game_winner_picks_round_id
  ON poker.weekend_game_winner_picks(round_id);

ALTER TABLE poker.weekend_game_winner_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "no_direct_access_weekend_winner_picks"
  ON poker.weekend_game_winner_picks
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.weekend_game_winner_picks IS 'WEEKEND GAME: 2 picks per winner for BULLIED; admins use when setting up next game';
