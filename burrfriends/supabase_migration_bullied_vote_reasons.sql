-- Phase 33 (BULLIED): Add reason_text to bullied_votes for "THE BETR CONFESSIONALS" (Why did you pick this person?)
-- Migration #57. Run after supabase_migration_bullied.sql (#56).

ALTER TABLE poker.bullied_votes ADD COLUMN IF NOT EXISTS reason_text TEXT;
