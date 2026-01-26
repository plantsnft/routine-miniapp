-- Basketball Mini App - Create basketball schema and tables
-- 
-- IMPORTANT: This migration is for the "Catwalk Ai Agent" Supabase project
-- This creates a separate basketball schema to isolate from existing public.* tables (catwalk app)
-- DO NOT modify public.* tables - they belong to the catwalk app
--
-- Run this in Supabase SQL Editor for the "Catwalk Ai Agent" project
-- All tables will be created in the basketball.* schema (separate from public.*)

-- Create basketball schema
CREATE SCHEMA IF NOT EXISTS basketball;

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. basketball.profiles – User profiles (supports both Farcaster and Email auth)
-- ============================================================================
CREATE TABLE IF NOT EXISTS basketball.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_type text NOT NULL CHECK (auth_type IN ('farcaster', 'email')),
  email text,
  farcaster_fid bigint,
  is_admin boolean NOT NULL DEFAULT true, -- MVP: all users are admin
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_auth_check CHECK (
    (auth_type = 'farcaster' AND farcaster_fid IS NOT NULL AND email IS NULL) OR
    (auth_type = 'email' AND email IS NOT NULL AND farcaster_fid IS NULL)
  ),
  CONSTRAINT profiles_email_unique UNIQUE (email),
  CONSTRAINT profiles_fid_unique UNIQUE (farcaster_fid)
);

