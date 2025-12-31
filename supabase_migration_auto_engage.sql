-- Migration: Add user auto-engage preferences table
-- This table stores user preferences for automatic like/recast and their signer UUIDs

CREATE TABLE IF NOT EXISTS public.user_engage_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fid BIGINT NOT NULL UNIQUE,
  signer_uuid TEXT, -- Neynar signer UUID for performing actions
  auto_engage_enabled BOOLEAN NOT NULL DEFAULT false,
  auto_engage_enabled_at TIMESTAMPTZ,
  bonus_multiplier NUMERIC NOT NULL DEFAULT 1.0, -- 1.1 for auto-engage users (10% bonus)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_user_engage_prefs_fid ON public.user_engage_preferences(fid);
CREATE INDEX IF NOT EXISTS idx_user_engage_prefs_auto ON public.user_engage_preferences(auto_engage_enabled) WHERE auto_engage_enabled = true;

-- Table to track auto-engagement jobs
CREATE TABLE IF NOT EXISTS public.auto_engage_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cast_hash TEXT NOT NULL,
  fid BIGINT NOT NULL, -- User FID to engage as
  action_type TEXT NOT NULL CHECK (action_type IN ('like', 'recast')),
  scheduled_for TIMESTAMPTZ NOT NULL, -- When to execute (5 min after cast creation)
  executed_at TIMESTAMPTZ,
  success BOOLEAN,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(cast_hash, fid, action_type)
);

-- Index for finding pending jobs
CREATE INDEX IF NOT EXISTS idx_auto_engage_pending ON public.auto_engage_queue(scheduled_for) 
  WHERE executed_at IS NULL;
