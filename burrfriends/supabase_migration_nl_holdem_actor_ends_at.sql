-- Phase 40 (NL HOLDEM): Add actor_ends_at to nl_holdem_hands for turn timer.
-- Deadline for current actor to act; cron folds at expiry. Run after #95.
-- Migration #96.

SET search_path = poker;

ALTER TABLE poker.nl_holdem_hands ADD COLUMN IF NOT EXISTS actor_ends_at timestamptz;

COMMENT ON COLUMN poker.nl_holdem_hands.actor_ends_at IS 'Phase 40: Deadline for current actor (40s); set on deal/act/advance; cron auto-folds at expiry';

NOTIFY pgrst, 'reload schema';
