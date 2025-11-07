-- Add recasts_count and replies_count columns to creator_casts table
ALTER TABLE public.creator_casts 
ADD COLUMN IF NOT EXISTS recasts_count INTEGER DEFAULT 0;

ALTER TABLE public.creator_casts 
ADD COLUMN IF NOT EXISTS replies_count INTEGER DEFAULT 0;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_creator_casts_recasts_count ON public.creator_casts(recasts_count DESC);
CREATE INDEX IF NOT EXISTS idx_creator_casts_replies_count ON public.creator_casts(replies_count DESC);

