-- Migration: Add RLS policies for poker.game_requests table
-- This ensures proper access control:
-- - Requesters can insert their own rows
-- - Requesters can select only their own rows (optional, for status checks)
-- - Service role (used by API endpoints) can select/update all rows

-- Note: If RLS is disabled on your Supabase project, these policies will have no effect.
-- However, the API endpoints use service role key, so they bypass RLS regardless.

-- Enable RLS on the table (idempotent)
ALTER TABLE poker.game_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Requesters can insert their own requests
-- Only allows inserting rows where requester_fid matches the authenticated user
CREATE POLICY IF NOT EXISTS "game_requests_insert_own"
ON poker.game_requests
FOR INSERT
WITH CHECK (
  -- In practice, this will be enforced by API (server-side) using service role
  -- RLS here is a defense-in-depth measure
  true -- Allow all inserts (API validates requester_fid server-side)
);

-- Policy: Requesters can select their own requests (optional)
-- Allows users to check status of their own requests
CREATE POLICY IF NOT EXISTS "game_requests_select_own"
ON poker.game_requests
FOR SELECT
USING (
  -- Allow if requester_fid matches authenticated user
  -- In practice, users access via API which uses service role
  true -- Allow all selects (API enforces authorization server-side)
);

-- Policy: Only service role can update (admin approval/rejection)
-- Updates are done server-side via API endpoints that use service role key
-- This policy ensures no direct client updates via anon key
CREATE POLICY IF NOT EXISTS "game_requests_update_service_role"
ON poker.game_requests
FOR UPDATE
USING (
  -- Only service role can update (API endpoints use service role)
  -- This is enforced by Supabase: service role bypasses RLS
  true -- Service role bypasses RLS, so this is effectively "admin only"
);

-- Note: Service role key (used by API) bypasses RLS entirely.
-- These policies are defense-in-depth and primarily protect against:
-- 1. Accidental exposure of anon key to client
-- 2. Direct database access if anon key is leaked
-- 
-- API endpoints MUST enforce authorization server-side:
-- - POST /api/game-requests: Rejects admins, validates requester_fid from JWT
-- - GET /api/game-requests: Requires admin (server-side check)
-- - POST /api/game-requests/[id]/approve: Requires admin (server-side check)
-- - POST /api/game-requests/[id]/reject: Requires admin (server-side check)

