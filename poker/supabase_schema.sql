-- Poker Mini App Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. users – Farcaster Players
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fid bigint NOT NULL UNIQUE,
  username text,
  display_name text,
  avatar_url text,
  wallet_address text,
  inserted_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_fid_unique ON public.users (fid);

-- 2. clubs – Hellfire & Burrfriends
CREATE TABLE IF NOT EXISTS public.clubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  owner_fid bigint NOT NULL,
  name text NOT NULL,
  description text,
  clubgg_club_id text,
  inserted_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clubs_owner_fid_idx ON public.clubs (owner_fid);

-- 3. club_members – Who Follows Which Club
CREATE TABLE IF NOT EXISTS public.club_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  member_fid bigint NOT NULL,
  role text NOT NULL DEFAULT 'member',
  status text NOT NULL DEFAULT 'active',
  inserted_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(club_id, member_fid)
);

CREATE INDEX IF NOT EXISTS club_members_club_id_idx ON public.club_members (club_id);
CREATE INDEX IF NOT EXISTS club_members_member_fid_idx ON public.club_members (member_fid);

-- 4. games – One Row Per Scheduled Game
CREATE TABLE IF NOT EXISTS public.games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  creator_fid bigint NOT NULL,
  title text,
  description text,
  clubgg_game_id text,
  clubgg_link text,
  scheduled_time timestamptz,
  status text NOT NULL DEFAULT 'scheduled',
  gating_type text NOT NULL DEFAULT 'open',
  entry_fee_amount numeric,
  entry_fee_currency text,
  staking_pool_id text,
  staking_min_amount numeric,
  game_password_encrypted text,
  password_expires_at timestamptz,
  inserted_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS games_club_id_idx ON public.games (club_id);
CREATE INDEX IF NOT EXISTS games_status_idx ON public.games (status);
CREATE INDEX IF NOT EXISTS games_scheduled_time_idx ON public.games (scheduled_time);

-- 5. game_participants – Who Is In Which Game
CREATE TABLE IF NOT EXISTS public.game_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_fid bigint NOT NULL,
  join_reason text,
  has_seen_password boolean NOT NULL DEFAULT false,
  password_viewed_at timestamptz,
  is_eligible boolean NOT NULL DEFAULT false,
  inserted_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(game_id, player_fid)
);

CREATE INDEX IF NOT EXISTS game_participants_game_id_idx ON public.game_participants (game_id);
CREATE INDEX IF NOT EXISTS game_participants_player_fid_idx ON public.game_participants (player_fid);

-- 6. game_results – Game Results (MVP skeleton)
CREATE TABLE IF NOT EXISTS public.game_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_fid bigint NOT NULL,
  position integer,
  payout_amount numeric,
  payout_currency text,
  net_profit numeric,
  inserted_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS game_results_game_id_idx ON public.game_results (game_id);
CREATE INDEX IF NOT EXISTS game_results_player_fid_idx ON public.game_results (player_fid);

-- 7. payouts – Payout Records (MVP skeleton)
CREATE TABLE IF NOT EXISTS public.payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid REFERENCES public.games(id) ON DELETE SET NULL,
  payer_fid bigint,
  recipient_fid bigint NOT NULL,
  amount numeric NOT NULL,
  currency text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  tx_hash text,
  inserted_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payouts_game_id_idx ON public.payouts (game_id);
CREATE INDEX IF NOT EXISTS payouts_recipient_fid_idx ON public.payouts (recipient_fid);

-- 8. club_announcements – Notifications / Broadcasts
CREATE TABLE IF NOT EXISTS public.club_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  creator_fid bigint NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  related_game_id uuid REFERENCES public.games(id),
  inserted_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS club_announcements_club_id_idx ON public.club_announcements (club_id);

-- Update trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  new.updated_at = now();
  return new;
END;
$$ language plpgsql;

-- Add update triggers
DROP TRIGGER IF EXISTS set_updated_at_users ON public.users;
CREATE TRIGGER set_updated_at_users
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_clubs ON public.clubs;
CREATE TRIGGER set_updated_at_clubs
  BEFORE UPDATE ON public.clubs
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_club_members ON public.club_members;
CREATE TRIGGER set_updated_at_club_members
  BEFORE UPDATE ON public.club_members
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_games ON public.games;
CREATE TRIGGER set_updated_at_games
  BEFORE UPDATE ON public.games
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_game_participants ON public.game_participants;
CREATE TRIGGER set_updated_at_game_participants
  BEFORE UPDATE ON public.game_participants
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_game_results ON public.game_results;
CREATE TRIGGER set_updated_at_game_results
  BEFORE UPDATE ON public.game_results
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_payouts ON public.payouts;
CREATE TRIGGER set_updated_at_payouts
  BEFORE UPDATE ON public.payouts
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- Enable Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_announcements ENABLE ROW LEVEL SECURITY;

-- Basic RLS Policies (can be refined)
-- Users: readable by all, writable by service role or self
CREATE POLICY "Users are viewable by everyone" ON public.users
  FOR SELECT USING (true);

CREATE POLICY "Users can insert themselves" ON public.users
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update themselves" ON public.users
  FOR UPDATE USING (true);

-- Clubs: readable by all, writable by owner or service role
CREATE POLICY "Clubs are viewable by everyone" ON public.clubs
  FOR SELECT USING (true);

-- Games: readable by all, writable by club owner or service role
CREATE POLICY "Games are viewable by everyone" ON public.games
  FOR SELECT USING (true);

-- Game participants: readable by participant, game club owner, or service role
-- Writable by service role (API will handle owner checks)
CREATE POLICY "Game participants are viewable by participants and owners" ON public.game_participants
  FOR SELECT USING (true);

-- Announcements: readable by all
CREATE POLICY "Announcements are viewable by everyone" ON public.club_announcements
  FOR SELECT USING (true);
