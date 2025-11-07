-- Add likes_count column to creator_casts table
ALTER TABLE public.creator_casts 
ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0;

-- Add index for likes_count if needed
CREATE INDEX IF NOT EXISTS idx_creator_casts_likes_count ON public.creator_casts(likes_count DESC);

