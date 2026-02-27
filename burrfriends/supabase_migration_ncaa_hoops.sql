-- Phase 41 (NCAA HOOPS): March Madness bracket. Run in Supabase SQL Editor.
-- Migration #88. Creates poker.ncaa_hoops_contests, slots, brackets, picks, results, settlements.

SET search_path = poker;

-- ============================================================================
-- poker.ncaa_hoops_contests – One active contest per community
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.ncaa_hoops_contests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'picks_closed', 'in_progress', 'settled', 'cancelled')),
  is_preview boolean NOT NULL DEFAULT false,
  created_by_fid bigint NOT NULL,
  community text NOT NULL DEFAULT 'betr',
  picks_close_at timestamptz NULL,
  tournament_start_date date NULL,
  tournament_end_date date NULL,
  last_sync_at timestamptz NULL,
  last_sync_result_count int NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ncaa_hoops_contests_status
  ON poker.ncaa_hoops_contests(status);
CREATE INDEX IF NOT EXISTS idx_ncaa_hoops_contests_community
  ON poker.ncaa_hoops_contests(community);
CREATE INDEX IF NOT EXISTS idx_ncaa_hoops_contests_created_at
  ON poker.ncaa_hoops_contests(created_at DESC);

ALTER TABLE poker.ncaa_hoops_contests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "no_direct_access_ncaa_hoops_contests" ON poker.ncaa_hoops_contests;
CREATE POLICY "no_direct_access_ncaa_hoops_contests"
  ON poker.ncaa_hoops_contests FOR ALL USING (false) WITH CHECK (false);

COMMENT ON TABLE poker.ncaa_hoops_contests IS 'Phase 41: NCAA HOOPS – one active contest per community; ESPN sync date range';

-- ============================================================================
-- poker.ncaa_hoops_slots – 64 slots per contest (region, seed, display_label; espn_team_id/display_name after import)
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.ncaa_hoops_slots (
  contest_id uuid NOT NULL REFERENCES poker.ncaa_hoops_contests(id) ON DELETE CASCADE,
  slot_id text NOT NULL,
  region text NULL,
  seed int NULL,
  round int NULL,
  display_label text NOT NULL,
  espn_team_id text NULL,
  display_name text NULL,
  PRIMARY KEY (contest_id, slot_id)
);

CREATE INDEX IF NOT EXISTS idx_ncaa_hoops_slots_contest_id
  ON poker.ncaa_hoops_slots(contest_id);

ALTER TABLE poker.ncaa_hoops_slots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "no_direct_access_ncaa_hoops_slots" ON poker.ncaa_hoops_slots;
CREATE POLICY "no_direct_access_ncaa_hoops_slots"
  ON poker.ncaa_hoops_slots FOR ALL USING (false) WITH CHECK (false);

COMMENT ON TABLE poker.ncaa_hoops_slots IS 'Phase 41: NCAA HOOPS – 64 slots per contest; display_label e.g. South #5; espn_team_id/display_name after ESPN import';

-- ============================================================================
-- poker.ncaa_hoops_brackets – User bracket (cached total_score, championship_correct)
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.ncaa_hoops_brackets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id uuid NOT NULL REFERENCES poker.ncaa_hoops_contests(id) ON DELETE CASCADE,
  fid bigint NOT NULL,
  total_score int NOT NULL DEFAULT 0,
  championship_correct boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ncaa_hoops_brackets_contest_fid
  ON poker.ncaa_hoops_brackets(contest_id, fid);
CREATE INDEX IF NOT EXISTS idx_ncaa_hoops_brackets_contest_score
  ON poker.ncaa_hoops_brackets(contest_id, total_score DESC);

ALTER TABLE poker.ncaa_hoops_brackets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "no_direct_access_ncaa_hoops_brackets" ON poker.ncaa_hoops_brackets;
CREATE POLICY "no_direct_access_ncaa_hoops_brackets"
  ON poker.ncaa_hoops_brackets FOR ALL USING (false) WITH CHECK (false);

COMMENT ON TABLE poker.ncaa_hoops_brackets IS 'Phase 41: NCAA HOOPS – one row per user bracket; total_score/championship_correct updated on ESPN sync';

-- ============================================================================
-- poker.ncaa_hoops_picks – 63 picks per bracket (matchup_id 1–63, winner_slot_id)
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.ncaa_hoops_picks (
  bracket_id uuid NOT NULL REFERENCES poker.ncaa_hoops_brackets(id) ON DELETE CASCADE,
  matchup_id int NOT NULL CHECK (matchup_id >= 1 AND matchup_id <= 63),
  winner_slot_id text NOT NULL,
  PRIMARY KEY (bracket_id, matchup_id)
);

CREATE INDEX IF NOT EXISTS idx_ncaa_hoops_picks_bracket_id
  ON poker.ncaa_hoops_picks(bracket_id);

ALTER TABLE poker.ncaa_hoops_picks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "no_direct_access_ncaa_hoops_picks" ON poker.ncaa_hoops_picks;
CREATE POLICY "no_direct_access_ncaa_hoops_picks"
  ON poker.ncaa_hoops_picks FOR ALL USING (false) WITH CHECK (false);

COMMENT ON TABLE poker.ncaa_hoops_picks IS 'Phase 41: NCAA HOOPS – 63 picks per bracket';

-- ============================================================================
-- poker.ncaa_hoops_results – One row per (contest_id, matchup_id); idempotent upsert
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.ncaa_hoops_results (
  contest_id uuid NOT NULL REFERENCES poker.ncaa_hoops_contests(id) ON DELETE CASCADE,
  matchup_id int NOT NULL CHECK (matchup_id >= 1 AND matchup_id <= 63),
  winner_slot_id text NOT NULL,
  round int NOT NULL,
  PRIMARY KEY (contest_id, matchup_id)
);

CREATE INDEX IF NOT EXISTS idx_ncaa_hoops_results_contest_id
  ON poker.ncaa_hoops_results(contest_id);

ALTER TABLE poker.ncaa_hoops_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "no_direct_access_ncaa_hoops_results" ON poker.ncaa_hoops_results;
CREATE POLICY "no_direct_access_ncaa_hoops_results"
  ON poker.ncaa_hoops_results FOR ALL USING (false) WITH CHECK (false);

COMMENT ON TABLE poker.ncaa_hoops_results IS 'Phase 41: NCAA HOOPS – ESPN sync upserts; UNIQUE(contest_id, matchup_id)';

-- ============================================================================
-- poker.ncaa_hoops_settlements – Final positions after settle
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.ncaa_hoops_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id uuid NOT NULL REFERENCES poker.ncaa_hoops_contests(id) ON DELETE CASCADE,
  bracket_id uuid NOT NULL REFERENCES poker.ncaa_hoops_brackets(id) ON DELETE CASCADE,
  fid bigint NOT NULL,
  position int NOT NULL,
  total_score int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ncaa_hoops_settlements_contest_id
  ON poker.ncaa_hoops_settlements(contest_id);

ALTER TABLE poker.ncaa_hoops_settlements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "no_direct_access_ncaa_hoops_settlements" ON poker.ncaa_hoops_settlements;
CREATE POLICY "no_direct_access_ncaa_hoops_settlements"
  ON poker.ncaa_hoops_settlements FOR ALL USING (false) WITH CHECK (false);

COMMENT ON TABLE poker.ncaa_hoops_settlements IS 'Phase 41: NCAA HOOPS – settled positions';

NOTIFY pgrst, 'reload schema';
