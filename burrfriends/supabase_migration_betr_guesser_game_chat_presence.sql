-- Migration #84: BETR GUESSER game chat presence (unread tracking)
-- Phase 13.10. chat_last_seen_at updated when user has chat open (heartbeat inChat: true).
-- Unread = messages with created_at > COALESCE(chat_last_seen_at, 'epoch'). Run after #82.

CREATE TABLE IF NOT EXISTS poker.betr_guesser_game_chat_presence (
  game_id UUID NOT NULL REFERENCES poker.betr_guesser_games(id) ON DELETE CASCADE,
  fid BIGINT NOT NULL,
  chat_last_seen_at TIMESTAMPTZ,
  PRIMARY KEY (game_id, fid)
);

ALTER TABLE poker.betr_guesser_game_chat_presence ENABLE ROW LEVEL SECURITY;
