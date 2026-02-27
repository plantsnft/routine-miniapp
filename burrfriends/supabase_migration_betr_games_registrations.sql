-- BETR GAMES Registration - Signup list for payouts and whitelisting
-- Run this in Supabase SQL Editor (project: https://supabase.com/dashboard/project/bfjinpptqwoemnavthon)
-- Creates poker.betr_games_registrations: one row per FID, used for payout list and future game gating

-- ============================================================================
-- poker.betr_games_registrations – Signups for BETR GAMES (payouts, whitelist)
-- ============================================================================
CREATE TABLE IF NOT EXISTS poker.betr_games_registrations (
  fid bigint PRIMARY KEY,
  registered_at timestamptz NOT NULL DEFAULT now(),
  source text DEFAULT 'betr_games_button'
);

-- Index for "newest first" and date-range export
CREATE INDEX IF NOT EXISTS idx_betr_games_registrations_registered_at
  ON poker.betr_games_registrations(registered_at DESC);

-- RLS: Deny direct access for anon/authenticated; only API (service role) can access
ALTER TABLE poker.betr_games_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "no_direct_access"
  ON poker.betr_games_registrations
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.betr_games_registrations IS 'Signups for BETR GAMES: payout list and whitelist for future game gating';
