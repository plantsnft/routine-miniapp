-- BETR GUESSER - Games, guesses, and settlements
-- Run in Supabase SQL Editor. Creates poker.betr_guesser_games, betr_guesser_guesses, betr_guesser_settlements.

-- ============================================================================
-- poker.betr_guesser_games – Game instances
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.betr_guesser_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'BETR GUESSER',
  prize_amount numeric NOT NULL,
  guesses_close_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'settled', 'cancelled')),
  winner_fid bigint,
  winner_guess int CHECK (winner_guess IS NULL OR (winner_guess >= 1 AND winner_guess <= 100)),
  settled_by_fid bigint,
  settled_at timestamptz,
  settle_tx_hash text,
  created_by_fid bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_betr_guesser_games_guesses_close_at
  ON poker.betr_guesser_games(guesses_close_at);

CREATE INDEX IF NOT EXISTS idx_betr_guesser_games_status
  ON poker.betr_guesser_games(status);

CREATE INDEX IF NOT EXISTS idx_betr_guesser_games_created_at
  ON poker.betr_guesser_games(created_at DESC);

ALTER TABLE poker.betr_guesser_games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "no_direct_access_games"
  ON poker.betr_guesser_games
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.betr_guesser_games IS 'BETR GUESSER: game instances with countdown timer and prize amount';

-- ============================================================================
-- poker.betr_guesser_guesses – User guesses per game
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.betr_guesser_guesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES poker.betr_guesser_games(id) ON DELETE CASCADE,
  fid bigint NOT NULL,
  guess int NOT NULL CHECK (guess >= 1 AND guess <= 100),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(game_id, fid)
);

CREATE INDEX IF NOT EXISTS idx_betr_guesser_guesses_game_id
  ON poker.betr_guesser_guesses(game_id);

CREATE INDEX IF NOT EXISTS idx_betr_guesser_guesses_fid
  ON poker.betr_guesser_guesses(fid);

CREATE INDEX IF NOT EXISTS idx_betr_guesser_guesses_game_guess
  ON poker.betr_guesser_guesses(game_id, guess);

ALTER TABLE poker.betr_guesser_guesses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "no_direct_access_guesses"
  ON poker.betr_guesser_guesses
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.betr_guesser_guesses IS 'BETR GUESSER: user guesses (1-100) per game, one per user per game';

-- ============================================================================
-- poker.betr_guesser_settlements – Settlement records
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.betr_guesser_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES poker.betr_guesser_games(id),
  winner_fid bigint NOT NULL,
  winner_guess int NOT NULL CHECK (winner_guess >= 1 AND winner_guess <= 100),
  prize_amount numeric NOT NULL,
  settled_by_fid bigint NOT NULL,
  settled_at timestamptz NOT NULL DEFAULT now(),
  tx_hash text,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_betr_guesser_settlements_game_id
  ON poker.betr_guesser_settlements(game_id);

CREATE INDEX IF NOT EXISTS idx_betr_guesser_settlements_settled_at
  ON poker.betr_guesser_settlements(settled_at DESC);

ALTER TABLE poker.betr_guesser_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "no_direct_access_settlements"
  ON poker.betr_guesser_settlements
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.betr_guesser_settlements IS 'BETR GUESSER: settlement records with winner and payout tx hash';
