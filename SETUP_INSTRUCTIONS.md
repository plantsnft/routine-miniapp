# Step 1: Create Supabase Tables - Copy & Paste Guide

## What You Need
- Your Supabase project URL and access
- About 2 minutes

## Step-by-Step Instructions

### Step 1.1: Open Supabase SQL Editor

1. **Go to your Supabase Dashboard:**
   ```
   https://app.supabase.com
   ```

2. **Select your project** (or create one if you don't have one)

3. **Click on "SQL Editor" in the left sidebar**
   - It's usually near the bottom of the menu
   - Icon looks like a database or SQL query

4. **Click "New query" button** (top right, green button)

### Step 1.2: Copy & Paste the SQL

**Copy this ENTIRE block of SQL** (select all, Ctrl+C / Cmd+C):

```sql
-- Creator Casts Table: Store all casts from Catwalk channel
CREATE TABLE IF NOT EXISTS public.creator_casts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cast_hash TEXT NOT NULL UNIQUE,
  fid BIGINT NOT NULL,
  text TEXT,
  images TEXT[], -- Array of image URLs
  timestamp TIMESTAMPTZ NOT NULL,
  parent_url TEXT, -- Channel URL to verify it's from Catwalk channel
  author_username TEXT,
  author_display_name TEXT,
  inserted_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creator_casts_fid ON public.creator_casts(fid);
CREATE INDEX IF NOT EXISTS idx_creator_casts_timestamp ON public.creator_casts(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_creator_casts_cast_hash ON public.creator_casts(cast_hash);

-- Creator Metadata Table: Store extracted information about creators
CREATE TABLE IF NOT EXISTS public.creator_metadata (
  fid BIGINT PRIMARY KEY,
  cast_count INTEGER DEFAULT 0,
  last_cast_date TIMESTAMPTZ,
  cat_names TEXT[], -- Array of cat names extracted
  location TEXT, -- City/country from profile or casts
  labels TEXT[], -- Array of labels like "off leash", "on leash", "backpack", etc.
  location_manual_override BOOLEAN DEFAULT FALSE, -- Flag if location was manually set
  cat_names_manual_override BOOLEAN DEFAULT FALSE, -- Flag if cat names were manually curated
  last_synced_at TIMESTAMPTZ DEFAULT now(),
  inserted_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Cat Profiles Table: Store detailed information about individual cats
CREATE TABLE IF NOT EXISTS public.cat_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fid BIGINT NOT NULL, -- Creator FID
  cat_name TEXT NOT NULL,
  photos TEXT[], -- Array of up to 10 photo URLs
  ai_writeup TEXT, -- AI-generated description (can be manually overridden)
  photos_manual_override BOOLEAN DEFAULT FALSE,
  writeup_manual_override BOOLEAN DEFAULT FALSE,
  inserted_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(fid, cat_name)
);

CREATE INDEX IF NOT EXISTS idx_cat_profiles_fid ON public.cat_profiles(fid);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS set_creator_casts_updated_at ON public.creator_casts;
CREATE TRIGGER set_creator_casts_updated_at
BEFORE UPDATE ON public.creator_casts
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_creator_metadata_updated_at ON public.creator_metadata;
CREATE TRIGGER set_creator_metadata_updated_at
BEFORE UPDATE ON public.creator_metadata
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_cat_profiles_updated_at ON public.cat_profiles;
CREATE TRIGGER set_cat_profiles_updated_at
BEFORE UPDATE ON public.cat_profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
```

### Step 1.3: Run the SQL

1. **Paste the SQL** into the SQL Editor text area (the big empty box)

2. **Click the "Run" button** (bottom right, or press Ctrl+Enter / Cmd+Enter)

3. **Wait for success message** - You should see:
   - ✅ Green checkmark
   - Message like "Success. No rows returned" or "Success"

### Step 1.4: Verify Tables Were Created

1. **Click "Table Editor" in the left sidebar**

2. **You should see 3 new tables:**
   - `creator_casts`
   - `creator_metadata`
   - `cat_profiles`

3. **If you see them, you're done! ✅**

## Troubleshooting

**Problem: "permission denied" error**
- Solution: Make sure you're the project owner or have admin access

**Problem: "relation already exists" error**
- Solution: This is fine! It means tables already exist. You can skip this step.

**Problem: Can't find SQL Editor**
- Solution: Look for "SQL Editor" or "Query Editor" in the left sidebar menu

**Problem: Tables not showing up**
- Solution: Refresh the page (F5) and check again in Table Editor

## What's Next?

Once tables are created, we'll:
1. Test the sync endpoint
2. Set up hourly automatic sync
3. Build the UI components

**Tell me when Step 1 is complete and I'll give you Step 2! 🚀**

