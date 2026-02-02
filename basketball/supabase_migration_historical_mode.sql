-- Basketball Historical Mode - Database Schema Migration
-- 
-- This migration transforms the basketball app to support historical mode:
-- - Adds historical tables for source of truth data
-- - Removes age, tier, salary, contract fields
-- - Adds year_in_school, historical_year, rating fields
-- - Adds historical schedule and game result tracking
--
-- Run this in Supabase SQL Editor for the "Catwalk Ai Agent" project

-- ============================================================================
-- 1. Create Historical Tables (Source of Truth)
-- ============================================================================

-- Historical Players: All player data from MaxPreps
CREATE TABLE IF NOT EXISTS basketball.historical_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  historical_year integer NOT NULL, -- e.g., 2005 for 2005-06 season
  team_name text NOT NULL, -- e.g., "College Park"
  position text CHECK (position IN ('PG', 'SG', 'SF', 'PF', 'C')),
  height_inches integer, -- fallback for position if not available
  year_in_school text CHECK (year_in_school IN ('Freshman', 'Sophomore', 'Junior', 'Senior')),
  
  -- Actual stats from MaxPreps
  ppg numeric,
  rpg numeric, -- rebounds per game
  apg numeric, -- assists per game
  spg numeric, -- steals per game
  bpg numeric, -- blocks per game
  mpg numeric, -- minutes per game
  
  -- Calculated fields
  starting_rating numeric, -- from first varsity season
  potential_rating numeric, -- from best season + 3 points to each stat
  best_season_year integer, -- year of best season
  
  -- Metadata
  maxpreps_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(name, historical_year, team_name) -- prevent duplicates
);

CREATE INDEX IF NOT EXISTS historical_players_year_team_idx 
ON basketball.historical_players (historical_year, team_name);
CREATE INDEX IF NOT EXISTS historical_players_name_idx 
ON basketball.historical_players (name);

-- Historical Teams: Team standings and strength data
CREATE TABLE IF NOT EXISTS basketball.historical_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  historical_year integer NOT NULL,
  
  -- Standings data
  district_wins integer,
  district_losses integer,
  overall_wins integer,
  overall_losses integer,
  points_for integer,
  points_against integer,
  district_rank integer, -- 1-6 (or however many teams in district)
  
  -- Calculated team strength rating
  team_strength_rating numeric, -- calculated from standings (district 75%, margin 15%, overall 10%)
  
  -- Metadata
  maxpreps_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(name, historical_year)
);

CREATE INDEX IF NOT EXISTS historical_teams_year_idx 
ON basketball.historical_teams (historical_year);

-- Historical Schedules: Exact game schedules with results
CREATE TABLE IF NOT EXISTS basketball.historical_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  historical_year integer NOT NULL,
  game_date date, -- actual date from MaxPreps
  home_team_name text NOT NULL,
  away_team_name text NOT NULL,
  
  -- Actual results
  home_score integer,
  away_score integer,
  winner_team_name text,
  margin integer, -- point differential
  
  -- Game type
  is_district_game boolean NOT NULL DEFAULT false, -- true if both teams in district
  is_out_of_conference boolean NOT NULL DEFAULT false,
  
  -- For simulation probability calculation
  expected_win_probability numeric, -- calculated from margin (e.g., 20pt loss = 5% win chance)
  
  -- Metadata
  maxpreps_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS historical_schedules_year_idx 
ON basketball.historical_schedules (historical_year);
CREATE INDEX IF NOT EXISTS historical_schedules_teams_idx 
ON basketball.historical_schedules (home_team_name, away_team_name);

-- Retired Players: Players from teams that left the district
CREATE TABLE IF NOT EXISTS basketball.retired_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES basketball.players(id),
  retired_season integer NOT NULL,
  retired_reason text NOT NULL DEFAULT 'team_left_district',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS retired_players_player_id_idx 
ON basketball.retired_players (player_id);

-- ============================================================================
-- 2. Modify Existing Tables
-- ============================================================================

-- Remove old columns from players table
ALTER TABLE basketball.players DROP COLUMN IF EXISTS age;
ALTER TABLE basketball.players DROP COLUMN IF EXISTS tier;
ALTER TABLE basketball.players DROP COLUMN IF EXISTS salary_m;
ALTER TABLE basketball.players DROP COLUMN IF EXISTS contract_years_remaining;

-- Add new columns to players table
ALTER TABLE basketball.players 
ADD COLUMN IF NOT EXISTS year_in_school text CHECK (year_in_school IN ('Freshman', 'Sophomore', 'Junior', 'Senior'));
ALTER TABLE basketball.players 
ADD COLUMN IF NOT EXISTS historical_year integer;
ALTER TABLE basketball.players 
ADD COLUMN IF NOT EXISTS starting_rating numeric;
ALTER TABLE basketball.players 
ADD COLUMN IF NOT EXISTS potential_rating numeric;
ALTER TABLE basketball.players 
ADD COLUMN IF NOT EXISTS historical_player_id uuid REFERENCES basketball.historical_players(id);

