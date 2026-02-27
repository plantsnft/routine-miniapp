-- App-wide unread / missed chat: Lobby
-- Migration #78 — add chat_last_seen_at to lobby_presence for per-user unread count.
-- Run after lobby chat migrations. When user has lobby chat open, heartbeat sets chat_last_seen_at; unread = messages with created_at > COALESCE(chat_last_seen_at, 'epoch').

ALTER TABLE poker.lobby_presence
  ADD COLUMN IF NOT EXISTS chat_last_seen_at TIMESTAMPTZ;

COMMENT ON COLUMN poker.lobby_presence.chat_last_seen_at IS 'Last time user had lobby chat open; updated only when in_chat=true in heartbeat. Used for unread count.';
