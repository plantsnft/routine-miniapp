-- Migration #51: Phase 26 - BETR SUPERBOWL: PROPS
-- Creates tables for 25 prop bets + tiebreaker game

-- Table 1: Games
CREATE TABLE IF NOT EXISTS poker.superbowl_props_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT 'BETR SUPERBOWL: PROPS',
  total_prize_pool NUMERIC NOT NULL DEFAULT 10000000,
  staking_min_amount BIGINT DEFAULT NULL,
  submissions_close_at TIMESTAMPTZ NOT NULL DEFAULT '2026-02-09T23:30:00.000Z',
  actual_total_score INT DEFAULT NULL,
  answers_json JSONB DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'settled')),
  created_by_fid BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at TIMESTAMPTZ DEFAULT NULL,
  settle_tx_hash TEXT DEFAULT NULL
);

-- Table 2: Submissions (player picks)
CREATE TABLE IF NOT EXISTS poker.superbowl_props_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES poker.superbowl_props_games(id) ON DELETE CASCADE,
  fid BIGINT NOT NULL,
  picks_json JSONB NOT NULL,
  total_score_guess INT NOT NULL,
  score INT DEFAULT NULL,
  display_name TEXT DEFAULT NULL,
  pfp_url TEXT DEFAULT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(game_id, fid)
);

-- Table 3: Settlements (winner payouts)
CREATE TABLE IF NOT EXISTS poker.superbowl_props_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES poker.superbowl_props_games(id) ON DELETE CASCADE,
  winner_fid BIGINT NOT NULL,
  rank INT NOT NULL,
  prize_pct NUMERIC NOT NULL,
  prize_amount NUMERIC NOT NULL,
  tx_hash TEXT DEFAULT NULL,
  settled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_superbowl_props_games_status ON poker.superbowl_props_games(status);
CREATE INDEX IF NOT EXISTS idx_superbowl_props_submissions_game_id ON poker.superbowl_props_submissions(game_id);
CREATE INDEX IF NOT EXISTS idx_superbowl_props_submissions_fid ON poker.superbowl_props_submissions(fid);
CREATE INDEX IF NOT EXISTS idx_superbowl_props_settlements_game_id ON poker.superbowl_props_settlements(game_id);

-- Comments
COMMENT ON TABLE poker.superbowl_props_games IS 'Phase 26: BETR SUPERBOWL: PROPS - 25 prop bets + tiebreaker';
COMMENT ON TABLE poker.superbowl_props_submissions IS 'Player submissions with 25 picks and total score guess';
COMMENT ON TABLE poker.superbowl_props_settlements IS 'Winner payouts for top 5 finishers';

-- Phase 26.11: Add username column for profile caching (run if table already exists)
ALTER TABLE poker.superbowl_props_submissions 
ADD COLUMN IF NOT EXISTS username TEXT DEFAULT NULL;
