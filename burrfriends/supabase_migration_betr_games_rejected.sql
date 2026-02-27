-- Migration #49: Phase 25 - Opt-Out & Admin Registration Management
-- Adds rejected_at and rejected_by columns to betr_games_registrations
-- for tracking rejected registrations

-- Add columns for rejection tracking
ALTER TABLE poker.betr_games_registrations
ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS rejected_by BIGINT DEFAULT NULL;

-- Add comments
COMMENT ON COLUMN poker.betr_games_registrations.rejected_at IS 'Timestamp when admin rejected this registration';
COMMENT ON COLUMN poker.betr_games_registrations.rejected_by IS 'FID of admin who rejected';

-- Create index for efficient filtering of rejected registrations
CREATE INDEX IF NOT EXISTS idx_betr_games_registrations_rejected_at
  ON poker.betr_games_registrations(rejected_at)
  WHERE rejected_at IS NOT NULL;
