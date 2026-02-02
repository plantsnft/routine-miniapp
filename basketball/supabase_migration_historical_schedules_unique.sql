-- Add unique constraint so upsert works for historical_schedules
-- Run this in Supabase SQL Editor if you get "no unique or exclusion constraint matching the ON CONFLICT specification"

-- Allow multiple rows when game_date is null (use coalesce in unique index)
CREATE UNIQUE INDEX IF NOT EXISTS historical_schedules_year_home_away_date_idx
ON basketball.historical_schedules (historical_year, home_team_name, away_team_name, COALESCE(game_date, '1970-01-01'::date));
