-- THE MOLE - Games, signups, rounds, groups (with mole), votes, chat, settlements
-- Run in Supabase SQL Editor. Mirrors BUDDY UP; adds mole_fid per group and mole_won path.
-- Rules: All must agree on who the mole is AND be correct to advance; else that group's mole wins the whole game.

-- ============================================================================
-- poker.mole_games – Game instances
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.mole_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'THE MOLE',
  prize_amount numeric NOT NULL,
  staking_min_amount numeric,
  status text NOT NULL DEFAULT 'signup' CHECK (status IN ('signup', 'in_progress', 'mole_won', 'settled', 'cancelled')),
  current_round int NOT NULL DEFAULT 1,
  mole_winner_fid bigint,
  started_at timestamptz,
  settled_by_fid bigint,
  settled_at timestamptz,
  settle_tx_hash text,
  created_by_fid bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mole_games_status
  ON poker.mole_games(status);

CREATE INDEX IF NOT EXISTS idx_mole_games_created_at
  ON poker.mole_games(created_at DESC);

ALTER TABLE poker.mole_games ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_mole_games" ON poker.mole_games;
CREATE POLICY "no_direct_access_mole_games"
  ON poker.mole_games
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.mole_games IS 'THE MOLE: game instances. mole_winner_fid set when a group fails (mole wins game).';
COMMENT ON COLUMN poker.mole_games.mole_winner_fid IS 'Set when status=mole_won: the mole who won the whole game (from the group that failed).';

-- ============================================================================
-- poker.mole_signups – User signups per game
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.mole_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES poker.mole_games(id) ON DELETE CASCADE,
  fid bigint NOT NULL,
  signed_up_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(game_id, fid)
);

CREATE INDEX IF NOT EXISTS idx_mole_signups_game_id
  ON poker.mole_signups(game_id);

CREATE INDEX IF NOT EXISTS idx_mole_signups_fid
  ON poker.mole_signups(fid);

ALTER TABLE poker.mole_signups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_mole_signups" ON poker.mole_signups;
CREATE POLICY "no_direct_access_mole_signups"
  ON poker.mole_signups
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.mole_signups IS 'THE MOLE: user signups per game, one per user per game';

-- ============================================================================
-- poker.mole_rounds – Round instances per game
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.mole_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES poker.mole_games(id) ON DELETE CASCADE,
  round_number int NOT NULL,
  group_size int NOT NULL CHECK (group_size >= 1 AND group_size <= 10),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'grouping', 'voting', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(game_id, round_number)
);

CREATE INDEX IF NOT EXISTS idx_mole_rounds_game_id
  ON poker.mole_rounds(game_id);

CREATE INDEX IF NOT EXISTS idx_mole_rounds_game_round
  ON poker.mole_rounds(game_id, round_number);

ALTER TABLE poker.mole_rounds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_mole_rounds" ON poker.mole_rounds;
CREATE POLICY "no_direct_access_mole_rounds"
  ON poker.mole_rounds
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.mole_rounds IS 'THE MOLE: round instances with group size and status';

-- ============================================================================
-- poker.mole_groups – Groups within rounds; each group has one mole (mole_fid)
-- status: voting | completed (found mole, non-moles advance) | mole_won (failed, that mole wins game)
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.mole_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES poker.mole_rounds(id) ON DELETE CASCADE,
  group_number int NOT NULL,
  fids bigint[] NOT NULL,
  mole_fid bigint NOT NULL,
  status text NOT NULL DEFAULT 'voting' CHECK (status IN ('voting', 'completed', 'mole_won', 'eliminated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(round_id, group_number)
);

CREATE INDEX IF NOT EXISTS idx_mole_groups_round_id
  ON poker.mole_groups(round_id);

CREATE INDEX IF NOT EXISTS idx_mole_groups_round_group
  ON poker.mole_groups(round_id, group_number);

ALTER TABLE poker.mole_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_mole_groups" ON poker.mole_groups;
CREATE POLICY "no_direct_access_mole_groups"
  ON poker.mole_groups
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.mole_groups IS 'THE MOLE: groups with mole_fid. completed=found mole; mole_won=failed, that mole wins game.';
COMMENT ON COLUMN poker.mole_groups.mole_fid IS 'The mole in this group (must be in fids). Secret until round complete.';

-- ============================================================================
-- poker.mole_votes – Who each player thinks is the mole (voted_for_fid = suspected mole)
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.mole_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES poker.mole_groups(id) ON DELETE CASCADE,
  voter_fid bigint NOT NULL,
  voted_for_fid bigint NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, voter_fid)
);

CREATE INDEX IF NOT EXISTS idx_mole_votes_group_id
  ON poker.mole_votes(group_id);

CREATE INDEX IF NOT EXISTS idx_mole_votes_voter_fid
  ON poker.mole_votes(voter_fid);

ALTER TABLE poker.mole_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_mole_votes" ON poker.mole_votes;
CREATE POLICY "no_direct_access_mole_votes"
  ON poker.mole_votes
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.mole_votes IS 'THE MOLE: vote for who you think is the mole; must all agree and be correct to advance';

-- ============================================================================
-- poker.mole_chat_messages – Group chat (like BUDDY UP)
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.mole_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES poker.mole_groups(id) ON DELETE CASCADE,
  sender_fid bigint NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mole_chat_messages_group_id
  ON poker.mole_chat_messages(group_id);

CREATE INDEX IF NOT EXISTS idx_mole_chat_messages_group_created
  ON poker.mole_chat_messages(group_id, created_at DESC);

ALTER TABLE poker.mole_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_mole_chat_messages" ON poker.mole_chat_messages;
CREATE POLICY "no_direct_access_mole_chat_messages"
  ON poker.mole_chat_messages
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.mole_chat_messages IS 'THE MOLE: chat per group during voting';

-- ============================================================================
-- poker.mole_settlements – Settlement records (one per winner)
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.mole_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES poker.mole_games(id),
  winner_fid bigint NOT NULL,
  prize_amount numeric NOT NULL,
  position int,
  settled_by_fid bigint NOT NULL,
  settled_at timestamptz NOT NULL DEFAULT now(),
  tx_hash text,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_mole_settlements_game_id
  ON poker.mole_settlements(game_id);

CREATE INDEX IF NOT EXISTS idx_mole_settlements_settled_at
  ON poker.mole_settlements(settled_at DESC);

ALTER TABLE poker.mole_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_mole_settlements" ON poker.mole_settlements;
CREATE POLICY "no_direct_access_mole_settlements"
  ON poker.mole_settlements
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.mole_settlements IS 'THE MOLE: settlement records; mole gets full prize when mole_won, else non-moles split';
