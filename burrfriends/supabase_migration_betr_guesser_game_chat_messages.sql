-- Migration #82: BETR GUESSER game-level chat messages
-- Phase 13.10. One chat per game; access = has guessed or admin; chat only when game is open.
-- Run after supabase_migration_betr_guesser.sql.

CREATE TABLE IF NOT EXISTS poker.betr_guesser_game_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES poker.betr_guesser_games(id) ON DELETE CASCADE,
  sender_fid BIGINT NOT NULL,
  message TEXT NOT NULL CHECK (char_length(message) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_betr_guesser_game_chat_messages_game_id
  ON poker.betr_guesser_game_chat_messages(game_id);
CREATE INDEX IF NOT EXISTS idx_betr_guesser_game_chat_messages_game_created
  ON poker.betr_guesser_game_chat_messages(game_id, created_at DESC);

ALTER TABLE poker.betr_guesser_game_chat_messages ENABLE ROW LEVEL SECURITY;
