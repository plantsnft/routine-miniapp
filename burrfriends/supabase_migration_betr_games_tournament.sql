-- Migration #47: Phase 22 - BETR GAMES Tournament System
-- Adds approval tracking to registrations and tournament player status tracking

-- 1. Add approval columns to existing registrations table
ALTER TABLE poker.betr_games_registrations
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by bigint;

COMMENT ON COLUMN poker.betr_games_registrations.approved_at IS 'When registration was approved (null = pending)';
COMMENT ON COLUMN poker.betr_games_registrations.approved_by IS 'Admin FID who approved (null = auto-approved from pre-approved list)';

-- 2. Tournament players table (tracks alive/eliminated status during tournament)
CREATE TABLE IF NOT EXISTS poker.betr_games_tournament_players (
  fid bigint PRIMARY KEY,
  status text NOT NULL DEFAULT 'alive' CHECK (status IN ('alive', 'eliminated', 'quit')),
  eliminated_at timestamptz,
  eliminated_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tournament_players_status 
  ON poker.betr_games_tournament_players(status);

ALTER TABLE poker.betr_games_tournament_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "no_direct_access" ON poker.betr_games_tournament_players 
  FOR ALL USING (false) WITH CHECK (false);

COMMENT ON TABLE poker.betr_games_tournament_players IS 'Tracks tournament participants - alive vs eliminated';

-- 3. Add access_gate column to BETR game tables for flexible gating
-- Values: 'public' (anyone), 'registered' (betr_games_registrations), 'alive' (tournament alive), 'staking' (staking_min_amount)

ALTER TABLE poker.betr_guesser_games 
  ADD COLUMN IF NOT EXISTS access_gate text DEFAULT 'registered'
    CHECK (access_gate IN ('public', 'registered', 'alive', 'staking'));

ALTER TABLE poker.buddy_up_games 
  ADD COLUMN IF NOT EXISTS access_gate text DEFAULT 'registered'
    CHECK (access_gate IN ('public', 'registered', 'alive', 'staking'));

ALTER TABLE poker.mole_games 
  ADD COLUMN IF NOT EXISTS access_gate text DEFAULT 'registered'
    CHECK (access_gate IN ('public', 'registered', 'alive', 'staking'));

ALTER TABLE poker.steal_no_steal_games 
  ADD COLUMN IF NOT EXISTS access_gate text DEFAULT 'registered'
    CHECK (access_gate IN ('public', 'registered', 'alive', 'staking'));

COMMENT ON COLUMN poker.betr_guesser_games.access_gate IS 'Who can join: public, registered, alive (tournament), or staking';
COMMENT ON COLUMN poker.buddy_up_games.access_gate IS 'Who can join: public, registered, alive (tournament), or staking';
COMMENT ON COLUMN poker.mole_games.access_gate IS 'Who can join: public, registered, alive (tournament), or staking';
COMMENT ON COLUMN poker.steal_no_steal_games.access_gate IS 'Who can join: public, registered, alive (tournament), or staking';
