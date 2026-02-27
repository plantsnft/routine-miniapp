-- Migration: Add approval_claim_id and unique constraint for created_game_id
-- This enables idempotent approval retries and prevents duplicate game creation

-- Add approval_claim_id column for idempotent approval tracking
ALTER TABLE poker.game_requests 
ADD COLUMN IF NOT EXISTS approval_claim_id uuid NULL;

-- Add index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_game_requests_approval_claim_id 
ON poker.game_requests(approval_claim_id) 
WHERE approval_claim_id IS NOT NULL;

-- Add unique constraint on created_game_id (prevents duplicate game creation)
-- This ensures one request can only create one game
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'game_requests_created_game_id_unique'
  ) THEN
    CREATE UNIQUE INDEX game_requests_created_game_id_unique
    ON poker.game_requests(created_game_id)
    WHERE created_game_id IS NOT NULL;
  END IF;
END $$;

-- Comments
COMMENT ON COLUMN poker.game_requests.approval_claim_id IS 'UUID generated when request is claimed for approval (enables idempotent retries by same approver)';

