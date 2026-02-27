-- Manually mark a player safe in an active Kill or Keep game.
-- Run in Supabase SQL editor. Replace GAME_ID and FID with your values.
-- Example: GAME_ID = 'a1b2c3d4-e5f6-...'  FID = 12345

UPDATE poker.kill_or_keep_games
SET safe_fids = (
  SELECT array_agg(DISTINCT f ORDER BY f)
  FROM unnest(safe_fids || array[FID]::bigint[]) AS f
),
updated_at = now()
WHERE id = 'GAME_ID'
  AND status = 'in_progress'
  AND FID = ANY(remaining_fids);

-- Optional: verify
-- SELECT id, safe_fids, remaining_fids FROM poker.kill_or_keep_games WHERE id = 'GAME_ID';
