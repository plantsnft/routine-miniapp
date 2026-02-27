-- REMIX BETR - Scores, settlements, and leaderboard cache
-- Run in Supabase SQL Editor. Creates poker.remix_betr_scores, remix_betr_settlements, remix_betr_leaderboard_cache.

-- ============================================================================
-- poker.remix_betr_scores – Best verified score per FID
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.remix_betr_scores (
  fid bigint PRIMARY KEY,
  best_score int NOT NULL,
  best_cast_hash text,
  best_cast_url text,
  best_submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_remix_betr_scores_best_score
  ON poker.remix_betr_scores(best_score DESC);

ALTER TABLE poker.remix_betr_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "no_direct_access_scores"
  ON poker.remix_betr_scores
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.remix_betr_scores IS 'REMIX BETR: best verified score per FID; proof cast stored for leaderboard';

-- ============================================================================
-- poker.remix_betr_settlements – One row per winner per round (3 per settle)
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.remix_betr_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_label text,
  winner_fid bigint NOT NULL,
  amount numeric NOT NULL,
  position int NOT NULL,
  chosen_by_fid bigint NOT NULL,
  chosen_at timestamptz NOT NULL DEFAULT now(),
  tx_hash text,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_remix_betr_settlements_chosen_at
  ON poker.remix_betr_settlements(chosen_at DESC);

CREATE INDEX IF NOT EXISTS idx_remix_betr_settlements_winner_fid
  ON poker.remix_betr_settlements(winner_fid);

ALTER TABLE poker.remix_betr_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "no_direct_access_settlements"
  ON poker.remix_betr_settlements
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.remix_betr_settlements IS 'REMIX BETR: settlement records, 3 rows per settle (1st/2nd/3rd)';

-- ============================================================================
-- poker.remix_betr_leaderboard_cache – Single-row cache for leaderboard (30 min TTL)
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.remix_betr_leaderboard_cache (
  id text PRIMARY KEY DEFAULT 'default',
  as_of timestamptz,
  payload jsonb
);

ALTER TABLE poker.remix_betr_leaderboard_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "no_direct_access_leaderboard_cache"
  ON poker.remix_betr_leaderboard_cache
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.remix_betr_leaderboard_cache IS 'REMIX BETR: cached leaderboard; rebuilt when as_of older than 30 min';
