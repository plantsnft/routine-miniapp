# Database Setup Instructions

## Using Existing Supabase Project

We're using your existing **"Catwalk Ai Agent"** Supabase project to avoid needing a paid plan. The basketball app will use the `basketball.*` schema, which is completely isolated from the `public.*` schema used by your catwalk app.

## Step-by-Step Migration

### 1. Open Supabase Dashboard
- Go to https://supabase.com/dashboard
- Select your **"Catwalk Ai Agent"** project

### 2. Open SQL Editor
- Click on **SQL Editor** in the left sidebar
- Click **New query**

### 3. Run the Migration
1. Open the file: `basketball/supabase_migration_basketball_schema.sql`
2. Copy the **entire contents** of the file
3. Paste into the SQL Editor
4. Click **Run** (or press Ctrl+Enter)

### 4. Verify Success
After running, you should see:
- ✅ Success message
- 10 new tables created in the `basketball` schema:
  - `basketball.profiles`
  - `basketball.teams`
  - `basketball.players`
  - `basketball.season_state`
  - `basketball.gameplans`
  - `basketball.offday_actions`
  - `basketball.team_season_stats`
  - `basketball.player_season_stats`
  - `basketball.games`
  - `basketball.game_player_lines`

### 5. Verify Schema Isolation
To confirm everything is isolated:
1. Go to **Table Editor** in Supabase
2. You should see:
   - Your existing `public.*` tables (catwalk app) - **untouched**
   - New `basketball.*` tables - **separate schema**

## Important Notes

✅ **Safe to run**: This migration only creates new tables in the `basketball` schema
✅ **No conflicts**: Won't affect your existing `public.*` tables
✅ **RLS enabled**: All tables have Row Level Security enabled
✅ **Isolated**: All basketball app queries use `Accept-Profile: basketball` header

## Troubleshooting

If you see errors:
- **"schema basketball already exists"** - This is fine, the migration uses `CREATE SCHEMA IF NOT EXISTS`
- **"relation already exists"** - Some tables might already exist, the migration uses `CREATE TABLE IF NOT EXISTS`
- **Permission errors** - Make sure you're using the SQL Editor (has full permissions)

## After Migration

Once the migration is complete:
1. Your catwalk app continues to work normally (uses `public.*` schema)
2. Basketball app will use `basketball.*` schema
3. Both apps share the same Supabase instance but are completely isolated
