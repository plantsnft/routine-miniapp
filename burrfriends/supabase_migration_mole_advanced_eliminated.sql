-- THE MOLE: Advanced / Eliminated outcome for results display
-- Run after supabase_migration_the_mole.sql (and community / mole_reserved_spots as needed).
-- Optional: when set, Results tab shows "Advanced" and "Eliminated" instead of only the settlement winner (mole).

ALTER TABLE poker.mole_games
  ADD COLUMN IF NOT EXISTS advanced_fids bigint[],
  ADD COLUMN IF NOT EXISTS eliminated_fids bigint[];

COMMENT ON COLUMN poker.mole_games.advanced_fids IS 'FIDs who advanced to next round (e.g. BETR games). Shown on Results as "Advanced".';
COMMENT ON COLUMN poker.mole_games.eliminated_fids IS 'FIDs who were eliminated. Shown on Results as "Eliminated". If NULL but advanced_fids set, derived from signups minus advanced_fids.';
