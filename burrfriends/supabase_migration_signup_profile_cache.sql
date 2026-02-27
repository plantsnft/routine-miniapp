-- Cached profile columns for signup lists (10.3.5 optimization).
-- Populated at signup time via Neynar; GET game returns from DB without Neynar call.
-- Run after supabase_migration_burrfriends_feed_cache.sql (see Infrastructure → Running migrations).

-- poker.buddy_up_signups: add cached profile columns
ALTER TABLE poker.buddy_up_signups
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS pfp_url text;

COMMENT ON COLUMN poker.buddy_up_signups.username IS 'Cached from Neynar at signup; used for signup list (10.3.5)';
COMMENT ON COLUMN poker.buddy_up_signups.display_name IS 'Cached from Neynar at signup; used for signup list (10.3.5)';
COMMENT ON COLUMN poker.buddy_up_signups.pfp_url IS 'Cached from Neynar at signup; used for signup list (10.3.5)';

-- poker.mole_signups: add cached profile columns
ALTER TABLE poker.mole_signups
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS pfp_url text;

COMMENT ON COLUMN poker.mole_signups.username IS 'Cached from Neynar at signup; used for signup list (10.3.5)';
COMMENT ON COLUMN poker.mole_signups.display_name IS 'Cached from Neynar at signup; used for signup list (10.3.5)';
COMMENT ON COLUMN poker.mole_signups.pfp_url IS 'Cached from Neynar at signup; used for signup list (10.3.5)';
