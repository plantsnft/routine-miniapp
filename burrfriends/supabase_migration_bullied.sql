-- BULLIED - Phase 33: Single-round elimination game
-- Run in Supabase SQL Editor. Creates poker.bullied_games, bullied_rounds, bullied_groups, bullied_votes, bullied_chat_messages.
-- No signups table (eligible from betr_games_tournament_players). No settlements table (winners from bullied_groups.winner_fid).

-- ============================================================================
-- poker.bullied_games – Game instances
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.bullied_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'BULLIED',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'settled', 'cancelled')),
  is_preview boolean NOT NULL DEFAULT false,
  created_by_fid bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bullied_games_status
  ON poker.bullied_games(status);

CREATE INDEX IF NOT EXISTS idx_bullied_games_created_at
  ON poker.bullied_games(created_at DESC);

ALTER TABLE poker.bullied_games ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_bullied_games" ON poker.bullied_games;
CREATE POLICY "no_direct_access_bullied_games"
  ON poker.bullied_games
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.bullied_games IS 'BULLIED: single-round elimination game instances';

-- ============================================================================
-- poker.bullied_rounds – Round instances per game (always 1)
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.bullied_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES poker.bullied_games(id) ON DELETE CASCADE,
  round_number int NOT NULL DEFAULT 1,
  group_size int NOT NULL DEFAULT 3,
  status text NOT NULL DEFAULT 'voting' CHECK (status IN ('voting', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(game_id, round_number)
);

CREATE INDEX IF NOT EXISTS idx_bullied_rounds_game_id
  ON poker.bullied_rounds(game_id);

ALTER TABLE poker.bullied_rounds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_bullied_rounds" ON poker.bullied_rounds;
CREATE POLICY "no_direct_access_bullied_rounds"
  ON poker.bullied_rounds
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.bullied_rounds IS 'BULLIED: round instances, always single round per game';

-- ============================================================================
-- poker.bullied_groups – Groups within rounds
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.bullied_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES poker.bullied_rounds(id) ON DELETE CASCADE,
  group_number int NOT NULL,
  fids bigint[] NOT NULL,
  status text NOT NULL DEFAULT 'voting' CHECK (status IN ('voting', 'completed', 'eliminated')),
  winner_fid bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(round_id, group_number)
);

CREATE INDEX IF NOT EXISTS idx_bullied_groups_round_id
  ON poker.bullied_groups(round_id);

CREATE INDEX IF NOT EXISTS idx_bullied_groups_round_group
  ON poker.bullied_groups(round_id, group_number);

ALTER TABLE poker.bullied_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_bullied_groups" ON poker.bullied_groups;
CREATE POLICY "no_direct_access_bullied_groups"
  ON poker.bullied_groups
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.bullied_groups IS 'BULLIED: groups within rounds with member FIDs array and voting status';

-- ============================================================================
-- poker.bullied_votes – Individual votes per group
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.bullied_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES poker.bullied_groups(id) ON DELETE CASCADE,
  voter_fid bigint NOT NULL,
  voted_for_fid bigint NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, voter_fid)
);

CREATE INDEX IF NOT EXISTS idx_bullied_votes_group_id
  ON poker.bullied_votes(group_id);

CREATE INDEX IF NOT EXISTS idx_bullied_votes_voter_fid
  ON poker.bullied_votes(voter_fid);

CREATE INDEX IF NOT EXISTS idx_bullied_votes_group_voted_for
  ON poker.bullied_votes(group_id, voted_for_fid);

ALTER TABLE poker.bullied_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_bullied_votes" ON poker.bullied_votes;
CREATE POLICY "no_direct_access_bullied_votes"
  ON poker.bullied_votes
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.bullied_votes IS 'BULLIED: individual votes per group, one vote per person per group';

-- ============================================================================
-- poker.bullied_chat_messages – Group chat messages
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.bullied_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES poker.bullied_groups(id) ON DELETE CASCADE,
  sender_fid bigint NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bullied_chat_messages_group_id
  ON poker.bullied_chat_messages(group_id);

CREATE INDEX IF NOT EXISTS idx_bullied_chat_messages_group_created
  ON poker.bullied_chat_messages(group_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bullied_chat_messages_sender_fid
  ON poker.bullied_chat_messages(sender_fid);

ALTER TABLE poker.bullied_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_bullied_chat" ON poker.bullied_chat_messages;
CREATE POLICY "no_direct_access_bullied_chat"
  ON poker.bullied_chat_messages
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.bullied_chat_messages IS 'BULLIED: group chat messages during voting phase';
