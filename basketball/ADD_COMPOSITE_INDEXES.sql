-- ============================================================================
-- Composite Indexes (Performance Optimization)
-- ============================================================================
-- These indexes optimize common query patterns for better performance
-- Run this in Supabase SQL Editor

-- For game queries filtered by season + day + status
CREATE INDEX IF NOT EXISTS games_season_day_status_idx 
ON basketball.games (season_number, day_number, status);

-- For player stats filtered by season + team
CREATE INDEX IF NOT EXISTS player_season_stats_season_team_idx 
ON basketball.player_season_stats (season_number, team_id);

-- For gameplans filtered by season + day + team
CREATE INDEX IF NOT EXISTS gameplans_season_day_team_idx 
ON basketball.gameplans (season_number, day_number, team_id);
