-- Migration: Allow multiple creator claims per user (one per cast)
-- This changes the unique constraint from UNIQUE(fid) to UNIQUE(fid, cast_hash)
-- Allowing users to claim 1M CATWALK per cast they've made in /catwalk

-- Step 1: Drop the old unique constraint on fid only
ALTER TABLE public.creator_claims DROP CONSTRAINT IF EXISTS creator_claims_fid_key;

-- Step 2: Add new unique constraint on fid + cast_hash
-- This allows one claim per user per cast
ALTER TABLE public.creator_claims ADD CONSTRAINT creator_claims_fid_cast_hash_key UNIQUE(fid, cast_hash);

-- Step 3: Update default reward amount to 1,000,000 CATWALK per cast
ALTER TABLE public.creator_claims ALTER COLUMN reward_amount SET DEFAULT 1000000;

-- Step 4: Remove claimed_at default so new entries start as unclaimed
ALTER TABLE public.creator_claims ALTER COLUMN claimed_at DROP DEFAULT;

-- Verify the changes
-- SELECT constraint_name, table_name FROM information_schema.table_constraints 
-- WHERE table_name = 'creator_claims' AND constraint_type = 'UNIQUE';