-- Update rating constraint (still 0-99, but no tier cap)
ALTER TABLE basketball.players DROP CONSTRAINT IF EXISTS players_rating_check;
ALTER TABLE basketball.players ADD CONSTRAINT players_rating_check 
CHECK (rating >= 0 AND rating <= 99);

-- Remove tier constraint
ALTER TABLE basketball.players DROP CONSTRAINT IF EXISTS players_tier_check;

-- Add columns to teams table
ALTER TABLE basketball.teams 
ADD COLUMN IF NOT EXISTS historical_year integer;
ALTER TABLE basketball.teams 
ADD COLUMN IF NOT EXISTS historical_team_id uuid REFERENCES basketball.historical_teams(id);
ALTER TABLE basketball.teams 
ADD COLUMN IF NOT EXISTS team_strength_rating numeric;

-- Add columns to games table
ALTER TABLE basketball.games 
ADD COLUMN IF NOT EXISTS historical_game_id uuid REFERENCES basketball.historical_schedules(id);
ALTER TABLE basketball.games 
ADD COLUMN IF NOT EXISTS actual_home_score integer; -- IRL result
ALTER TABLE basketball.games 
ADD COLUMN IF NOT EXISTS actual_away_score integer; -- IRL result
ALTER TABLE basketball.games 
ADD COLUMN IF NOT EXISTS game_date date;
ALTER TABLE basketball.games 
ADD COLUMN IF NOT EXISTS is_district_game boolean NOT NULL DEFAULT false;
ALTER TABLE basketball.games 
ADD COLUMN IF NOT EXISTS is_out_of_conference boolean NOT NULL DEFAULT false;

-- Add columns to player_season_stats table
ALTER TABLE basketball.player_season_stats 
ADD COLUMN IF NOT EXISTS minutes_played integer DEFAULT 0;
ALTER TABLE basketball.player_season_stats 
ADD COLUMN IF NOT EXISTS rebounds integer DEFAULT 0;
ALTER TABLE basketball.player_season_stats 
ADD COLUMN IF NOT EXISTS assists integer DEFAULT 0;
ALTER TABLE basketball.player_season_stats 
ADD COLUMN IF NOT EXISTS steals integer DEFAULT 0;
ALTER TABLE basketball.player_season_stats 
ADD COLUMN IF NOT EXISTS blocks integer DEFAULT 0;
ALTER TABLE basketball.player_season_stats 
ADD COLUMN IF NOT EXISTS ppg numeric;
ALTER TABLE basketball.player_season_stats 
ADD COLUMN IF NOT EXISTS rpg numeric;
ALTER TABLE basketball.player_season_stats 
ADD COLUMN IF NOT EXISTS apg numeric;
ALTER TABLE basketball.player_season_stats 
ADD COLUMN IF NOT EXISTS spg numeric;
ALTER TABLE basketball.player_season_stats 
ADD COLUMN IF NOT EXISTS bpg numeric;
ALTER TABLE basketball.player_season_stats 
ADD COLUMN IF NOT EXISTS mpg numeric;

-- Update season_state to remove 60-day constraint
ALTER TABLE basketball.season_state 
DROP CONSTRAINT IF EXISTS season_state_day_number_check;
ALTER TABLE basketball.season_state 
ADD CONSTRAINT season_state_day_number_check 
CHECK (day_number >= 1); -- No upper limit, dynamic per season

-- ============================================================================
-- 3. RLS Policies for New Tables
-- ============================================================================

ALTER TABLE basketball.historical_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE basketball.historical_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE basketball.historical_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE basketball.retired_players ENABLE ROW LEVEL SECURITY;

-- Drop policies if they exist (so this migration can be re-run safely)
DROP POLICY IF EXISTS "historical_players_select_all" ON basketball.historical_players;
DROP POLICY IF EXISTS "historical_teams_select_all" ON basketball.historical_teams;
DROP POLICY IF EXISTS "historical_schedules_select_all" ON basketball.historical_schedules;
DROP POLICY IF EXISTS "retired_players_select_all" ON basketball.retired_players;

-- Historical data: Everyone can read
CREATE POLICY "historical_players_select_all" ON basketball.historical_players
  FOR SELECT USING (true);

CREATE POLICY "historical_teams_select_all" ON basketball.historical_teams
  FOR SELECT USING (true);

CREATE POLICY "historical_schedules_select_all" ON basketball.historical_schedules
  FOR SELECT USING (true);

CREATE POLICY "retired_players_select_all" ON basketball.retired_players
  FOR SELECT USING (true);
