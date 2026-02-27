-- TO SPINFINITY AND BEYOND ART CONTEST - Phase 39.
-- Run in Supabase SQL Editor. Creates poker.art_contest, art_contest_submissions, art_contest_winners.
-- Migration #69. Storage: use Supabase Storage bucket "art-contest" (public) via @supabase/supabase-js.

SET search_path = poker;

-- ============================================================================
-- poker.art_contest – Single contest instance (one active open/closed at a time)
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.art_contest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'TO SPINFINITY AND BEYOND ART CONTEST',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'settled')),
  is_preview boolean NOT NULL DEFAULT false,
  created_by_fid bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz NULL,
  settled_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_art_contest_status
  ON poker.art_contest(status);

CREATE INDEX IF NOT EXISTS idx_art_contest_created_at
  ON poker.art_contest(created_at DESC);

ALTER TABLE poker.art_contest ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_art_contest" ON poker.art_contest;
CREATE POLICY "no_direct_access_art_contest"
  ON poker.art_contest
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.art_contest IS 'Phase 39: TO SPINFINITY AND BEYOND ART CONTEST – single contest, admin closes and picks 14 winners';

-- ============================================================================
-- poker.art_contest_submissions – User submissions (multiple per user allowed)
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.art_contest_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id uuid NOT NULL REFERENCES poker.art_contest(id) ON DELETE CASCADE,
  fid bigint NOT NULL,
  cast_url text NOT NULL,
  title text NOT NULL,
  image_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_art_contest_submissions_contest_id
  ON poker.art_contest_submissions(contest_id);

CREATE INDEX IF NOT EXISTS idx_art_contest_submissions_fid
  ON poker.art_contest_submissions(fid);

ALTER TABLE poker.art_contest_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_art_contest_submissions" ON poker.art_contest_submissions;
CREATE POLICY "no_direct_access_art_contest_submissions"
  ON poker.art_contest_submissions
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.art_contest_submissions IS 'Phase 39: ART CONTEST submissions; image_url = Supabase Storage public URL';

-- ============================================================================
-- poker.art_contest_winners – 14 winners per contest (distinct FIDs)
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.art_contest_winners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id uuid NOT NULL REFERENCES poker.art_contest(id) ON DELETE CASCADE,
  submission_id uuid NOT NULL REFERENCES poker.art_contest_submissions(id) ON DELETE CASCADE,
  fid bigint NOT NULL,
  position int NOT NULL CHECK (position >= 1 AND position <= 14),
  amount_display text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contest_id, position)
);

CREATE INDEX IF NOT EXISTS idx_art_contest_winners_contest_id
  ON poker.art_contest_winners(contest_id);

ALTER TABLE poker.art_contest_winners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_art_contest_winners" ON poker.art_contest_winners;
CREATE POLICY "no_direct_access_art_contest_winners"
  ON poker.art_contest_winners
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.art_contest_winners IS 'Phase 39: ART CONTEST top 14 winners; amount_display display-only, payments outside app';

NOTIFY pgrst, 'reload schema';
