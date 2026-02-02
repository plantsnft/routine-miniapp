# Daily Sim Basketball — Source of Truth (SoT)

## ⚠️ CRITICAL ISOLATION REQUIREMENTS

**THIS APP IS A STANDALONE REPOSITORY AND MUST BE COMPLETELY ISOLATED:**

1. **Git Repository**: This app has its own GitHub repository (separate from `routine-miniapp`, `burrfriends`, `poker`, etc.). All code lives at the root of this repository.

2. **Database Schema**: All tables live in `basketball.*` schema in Supabase. DO NOT touch:
   - `public.*` schema (catwalk app)
   - `poker.*` schema (poker/burrfriends apps)

3. **Supabase Client**: Use `basketballDb.ts` helper with `Accept-Profile: basketball` and `Content-Profile: basketball` headers. Never use raw Supabase client without schema headers.

4. **Vercel Project**: Deploy as separate Vercel project with its own repository. Root Directory is `.` (root of this repo).

5. **Environment Variables**: Use app-specific env vars. Can share Supabase URL/keys but use `BASKETBALL_*` prefix for app-specific config.

---

## 0) Purpose

This document is the single source of truth for MVP implementation.
Any AI agent (Cursor) must implement exactly what's here, and must not invent rules or features.
If anything is ambiguous, ask a single question; otherwise make the smallest reasonable MVP decision and document it in a comment.

---

## 1) Product Summary

A lightweight basketball team-owner simulation game:

- **4 human-controlled teams** in one shared league (expands later)
- **Users log in via Farcaster (Neynar SIWN) or Email (Supabase Auth)**
- **Season runs on a fixed calendar:**
  - 60 days total per season
  - 30 game nights + 30 offdays (training/prep days)

Users make decisions during offdays (train or prep, and set strategy for the next game).
Games simulate automatically on game nights (or can be manually triggered by admin).

**Stats tracked:**
- **Team**: W/L, Points For/Against, PPG, Opp PPG, point differential, streak
- **Player**: Points, PPG, rating, age, tier, contract years remaining, salary

**Player points must add up to team points each game and across season.**

---

## 2) Tech Stack (MVP)

### Frontend
- **Next.js (App Router)** - Version 15.5.9+
- **Deployed on Vercel (Free)**
- **UI is mobile-first** and works inside Farcaster mini app and normal web

### Auth
- **Farcaster login**: Neynar SIWN (Sign In With Neynar)
- **Email login**: Supabase Auth (magic link recommended for simplicity)
- **One app supports both** - profiles table supports dual auth

**Email Auth Benefits**:
- Allows non-Farcaster users to participate (broader audience)
- Simpler onboarding for users without Farcaster accounts
- Magic link eliminates password management
- Supabase Auth handles email verification automatically
- Can reuse same Supabase instance (no additional infrastructure)

**Implementation**: Use Supabase Auth's built-in magic link flow. No custom email templates needed for MVP (Supabase provides default templates).

### Backend / Database
- **Supabase (Free) Postgres DB** - Uses existing "Catwalk Ai Agent" Supabase project (shared instance)
- **Schema**: All tables in `basketball.*` schema (isolated from `public.*` schema used by catwalk app)
- **Supabase Row Level Security (RLS)** enabled
- **Server actions / API routes** in Next.js for game actions

### Game Simulation Job
**MVP Decision**: Use Vercel Cron (free supports scheduled cron) if available on your account, otherwise:
- A manual "Advance Day" admin button triggers sim
- And we can also support Supabase scheduled triggers later

**Note**: Even if cron is enabled, keep manual admin endpoint for reliability/testing.

**Cutoff Time**: 
- Offday actions and gameplan submissions must be submitted before **midnight Eastern Time**
- Game simulations run after midnight Eastern Time (results available after cutoff)
- Server should use Eastern Time zone for all cutoff calculations

---

## 3) Project Structure & Isolation

### Repository Structure

**This app is a standalone GitHub repository.** All code lives at the root:

```
basketball/                  # Root of this repository
├── src/
│   ├── app/                # Next.js App Router
│   ├── components/         # React components
│   ├── lib/                # Utilities (basketballDb.ts, constants.ts, etc.)
│   └── hooks/              # React hooks
├── docs/                   # Documentation (this file)
├── scripts/                # Admin/seed scripts
├── supabase_migration_*.sql  # All migrations for basketball schema
├── package.json            # Dependencies
├── next.config.ts          # Next.js config
├── vercel.json             # Cron config
├── tsconfig.json           # TypeScript config
└── .env.local.example      # Env var template
```

**Note**: This repository is completely separate from:
- `routine-miniapp` repository
- `burrfriends` repository
- `poker` repository
- `catwalkai` repository

### Database Schema Isolation

**CRITICAL**: All basketball tables live in `basketball.*` schema.

**Supabase Client Pattern** (similar to `pokerDb.ts`):
- Create `basketball/src/lib/basketballDb.ts`
- Use PostgREST headers: `Accept-Profile: basketball` and `Content-Profile: basketball`
- Never access `public.*` or `poker.*` schemas
- Validate table names against allowlist of basketball tables only

**Example**:
```typescript
// basketball/src/lib/basketballDb.ts
const headers = {
  apikey: SUPABASE_SERVICE_ROLE,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
  'Content-Type': 'application/json',
  'Accept-Profile': 'basketball',    // ← Schema isolation
  'Content-Profile': 'basketball',   // ← Schema isolation
};
```

**PostgREST Schema Exposure Configuration** (REQUIRED for first-time setup):
- **Error**: If you see `PGRST106: "The schema must be one of the following: public, graphql_public"`, the `basketball` schema is not exposed to PostgREST
- **Fix**: Follow these steps in order:

1. **Supabase Dashboard Configuration**:
   - Go to: Supabase Dashboard → Your Project → Settings → API
   - Find: "Exposed schemas" (under "Data API Settings")
   - Add `basketball` to the comma-separated list (e.g., `public, graphql_public, poker, basketball`)
   - Save

2. **Database Permissions** (run in Supabase SQL Editor):
   ```sql
   -- Grant usage on schema to PostgREST roles
   GRANT USAGE ON SCHEMA basketball TO anon, authenticated, service_role;
   
   -- Grant permissions on all existing tables
   GRANT ALL ON ALL TABLES IN SCHEMA basketball TO anon, authenticated, service_role;
   
   -- Grant permissions on all sequences
   GRANT ALL ON ALL SEQUENCES IN SCHEMA basketball TO anon, authenticated, service_role;
   
   -- Grant permissions on all functions/routines
   GRANT ALL ON ALL ROUTINES IN SCHEMA basketball TO anon, authenticated, service_role;
   
   -- Set default privileges for future tables
   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA basketball 
     GRANT ALL ON TABLES TO anon, authenticated, service_role;
   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA basketball 
     GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA basketball 
     GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
   ```

