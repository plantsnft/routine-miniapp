# How to Add Composite Indexes to Database

## Step-by-Step Instructions

### 1. Open Supabase Dashboard
- Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
- Sign in to your account
- Select your **"Catwalk Ai Agent"** project (the shared Supabase instance)

### 2. Open SQL Editor
- In the left sidebar, click **"SQL Editor"**
- Click **"New query"** button (top right)

### 3. Copy and Paste the SQL
- Open the file `ADD_COMPOSITE_INDEXES.sql` in this directory
- Copy the entire contents (all 3 CREATE INDEX statements)
- Paste into the SQL Editor

### 4. Run the Migration
- Click **"Run"** button (or press `Ctrl+Enter` / `Cmd+Enter`)
- Wait for execution to complete
- You should see: "Success. No rows returned" (this is normal - indexes don't return rows)

### 5. Verify Indexes Were Created
- In Supabase Dashboard, go to **"Table Editor"**
- Select any table (e.g., `basketball.games`)
- Click the **"Indexes"** tab
- You should see the new composite indexes listed:
  - `games_season_day_status_idx`
  - `player_season_stats_season_team_idx`
  - `gameplans_season_day_team_idx`

## Alternative: Verify via SQL

You can also verify by running this query in SQL Editor:

```sql
SELECT 
  schemaname,
  tablename,
  indexname
FROM pg_indexes
WHERE schemaname = 'basketball'
  AND indexname IN (
    'games_season_day_status_idx',
    'player_season_stats_season_team_idx',
    'gameplans_season_day_team_idx'
  )
ORDER BY tablename, indexname;
```

You should see 3 rows returned, one for each index.

## What These Indexes Do

- **`games_season_day_status_idx`**: Speeds up queries that filter games by season, day, and status (used in `/api/games`)
- **`player_season_stats_season_team_idx`**: Speeds up queries that filter player stats by season and team (used in `/api/roster`)
- **`gameplans_season_day_team_idx`**: Speeds up queries that filter gameplans by season, day, and team (used in gameplan lookups)

## Notes

- ✅ **Safe to run multiple times**: Uses `IF NOT EXISTS`, so it won't error if indexes already exist
- ✅ **No downtime**: Index creation doesn't lock tables or affect running queries
- ✅ **Automatic**: Once created, PostgreSQL automatically uses these indexes for relevant queries
- ⚠️ **Takes a few seconds**: Index creation may take 5-10 seconds depending on table size

## Troubleshooting

**Error: "relation basketball.games does not exist"**
- Make sure you're using the correct Supabase project (Catwalk Ai Agent)
- Verify the `basketball` schema exists (run: `SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'basketball';`)

**Error: "permission denied"**
- Make sure you're logged in as the project owner or have admin privileges
- If using service role key, ensure it has proper permissions

**Indexes not showing up**
- Refresh the Table Editor page
- Check that you're looking at the correct schema (`basketball`, not `public`)

---

**That's it!** Once these indexes are created, your database queries will be significantly faster. 🚀
