-- IN OR OUT - Phase 35: Single-instance game (quit for $10M share or stay).
-- Run in Supabase SQL Editor. Creates poker.in_or_out_games, in_or_out_choices.
-- Migration #61. No signups table (eligible from betr_games_tournament_players status = 'alive').

-- ============================================================================
-- poker.in_or_out_games – Game instances
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.in_or_out_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'IN OR OUT',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'settled', 'cancelled')),
  is_preview boolean NOT NULL DEFAULT false,
  created_by_fid bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_in_or_out_games_status
  ON poker.in_or_out_games(status);

CREATE INDEX IF NOT EXISTS idx_in_or_out_games_created_at
  ON poker.in_or_out_games(created_at DESC);

ALTER TABLE poker.in_or_out_games ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_in_or_out_games" ON poker.in_or_out_games;
CREATE POLICY "no_direct_access_in_or_out_games"
  ON poker.in_or_out_games
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.in_or_out_games IS 'IN OR OUT: single-instance game (quit for share or stay)';

-- ============================================================================
-- poker.in_or_out_choices – Player choice per game (quit or stay)
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.in_or_out_choices (
  game_id uuid NOT NULL REFERENCES poker.in_or_out_games(id) ON DELETE CASCADE,
  fid bigint NOT NULL,
  choice text NOT NULL CHECK (choice IN ('quit', 'stay')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, fid)
);

CREATE INDEX IF NOT EXISTS idx_in_or_out_choices_game_id
  ON poker.in_or_out_choices(game_id);

CREATE INDEX IF NOT EXISTS idx_in_or_out_choices_fid
  ON poker.in_or_out_choices(fid);

ALTER TABLE poker.in_or_out_choices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_in_or_out_choices" ON poker.in_or_out_choices;
CREATE POLICY "no_direct_access_in_or_out_choices"
  ON poker.in_or_out_choices
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.in_or_out_choices IS 'IN OR OUT: player choice (quit or stay) per game; unquit = update to stay until game closed';
