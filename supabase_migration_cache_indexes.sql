-- Database indexes for cache optimization
-- Run this in Supabase SQL Editor to improve query performance

-- Index for eligible_casts query (used in engagement verification)
-- Speeds up: WHERE parent_url = ? AND created_at >= ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_eligible_casts_parent_created 
ON eligible_casts(parent_url, created_at DESC);

-- Index for engagements query (used in engagement verification)
-- Speeds up: WHERE user_fid = ? AND engaged_at >= ? ORDER BY engaged_at DESC
CREATE INDEX IF NOT EXISTS idx_engagements_user_engaged 
ON engagements(user_fid, engaged_at DESC);

-- Index for smart cache invalidation check
-- Speeds up: WHERE user_fid = ? AND engaged_at > ? (cache timestamp check)
CREATE INDEX IF NOT EXISTS idx_engagements_user_engaged_at 
ON engagements(user_fid, engaged_at);

-- Verify indexes were created
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename IN ('eligible_casts', 'engagements')
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
