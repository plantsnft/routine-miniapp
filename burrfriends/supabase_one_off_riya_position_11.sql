-- One-off: Move Riya (FID 408979) to position 11 in turn order for the in-progress Kill or Keep game.
-- Run in Supabase SQL editor (poker schema). Safe to run once; only updates the single in_progress game.

WITH game AS (
  SELECT id, turn_order_fids
  FROM poker.kill_or_keep_games
  WHERE status = 'in_progress'
  LIMIT 1
),
without_riya AS (
  SELECT id, array_remove(turn_order_fids, 408979) AS arr
  FROM game
)
UPDATE poker.kill_or_keep_games g
SET
  turn_order_fids = (
    SELECT (w.arr[1:10] || 408979::bigint || COALESCE(w.arr[11:array_length(w.arr, 1)], ARRAY[]::bigint[]))
    FROM without_riya w
    WHERE w.id = g.id
  ),
  updated_at = now()
FROM without_riya w
WHERE g.id = w.id;
