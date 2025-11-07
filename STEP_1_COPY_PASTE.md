# ✅ STEP 1: Create Supabase Tables (Copy & Paste)

## 📋 Quick Instructions

1. **Go to:** https://app.supabase.com
2. **Click:** Your project name
3. **Click:** "SQL Editor" (left sidebar)
4. **Click:** "New query" (green button, top right)
5. **Copy & Paste** the SQL below
6. **Click:** "Run" (or press Ctrl+Enter)
7. **Done!** ✅

---

## 📝 COPY THIS ENTIRE SQL BLOCK:

```sql
-- Creator Casts Table: Store all casts from Catwalk channel
CREATE TABLE IF NOT EXISTS public.creator_casts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cast_hash TEXT NOT NULL UNIQUE,
  fid BIGINT NOT NULL,
  text TEXT,
  images TEXT[],
  timestamp TIMESTAMPTZ NOT NULL,
  parent_url TEXT,
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
  cat_names TEXT[],
  location TEXT,
  labels TEXT[],
  location_manual_override BOOLEAN DEFAULT FALSE,
  cat_names_manual_override BOOLEAN DEFAULT FALSE,
  last_synced_at TIMESTAMPTZ DEFAULT now(),
  inserted_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Cat Profiles Table: Store detailed information about individual cats
CREATE TABLE IF NOT EXISTS public.cat_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fid BIGINT NOT NULL,
  cat_name TEXT NOT NULL,
  photos TEXT[],
  ai_writeup TEXT,
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

---

## ✅ Verify It Worked

After running the SQL:

1. **Click:** "Table Editor" (left sidebar)
2. **Look for these 3 tables:**
   - `creator_casts` ✅
   - `creator_metadata` ✅
   - `cat_profiles` ✅

**If you see all 3 tables, you're done with Step 1!** 🎉

---

## 🔗 Direct Links

**Supabase Dashboard:**
```
https://app.supabase.com
```

**After logging in, your project URL will be:**
```
https://app.supabase.com/project/[your-project-id]
```

---

## ❓ Troubleshooting

**"permission denied"** → You need admin access to the project

**"relation already exists"** → Tables already exist, that's fine! ✅

**Can't find SQL Editor** → Look in left sidebar, might be called "Query Editor"

**Tables not showing** → Refresh page (F5) and check again

---

## 📞 Next Step

**Once Step 1 is complete, tell me and I'll give you Step 2!**

