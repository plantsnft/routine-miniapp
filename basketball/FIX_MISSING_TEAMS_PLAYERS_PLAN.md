# Fix Plan: Missing Teams and Players

## Current State (Final)
- ✅ **Season state**: `season_number = 1, day_number = 1, phase = REGULAR, day_type = OFFDAY` (Phase 2 complete)
- ✅ **4 profiles exist** (Phase 1 complete):
  - catwalk (FID 871872, is_admin = true)
  - farville (FID 967647, is_admin = true)
  - plantsnft (FID 318447, is_admin = true)
  - email (cpjets07@yahoo.com, is_admin = true)
- ✅ **4 teams exist** (Phase 2 complete):
  - Houston → catwalk (FID 871872)
  - Atlanta → farville (FID 967647)
  - Vegas → plantsnft (FID 318447)
  - NYC → email (cpjets07@yahoo.com)
- ✅ **20 players exist** (Phase 2 complete): 5 players per team

## Root Cause
Initialization was partially completed:
- Season state was created
- But teams and players were not created
- Only 1 profile exists (plantsnft signed in, creating profile automatically)
- Initialize endpoint requires 4 profiles to create 4 teams

## Solution Plan

### Phase 1: Create Missing Profiles ✅
**Goal**: Ensure all 4 profiles exist before running initialization

**Action**: Run SQL migration to create missing profiles
- File: `supabase_migration_create_initial_profiles.sql`
- Creates: catwalk (FID 871872), farville (FID 967647), plantsnft (FID 318447), email (cpjets07@yahoo.com)
- Uses `ON CONFLICT DO NOTHING` to skip existing profiles

**Verification**:
```sql
SELECT id, farcaster_fid, email, is_admin FROM basketball.profiles;
-- Should return 4 profiles
```

### Phase 2: Run League Initialization ✅ **COMPLETE**
**Goal**: Create all teams, players, and complete season setup

**Status**: ✅ Completed successfully

**What was done**:
1. ✅ Used existing profiles (all 4 found)
2. ✅ Created 4 teams: Houston → catwalk, Atlanta → farville, Vegas → plantsnft, NYC → email
3. ✅ Created 20 players (5 per team: 1 Elite, 1 Great, 3 Good)
4. ✅ Updated season_state to `season_number = 1, day_number = 1, phase = REGULAR, day_type = OFFDAY`
5. ✅ Created initial stats records (team_season_stats and player_season_stats)

**Verification Results**:
- ✅ 4 teams created with correct owners
- ✅ 20 players created (5 per team)
- ✅ Season state correctly set
- ✅ All team assignments match SoT requirements

**Verification**:
```sql
-- Should show 4 teams
SELECT id, name, owner_profile_id FROM basketball.teams ORDER BY name;

-- Should show 20 players (5 per team)
SELECT t.name, COUNT(p.id) AS player_count
FROM basketball.teams t
LEFT JOIN basketball.players p ON p.team_id = t.id
GROUP BY t.id, t.name
ORDER BY t.name;

-- Should show season_number = 1
SELECT * FROM basketball.season_state;
```

### Phase 3: Verify End-to-End ✅
**Goal**: Confirm everything works

**Actions**:
1. Sign in as plantsnft
2. Should see Vegas team on dashboard
3. Should see 5 players on roster
4. Should see "Admin Controls" section
5. Should be able to submit offday actions and gameplans

## Execution Order

1. **Phase 1**: Run `supabase_migration_create_initial_profiles.sql` in Supabase SQL Editor
2. **Phase 2**: Go to dashboard, click "Initialize League"
3. **Phase 3**: Test sign-in and verify teams/players exist

## Expected Outcome

After completion:
- ✅ 4 profiles exist (catwalk, farville, plantsnft, email)
- ✅ 4 teams exist (Houston, Atlanta, Vegas, NYC)
- ✅ 20 players exist (5 per team)
- ✅ Season state: `season_number = 1, day_number = 1`
- ✅ plantsnft can see Vegas team and admin controls
- ✅ All teams have players and can participate in games

## Known FIDs

- `catwalk`: 871872
- `farville`: 967647
- `plantsnft`: 318447
- Email: `cpjets07@yahoo.com`
