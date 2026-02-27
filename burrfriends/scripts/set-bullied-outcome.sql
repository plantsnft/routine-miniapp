-- =============================================================================
-- BULLIED one-time outcome update (SQL)
-- =============================================================================
-- Use after you close BULLIED and complete the round. Run in Supabase SQL Editor.
--
-- DOWNSIDE vs Node script: You must supply FIDs, not usernames.
--   Get FIDs from: app (tournament/group views), or warpcast.com/~/profile/<fid>
--
-- 1. Edit the INSERT below: one row per group (group_number, winner_fid).
--    Use NULL for winner_fid when the whole group was eliminated.
-- 2. Run the whole script once.
-- =============================================================================

SET search_path = poker;

-- -----------------------------------------------------------------------------
-- EDIT THIS: one row per group. NULL winner_fid = "all eliminated".
-- Get FIDs from the app (e.g. tournament players / group members) or Warpcast.
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE outcome (group_number int, winner_fid bigint);
INSERT INTO outcome (group_number, winner_fid) VALUES
  (1,  NULL),   -- replace with winner FID or leave NULL
  (2,  NULL),
  (3,  NULL),
  (4,  NULL),
  (5,  NULL),
  (6,  NULL),
  (7,  NULL),
  (8,  NULL),
  (9,  NULL),
  (10, NULL),
  (11, NULL),
  (12, NULL),
  (13, NULL),
  (14, NULL),
  (15, NULL),
  (16, NULL),
  (17, NULL);
-- Add more rows if you have more than 17 groups.

-- Get the latest settled BULLIED game's round
CREATE TEMP TABLE game_round AS
  SELECT g.id AS game_id, r.id AS round_id
  FROM bullied_games g
  JOIN bullied_rounds r ON r.game_id = g.id
  WHERE g.status = 'settled'
  ORDER BY g.updated_at DESC
  LIMIT 1;

-- Step 1: Update bullied_groups
UPDATE bullied_groups bg
SET
  status     = CASE WHEN o.winner_fid IS NOT NULL THEN 'completed' ELSE 'eliminated' END,
  winner_fid = o.winner_fid,
  updated_at = now()
FROM outcome o, game_round gr
WHERE bg.round_id = gr.round_id
  AND bg.group_number = o.group_number;

-- Step 2: Eliminate non-winners in tournament
UPDATE betr_games_tournament_players tp
SET
  status            = 'eliminated',
  eliminated_at     = now(),
  eliminated_reason = 'BULLIED round'
WHERE tp.fid IN (
  SELECT DISTINCT u.fid::bigint
  FROM bullied_groups g
  CROSS JOIN LATERAL unnest(g.fids) AS u(fid)
  JOIN outcome o ON o.group_number = g.group_number
  CROSS JOIN game_round gr
  WHERE g.round_id = gr.round_id
    AND (o.winner_fid IS NULL OR u.fid != o.winner_fid)
)
AND tp.status <> 'eliminated';

-- Step 3: Reinstate winners (set alive)
UPDATE betr_games_tournament_players tp
SET
  status            = 'alive',
  eliminated_at     = NULL,
  eliminated_reason  = NULL
WHERE tp.fid IN (SELECT DISTINCT winner_fid FROM outcome WHERE winner_fid IS NOT NULL)
  AND tp.status <> 'alive';

-- Optional: show result
SELECT 'Groups updated' AS step, count(*) FROM outcome
UNION ALL
SELECT 'Winners (alive)', count(*) FROM outcome WHERE winner_fid IS NOT NULL;
