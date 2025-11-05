-- Create price_history table for tracking token prices over time
-- This enables us to calculate 24h change even if external APIs don't provide it

CREATE TABLE IF NOT EXISTS public.price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_address TEXT NOT NULL,
  price NUMERIC NOT NULL,
  price_usd NUMERIC NOT NULL,
  market_cap NUMERIC,
  volume_24h NUMERIC,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  inserted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on token_address for faster lookups
CREATE INDEX IF NOT EXISTS idx_price_history_token_address ON public.price_history(token_address);

-- Create index on timestamp for faster time-based queries
CREATE INDEX IF NOT EXISTS idx_price_history_timestamp ON public.price_history(timestamp DESC);

-- Create composite index for common query pattern (token_address + timestamp)
CREATE INDEX IF NOT EXISTS idx_price_history_token_timestamp ON public.price_history(token_address, timestamp DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;

-- Create policy to allow reads (for API queries)
CREATE POLICY "Allow public read access" ON public.price_history
  FOR SELECT
  USING (true);

-- Create policy to allow inserts (for storing price snapshots)
CREATE POLICY "Allow public insert access" ON public.price_history
  FOR INSERT
  WITH CHECK (true);

-- Optional: Create a function to automatically clean up old records (older than 7 days)
-- This can be called periodically via a cron job or edge function
CREATE OR REPLACE FUNCTION cleanup_old_price_history()
RETURNS void AS $$
BEGIN
  DELETE FROM public.price_history
  WHERE timestamp < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

