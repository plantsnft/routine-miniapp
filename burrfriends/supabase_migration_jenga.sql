-- JENGA - Games, signups, moves, and settlements
-- Run in Supabase SQL Editor. Creates poker.jenga_games, jenga_signups, jenga_moves, jenga_settlements.

-- ============================================================================
-- poker.jenga_games – Game instances
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.jenga_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'JENGA',
  prize_amount numeric NOT NULL,
  turn_time_seconds integer NOT NULL CHECK (turn_time_seconds >= 60 AND turn_time_seconds <= 3600),
  status text NOT NULL DEFAULT 'signup' CHECK (status IN ('signup', 'in_progress', 'settled', 'cancelled')),
  current_turn_fid bigint,
  current_turn_started_at timestamptz,
  turn_order bigint[] NOT NULL DEFAULT '{}',
  eliminated_fids bigint[] NOT NULL DEFAULT '{}',
  tower_state jsonb NOT NULL,
  move_count integer NOT NULL DEFAULT 0,
  move_lock_id text,
  move_locked_at timestamptz,
  game_ended_reason text CHECK (game_ended_reason IN ('last_player_standing', 'all_eliminated', 'admin_settled', NULL)),
  started_at timestamptz,
  settled_by_fid bigint,
  settled_at timestamptz,
  settle_tx_hash text,
  created_by_fid bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jenga_games_status
  ON poker.jenga_games(status);

CREATE INDEX IF NOT EXISTS idx_jenga_games_created_at
  ON poker.jenga_games(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_jenga_games_timeout_check
  ON poker.jenga_games(current_turn_started_at, turn_time_seconds)
  WHERE status = 'in_progress' AND current_turn_started_at IS NOT NULL;

ALTER TABLE poker.jenga_games ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_games" ON poker.jenga_games;
CREATE POLICY "no_direct_access_games"
  ON poker.jenga_games
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.jenga_games IS 'JENGA: game instances with turn-based gameplay, timeout elimination, and admin controls';

-- ============================================================================
-- poker.jenga_signups – User signups per game (with cached profiles)
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.jenga_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES poker.jenga_games(id) ON DELETE CASCADE,
  fid bigint NOT NULL,
  username text,
  display_name text,
  pfp_url text,
  signed_up_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(game_id, fid)
);

CREATE INDEX IF NOT EXISTS idx_jenga_signups_game_id
  ON poker.jenga_signups(game_id);

CREATE INDEX IF NOT EXISTS idx_jenga_signups_fid
  ON poker.jenga_signups(fid);

ALTER TABLE poker.jenga_signups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_signups" ON poker.jenga_signups;
CREATE POLICY "no_direct_access_signups"
  ON poker.jenga_signups
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.jenga_signups IS 'JENGA: user signups per game with cached profiles (username, display_name, pfp_url) to minimize Neynar API calls';

-- ============================================================================
-- poker.jenga_moves – Individual moves per game
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.jenga_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES poker.jenga_games(id) ON DELETE CASCADE,
  fid bigint NOT NULL,
  move_data jsonb NOT NULL,
  move_number integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jenga_moves_game_id
  ON poker.jenga_moves(game_id);

CREATE INDEX IF NOT EXISTS idx_jenga_moves_fid
  ON poker.jenga_moves(fid);

CREATE INDEX IF NOT EXISTS idx_jenga_moves_game_move_number
  ON poker.jenga_moves(game_id, move_number);

ALTER TABLE poker.jenga_moves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_moves" ON poker.jenga_moves;
CREATE POLICY "no_direct_access_moves"
  ON poker.jenga_moves
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.jenga_moves IS 'JENGA: individual moves per game with block position, direction, and sequence number';

-- ============================================================================
-- poker.jenga_settlements – Settlement records
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.jenga_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES poker.jenga_games(id),
  winner_fid bigint NOT NULL,
  prize_amount numeric NOT NULL,
  settled_by_fid bigint NOT NULL,
  settled_at timestamptz NOT NULL DEFAULT now(),
  tx_hash text,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_jenga_settlements_game_id
  ON poker.jenga_settlements(game_id);

CREATE INDEX IF NOT EXISTS idx_jenga_settlements_settled_at
  ON poker.jenga_settlements(settled_at DESC);

ALTER TABLE poker.jenga_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_settlements" ON poker.jenga_settlements;
CREATE POLICY "no_direct_access_settlements"
  ON poker.jenga_settlements
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.jenga_settlements IS 'JENGA: settlement records with winner and payout tx hash';
