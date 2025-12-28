-- Migration: Create poker.game_requests table for non-admin game requests
-- This table stores game requests from non-admin users that require admin approval

CREATE TABLE IF NOT EXISTS poker.game_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_fid bigint NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  payload jsonb NOT NULL,
  prefund_tx_hash text NOT NULL,
  created_game_id uuid NULL,
  approved_by_fid bigint NULL,
  rejection_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_game_requests_status ON poker.game_requests(status);
CREATE INDEX IF NOT EXISTS idx_game_requests_created_at ON poker.game_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_requests_requester_fid ON poker.game_requests(requester_fid);
CREATE INDEX IF NOT EXISTS idx_game_requests_created_game_id ON poker.game_requests(created_game_id) WHERE created_game_id IS NOT NULL;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION poker.update_game_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_game_requests_updated_at ON poker.game_requests;
CREATE TRIGGER trigger_update_game_requests_updated_at
  BEFORE UPDATE ON poker.game_requests
  FOR EACH ROW
  EXECUTE FUNCTION poker.update_game_requests_updated_at();

-- Comments
COMMENT ON TABLE poker.game_requests IS 'Game requests from non-admin users requiring admin approval';
COMMENT ON COLUMN poker.game_requests.requester_fid IS 'Farcaster user ID of the requester';
COMMENT ON COLUMN poker.game_requests.status IS 'Request status: pending, approved, or rejected';
COMMENT ON COLUMN poker.game_requests.payload IS 'JSON payload containing requested game fields (matches create-game API format)';
COMMENT ON COLUMN poker.game_requests.prefund_tx_hash IS 'Transaction hash of the prefund payment (required before submission)';
COMMENT ON COLUMN poker.game_requests.created_game_id IS 'Game ID if request was approved and game was created';
COMMENT ON COLUMN poker.game_requests.approved_by_fid IS 'FID of admin who approved the request';
COMMENT ON COLUMN poker.game_requests.rejection_reason IS 'Optional reason for rejection';

