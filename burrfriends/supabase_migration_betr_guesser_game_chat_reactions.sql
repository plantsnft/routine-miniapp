-- Migration #83: BETR GUESSER game chat reactions
-- Phase 13.10. Same pattern as lobby_chat_reactions. Run after #82.

CREATE TABLE IF NOT EXISTS poker.betr_guesser_game_chat_reactions (
  message_id UUID NOT NULL REFERENCES poker.betr_guesser_game_chat_messages(id) ON DELETE CASCADE,
  fid BIGINT NOT NULL,
  reaction TEXT NOT NULL,
  PRIMARY KEY (message_id, fid)
);

ALTER TABLE poker.betr_guesser_game_chat_reactions ENABLE ROW LEVEL SECURITY;