CREATE INDEX IF NOT EXISTS profiles_farcaster_fid_idx ON basketball.profiles (farcaster_fid);
CREATE INDEX IF NOT EXISTS profiles_email_idx ON basketball.profiles (email);
-- Partial unique indexes (enforce uniqueness only for non-NULL values)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique_idx ON basketball.profiles (email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_fid_unique_idx ON basketball.profiles (farcaster_fid) WHERE farcaster_fid IS NOT NULL;

-- ============================================================================
-- 2. basketball.teams – Teams owned by users
-- ============================================================================
CREATE TABLE IF NOT EXISTS basketball.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_profile_id uuid NOT NULL REFERENCES basketball.profiles(id) ON DELETE CASCADE,
  prep_boost_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS teams_owner_profile_id_idx ON basketball.teams (owner_profile_id);

-- ============================================================================
-- 3. basketball.players – Players on teams
-- ============================================================================
CREATE TABLE IF NOT EXISTS basketball.players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES basketball.teams(id) ON DELETE CASCADE,
  name text NOT NULL,
  position text NOT NULL CHECK (position IN ('PG', 'SG', 'SF', 'PF', 'C')),
  tier text NOT NULL CHECK (tier IN ('good', 'great', 'elite')),
  rating numeric NOT NULL CHECK (rating >= 0 AND rating <= 99),
  age integer NOT NULL CHECK (age >= 18 AND age <= 36),
  affinity text NOT NULL CHECK (affinity IN ('StrongVsZone', 'StrongVsMan')),
  salary_m integer NOT NULL,
  contract_years_remaining integer NOT NULL CHECK (contract_years_remaining >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS players_team_id_idx ON basketball.players (team_id);

-- ============================================================================
-- 4. basketball.season_state – Single row table for current season state
-- ============================================================================
CREATE TABLE IF NOT EXISTS basketball.season_state (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  season_number integer NOT NULL DEFAULT 1,
  day_number integer NOT NULL CHECK (day_number >= 1 AND day_number <= 60),
  phase text NOT NULL CHECK (phase IN ('REGULAR', 'PLAYOFFS', 'OFFSEASON')),
  day_type text NOT NULL CHECK (day_type IN ('OFFDAY', 'GAMENIGHT')),
  last_advanced_at timestamptz
);

-- Insert initial row (will fail if already exists, which is fine)
INSERT INTO basketball.season_state (id, season_number, day_number, phase, day_type)
VALUES (1, 1, 1, 'REGULAR', 'OFFDAY')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 5. basketball.gameplans – Game plans submitted by teams
-- ============================================================================
CREATE TABLE IF NOT EXISTS basketball.gameplans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_number integer NOT NULL,
  day_number integer NOT NULL,
  team_id uuid NOT NULL REFERENCES basketball.teams(id) ON DELETE CASCADE,
  offense text NOT NULL CHECK (offense IN ('Drive', 'Shoot')),
  defense text NOT NULL CHECK (defense IN ('Zone', 'Man')),
  mentality text NOT NULL CHECK (mentality IN ('Aggressive', 'Conservative', 'Neutral')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(season_number, day_number, team_id)
);

CREATE INDEX IF NOT EXISTS gameplans_team_id_idx ON basketball.gameplans (team_id);
CREATE INDEX IF NOT EXISTS gameplans_season_day_idx ON basketball.gameplans (season_number, day_number);

-- ============================================================================
-- 6. basketball.offday_actions – Offday actions (TRAIN or PREP)
-- ============================================================================
CREATE TABLE IF NOT EXISTS basketball.offday_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_number integer NOT NULL,
  day_number integer NOT NULL,
  team_id uuid NOT NULL REFERENCES basketball.teams(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('TRAIN', 'PREP')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(season_number, day_number, team_id)
);

CREATE INDEX IF NOT EXISTS offday_actions_team_id_idx ON basketball.offday_actions (team_id);
CREATE INDEX IF NOT EXISTS offday_actions_season_day_idx ON basketball.offday_actions (season_number, day_number);

-- ============================================================================
-- 7. basketball.team_season_stats – Team statistics per season
-- ============================================================================
CREATE TABLE IF NOT EXISTS basketball.team_season_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_number integer NOT NULL,
  team_id uuid NOT NULL REFERENCES basketball.teams(id) ON DELETE CASCADE,
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  games_played integer NOT NULL DEFAULT 0,
  points_for integer NOT NULL DEFAULT 0,
  points_against integer NOT NULL DEFAULT 0,
  streak_type text NOT NULL DEFAULT 'NONE' CHECK (streak_type IN ('W', 'L', 'NONE')),
  streak_count integer NOT NULL DEFAULT 0,
  UNIQUE(season_number, team_id)
);

CREATE INDEX IF NOT EXISTS team_season_stats_team_id_idx ON basketball.team_season_stats (team_id);
CREATE INDEX IF NOT EXISTS team_season_stats_season_idx ON basketball.team_season_stats (season_number);

-- ============================================================================
-- 8. basketball.player_season_stats – Player statistics per season
-- ============================================================================
CREATE TABLE IF NOT EXISTS basketball.player_season_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_number integer NOT NULL,
  player_id uuid NOT NULL REFERENCES basketball.players(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES basketball.teams(id) ON DELETE CASCADE,
  games_played integer NOT NULL DEFAULT 0,
  points integer NOT NULL DEFAULT 0,
  UNIQUE(season_number, player_id)
);

CREATE INDEX IF NOT EXISTS player_season_stats_player_id_idx ON basketball.player_season_stats (player_id);
CREATE INDEX IF NOT EXISTS player_season_stats_team_id_idx ON basketball.player_season_stats (team_id);
CREATE INDEX IF NOT EXISTS player_season_stats_season_idx ON basketball.player_season_stats (season_number);

-- ============================================================================
-- 9. basketball.games – Game records
-- ============================================================================
CREATE TABLE IF NOT EXISTS basketball.games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_number integer NOT NULL,
  day_number integer NOT NULL,
  home_team_id uuid NOT NULL REFERENCES basketball.teams(id) ON DELETE CASCADE,
  away_team_id uuid NOT NULL REFERENCES basketball.teams(id) ON DELETE CASCADE,
  home_score integer,
  away_score integer,
  winner_team_id uuid REFERENCES basketball.teams(id),
  status text NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'FINAL')),
  played_at timestamptz
);

CREATE INDEX IF NOT EXISTS games_home_team_id_idx ON basketball.games (home_team_id);
CREATE INDEX IF NOT EXISTS games_away_team_id_idx ON basketball.games (away_team_id);
CREATE INDEX IF NOT EXISTS games_season_day_idx ON basketball.games (season_number, day_number);

-- ============================================================================
-- 10. basketball.game_player_lines – Player points per game
-- ============================================================================
CREATE TABLE IF NOT EXISTS basketball.game_player_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES basketball.games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES basketball.players(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES basketball.teams(id) ON DELETE CASCADE,
  points integer NOT NULL DEFAULT 0,
  UNIQUE(game_id, player_id)
);

