-- KILL OR KEEP - Phase 38: Single-instance game (keep or kill one per turn; end when remaining ≤ 10 and everyone had a turn).
-- Run in Supabase SQL Editor. Creates poker.kill_or_keep_games, kill_or_keep_actions.
-- Migration #67. Eligible = betr_games_tournament_players status = 'alive' (community 'betr').

SET search_path = poker;

-- ============================================================================
-- poker.kill_or_keep_games – Game instances
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.kill_or_keep_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'KILL OR KEEP',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'settled', 'cancelled')),
  is_preview boolean NOT NULL DEFAULT false,
  created_by_fid bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  community text NOT NULL DEFAULT 'betr' CHECK (community IN ('betr', 'minted_merch')),
  turn_order_fids bigint[] NOT NULL DEFAULT '{}',
  amount_by_fid jsonb NULL,
  remaining_fids bigint[] NOT NULL DEFAULT '{}',
  eliminated_fids bigint[] NOT NULL DEFAULT '{}',
  current_turn_fid bigint NULL
);

CREATE INDEX IF NOT EXISTS idx_kill_or_keep_games_status
  ON poker.kill_or_keep_games(status);

CREATE INDEX IF NOT EXISTS idx_kill_or_keep_games_created_at
  ON poker.kill_or_keep_games(created_at DESC);

ALTER TABLE poker.kill_or_keep_games ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_kill_or_keep_games" ON poker.kill_or_keep_games;
CREATE POLICY "no_direct_access_kill_or_keep_games"
  ON poker.kill_or_keep_games
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.kill_or_keep_games IS 'KILL OR KEEP: single-instance game, keep or kill one per turn, end when remaining ≤ 10 and round complete';

-- ============================================================================
-- poker.kill_or_keep_actions – Each keep/kill/roulette action
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.kill_or_keep_actions (
  game_id uuid NOT NULL REFERENCES poker.kill_or_keep_games(id) ON DELETE CASCADE,
  sequence int NOT NULL,
  actor_fid bigint NOT NULL,
  action text NOT NULL CHECK (action IN ('keep', 'kill', 'roulette')),
  target_fid bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_kill_or_keep_actions_game_id
  ON poker.kill_or_keep_actions(game_id);

ALTER TABLE poker.kill_or_keep_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_kill_or_keep_actions" ON poker.kill_or_keep_actions;
CREATE POLICY "no_direct_access_kill_or_keep_actions"
  ON poker.kill_or_keep_actions
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.kill_or_keep_actions IS 'KILL OR KEEP: each keep/kill/roulette action for Activity';

NOTIFY pgrst, 'reload schema';
