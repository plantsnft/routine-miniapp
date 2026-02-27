-- Phase 43: User Feedback (support ticket style).
-- Creates poker.feedback_tickets, poker.feedback_images, poker.feedback_replies.
-- Storage: Supabase bucket "feedback" (public) - create manually in Dashboard.
-- Max 25 MB per image (enforced in API).
-- Run after supabase_migration_sunday_high_stakes_starts_at.sql (#91).

SET search_path = poker;

-- ============================================================================
-- poker.feedback_tickets – Main ticket
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.feedback_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fid bigint NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_tickets_fid ON poker.feedback_tickets(fid);
CREATE INDEX IF NOT EXISTS idx_feedback_tickets_created_at ON poker.feedback_tickets(created_at DESC);

ALTER TABLE poker.feedback_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_feedback_tickets" ON poker.feedback_tickets;
CREATE POLICY "no_direct_access_feedback_tickets"
  ON poker.feedback_tickets
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.feedback_tickets IS 'Phase 43: User feedback tickets; admins can reply and set status';

-- ============================================================================
-- poker.feedback_images – Per-ticket images (up to 5)
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.feedback_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES poker.feedback_tickets(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_images_ticket_id ON poker.feedback_images(ticket_id);

ALTER TABLE poker.feedback_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_feedback_images" ON poker.feedback_images;
CREATE POLICY "no_direct_access_feedback_images"
  ON poker.feedback_images
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.feedback_images IS 'Phase 43: Feedback ticket images (max 5 per ticket)';

-- ============================================================================
-- poker.feedback_replies – Admin replies
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.feedback_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES poker.feedback_tickets(id) ON DELETE CASCADE,
  fid bigint NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_replies_ticket_id ON poker.feedback_replies(ticket_id);

ALTER TABLE poker.feedback_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_feedback_replies" ON poker.feedback_replies;
CREATE POLICY "no_direct_access_feedback_replies"
  ON poker.feedback_replies
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.feedback_replies IS 'Phase 43: Admin replies to feedback tickets';

NOTIFY pgrst, 'reload schema';
