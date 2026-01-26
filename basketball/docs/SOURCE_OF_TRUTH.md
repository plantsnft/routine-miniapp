# Daily Sim Basketball — Source of Truth (SoT)

## ⚠️ CRITICAL ISOLATION REQUIREMENTS

**THIS APP MUST BE COMPLETELY ISOLATED FROM EXISTING PROJECTS:**

1. **Folder Structure**: All code lives in `basketball/` folder. DO NOT modify:
   - `burrfriends/` folder
   - `poker/` folder  
   - Root `src/` folder (catwalk app)
   - Any files outside `basketball/`

2. **Database Schema**: All tables live in `basketball.*` schema in Supabase. DO NOT touch:
   - `public.*` schema (catwalk app)
   - `poker.*` schema (poker/burrfriends apps)

3. **Supabase Client**: Use `basketballDb.ts` helper with `Accept-Profile: basketball` and `Content-Profile: basketball` headers. Never use raw Supabase client without schema headers.

4. **Vercel Project**: Deploy as separate Vercel project. DO NOT modify root `vercel.json`.

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

### Folder Structure
```
routine/
├── basketball/              # NEW - All basketball app code here
│   ├── src/
│   │   ├── app/            # Next.js App Router
│   │   ├── components/     # React components
│   │   ├── lib/            # Utilities (basketballDb.ts, constants.ts, etc.)
│   │   └── hooks/          # React hooks
│   ├── docs/               # Documentation (this file)
│   ├── scripts/            # Admin/seed scripts
│   ├── supabase_migration_*.sql  # All migrations for basketball schema
│   ├── package.json        # Own dependencies
│   ├── next.config.ts      # Own Next.js config
│   ├── vercel.json         # Own cron config
│   ├── tsconfig.json       # Own TypeScript config
│   └── .env.local.example  # Env var template
├── burrfriends/            # EXISTING - DO NOT TOUCH
├── poker/                  # EXISTING - DO NOT TOUCH
└── src/                    # EXISTING (catwalk) - DO NOT TOUCH
```

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
- (Regular season uses first 27 game nights; adjust if needed.)

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
status text NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'FINAL'))
played_at timestamptz
```

#### `basketball.game_player_lines`
```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
game_id uuid NOT NULL REFERENCES basketball.games(id) ON DELETE CASCADE
player_id uuid NOT NULL REFERENCES basketball.players(id)
team_id uuid NOT NULL REFERENCES basketball.teams(id)
points integer NOT NULL DEFAULT 0
UNIQUE(game_id, player_id)
```

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
  - If day 27 completed, transition to PLAYOFFS phase
  - If day 30 completed (playoffs end), transition to OFFSEASON phase
- Handle phase transitions:
  - REGULAR → PLAYOFFS (after day 27)
  - PLAYOFFS → OFFSEASON (after day 30)
  - OFFSEASON → REGULAR (after draft, increment season)

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
   - Days 1-27: Regular season games
   - Day 27 completion: Transition to PLAYOFFS phase
   - Days 28-30: Playoff games (best-of-3)
   - Day 30 completion: Transition to OFFSEASON phase
   - Offseason: Aging, progression/regression, draft
   - New season: Increment season_number, reset to day 1

---

## 16) Environment Variables

### Required (Shared Supabase Instance - "Catwalk Ai Agent" project):
```
NEXT_PUBLIC_SUPABASE_URL=https://your-catwalk-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key (same as catwalk app)
SUPABASE_SERVICE_ROLE=your-service-role-key (same as catwalk app)
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

## 17) Deployment Checklist

### Vercel Setup:
1. Create new Vercel project: `basketball` (separate from other apps)
2. Root Directory: `basketball` (not root of repo)
3. Build Command: `npm run build`
4. Install Command: `npm install`
5. Framework: Next.js
6. Add all environment variables from section 16

### Supabase Setup:
1. **Use existing "Catwalk Ai Agent" Supabase project** (the one you're already using)
2. Run `supabase_migration_basketball_schema.sql` in Supabase SQL Editor
3. All tables will be created in `basketball.*` schema (isolated from `public.*` schema)
4. RLS is automatically enabled by the migration
5. RLS policies are created by the migration for team owners
6. **Important**: This shares the same Supabase instance with catwalk app, but uses a separate schema

### Local Development:
1. `cd basketball`
2. `npm install`
3. Copy `.env.local.example` to `.env.local` and fill in values
4. `npm run dev`
5. App runs on `http://localhost:3000` (or next available port)

---

## END SOURCE OF TRUTH

**Implementation Note**: When implementing, follow phases 1-7 in order. Each phase should be fully working before moving to the next. Test end-to-end after each phase.
