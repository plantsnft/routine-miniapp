-- Migration: Add stats table for burrfriends player statistics
-- Run this in Supabase SQL Editor (project: https://supabase.com/dashboard/project/bfjinpptqwoemnavthon)
-- This creates poker.burrfriends_stats table for tracking player statistics

CREATE TABLE IF NOT EXISTS poker.burrfriends_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fid bigint NOT NULL,
  
  -- Game stats
  games_played integer NOT NULL DEFAULT 0,
  games_won integer NOT NULL DEFAULT 0,
  total_winnings numeric NOT NULL DEFAULT 0, -- In BETR
  total_entry_fees numeric NOT NULL DEFAULT 0, -- In BETR
  net_profit numeric NOT NULL DEFAULT 0, -- total_winnings - total_entry_fees
  
  -- Timestamps
  inserted_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(fid)
);

-- Indexes
CREATE INDEX IF NOT EXISTS burrfriends_stats_fid_idx ON poker.burrfriends_stats (fid);
CREATE INDEX IF NOT EXISTS burrfriends_stats_games_won_idx ON poker.burrfriends_stats (games_won DESC);
CREATE INDEX IF NOT EXISTS burrfriends_stats_net_profit_idx ON poker.burrfriends_stats (net_profit DESC);

-- Add update trigger
DROP TRIGGER IF EXISTS set_updated_at_burrfriends_stats ON poker.burrfriends_stats;
CREATE TRIGGER set_updated_at_burrfriends_stats
  BEFORE UPDATE ON poker.burrfriends_stats
  FOR EACH ROW
  EXECUTE FUNCTION poker.set_updated_at();

-- Enable RLS
ALTER TABLE poker.burrfriends_stats ENABLE ROW LEVEL SECURITY;

-- Basic RLS policy (viewable by everyone, writable by service role)
CREATE POLICY "Burrfriends stats are viewable by everyone" ON poker.burrfriends_stats
  FOR SELECT USING (true);

-- Comments
COMMENT ON TABLE poker.burrfriends_stats IS 'Player statistics for burrfriends games';
COMMENT ON COLUMN poker.burrfriends_stats.games_played IS 'Total number of games player participated in (status=settled)';
COMMENT ON COLUMN poker.burrfriends_stats.games_won IS 'Number of games won (position=1 in game_results)';
COMMENT ON COLUMN poker.burrfriends_stats.total_winnings IS 'Total payout amount received across all games (in BETR)';
COMMENT ON COLUMN poker.burrfriends_stats.total_entry_fees IS 'Total entry fees paid across all games (in BETR)';
COMMENT ON COLUMN poker.burrfriends_stats.net_profit IS 'Net profit: total_winnings - total_entry_fees (in BETR)';
