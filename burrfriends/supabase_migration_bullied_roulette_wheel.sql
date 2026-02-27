-- Phase 33 (BULLIED) Roulette Wheel — Migration #59
-- Adds roulette_wheel_deployed_at to bullied_games
-- Adds roulette_opted_fids and roulette_locked_at to bullied_groups

ALTER TABLE poker.bullied_games
  ADD COLUMN IF NOT EXISTS roulette_wheel_deployed_at timestamptz NULL;

ALTER TABLE poker.bullied_groups
  ADD COLUMN IF NOT EXISTS roulette_opted_fids bigint[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS roulette_locked_at timestamptz NULL;

-- Reload schema so PostgREST picks up new columns immediately
NOTIFY pgrst, 'reload schema';
