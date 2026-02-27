-- Phase 42: SUNDAY HIGH STAKES ARE BETR.
-- Run in Supabase SQL Editor. Creates poker.sunday_high_stakes, poker.sunday_high_stakes_submissions.
-- No image storage; submissions store cast_url + title only. Password and clubgg_url set at contest creation.

SET search_path = poker;

-- ============================================================================
-- poker.sunday_high_stakes – Single active contest (one open/closed at a time)
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.sunday_high_stakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'SUNDAY HIGH STAKES ARE BETR',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  is_preview boolean NOT NULL DEFAULT false,
  created_by_fid bigint NOT NULL,
  password text NOT NULL,
  clubgg_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_sunday_high_stakes_status
  ON poker.sunday_high_stakes(status);

CREATE INDEX IF NOT EXISTS idx_sunday_high_stakes_created_at
  ON poker.sunday_high_stakes(created_at DESC);

ALTER TABLE poker.sunday_high_stakes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_sunday_high_stakes" ON poker.sunday_high_stakes;
CREATE POLICY "no_direct_access_sunday_high_stakes"
  ON poker.sunday_high_stakes
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.sunday_high_stakes IS 'Phase 42: SUNDAY HIGH STAKES ARE BETR – cast gate to Club GG; password + clubgg_url at setup';

-- ============================================================================
-- poker.sunday_high_stakes_submissions – User submissions (cast link only, no image storage)
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.sunday_high_stakes_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id uuid NOT NULL REFERENCES poker.sunday_high_stakes(id) ON DELETE CASCADE,
  fid bigint NOT NULL,
  cast_url text NOT NULL,
  title text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sunday_high_stakes_submissions_contest_id
  ON poker.sunday_high_stakes_submissions(contest_id);

CREATE INDEX IF NOT EXISTS idx_sunday_high_stakes_submissions_fid
  ON poker.sunday_high_stakes_submissions(fid);

ALTER TABLE poker.sunday_high_stakes_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_sunday_high_stakes_submissions" ON poker.sunday_high_stakes_submissions;
CREATE POLICY "no_direct_access_sunday_high_stakes_submissions"
  ON poker.sunday_high_stakes_submissions
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.sunday_high_stakes_submissions IS 'Phase 42: SUNDAY HIGH STAKES submissions; cast_url + title only, no image_url';

NOTIFY pgrst, 'reload schema';
