-- Portal Claims Migration
-- Creates tables for tracking creator and engagement reward claims

-- Creator Claims Table: Track creator reward claims (500k CATWALK per creator)
CREATE TABLE IF NOT EXISTS public.creator_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fid BIGINT NOT NULL,
  cast_hash TEXT NOT NULL, -- The cast hash used for verification
  reward_amount NUMERIC NOT NULL DEFAULT 500000, -- 500k CATWALK tokens
  transaction_hash TEXT, -- Blockchain transaction hash (if applicable)
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at TIMESTAMPTZ DEFAULT now(),
  inserted_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(fid) -- One claim per creator
);

CREATE INDEX IF NOT EXISTS idx_creator_claims_fid ON public.creator_claims(fid);
CREATE INDEX IF NOT EXISTS idx_creator_claims_cast_hash ON public.creator_claims(cast_hash);
CREATE INDEX IF NOT EXISTS idx_creator_claims_verified_at ON public.creator_claims(verified_at DESC);

-- Engagement Claims Table: Track engagement reward claims (likes/comments/recasts)
CREATE TABLE IF NOT EXISTS public.engagement_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fid BIGINT NOT NULL, -- User who engaged
  cast_hash TEXT NOT NULL, -- Cast they engaged with
  engagement_type TEXT NOT NULL CHECK (engagement_type IN ('like', 'comment', 'recast')),
  reward_amount NUMERIC NOT NULL, -- Token reward amount
  transaction_hash TEXT, -- Blockchain transaction hash (if applicable)
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at TIMESTAMPTZ DEFAULT now(),
  inserted_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(fid, cast_hash, engagement_type) -- One claim per user per cast per engagement type
);

CREATE INDEX IF NOT EXISTS idx_engagement_claims_fid ON public.engagement_claims(fid);
CREATE INDEX IF NOT EXISTS idx_engagement_claims_cast_hash ON public.engagement_claims(cast_hash);
CREATE INDEX IF NOT EXISTS idx_engagement_claims_engagement_type ON public.engagement_claims(engagement_type);
CREATE INDEX IF NOT EXISTS idx_engagement_claims_verified_at ON public.engagement_claims(verified_at DESC);

-- Function to update updated_at timestamp (if not already exists)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS set_creator_claims_updated_at ON public.creator_claims;
CREATE TRIGGER set_creator_claims_updated_at
BEFORE UPDATE ON public.creator_claims
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_engagement_claims_updated_at ON public.engagement_claims;
CREATE TRIGGER set_engagement_claims_updated_at
BEFORE UPDATE ON public.engagement_claims
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- RLS Policies (optional - adjust based on your security needs)
-- Allow public read access for checking claim status
ALTER TABLE public.creator_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_claims ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public read access
CREATE POLICY "Allow public read access on creator_claims"
  ON public.creator_claims FOR SELECT
  USING (true);

CREATE POLICY "Allow public read access on engagement_claims"
  ON public.engagement_claims FOR SELECT
  USING (true);

-- Note: Insert/Update should be restricted to authenticated service role only
-- This will be handled via Supabase service role key in API routes
