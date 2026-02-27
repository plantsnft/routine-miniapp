-- TAKE FROM THE PILE – Preload: players in queue (not current) can set amount to auto-take when their turn starts.
-- Run after supabase_migration_take_from_the_pile_chat.sql (#66). Phase 37 preload feature.
-- Creates poker.take_from_the_pile_preloads. One row per (game_id, fid); upsert/delete via API.

SET search_path = poker;

CREATE TABLE IF NOT EXISTS poker.take_from_the_pile_preloads (
  game_id uuid NOT NULL REFERENCES poker.take_from_the_pile_games(id) ON DELETE CASCADE,
  fid bigint NOT NULL,
  preload_amount numeric NOT NULL CHECK (preload_amount >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, fid)
);

CREATE INDEX IF NOT EXISTS idx_take_from_the_pile_preloads_game_id
  ON poker.take_from_the_pile_preloads(game_id);

ALTER TABLE poker.take_from_the_pile_preloads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_take_from_the_pile_preloads" ON poker.take_from_the_pile_preloads;
CREATE POLICY "no_direct_access_take_from_the_pile_preloads"
  ON poker.take_from_the_pile_preloads
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE poker.take_from_the_pile_preloads IS 'TAKE FROM THE PILE: preload amount for queue players; applied when turn starts if pot >= amount';

NOTIFY pgrst, 'reload schema';