CREATE INDEX IF NOT EXISTS game_player_lines_game_id_idx ON basketball.game_player_lines (game_id);
CREATE INDEX IF NOT EXISTS game_player_lines_player_id_idx ON basketball.game_player_lines (player_id);
CREATE INDEX IF NOT EXISTS game_player_lines_team_id_idx ON basketball.game_player_lines (team_id);

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================
-- 
-- NOTE: RLS policies use auth.uid() which only works for Supabase Auth (email users).
-- For Farcaster users, auth.uid() will be NULL.
-- 
-- MVP: All database operations use service role key (bypasses RLS), so these policies
-- are not enforced. They're included for future client-side access if needed.
-- For now, authorization is handled in API routes using profile lookups.

-- Enable RLS on all tables
ALTER TABLE basketball.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE basketball.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE basketball.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE basketball.season_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE basketball.gameplans ENABLE ROW LEVEL SECURITY;
ALTER TABLE basketball.offday_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE basketball.team_season_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE basketball.player_season_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE basketball.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE basketball.game_player_lines ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can read their own profile, admins can read all
CREATE POLICY "profiles_select_own" ON basketball.profiles
  FOR SELECT
  USING (auth.uid()::text = id::text OR (SELECT is_admin FROM basketball.profiles WHERE id::text = auth.uid()::text));

-- Teams: Everyone can read (league is public), owners can update their team
CREATE POLICY "teams_select_all" ON basketball.teams
  FOR SELECT
  USING (true);

CREATE POLICY "teams_update_own" ON basketball.teams
  FOR UPDATE
  USING (owner_profile_id::text = auth.uid()::text OR (SELECT is_admin FROM basketball.profiles WHERE id::text = auth.uid()::text));

-- Players: Everyone can read
CREATE POLICY "players_select_all" ON basketball.players
  FOR SELECT
  USING (true);

-- Season state: Everyone can read
CREATE POLICY "season_state_select_all" ON basketball.season_state
  FOR SELECT
  USING (true);

-- Gameplans: Everyone can read, owners can insert/update their own
CREATE POLICY "gameplans_select_all" ON basketball.gameplans
  FOR SELECT
  USING (true);

CREATE POLICY "gameplans_insert_own" ON basketball.gameplans
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM basketball.teams
      WHERE teams.id = gameplans.team_id
      AND teams.owner_profile_id::text = auth.uid()::text
    )
    OR (SELECT is_admin FROM basketball.profiles WHERE id::text = auth.uid()::text)
  );

CREATE POLICY "gameplans_update_own" ON basketball.gameplans
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM basketball.teams
      WHERE teams.id = gameplans.team_id
      AND teams.owner_profile_id::text = auth.uid()::text
    )
    OR (SELECT is_admin FROM basketball.profiles WHERE id::text = auth.uid()::text)
  );

-- Offday actions: Everyone can read, owners can insert/update their own
CREATE POLICY "offday_actions_select_all" ON basketball.offday_actions
  FOR SELECT
  USING (true);

CREATE POLICY "offday_actions_insert_own" ON basketball.offday_actions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM basketball.teams
      WHERE teams.id = offday_actions.team_id
      AND teams.owner_profile_id::text = auth.uid()::text
    )
    OR (SELECT is_admin FROM basketball.profiles WHERE id::text = auth.uid()::text)
  );

CREATE POLICY "offday_actions_update_own" ON basketball.offday_actions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM basketball.teams
      WHERE teams.id = offday_actions.team_id
      AND teams.owner_profile_id::text = auth.uid()::text
    )
    OR (SELECT is_admin FROM basketball.profiles WHERE id::text = auth.uid()::text)
  );

-- Stats: Everyone can read
CREATE POLICY "team_season_stats_select_all" ON basketball.team_season_stats
  FOR SELECT
  USING (true);

CREATE POLICY "player_season_stats_select_all" ON basketball.player_season_stats
  FOR SELECT
  USING (true);

-- Games: Everyone can read
CREATE POLICY "games_select_all" ON basketball.games
  FOR SELECT
  USING (true);

-- Game player lines: Everyone can read
CREATE POLICY "game_player_lines_select_all" ON basketball.game_player_lines
  FOR SELECT
  USING (true);
