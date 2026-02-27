-- REMIX BETR Rounds - Discrete rounds for card visibility and auto-close
-- Run in Supabase SQL Editor. Creates poker.remix_betr_rounds.
-- Same pattern as betr_guesser_games: status flow open → closed → settled

-- ============================================================================
-- poker.remix_betr_rounds – Round instances
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.remix_betr_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'settled', 'cancelled')),
  prize_amount numeric NOT NULL,
  round_label text,
  submissions_close_at timestamptz NOT NULL,
  created_by_fid bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  settled_at timestamptz,
  settle_tx_hashes text[],
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_remix_betr_rounds_status
  ON poker.remix_betr_rounds(status);

CREATE INDEX IF NOT EXISTS idx_remix_betr_rounds_submissions_close_at
  ON poker.remix_betr_rounds(submissions_close_at);

CREATE INDEX IF NOT EXISTS idx_remix_betr_rounds_created_at
  ON poker.remix_betr_rounds(created_at DESC);

ALTER TABLE poker.remix_betr_rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "no_direct_access_remix_betr_rounds"
  ON poker.remix_betr_rounds
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.remix_betr_rounds IS 'REMIX BETR: discrete rounds for card visibility and settlement. Status: open (accepting submissions) → closed (auto-close when time passed) → settled. Same pattern as betr_guesser_games.';
