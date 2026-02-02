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

### 6. Expose basketball Schema to PostgREST (REQUIRED)

**CRITICAL**: After creating the schema, you must expose it to PostgREST so the API can access it.

1. **Add to Exposed Schemas**:
   - Go to Supabase Dashboard → Your Project → **Settings** → **API**
   - Find **"Exposed schemas"** (under "Data API Settings")
   - Add `basketball` to the comma-separated list
   - Example: `public, graphql_public, poker, basketball` (if `poker` is already there)
   - Click **Save**

2. **Grant Permissions**:
   - Open SQL Editor → New query
   - Open the file: `basketball/supabase_migration_basketball_schema_permissions.sql`
   - Copy the **entire contents** of the file
   - Paste into the SQL Editor
   - Click **Run** (or press Ctrl+Enter)
   - ✅ You should see success messages

3. **Synchronize Authenticator Role** (if needed):
   - If you still get `PGRST106` errors after steps 1-2, run this in SQL Editor:
   ```sql
   -- Reset to use dashboard configuration
   ALTER ROLE authenticator RESET pgrst.db_schemas;
   
   -- Reload PostgREST schema cache
   SELECT pg_notify('pgrst', 'reload schema');
   ```
   - Wait 2-3 minutes for changes to propagate

4. **Verify It Works**:
   - Test with a direct API call (replace `YOUR_SERVICE_ROLE_KEY`):
   ```bash
   curl -X GET \
     "https://your-project.supabase.co/rest/v1/profiles?select=*&limit=1" \
     -H "apikey: YOUR_SERVICE_ROLE_KEY" \
     -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
     -H "Accept-Profile: basketball" \
     -H "Content-Profile: basketball"
   ```
   - Expected: `200 OK` with JSON array (empty `[]` if no profiles yet)
   - If you get `406 Not Acceptable` with PGRST106 error, wait a few more minutes and retry

## After Migration

Once the migration is complete:
1. Your catwalk app continues to work normally (uses `public.*` schema)
2. Basketball app will use `basketball.*` schema
3. Both apps share the same Supabase instance but are completely isolated
4. **PostgREST can access basketball schema** via `Accept-Profile: basketball` headers
