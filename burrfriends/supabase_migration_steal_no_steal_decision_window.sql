-- Phase 17.1: STEAL OR NO STEAL Timer Rule Fix
-- Two-phase timer: negotiation period + decision window
-- Migration #43

-- Add decision_window_seconds to games (default 5 minutes = 300 seconds)
ALTER TABLE poker.steal_no_steal_games
  ADD COLUMN IF NOT EXISTS decision_window_seconds integer NOT NULL DEFAULT 300
  CHECK (decision_window_seconds >= 60 AND decision_window_seconds <= 1800);

COMMENT ON COLUMN poker.steal_no_steal_games.decision_window_seconds IS 
  'Seconds Player B has to decide AFTER negotiation ends (Phase 17.1)';

-- Add negotiation_ends_at to matches
ALTER TABLE poker.steal_no_steal_matches
  ADD COLUMN IF NOT EXISTS negotiation_ends_at timestamptz;

COMMENT ON COLUMN poker.steal_no_steal_matches.negotiation_ends_at IS 
  'When negotiation period ends and Player B can start deciding (Phase 17.1)';

-- Backfill existing matches: assume 5 min (300s) decision window was included in original deadline
-- So negotiation_ends_at = decision_deadline - 300 seconds
UPDATE poker.steal_no_steal_matches
SET negotiation_ends_at = decision_deadline - INTERVAL '300 seconds'
WHERE negotiation_ends_at IS NULL;