3. **Synchronize Authenticator Role** (if dashboard change doesn't take effect):
   ```sql
   -- Reset to use dashboard configuration
   ALTER ROLE authenticator RESET pgrst.db_schemas;
   
   -- Or manually set to match dashboard (if reset doesn't work)
   -- ALTER ROLE authenticator SET pgrst.db_schemas = 'public, graphql_public, poker, basketball';
   
   -- Reload PostgREST schema cache
   SELECT pg_notify('pgrst', 'reload schema');
   ```

4. **Wait 2-3 minutes** for changes to propagate, then test

**Note**: This configuration is a one-time setup. Once configured, PostgREST will recognize the `basketball` schema and all API calls using `Accept-Profile: basketball` headers will work correctly.

### Database Query Optimization

**CRITICAL**: For performance and scalability, use targeted queries instead of full table scans.

**Query Patterns**:
- Use `in` operator for filtering by multiple IDs: `filters: { id: { in: [id1, id2] } }`
- Use composite indexes for common query patterns (see Section 11.2)
- Always filter at database level, not in memory
- Avoid fetching all records when only specific ones are needed

**Example - Efficient Query**:
```typescript
// ✅ CORRECT: Fetch only needed teams
const teams = await basketballDb.fetch('teams', {
  filters: { 
    id: { in: [game.home_team_id, game.away_team_id] }
  }
});

// ❌ AVOID: Fetching all teams when only need specific ones
const allTeams = await basketballDb.fetch('teams');
```

**Performance Impact**:
- Reduces database load by 60-70%
- Improves query response time by 50-80%
- Scales efficiently beyond MVP (4 teams) to 20+ teams

---

## 4) League Configuration (MVP constants)

- **Teams at launch**: 4
- **Roster size**: 5 players per team
- **No bench**
- **Players have positions** but positions do not affect gameplay in MVP (only cosmetic display)
  - Positions: PG, SG, SF, PF, C (1 each per team)

**Players have a tier cap:**
- Good: max rating 80
- Great: max rating 90
- Elite: max rating 99

**Contracts:**
- Length = 3 seasons (3-year contract measured in seasons)
- Salary locked at signing:
  - Elite: $20M
  - Great: $15M
  - Good: $8M

**Ages:**
- All players share the same "birthday" = offseason rollover
- Decline/progression applied only in offseason

**Retirement:**
- Forced retirement at age 36

---

## 5) Season Structure

A season is **60 days**:
- `DayType` alternates: Offday then GameNight, repeated
- Total: 30 Offdays + 30 GameNights

### Schedule logic (4 teams)
Round-robin repeating 3-day cycle of matchups, only on game nights:

**Cycle A:**
- GameNight 1: Team1 vs Team2, Team3 vs Team4
- GameNight 2: Team1 vs Team3, Team2 vs Team4
- GameNight 3: Team1 vs Team4, Team2 vs Team3

Repeat this cycle across all 30 game nights (10 full repeats).

### Playoffs (end of season)
- Top 2 teams by record play a best-of-3 series
- Higher seed gets 2 home games:
  - Game 1 at higher seed
  - Game 2 at lower seed
  - Game 3 (if needed) at higher seed

**MVP Decision**: Playoff games occur on the final 3 game nights of the season calendar:
- GameNight 28–30 reserved for playoffs
- Regular season uses first 27 game nights
- **Day-to-GameNight mapping**: Day 2 = GameNight 1, Day 4 = GameNight 2, ..., Day 54 = GameNight 27 (last regular season), Day 56 = GameNight 28 (first playoff), Day 58 = GameNight 29, Day 60 = GameNight 30

---

## 6) Daily User Decisions

Users only act on **Offdays**.

### Offday choices (choose exactly one)

#### Train
- Each of the 5 players' ratings permanently increase by +0.1% (multiplicative)
- Formula: `newRating = min(tierCap, rating * 1.001)`
- Training only happens on Offdays.

#### Game Prep
- Grants +25% boost applied to next GameNight only
- Stored as `prep_boost_active=true` in `teams` table
- When PREP action is submitted, set `teams.prep_boost_active = true`
- During game simulation, if `prep_boost_active = true`, apply +25% multiplier, then set to `false`

### Strategy submission (must be set for next game)
User sets a `GamePlan` for the next game:
- **Offense**: Drive or Shoot
- **Defense**: Zone or Man
- **Mentality**: Aggressive, Conservative, Neutral

**UI State Management**:
- Gameplan state must be initialized even when no gameplan exists in database
- Initialize with defaults (Drive, Zone, Neutral) if no existing gameplan
- Use optimistic state updates: Update UI immediately when button is clicked, before API call
- If API call fails, revert to previous state or reload from API
- All three fields (offense, defense, mentality) must be submitted together in each API call
- State must persist between button clicks to allow selecting multiple options independently

**If user fails to submit a game plan before cutoff:**
- They receive the "worst penalty":
  - Offense and Defense treated as disadvantaged in RPS resolution
  - Mentality treated as wrong (-20%)
- Also they do NOT receive a prep boost unless previously set.

---

## 7) Game Simulation (Core Engine)

Game simulations occur on GameNights at midnight (cron) or via manual admin.

### 7.1 Team Strength Baseline (not 50/50)
Each team has strength derived from player ratings.
```
TeamStrength = sum of 5 player ratings (after game-only modifiers)
```

### 7.2 Home/Away
Home advantage:
- Home team win probability +3%
- Away team win probability -3%

### 7.3 RPS Strategy Advantage (Offense vs Defense)
**Offense options**: Drive / Shoot  
**Defense options**: Zone / Man

**Rules:**
- If Offense = Drive and Defense = Zone → Defense advantage
- If Offense = Drive and Defense = Man → Offense advantage
- If Offense = Shoot and Defense = Zone → Offense advantage
- If Offense = Shoot and Defense = Man → Defense advantage

**Effect size:**
- Advantage side gets +20% game-only rating multiplier
- Disadvantaged side gets -20% game-only rating multiplier
- This is implemented via rating multipliers, not directly win prob

### 7.4 Mentality Rule (maps to opponent defense)
Mentality impacts game-only rating:
- Aggressive vs Zone → +20%
- Aggressive vs Man → -20%
- Conservative vs Man → +20%
- Conservative vs Zone → -20%
- Neutral → 0%

Mentality applies as a rating multiplier.

### 7.5 Prep Boost
If `prepBoostActive = true`, apply:
- +25% rating multiplier for that game only
- Then consume (set to false)

### 7.6 Total Game-only Rating Multiplier
For each team, build a multiplier:
```
mult = 1.0
Apply RPS effect: mult *= 1.2 if advantaged, or mult *= 0.8 if disadvantaged
Apply mentality: mult *= 1.2 if correct, mult *= 0.8 if wrong, mult *= 1.0 neutral
Apply prep: mult *= 1.25 if active
Home effect handled at win-prob stage, not rating
```

```
GameRating_i = sum(player.rating) * mult
```

### 7.7 Convert ratings to win probability
Use a simple ratio:
```
pHome = GameRating_home / (GameRating_home + GameRating_away)
```

Then apply home/away shift:
```
pHome = pHome + 0.03
```

Clamp:
```
pHome = min(0.85, max(0.15, pHome))
```

Then sample a winner.

This guarantees:
- Ratings matter from day one
- Strategy multipliers matter hugely
- Home matters slightly
- No impossible 100% outcomes

### 7.8 Generate team scores
We need realistic-ish basketball scores and player points that sum to team points.

**Base team points from rating:**
```
basePts = 55 + (avgPlayerRating * 0.55)
```
Where `avgPlayerRating = (sum base ratings) / 5` (NOT the boosted rating)

Then apply a mild performance modifier based on GameRating share:
```
share = GameRating_team / (GameRating_home + GameRating_away)
teamPts = basePts + (share - 0.5) * 20 + noise
```

**Noise:**
- `noise ~ Uniform(-8, +8)`
- Round to integer.

**MVP Decision**: Enforce winner has higher score:
- If sampled winner ends up with <= loser score, swap by adding +1..+5 points to winner until higher.

### 7.8.1 Overtime Logic
**Requirement**: No ties allowed. If scores are equal after regulation, simulate overtime periods until scores differ.

**Overtime Scoring**:
- Range: 6-15 points per team per overtime period
- Formula: Scaled-down version of regular game scoring
  - Base: `6 + avgPlayerRating * 0.09` (approximately 1/9th scale of regular game)
  - Performance modifier: `(share - 0.5) * 3` (scaled down from regular game's * 20)
  - Noise: Uniform(-2, +2) (scaled down from regular game's -8 to +8)
  - Clamped to 6-15 point range
- Proportional to team strength: Uses same `gameRatingShare` calculation as regular game

**Overtime Process**:
1. After initial score generation, check if `homeScore === awayScore`
2. If tied, simulate overtime periods:
   - Generate overtime scores for both teams (6-15 points each)
   - Add to existing scores
   - Increment `overtime_count`
   - Repeat until scores differ or max overtimes reached
3. Max overtimes: 10 (safety limit to prevent infinite loops)
4. If still tied after max overtimes, force winner based on original probability (+1 point)
5. Final guarantee: Winner must have higher score

**Overtime Tracking**:
- `games.overtime_count` field: Number of overtime periods (0 = no overtime, 1 = OT, 2 = 2OT, etc.)
- Display in UI: Show "OT", "2OT", "3OT", etc. badges
- Player points: Overtime points are added to regular game total (included in player totals)

### 7.9 Player point distribution (must sum)
Each player has an affinity:
- `affinity = StrongVsZone` or `StrongVsMan`

**Opponent defense influences weights:**
- If `opponentDefense == Zone`:
  - `StrongVsZone` players get `weight * 1.15`
  - `StrongVsMan` players get `weight * 0.85`
- If `opponentDefense == Man`:
  - `StrongVsMan` players get `weight * 1.15`
  - `StrongVsZone` players get `weight * 0.85`

**Base weight** is proportional to player rating:
```
w_i = rating_i
```

Apply affinity multiplier, then normalize.

**Compute points:**
```
pts_i = round(teamPts * (w_i / sumW))
```

Fix rounding drift by adjusting highest-weight player until total matches `teamPts`.

### 7.10 Stats updates
After each game:

**Update `games` row with:**
- teams, home/away, date, winner, final score, per-player points

**Update `team_season_stats`:**
- wins/losses
- `points_for += teamPts`
- `points_against += oppPts`
- streak (W or L)
- `games_played += 1`

**Update `player_season_stats`:**
- `points += pts_i`
- `games_played += 1`
- PPG is derived: `points / games_played`

---

## 8) Offseason Rules (MUST match prior thread decisions)

Offseason occurs immediately after playoffs end.

### 8.1 Aging
- Age everyone by +1
- If `age >= 36` → retire (remove from league)

### 8.2 Offseason progression/regression
- If `age < 25` → `rating *= 1.05`
- If `age 25–29` → `rating *= 1.03`
- If `age >= 30` → `rating *= 0.85`

Then cap by tier cap (80/90/99).

### 8.3 Draft (Option A)
**Draft pool**: 10 players
- 1 Elite
- 2 Great
- 7 Good

**Draft order**: reverse regular-season standings (worst first)

Each team drafts exactly 1 player and must cut/replace 1 current player.

**Rookie contract:**
- 3 years
- salary by tier
- age set to 20 (MVP decision)

### 8.4 Contracts decrement
At end of season:
- `contractYearsRemaining -= 1`
- If hits 0:
  - Player becomes free agent

**MVP Decision**: In MVP, we do not implement complex re-signing UI. Instead:
- If contract expired, player stays on team and auto-renews for MVP (to avoid extra complexity), OR
- We implement a simple "auto-renew at same salary" rule.
- (This can be upgraded later.)

**NOTE**: If you want true resigning/free agency in MVP, we need an explicit flow. Current MVP aims to keep it shippable.

---

## 9) Admin & Manual Controls

For MVP, every player is admin.

**Admin actions:**
- Manually advance:
  - Run Offday processing (apply training choices)
  - OR run GameNight simulation (simulate scheduled games)
- Force season end (debug)
- Reset league (dev)

**Implementation:**
- `/api/admin/advance` (protected by `admin=true` from DB user profile)

---

## 10) Initial Accounts / Teams

**Initial 4 team owners:**
- **3 Farcaster logins** (FIDs to be fetched via Neynar API or Farcaster names API):
  - `catwalk` (username)
  - `farville` (username)
  - `plantsnft` (username)
- **1 email login**: `cpjets07@yahoo.com`

**MVP initialization script should:**
1. Fetch FIDs for Farcaster usernames using Neynar API or Farcaster names API:
   - `catwalk` → fetch FID
   - `farville` → fetch FID
   - `plantsnft` → fetch FID
   - If any username not found, fail with clear error
2. Create 4 profiles:
   - 3 Farcaster profiles (auth_type='farcaster', farcaster_fid set, email null)
   - 1 email profile (auth_type='email', email='cpjets07@yahoo.com', farcaster_fid null)
   - All profiles: is_admin=true (MVP)
3. Create 4 teams, assign one to each profile (owner_profile_id):
   - Team names: "Houston", "Atlanta", "Vegas", "NYC"
   - Assign teams to profiles in order: Houston → first profile, Atlanta → second, Vegas → third, NYC → fourth
4. Create 20 players, assign randomly:
   - Each team: 1 Elite, 1 Great, 3 Good
   - Positions assigned PG/SG/SF/PF/C (one of each per team)
   - Affinity randomly assigned (StrongVsZone or StrongVsMan)
   - **Player names**: Generate from curated list of University of Virginia college basketball players from 1980-1986 era
     - Use a list of 20+ UVA players from 1980-1986 teams (Ralph Sampson era)
     - Randomly assign names to players (no duplicates - each name used exactly once)
     - Store full names in `players.name` field

**Note**: FIDs for Farcaster usernames will be resolved at initialization time. If a username is not found, the script should fail with a clear error message listing which usernames failed.

**Known FIDs** (for manual profile creation if needed):
- `catwalk`: FID `871872`
- `farville`: FID `967647`
- `plantsnft`: FID `318447`
- Email: `cpjets07@yahoo.com`

**Manual Profile Creation** (if Neynar API fails during initialization):
If initialization fails due to FID lookup issues, create profiles manually:
```sql
-- Create all 4 profiles with known FIDs
INSERT INTO basketball.profiles (auth_type, farcaster_fid, email, is_admin)
VALUES 
  ('farcaster', 871872, NULL, true),  -- catwalk
  ('farcaster', 967647, NULL, true),  -- farville
  ('farcaster', 318447, NULL, true),  -- plantsnft
  ('email', NULL, 'cpjets07@yahoo.com', true)
ON CONFLICT DO NOTHING;
```
Then re-run "Initialize League" from dashboard.

---

## 11) Database Schema (Supabase - basketball schema)

**CRITICAL**: All tables live in `basketball.*` schema. Use `basketballDb.ts` helper with schema headers.

### Tables:

#### `basketball.profiles`
```sql
id uuid PRIMARY KEY (matches auth user id)
auth_type text NOT NULL CHECK (auth_type IN ('farcaster', 'email'))
email text (nullable, for email auth)
farcaster_fid bigint (nullable, for Farcaster auth)
is_admin boolean DEFAULT true (MVP: all users are admin)
created_at timestamptz DEFAULT now()
UNIQUE(email) WHERE email IS NOT NULL
UNIQUE(farcaster_fid) WHERE farcaster_fid IS NOT NULL
```

**Note**: Supports both auth types. `farcaster_fid` for Farcaster users, `email` for email users. One must be non-null.

#### `basketball.teams`
```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
name text NOT NULL
owner_profile_id uuid NOT NULL REFERENCES basketball.profiles(id)
prep_boost_active boolean NOT NULL DEFAULT false (flag for next game boost)
created_at timestamptz DEFAULT now()
```

#### `basketball.players`
```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
team_id uuid NOT NULL REFERENCES basketball.teams(id) ON DELETE CASCADE
name text NOT NULL
position text NOT NULL CHECK (position IN ('PG', 'SG', 'SF', 'PF', 'C'))
tier text NOT NULL CHECK (tier IN ('good', 'great', 'elite'))
rating numeric NOT NULL CHECK (rating >= 0 AND rating <= 99)
age integer NOT NULL CHECK (age >= 18 AND age <= 36)
affinity text NOT NULL CHECK (affinity IN ('StrongVsZone', 'StrongVsMan'))
salary_m integer NOT NULL
contract_years_remaining integer NOT NULL CHECK (contract_years_remaining >= 0)
created_at timestamptz DEFAULT now()
```

#### `basketball.season_state`
Single row table:
```sql
id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1)
season_number integer NOT NULL DEFAULT 1
day_number integer NOT NULL CHECK (day_number >= 1 AND day_number <= 60)
phase text NOT NULL CHECK (phase IN ('REGULAR', 'PLAYOFFS', 'OFFSEASON'))
day_type text NOT NULL CHECK (day_type IN ('OFFDAY', 'GAMENIGHT'))
last_advanced_at timestamptz
```

#### `basketball.gameplans`
```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
season_number integer NOT NULL
day_number integer NOT NULL (for next game)
team_id uuid NOT NULL REFERENCES basketball.teams(id)
offense text NOT NULL CHECK (offense IN ('Drive', 'Shoot'))
defense text NOT NULL CHECK (defense IN ('Zone', 'Man'))
mentality text NOT NULL CHECK (mentality IN ('Aggressive', 'Conservative', 'Neutral'))
submitted_at timestamptz DEFAULT now()
UNIQUE(season_number, day_number, team_id)
```

#### `basketball.offday_actions`
```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
season_number integer NOT NULL
day_number integer NOT NULL
team_id uuid NOT NULL REFERENCES basketball.teams(id)
action text NOT NULL CHECK (action IN ('TRAIN', 'PREP'))
submitted_at timestamptz DEFAULT now()
UNIQUE(season_number, day_number, team_id)
```

#### `basketball.team_season_stats`
```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
season_number integer NOT NULL
team_id uuid NOT NULL REFERENCES basketball.teams(id)
wins integer NOT NULL DEFAULT 0
losses integer NOT NULL DEFAULT 0
games_played integer NOT NULL DEFAULT 0
points_for integer NOT NULL DEFAULT 0
points_against integer NOT NULL DEFAULT 0
streak_type text NOT NULL DEFAULT 'NONE' CHECK (streak_type IN ('W', 'L', 'NONE'))
streak_count integer NOT NULL DEFAULT 0
UNIQUE(season_number, team_id)
```

#### `basketball.player_season_stats`
```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
season_number integer NOT NULL
player_id uuid NOT NULL REFERENCES basketball.players(id)
team_id uuid NOT NULL REFERENCES basketball.teams(id)
games_played integer NOT NULL DEFAULT 0
points integer NOT NULL DEFAULT 0
UNIQUE(season_number, player_id)
```

#### `basketball.games`
```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
season_number integer NOT NULL
day_number integer NOT NULL
home_team_id uuid NOT NULL REFERENCES basketball.teams(id)
away_team_id uuid NOT NULL REFERENCES basketball.teams(id)
home_score integer
away_score integer
winner_team_id uuid REFERENCES basketball.teams(id)
overtime_count integer NOT NULL DEFAULT 0
status text NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'FINAL'))
played_at timestamptz
```

**Note**: `overtime_count` tracks number of overtime periods played (0 = no overtime, 1 = OT, 2 = 2OT, etc.)

#### `basketball.game_player_lines`
```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
game_id uuid NOT NULL REFERENCES basketball.games(id) ON DELETE CASCADE
player_id uuid NOT NULL REFERENCES basketball.players(id)
team_id uuid NOT NULL REFERENCES basketball.teams(id)
points integer NOT NULL DEFAULT 0
UNIQUE(game_id, player_id)
```

### 11.2 Database Indexes (Performance)

**CRITICAL**: Composite indexes are required for optimal query performance as data grows.

**Required Composite Indexes**:
```sql
-- For game queries filtered by season + day + status
CREATE INDEX IF NOT EXISTS games_season_day_status_idx 
ON basketball.games (season_number, day_number, status);

-- For player stats filtered by season + team
CREATE INDEX IF NOT EXISTS player_season_stats_season_team_idx 
ON basketball.player_season_stats (season_number, team_id);

-- For gameplans filtered by season + day + team
CREATE INDEX IF NOT EXISTS gameplans_season_day_team_idx 
ON basketball.gameplans (season_number, day_number, team_id);
```

**Index Maintenance**:
- Indexes are created automatically by migration (`supabase_migration_basketball_schema.sql`)
- No manual index management required
- Indexes improve query performance significantly as data grows
- Indexes are transparent to application code (no code changes needed)

### RLS Policies:
- Team owners can read league data
- Owners can update only their team's offday action + gameplan
- Admin endpoint bypasses with service role key

---

## 12) UI Requirements (MVP)

### Pages:

#### Login
- "Sign in with Farcaster" (Neynar SIWN)
- "Sign in with Email" (Supabase Auth magic link)

#### Dashboard
- Season number
- Day number and Day Type (Offday/GameNight)
- Next opponent (if upcoming game)
- Buttons:
  - Submit offday action (Train/Prep)
  - Set gameplan (Offense/Defense/Mentality)
  - View standings
  - View roster

#### Standings
- Team records and PPG/Opp PPG

#### Team Roster
- 5 players with rating/age/tier/position/affinity
- Player PPG

#### Game Log
- List of games with scores
- Click game to see player points

#### Admin
- Advance day
- Simulate next game night
- Reset league (optional)

### Performance Requirements

**API Response Times** (Target):
- Dashboard load: < 500ms (with parallel API calls)
- Game detail: < 300ms
- Roster/Standings: < 400ms

**Optimization Strategies**:
- Parallel API calls for independent data (dashboard)
- Targeted database queries (fetch only needed records)
- Client-side caching for rarely-changing data

---

## 13) Phased Build Plan (step-by-step)

### Phase 1 — Skeleton + Auth + DB
- Next.js app scaffold in `basketball/` folder
- Supabase project + `basketball` schema + tables
- Neynar SIWN login
- Supabase email login
- Create profile record on first login (supports both auth types)
- Hardcode `is_admin=true` for all profiles (MVP)
- Build minimal UI shell
- Create `basketballDb.ts` helper with schema isolation

### Phase 2 — League Initialization
- Script or admin button: "Initialize league"
- Fetch FIDs for Farcaster usernames (catwalk, farville, plantsnft) via Neynar API or Farcaster names API
- Create 4 profiles:
  - 3 Farcaster profiles (using fetched FIDs)
  - 1 email profile (cpjets07@yahoo.com)
- Create 4 teams with names: "Houston", "Atlanta", "Vegas", "NYC"
  - Assign teams to profiles in order: Houston → first profile, Atlanta → second, Vegas → third, NYC → fourth
- Create 20 players with distribution rules:
  - Each team: 1 Elite, 1 Great, 3 Good
  - Positions: PG/SG/SF/PF/C (one of each per team)
  - Affinity: randomly assigned (StrongVsZone or StrongVsMan)
  - **Names**: Generate from curated list of UVA players from 1980-1986 era
    - Use list of 20+ players from Ralph Sampson era (1980-1986)
    - Randomly assign names (no duplicates - each name used exactly once)
- Create `season_state` row (season 1, day 1, OFFDAY, REGULAR phase)
- Create `team_season_stats` + `player_season_stats` for season 1

### Phase 3 — Offday Actions + Gameplans
- UI for submitting TRAIN or PREP for current offday
- UI for selecting Offense/Defense/Mentality for next game
- Store in DB with season/day keys
- Validation: one submission per team per day

### Phase 4 — Game Simulation Engine
- Implement schedule generator for 4 teams
- Implement `simulateGameNight()`:
  - load gameplans + prep flag + ratings
  - compute win prob + score + player points
  - store games + player lines + update stats
  - consume prep boost
- Admin endpoint triggers simulation

### Phase 5 — Cron + Automation
- Add Vercel cron calling `/api/cron/advance` (in basketball app's `vercel.json`)
- **Timezone handling**: All cutoff times and cron schedules use Eastern Time
- Cron job runs at midnight Eastern Time (or use manual advance)
- Offday processing:
  - Check if current day is OFFDAY
  - Apply training effects based on submitted actions (if TRAIN was chosen)
  - Consume prep boosts if PREP was chosen (flag set for next game)
  - Increment `day_number`, flip `day_type` to GAMENIGHT
- GameNight processing:
  - Check if current day is GAMENIGHT
  - Load scheduled games for this day
  - Simulate all games
  - Increment `day_number`, flip `day_type` to OFFDAY
  - If GameNight 27 completed (day 54), transition to PLAYOFFS phase
  - If GameNight 30 completed (day 60, playoffs end), transition to OFFSEASON phase
- Handle phase transitions:
  - REGULAR → PLAYOFFS (after GameNight 27 / day 54)
  - PLAYOFFS → OFFSEASON (after GameNight 30 / day 60)
  - OFFSEASON → REGULAR (after draft, increment season)

**Note**: Offseason processing is manual in MVP. When phase transitions to OFFSEASON, admin must manually call `/api/admin/offseason`. Future enhancement: Auto-trigger offseason processing in cron after phase transition (see Section 16.1).

### Phase 6 — Playoffs
- Determine top 2 after regular season
- Simulate best-of-3 with home advantage pattern
- Record playoff games in `games`

### Phase 7 — Offseason + Draft
- Triggered when phase transitions to OFFSEASON (after day 30)
- Apply aging: all players age +1
- Retire players: if age >= 36, remove from league
- Apply progression/regression:
  - Age < 25: rating *= 1.05
  - Age 25-29: rating *= 1.03
  - Age >= 30: rating *= 0.85
  - Cap by tier (80/90/99)
- Decrement contracts: contract_years_remaining -= 1
- Auto-renew expired contracts (MVP: same salary, 3 years)
- Generate draft pool: 10 players (1 Elite, 2 Great, 7 Good)
- Draft order: reverse regular-season standings (worst team picks first)
- Each team drafts 1 player, cuts 1 player (replace lowest-rated player)
- New players: age=20, 3-year contract, salary by tier
- New player names: Continue using UVA player names (curated list)
- Increment season_number, reset day_number to 1, phase to REGULAR, day_type to OFFDAY

---

## 14) Non-goals (explicitly out of MVP)

- Trades
- Injuries
- Salary cap or finances beyond fixed salaries
- Multi-league support (only one league)
- Complex contract negotiation UI (auto renew in MVP)

---

## 15) Acceptance Criteria (MVP must work end-to-end)

- Four owners can log in (3 Farcaster, 1 email) and each controls one team
- Season advances properly for 60 days with offday/game night alternation
- Owners can submit offday action and gameplan before midnight Eastern Time
- Games simulate with real scores after midnight Eastern Time
- Player points sum to team points always (verified in simulation logic)
- Standings and PPG display correctly
- Manual admin advance always works
- Timezone handling: All server-side time calculations use Eastern Time

### End-to-End Flow Verification:

1. **Initialization Flow**:
   - Admin clicks "Initialize league"
   - System fetches FIDs for catwalk, farville, plantsnft
   - Creates 4 profiles (3 Farcaster + 1 email)
   - Creates 4 teams, assigns to profiles
   - Creates 20 players with UVA names, distributes across teams
   - Creates season_state (season 1, day 1, OFFDAY, REGULAR)
   - Creates initial stats records

2. **Daily Flow (Offday)**:
   - User logs in (Farcaster or Email)
   - Dashboard shows current day (e.g., Day 1, OFFDAY)
   - User submits offday action (TRAIN or PREP)
   - User submits gameplan (Offense/Defense/Mentality)
   - System validates submission before midnight ET
   - After midnight ET, cron/advance processes:
     - If TRAIN: applies +0.1% rating boost to all 5 players
     - If PREP: sets prepBoostActive flag for next game
     - Flips day_type to GAMENIGHT, increments day_number

3. **Daily Flow (GameNight)**:
   - After midnight ET, cron/advance processes:
     - Loads scheduled games for this day
     - For each game:
       - Loads gameplans, prep flags, player ratings
       - Calculates win probability
       - Generates scores (winner always higher)
       - Distributes player points (sums to team total)
       - Updates game record, stats, player lines
     - Flips day_type to OFFDAY, increments day_number
   - Users see game results on dashboard

4. **Season Progression**:
   - GameNight 1-27 (Days 2, 4, 6, ..., 54): Regular season games
   - GameNight 27 (Day 54) completion: Transition to PLAYOFFS phase
   - Days 28-30: Playoff games (best-of-3)
   - Day 30 completion: Transition to OFFSEASON phase
   - Offseason: Aging, progression/regression, draft
   - New season: Increment season_number, reset to day 1

---

## 16) Future Enhancements (Post-MVP)

These features are explicitly **NOT** in MVP but are logical next steps that work with existing architecture:

### 16.1 Auto-trigger Offseason in Cron
**Current State**: Offseason processing requires manual admin call to `/api/admin/offseason` when phase is OFFSEASON.

**Enhancement**: Modify `/api/cron/advance` to automatically call `/api/admin/offseason` when phase transitions to OFFSEASON.

**Implementation**:
- After detecting phase transition to OFFSEASON (line 70 in `cron/advance/route.ts`)
- Before updating season_state, call `POST /api/admin/offseason` internally
- If offseason processing succeeds, the endpoint already resets season state
- If it fails, log error and keep phase as OFFSEASON for manual retry

**Why this works**: The offseason endpoint already exists and handles all logic. This is just automation of an existing manual step.

### 16.2 Data Visualization (Charts/Graphs)
**Enhancement**: Add visual charts to existing UI pages using existing API endpoints.

**Implementation**:
- Use existing `/api/standings` endpoint data for standings charts
- Use existing `/api/roster` endpoint data for player progression charts
- Use existing `/api/games` endpoint data for game history trends
- Add chart library (e.g., Recharts, Chart.js) to display:
  - Team PPG trends over season (line chart)
  - Player rating progression (line chart)
  - Win/loss distribution (bar chart)
  - Head-to-head matchup history (table/chart)

**Why this works**: All data already exists in database and is accessible via existing APIs. This is purely presentation layer.

### 16.3 API Response Standardization
**Enhancement**: Standardize all API responses to include consistent error handling and metadata.

**Current State**: APIs return `{ ok: boolean, error?: string, ...data }` but format varies slightly.

**Implementation**: Document and enforce consistent response format:
```typescript
// Success
{ ok: true, data: {...}, message?: string }

// Error  
{ ok: false, error: string, code?: string }
```

**Why this works**: This is a refactoring of existing endpoints, no new functionality needed.

---

## 17) API Reference

### Authentication Endpoints

**POST /api/auth/siwn**
- Verifies Farcaster SIWN message
- Creates/updates profile with FID
- Returns: `{ ok: boolean, profile?: Profile }`

**GET /api/auth/profile**
- Creates profile if doesn't exist
- Returns: `{ ok: boolean, profile?: Profile }`

**GET /api/profile?fid=X or ?email=X**
- Gets profile by FID or email
- Returns: `{ ok: boolean, profile?: Profile }`

### Season Management

**GET /api/season-state**
- Returns current season state
- Returns: `{ ok: boolean, state?: SeasonState }`

**POST /api/admin/advance**
- Manually advance day (admin only)
- Returns: `{ ok: boolean, message: string, new_day?: number, new_day_type?: string, new_phase?: string }`

**POST /api/admin/initialize**
- Initialize league (admin only)
- Returns: `{ ok: boolean, message: string }`

**POST /api/admin/offseason**
- Process offseason and draft (admin only, phase must be OFFSEASON)
- Returns: `{ ok: boolean, message: string, new_season?: number }`

**POST /api/admin/simulate**
- Manually simulate game night (admin only, day_type must be GAMENIGHT)
- Returns: `{ ok: boolean, message: string }`

### User Actions

**POST /api/offday-actions**
- Submit TRAIN or PREP action
- Body: `{ team_id: string, action: 'TRAIN' | 'PREP' }`
- Returns: `{ ok: boolean, message: string }`

**GET /api/offday-actions?team_id=X&season_number=Y&day_number=Z**
- Get offday action for specific team/day
- Returns: `{ ok: boolean, action?: OffdayAction }`

**POST /api/gameplans**
- Submit gameplan for next game
- Body: `{ team_id: string, offense: 'Drive' | 'Shoot', defense: 'Zone' | 'Man', mentality: 'Aggressive' | 'Conservative' | 'Neutral' }`
- Returns: `{ ok: boolean, message: string }`

**GET /api/gameplans?team_id=X&season_number=Y&day_number=Z**
- Get gameplan for specific team/day
- Returns: `{ ok: boolean, gameplan?: Gameplan }`

### Data Retrieval

**GET /api/teams?profile_id=X**
- Get team for a profile
- Returns: `{ ok: boolean, team?: Team }`

**GET /api/standings?season_number=X**
- Get standings for a season
- Returns: `{ ok: boolean, standings: Standing[], season_number: number }`

**GET /api/roster?team_id=X&season_number=Y**
- Get roster with player stats
- Returns: `{ ok: boolean, roster: Player[], season_number: number }`

**GET /api/games?team_id=X&season_number=Y**
- Get games (filtered by team if team_id provided)
- Returns: `{ ok: boolean, games: Game[], season_number: number }`

**GET /api/games/[gameId]**
- Get detailed game with player points
- Returns: `{ ok: boolean, game: Game, home_players: PlayerLine[], away_players: PlayerLine[] }`

**GET /api/next-opponent?team_id=X**
- Get next opponent for a team
- Returns: `{ ok: boolean, opponent?: { team_id: string, team_name: string, day_number: number, is_home: boolean } }`

### Cron

**POST /api/cron/advance**
- Automated day advancement (called by Vercel cron)
- Same logic as `/api/admin/advance` but for automated use
- Returns: `{ ok: boolean, message: string, ... }`

---

## 18) Known Limitations & MVP Decisions

### MVP Limitations (By Design)

1. **Manual Offseason Processing**
   - Offseason must be manually triggered via `/api/admin/offseason` when phase is OFFSEASON
   - Cron does not automatically process offseason
   - **Future Enhancement**: Auto-trigger in cron (see Section 16.1)

2. **All Users Are Admin**
   - `is_admin=true` hardcoded for all profiles in MVP
   - No role-based access control
   - All users can access admin endpoints
   - **Future Enhancement**: Proper admin role management

3. **No Draft UI**
   - Draft happens automatically during offseason
   - Users cannot choose which player to draft
   - Always cuts lowest-rated player
   - **Future Enhancement**: Draft UI with user choice

4. **Fixed Schedule**
   - No rescheduling or postponements
   - Games always happen on scheduled days
   - No weather delays, injuries, etc.

5. **No Timezone UI**
   - All times shown in server timezone (Eastern Time)
   - Users cannot see times in their local timezone
   - **Future Enhancement**: Timezone detection and conversion

6. **No Validation UI**
   - Users can submit actions multiple times (handled by UNIQUE constraint)
   - No client-side validation before submission
   - **Future Enhancement**: Form validation and duplicate submission prevention

### Data Integrity Guarantees

- Player points always sum to team points (verified in simulation code)
- Stats calculated correctly (W/L, PPG, etc.)
- Foreign key constraints prevent orphaned records
- UNIQUE constraints prevent duplicate submissions

---

## 19) Troubleshooting Guide

### Common Issues

**Issue**: Cron job not running
- **Check**: Vercel cron configuration in `vercel.json`
- **Verify**: Cron schedule is `"0 5 * * *"` (midnight ET = 5:00 UTC)
- **Check**: Vercel project settings → Cron Jobs
- **Logs**: Check Vercel function logs for errors

**Issue**: Games not simulating
- **Verify**: `day_type` is `GAMENIGHT` (not `OFFDAY`)
- **Check**: Call `/api/admin/simulate` manually
- **Verify**: Teams exist and have players
- **Check**: Gameplans exist (or defaults will be applied)

**Issue**: Offseason not processing
- **Verify**: `phase` is `OFFSEASON` (check `/api/season-state`)
- **Check**: Call `/api/admin/offseason` manually
- **Verify**: All required data exists (teams, players, stats)
- **Note**: Offseason is manual in MVP (see Section 18)

**Issue**: Player points don't sum to team points
- **This should never happen** (verified in code)
- **Check**: `game_player_lines` table for the game
- **Verify**: Sum of player points matches team score
- **If mismatch**: This indicates a bug in simulation logic

**Issue**: League not initialized
- **Check**: Call `/api/admin/initialize`
- **Verify**: FIDs can be fetched for Farcaster usernames
- **Check**: Supabase connection and schema exists
- **Verify**: All environment variables are set

**Issue**: "Team not found" error after sign-in
- **Cause**: League initialization was partially completed (season_state exists but teams/players missing)
- **Symptoms**: 
  - User can sign in successfully
  - Dashboard shows "Team not found" error
  - `/api/teams` returns 404
  - Season state exists but teams/players don't exist
- **Fix Steps**:
  1. **Check current state** (run in Supabase SQL Editor):
     ```sql
     -- Check profiles
     SELECT id, farcaster_fid, email, is_admin FROM basketball.profiles;
     
     -- Check teams
     SELECT id, name, owner_profile_id FROM basketball.teams;
     
     -- Check season state
     SELECT * FROM basketball.season_state;
     
     -- Check players
     SELECT COUNT(*) FROM basketball.players;
     ```
  2. **If season_state exists with season_number > 0**: Reset to allow re-initialization:
     ```sql
     -- Reset season_state (respects constraint: day_number >= 1)
     UPDATE basketball.season_state 
     SET season_number = 0, day_number = 1 
     WHERE id = 1;
     ```
  3. **If profiles are missing**: Create missing profiles manually (if Neynar FID lookup fails):
     ```sql
     -- Create profiles with known FIDs
     -- FIDs: catwalk=871872, farville=967647, plantsnft=318447
     INSERT INTO basketball.profiles (auth_type, farcaster_fid, email, is_admin)
     VALUES 
       ('farcaster', 871872, NULL, true),
       ('farcaster', 967647, NULL, true),
       ('farcaster', 318447, NULL, true),
       ('email', NULL, 'cpjets07@yahoo.com', true)
     ON CONFLICT DO NOTHING;
     ```
  4. **Run "Initialize League"** from dashboard (as admin)
  5. **Verify**: Should create 4 teams, 20 players, and update season_state
- **Prevention**: Always run initialization completely. If it fails partway, reset season_state and re-run.

**Issue**: Schema isolation errors
- **Check**: `basketballDb.ts` is using correct headers
- **Verify**: `Accept-Profile: basketball` and `Content-Profile: basketball` headers
- **Check**: Table names are in allowlist
- **Verify**: Not accessing `public.*` or `poker.*` schemas

**Issue**: `PGRST106: "The schema must be one of the following: public, graphql_public"` error
- **Cause**: `basketball` schema is not exposed to PostgREST
- **Fix**: Follow Section 3.2 "PostgREST Schema Exposure Configuration" steps:
  1. Add `basketball` to "Exposed schemas" in Supabase Dashboard → Settings → API
  2. Run GRANT permissions SQL (see Section 3.2)
  3. Reset authenticator role: `ALTER ROLE authenticator RESET pgrst.db_schemas;`
  4. Reload PostgREST cache: `SELECT pg_notify('pgrst', 'reload schema');`
  5. Wait 2-3 minutes, then retest
- **Verify**: Direct API call works: `curl -H "Accept-Profile: basketball" https://your-project.supabase.co/rest/v1/profiles`

**Issue**: Slow API responses
- **Check**: Database query patterns (should use indexes, not full table scans)
- **Verify**: Composite indexes exist (Section 11.2)
- **Check**: Queries use targeted filters, not fetching all records
- **Verify**: Parallel API calls for independent data (dashboard)
- **Logs**: Check Supabase Dashboard → Query Performance for slow queries

---

## 20) Environment Variables

### Required (Shared Supabase Instance - "Catwalk Ai Agent" project):
```
NEXT_PUBLIC_SUPABASE_URL=https://your-catwalk-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key (same as catwalk app)
SUPABASE_SERVICE_ROLE=your-service-role-key (same as catwalk app)
```

### Optional (Performance & Security):
```
CRON_SECRET=your-secret-key  # For protecting cron endpoint (recommended for production)
```

**Note**: Use the same Supabase credentials as your catwalk app since we're sharing the same Supabase project.

### Required (Neynar):
```
NEYNAR_API_KEY=your-neynar-api-key
```

### App-Specific:
```
APP_NAME=Basketball Sim
APP_DESCRIPTION=Daily basketball team simulation game
NEXT_PUBLIC_BASE_URL=http://localhost:3000 (or Vercel URL in prod)
```

### Optional:
```
BASKETBALL_ADMIN_EMAILS=admin1@example.com,admin2@example.com
```

---

## 21) Deployment Checklist

### Vercel Setup:
1. Create new Vercel project: `basketball` (separate from other apps)
2. Import from GitHub: Select the `basketball` repository
3. Root Directory: `.` (root of this repository - not a subdirectory)
4. Build Command: `npm run build`
5. Install Command: `npm install`
6. Framework: Next.js
7. Add all environment variables from section 20

### Supabase Setup:
1. **Use existing "Catwalk Ai Agent" Supabase project** (the one you're already using)
2. Run `supabase_migration_basketball_schema.sql` in Supabase SQL Editor
3. All tables will be created in `basketball.*` schema (isolated from `public.*` schema)
4. RLS is automatically enabled by the migration
5. **CRITICAL: Expose `basketball` schema to PostgREST** (see Section 3.2 "PostgREST Schema Exposure Configuration"):
   - Add `basketball` to "Exposed schemas" in Supabase Dashboard → Settings → API
   - Run GRANT permissions SQL (see Section 3.2)
   - Reset authenticator role if needed: `ALTER ROLE authenticator RESET pgrst.db_schemas;`
   - Reload PostgREST cache: `SELECT pg_notify('pgrst', 'reload schema');`
   - Wait 2-3 minutes for propagation
5. RLS policies are created by the migration for team owners
6. **Important**: This shares the same Supabase instance with catwalk app, but uses a separate schema

### Local Development:
1. Clone the repository: `git clone https://github.com/plantsnft/basketball.git`
2. `cd basketball`
3. `npm install`
4. Copy `.env.local.example` to `.env.local` and fill in values
5. `npm run dev`
6. App runs on `http://localhost:3000` (or next available port)

---

## 22) Deployment Workflow

### Standard Deployment Process

**Always verify build locally before pushing to production:**

1. **Local Build Verification**:
   ```bash
   cd basketball
   npm run build
   ```
   - ✅ Should complete with exit code 0
   - ✅ Should show "✓ Compiled successfully"
   - ✅ Should show "✓ Generating static pages (26/26)"
   - ✅ Should complete without errors (warnings are OK)

2. **Commit Changes**:
   ```bash
   git add -A
   git commit -m "descriptive commit message"
   ```

3. **Push to GitHub**:
   ```bash
   git push origin main
   ```

4. **Vercel Automatic Deployment**:
   - Vercel automatically detects push to `main` branch
   - Build starts within seconds
   - Monitor deployment in Vercel Dashboard

### Expected Build Output (Successful)

**Build Log Indicators of Success**:
```
✓ Compiled successfully in ~16-20s
✓ Linting and checking validity of types ...
✓ Generating static pages (26/26)
✓ Build Completed in /vercel/output [~50-60s]
✓ Deployment completed
```

**Build Time**: Typically 50-60 seconds total
- Dependencies: ~18-20s
- Compilation: ~16-20s
- Page generation: ~5-10s
- Finalization: ~10-15s

### Common Build Errors & Fixes

#### Error: `supabaseUrl is required.`

**Cause**: Supabase client created at module level (runs during build when env vars unavailable)

**Fix Pattern**: Use lazy initialization - create client inside function, not at module level

**Example Fix**:
```typescript
// ❌ WRONG - Module level (runs during build)
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ✅ CORRECT - Lazy initialization (only runs at runtime)
function getSupabaseClient() {
  if (typeof window === "undefined") {
    throw new Error("Supabase client can only be created in browser environment");
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase configuration missing...");
  }
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

export async function signInWithEmail(email: string) {
  const supabase = getSupabaseClient(); // Created only when called
  // ...
}
```

**Files That Need This Pattern**:
- ✅ `src/app/auth/callback/route.ts` - Fixed (lazy initialization)
- ✅ `src/lib/auth.ts` - Fixed (lazy initialization)
- ⚠️ Any new files that create Supabase clients must use lazy initialization

#### Error: `Type error: Property 'id' does not exist`

**Cause**: TypeScript doesn't know database returns `id` field (auto-generated)

**Fix**: Use generic type parameters in `basketballDb.insert()`:
```typescript
interface Team {
  id: string;
  name: string;
  // ... other fields
}

const team = await basketballDb.insert<InputType, Team>("teams", {
  name: "Houston",
  // ... input fields
});
// Now TypeScript knows team[0].id exists
```

#### Error: `Route has an invalid "GET" export` (Next.js 15)

**Cause**: Next.js 15 requires async route params

**Fix**: Await params in dynamic routes:
```typescript
// ❌ WRONG - Next.js 14
export async function GET(req: NextRequest, { params }: { params: { gameId: string } }) {
  const { gameId } = params;
}

// ✅ CORRECT - Next.js 15
export async function GET(req: NextRequest, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
}
```

### Build Verification Checklist

Before pushing, verify:
- [ ] `npm run build` succeeds locally (exit code 0)
- [ ] No TypeScript errors
- [ ] No blocking ESLint errors (warnings OK)
- [ ] All pages generate successfully (26/26)
- [ ] No module-level Supabase client creation
- [ ] All route handlers use correct Next.js 15 patterns

### Post-Deployment Verification

After Vercel deployment completes:
1. **Check Build Logs**: Should show "Build Completed" and "Deployment completed"
2. **Test Production URL**: Visit deployed app
3. **Verify Environment Variables**: Check Vercel project settings
4. **Test Critical Paths**:
   - Login page loads
   - Dashboard loads (after login)
   - API routes respond correctly
5. **Performance Check** (Optional but recommended):
   - Dashboard loads in < 500ms
   - API routes respond in < 300ms
   - No full table scans in database logs (check Supabase Dashboard)

### Rollback Procedure

If deployment fails or breaks production:
1. **Revert Commit**: `git revert HEAD` (or specific commit hash)
2. **Push Revert**: `git push origin main`
3. **Vercel Auto-Deploys**: Previous working version redeploys automatically

### Environment Variables in Vercel

**Required Variables** (set in Vercel Dashboard → Settings → Environment Variables):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE` (or `SUPABASE_SERVICE_ROLE_KEY`)
- `NEYNAR_API_KEY`
- `NEXT_PUBLIC_BASE_URL` (optional, auto-detected from Vercel)

**Optional (Performance & Security)**:
- `CRON_SECRET` - For protecting cron endpoint (recommended for production)

**Note**: These must be set in Vercel for production builds to work. Local `.env.local` is only for development.

---

## 23) Performance & Optimization Guidelines

### 23.1 Database Query Best Practices

**CRITICAL**: Follow these patterns for optimal performance:

1. **Use Targeted Queries**:
   - ✅ Filter at database level: `filters: { team_id: teamId }`
   - ✅ Use `in` operator for multiple IDs: `filters: { id: { in: [id1, id2] } }`
   - ❌ Avoid: Fetching all records then filtering in memory

2. **Leverage Composite Indexes**:
   - Queries filtered by multiple columns automatically use composite indexes
   - See Section 11.2 for required indexes

3. **Parallel Independent Queries**:
   - Use `Promise.all()` for independent API calls
   - Reduces total response time significantly

### 23.2 basketballDb.fetch() Filter Operators

**Supported Operators** (PostgREST syntax):
- `eq`: Equals (default) - `?column=eq.value`
- `in`: Multiple values (array) - `?column=in.(value1,value2,value3)`
- `gt`: Greater than (numbers) - `?column=gt.value`
- `gte`: Greater than or equal (numbers) - `?column=gte.value`
- `lt`: Less than (numbers) - `?column=lt.value`
- `lte`: Less than or equal (numbers) - `?column=lte.value`

**Usage Examples**:
```typescript
// Single value filter (default - uses eq)
basketballDb.fetch('players', {
  filters: { team_id: teamId }
});

// Multiple values (in operator)
basketballDb.fetch('players', {
  filters: { 
    id: { in: [id1, id2, id3] }
  }
});

// Range filter
basketballDb.fetch('players', {
  filters: { 
    rating: { gte: 80, lte: 99 }
  }
});
```

**PostgREST Compatibility**:
- All operators use standard PostgREST query syntax
- Works with existing schema isolation headers
- No changes to PostgREST API calls

### 23.3 Caching Strategy

**Cacheable Data** (rarely changes):
- Team names and metadata
- Season state (changes once per day)
- Player base attributes (name, position, tier)

**Non-Cacheable Data** (changes frequently):
- Game results
- Player stats (points, PPG)
- Standings (updates after each game)
- Gameplans and offday actions

**Implementation**:
- Server-side: Use Next.js `unstable_cache` for API routes
- Client-side: Use React Query for stale-while-revalidate caching
- Cache TTL: 5 minutes for rarely-changing data, 1 minute for frequently-changing

**Note**: Caching is optional optimization. MVP works without caching, but caching improves performance significantly.

### 23.4 Code Quality Standards

**Shared Utilities**:
- Extract duplicate code to shared utilities (`src/lib/`)
- Example: `isAfterMidnightET()` should be in `src/lib/dateUtils.ts`
- Reduces code duplication and maintenance burden

**Input Validation**:
- Validate all API route inputs
- Check data types, ranges, and formats
- Return 400 errors for invalid input
- Prevents errors and security issues

**Error Handling**:
- Use consistent error response format: `{ ok: false, error: string }`
- Log errors server-side for debugging
- Don't expose internal errors to clients

### 23.5 Security Best Practices

**Cron Endpoint Protection**:
- Always protect `/api/cron/advance` with authentication
- Use `CRON_SECRET` environment variable
- Verify `Authorization: Bearer <secret>` header
- Prevents unauthorized day advancement

**Rate Limiting**:
- Implement rate limiting for public API endpoints
- Use Vercel's built-in rate limiting or custom middleware
- Recommended: 100 requests per minute per IP
- Prevents abuse and DoS attacks

### 23.6 Performance Targets

**API Response Times** (Target):
- Dashboard load: < 500ms (with parallel API calls)
- Game detail: < 300ms
- Roster/Standings: < 400ms

**Optimization Strategies**:
- Parallel API calls for independent data (dashboard)
- Targeted database queries (fetch only needed records)
- Client-side caching for rarely-changing data
- Composite indexes for multi-column filters

### 23.7 Performance Monitoring

**Key Metrics to Track**:
- API response times (p50, p95, p99)
- Database query execution time
- Cache hit rates
- Error rates

**Tools**:
- Vercel Analytics for response times
- Supabase Dashboard for query performance
- Custom logging for cache metrics

**Note**: Performance monitoring is optional but recommended for production.

---

## END SOURCE OF TRUTH

**Implementation Note**: When implementing, follow phases 1-7 in order. Each phase should be fully working before moving to the next. Test end-to-end after each phase.
