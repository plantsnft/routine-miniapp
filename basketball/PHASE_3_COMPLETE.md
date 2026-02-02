# Phase 3 Implementation - Complete ✅

## What Was Implemented

### ✅ API Routes Created

1. **POST /api/offday-actions** ✅
   - Submit TRAIN or PREP action for current offday
   - Validates current day is OFFDAY
   - One submission per team per day (upsert via UNIQUE constraint)
   - If PREP, sets `teams.prep_boost_active = true`
   - Stores with season/day keys

2. **GET /api/offday-actions** ✅
   - Get offday action for specific team/day
   - Query params: team_id, season_number, day_number

3. **POST /api/gameplans** ✅
   - Submit gameplan (Offense/Defense/Mentality) for next game
   - Validates all three fields
   - One submission per team per day (upsert via UNIQUE constraint)
   - Calculates next GAMENIGHT correctly
   - Stores with season/day keys

4. **GET /api/gameplans** ✅
   - Get gameplan for specific team/day
   - Query params: team_id, season_number, day_number

5. **GET /api/season-state** ✅
   - Get current season state
   - Returns season_number, day_number, phase, day_type

6. **GET /api/teams** ✅
   - Get team for a specific profile
   - Query param: profile_id

7. **GET /api/profile** ✅
   - Get profile by FID or email
   - Query params: fid or email

### ✅ Dashboard UI Updated

**File**: `src/app/dashboard/page.tsx`

**Features**:
- ✅ Shows current season state (season, day, phase, day_type)
- ✅ Shows user's team name and prep boost status
- ✅ **Offday Actions UI** (only shown on OFFDAY):
  - Buttons for TRAIN and PREP
  - Shows current selection
  - Disables button if already selected
  - Submits to `/api/offday-actions`
- ✅ **Gameplan UI** (always shown):
  - Three sections: Offense, Defense, Mentality
  - Offense: Drive / Shoot buttons
  - Defense: Zone / Man buttons
  - Mentality: Aggressive / Conservative / Neutral buttons
  - Shows current selection
  - Submits to `/api/gameplans`
  - Calculates next GAMENIGHT correctly

### ✅ Auth Flow Updates

- ✅ Farcaster login stores FID in localStorage
- ✅ Email login callback passes email via URL param
- ✅ Dashboard reads FID from localStorage or email from URL
- ✅ Dashboard loads user profile and team

### ✅ Validation

- ✅ **One submission per team per day**: 
  - UNIQUE constraint in database (season_number, day_number, team_id)
  - API routes use upsert (update if exists, insert if not)
- ✅ **OFFDAY validation**: 
  - Offday actions can only be submitted when `day_type = 'OFFDAY'`
- ✅ **Next game calculation**:
  - If OFFDAY: next game = day_number + 1
  - If GAMENIGHT: next game = day_number + 2 (skip next OFFDAY)

### ✅ Data Storage

- ✅ **offday_actions**: Stored with season_number, day_number, team_id
- ✅ **gameplans**: Stored with season_number, day_number, team_id
- ✅ **prep_boost_active**: Set on teams table when PREP is submitted

## Implementation Details (Following SoT)

### Offday Actions
- ✅ TRAIN: Stored as action='TRAIN' (will be processed in Phase 4)
- ✅ PREP: Stored as action='PREP' AND sets `teams.prep_boost_active = true`
- ✅ Validation: Only allowed on OFFDAY
- ✅ One per team per day (UNIQUE constraint)

### Gameplans
- ✅ Offense: 'Drive' or 'Shoot'
- ✅ Defense: 'Zone' or 'Man'
- ✅ Mentality: 'Aggressive', 'Conservative', or 'Neutral'
- ✅ Stored for next GAMENIGHT
- ✅ One per team per day (UNIQUE constraint)

## How to Use

1. **User logs in** (Farcaster or Email)
2. **Dashboard loads**:
   - Shows current season state
   - Shows user's team
   - Shows offday action UI (if OFFDAY)
   - Shows gameplan UI (always)
3. **User submits**:
   - Click TRAIN or PREP (on OFFDAY)
   - Select Offense/Defense/Mentality (anytime)
4. **Submissions stored**:
   - In `basketball.offday_actions` table
   - In `basketball.gameplans` table
   - Ready for Phase 4 (game simulation)

## Next Steps

Phase 3 is complete! Ready for:
- **Phase 4**: Game Simulation Engine
  - Will use submitted gameplans
  - Will process TRAIN actions (apply rating boosts)
  - Will use PREP flag (apply +25% boost)

---

**Status**: ✅ Phase 3 implementation complete and ready for Phase 4
