-- Add overtime_count field to basketball.games table
-- This tracks how many overtime periods were played (0 = no overtime, 1 = OT, 2 = 2OT, etc.)

ALTER TABLE basketball.games 
ADD COLUMN IF NOT EXISTS overtime_count integer NOT NULL DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN basketball.games.overtime_count IS 'Number of overtime periods played (0 = no overtime, 1 = OT, 2 = 2OT, etc.)';
