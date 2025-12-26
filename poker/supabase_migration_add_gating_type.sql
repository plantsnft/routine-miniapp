-- Migration: Add gating_type column to poker.games table (if missing) and refresh PostgREST cache
-- This fixes PGRST204 error: "Could not find the 'gating_type' column"
-- Run this in Supabase SQL Editor

-- Step 1: Check if column exists, add if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'poker' 
      AND table_name = 'games' 
      AND column_name = 'gating_type'
  ) THEN
    -- Column doesn't exist, add it
    ALTER TABLE poker.games
      ADD COLUMN gating_type text NOT NULL DEFAULT 'open';
    
    -- Update existing rows based on buy_in_amount
    UPDATE poker.games
    SET gating_type = CASE 
      WHEN buy_in_amount IS NOT NULL AND buy_in_amount > 0 THEN 'entry_fee'
      ELSE 'open'
    END;
    
    -- Add comment
    COMMENT ON COLUMN poker.games.gating_type IS 'Game gating type: open (free), entry_fee (paid), or stake_threshold (staking required)';
    
    RAISE NOTICE 'Added gating_type column to poker.games';
  ELSE
    RAISE NOTICE 'gating_type column already exists in poker.games';
  END IF;
END $$;

-- Step 2: Force PostgREST to refresh its schema cache
-- This is the critical step - PostgREST caches the schema and may not see new columns
SELECT pg_notify('pgrst', 'reload schema');

-- Step 3: Verify the column exists (for debugging)
SELECT 
  column_name, 
  data_type, 
  column_default, 
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'poker' 
  AND table_name = 'games' 
  AND column_name = 'gating_type';

