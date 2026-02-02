-- Basketball Mini App - Create Initial Profiles
-- 
-- IMPORTANT: This migration creates the 4 required profiles for league initialization.
-- Use this if Neynar API fails to fetch FIDs during initialization, or if profiles
-- were deleted and need to be recreated.
--
-- Known FIDs:
-- - catwalk: 871872
-- - farville: 967647
-- - plantsnft: 318447
-- - Email: cpjets07@yahoo.com
--
-- Run this in Supabase SQL Editor for the "Catwalk Ai Agent" project

-- Create all 4 profiles (will skip if already exist)
-- Note: Uses individual INSERTs with conflict handling since we have separate UNIQUE constraints
-- for farcaster_fid and email

-- Create catwalk profile (skip if farcaster_fid 871872 already exists)
INSERT INTO basketball.profiles (auth_type, farcaster_fid, email, is_admin)
VALUES ('farcaster', 871872, NULL, true)
ON CONFLICT (farcaster_fid) DO NOTHING;

-- Create farville profile (skip if farcaster_fid 967647 already exists)
INSERT INTO basketball.profiles (auth_type, farcaster_fid, email, is_admin)
VALUES ('farcaster', 967647, NULL, true)
ON CONFLICT (farcaster_fid) DO NOTHING;

-- Create plantsnft profile (skip if farcaster_fid 318447 already exists)
INSERT INTO basketball.profiles (auth_type, farcaster_fid, email, is_admin)
VALUES ('farcaster', 318447, NULL, true)
ON CONFLICT (farcaster_fid) DO NOTHING;

-- Create email profile (skip if email already exists)
INSERT INTO basketball.profiles (auth_type, farcaster_fid, email, is_admin)
VALUES ('email', NULL, 'cpjets07@yahoo.com', true)
ON CONFLICT (email) DO NOTHING;

-- Verify profiles were created
SELECT id, farcaster_fid, email, is_admin 
FROM basketball.profiles 
ORDER BY 
  CASE 
    WHEN farcaster_fid = 871872 THEN 1  -- catwalk
    WHEN farcaster_fid = 967647 THEN 2  -- farville
    WHEN farcaster_fid = 318447 THEN 3  -- plantsnft
    WHEN email = 'cpjets07@yahoo.com' THEN 4  -- email
    ELSE 5
  END;
