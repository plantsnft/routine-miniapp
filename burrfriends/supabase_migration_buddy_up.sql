-- BUDDY UP - Games, signups, rounds, groups, votes, and settlements
-- Run in Supabase SQL Editor. Creates poker.buddy_up_games, buddy_up_signups, buddy_up_rounds, buddy_up_groups, buddy_up_votes, buddy_up_settlements.

-- ============================================================================
-- poker.buddy_up_games – Game instances
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.buddy_up_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'BUDDY UP',
  prize_amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'signup' CHECK (status IN ('signup', 'in_progress', 'settled', 'cancelled')),
  current_round int NOT NULL DEFAULT 1,
  started_at timestamptz,
  settled_by_fid bigint,
  settled_at timestamptz,
  settle_tx_hash text,
  created_by_fid bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_buddy_up_games_status
  ON poker.buddy_up_games(status);

CREATE INDEX IF NOT EXISTS idx_buddy_up_games_created_at
  ON poker.buddy_up_games(created_at DESC);

ALTER TABLE poker.buddy_up_games ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_games" ON poker.buddy_up_games;
CREATE POLICY "no_direct_access_games"
  ON poker.buddy_up_games
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.buddy_up_games IS 'BUDDY UP: game instances with signup and in-progress states';

-- ============================================================================
-- poker.buddy_up_signups – User signups per game
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.buddy_up_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES poker.buddy_up_games(id) ON DELETE CASCADE,
  fid bigint NOT NULL,
  signed_up_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(game_id, fid)
);

CREATE INDEX IF NOT EXISTS idx_buddy_up_signups_game_id
  ON poker.buddy_up_signups(game_id);

CREATE INDEX IF NOT EXISTS idx_buddy_up_signups_fid
  ON poker.buddy_up_signups(fid);

ALTER TABLE poker.buddy_up_signups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_signups" ON poker.buddy_up_signups;
CREATE POLICY "no_direct_access_signups"
  ON poker.buddy_up_signups
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.buddy_up_signups IS 'BUDDY UP: user signups per game, one per user per game';

-- ============================================================================
-- poker.buddy_up_rounds – Round instances per game
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.buddy_up_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES poker.buddy_up_games(id) ON DELETE CASCADE,
  round_number int NOT NULL,
  group_size int NOT NULL CHECK (group_size >= 1 AND group_size <= 10),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'grouping', 'voting', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(game_id, round_number)
);

CREATE INDEX IF NOT EXISTS idx_buddy_up_rounds_game_id
  ON poker.buddy_up_rounds(game_id);

CREATE INDEX IF NOT EXISTS idx_buddy_up_rounds_game_round
  ON poker.buddy_up_rounds(game_id, round_number);

ALTER TABLE poker.buddy_up_rounds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_rounds" ON poker.buddy_up_rounds;
CREATE POLICY "no_direct_access_rounds"
  ON poker.buddy_up_rounds
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.buddy_up_rounds IS 'BUDDY UP: round instances with group size and status';

-- ============================================================================
-- poker.buddy_up_groups – Groups within rounds
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.buddy_up_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES poker.buddy_up_rounds(id) ON DELETE CASCADE,
  group_number int NOT NULL,
  fids bigint[] NOT NULL,
  status text NOT NULL DEFAULT 'voting' CHECK (status IN ('voting', 'completed', 'eliminated')),
  winner_fid bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(round_id, group_number)
);

CREATE INDEX IF NOT EXISTS idx_buddy_up_groups_round_id
  ON poker.buddy_up_groups(round_id);

CREATE INDEX IF NOT EXISTS idx_buddy_up_groups_round_group
  ON poker.buddy_up_groups(round_id, group_number);

ALTER TABLE poker.buddy_up_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_groups" ON poker.buddy_up_groups;
CREATE POLICY "no_direct_access_groups"
  ON poker.buddy_up_groups
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.buddy_up_groups IS 'BUDDY UP: groups within rounds with member FIDs array and voting status';

-- ============================================================================
-- poker.buddy_up_votes – Individual votes per group
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.buddy_up_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES poker.buddy_up_groups(id) ON DELETE CASCADE,
  voter_fid bigint NOT NULL,
  voted_for_fid bigint NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, voter_fid)
);

CREATE INDEX IF NOT EXISTS idx_buddy_up_votes_group_id
  ON poker.buddy_up_votes(group_id);

CREATE INDEX IF NOT EXISTS idx_buddy_up_votes_voter_fid
  ON poker.buddy_up_votes(voter_fid);

CREATE INDEX IF NOT EXISTS idx_buddy_up_votes_group_voted_for
  ON poker.buddy_up_votes(group_id, voted_for_fid);

ALTER TABLE poker.buddy_up_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_votes" ON poker.buddy_up_votes;
CREATE POLICY "no_direct_access_votes"
  ON poker.buddy_up_votes
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.buddy_up_votes IS 'BUDDY UP: individual votes per group, one vote per person per group';

-- ============================================================================
-- poker.buddy_up_settlements – Settlement records (one per winner)
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.buddy_up_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES poker.buddy_up_games(id),
  winner_fid bigint NOT NULL,
  prize_amount numeric NOT NULL,
  position int,
  settled_by_fid bigint NOT NULL,
  settled_at timestamptz NOT NULL DEFAULT now(),
  tx_hash text,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_buddy_up_settlements_game_id
  ON poker.buddy_up_settlements(game_id);

CREATE INDEX IF NOT EXISTS idx_buddy_up_settlements_settled_at
  ON poker.buddy_up_settlements(settled_at DESC);

ALTER TABLE poker.buddy_up_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_settlements" ON poker.buddy_up_settlements;
CREATE POLICY "no_direct_access_settlements"
  ON poker.buddy_up_settlements
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.buddy_up_settlements IS 'BUDDY UP: settlement records with winner and payout tx hash (one record per winner)';
