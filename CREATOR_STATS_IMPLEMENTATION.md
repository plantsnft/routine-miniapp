# Creator Stats Implementation Guide

## Overview
This document outlines the implementation of creator statistics tracking for the Catwalk mini-app, including cast counts, cat names, locations, and labels.

## Database Schema

Run the SQL in `supabase_schema.sql` in your Supabase SQL Editor to create the required tables:
- `creator_casts` - Stores all casts from Catwalk channel
- `creator_metadata` - Stores extracted metadata (cat names, location, labels)
- `cat_profiles` - Stores detailed cat information with photos

## Setup Steps

### 1. Create Database Tables
1. Go to Supabase Dashboard → SQL Editor
2. Run the SQL from `supabase_schema.sql`
3. Verify tables are created successfully

### 2. Run Initial Sync
Call the sync endpoint to populate initial data:
```bash
curl https://your-app.vercel.app/api/creator-stats/sync
```

Or manually trigger from browser:
```
https://your-app.vercel.app/api/creator-stats/sync
```

### 3. Set Up Hourly Sync (Vercel Cron)
Add to `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/creator-stats/sync",
    "schedule": "0 * * * *"
  }]
}
```

Or use Vercel Cron Jobs in dashboard:
1. Go to Vercel Dashboard → Your Project → Settings → Cron Jobs
2. Add new cron job:
   - Path: `/api/creator-stats/sync`
   - Schedule: `0 * * * *` (every hour)

### 4. API Endpoints

#### Sync Creator Stats
```
GET /api/creator-stats/sync
```
- Fetches casts from Catwalk channel for all creators
- Extracts cat names, labels, location
- Updates database
- Should run hourly

#### Get Creator Stats
```
GET /api/creator-stats
```
Returns all creators with stats, separated into active/inactive

```
GET /api/creator-stats?fid=123
```
Returns stats for a specific creator

## Data Extraction

### Cat Names
Extracted from cast text using patterns:
- "my cat [name]"
- "[name] the cat"
- Hashtags like #CatName

### Labels/Categories
Detected keywords:
- "off leash" → off leash
- "on leash" → on leash
- "backpack" → backpack
- "stroller" → stroller
- "car ride" → car ride
- "traveling" → traveling
- "adventure" → adventure
- "hiking" → hiking

### Location
- Extracted from Farcaster profile metadata
- Can be manually overridden in database

## Manual Override

To manually update creator data:
1. Go to Supabase Dashboard → Table Editor
2. Edit `creator_metadata` table
3. Set override flags:
   - `location_manual_override = true` for manual location
   - `cat_names_manual_override = true` for curated cat names

## UI Integration

The creator modal in `HomeTab.tsx` will display:
- Cast count
- Cat names (swipeable carousel)
- Location
- Labels/categories
- Active/Inactive status

Clicking on a cat name opens a popup with:
- Cat photos (up to 10)
- AI-generated writeup
- Cat name

## Next Steps

1. ✅ Database schema created
2. ✅ API endpoints created
3. ⏳ Update UI components (HomeTab creator modal)
4. ⏳ Create cat details popup component
5. ⏳ Set up Vercel cron job
6. ⏳ Test initial sync
7. ⏳ Manual review and corrections

