-- Migration: Add global user blocklist table
-- This table stores blocked users (by FID) who cannot join games or make payments

CREATE SCHEMA IF NOT EXISTS poker;

CREATE TABLE IF NOT EXISTS poker.user_blocks (
  fid BIGINT PRIMARY KEY,
  is_blocked BOOLEAN NOT NULL DEFAULT true,
  blocked_by_fid BIGINT NOT NULL,
  reason TEXT,
  blocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying blocked users
CREATE INDEX IF NOT EXISTS idx_user_blocks_fid ON poker.user_blocks (fid);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked_by ON poker.user_blocks (blocked_by_fid);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION poker.set_user_blocks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_user_blocks_updated_at ON poker.user_blocks;
CREATE TRIGGER set_user_blocks_updated_at
  BEFORE UPDATE ON poker.user_blocks
  FOR EACH ROW
  EXECUTE FUNCTION poker.set_user_blocks_updated_at();

COMMENT ON TABLE poker.user_blocks IS 'Global blocklist: blocked users cannot join games or make payments';
COMMENT ON COLUMN poker.user_blocks.fid IS 'FID of the blocked user (primary key)';
COMMENT ON COLUMN poker.user_blocks.blocked_by_fid IS 'FID of the admin who blocked this user';
COMMENT ON COLUMN poker.user_blocks.reason IS 'Optional reason for blocking';

