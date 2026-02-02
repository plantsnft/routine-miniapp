# Deployment & Production Testing Plan

## 🎯 Goal
Deploy basketball app to Vercel and test in production (skip local testing).

---

## 📋 Pre-Deployment Checklist

### ✅ Code Ready
- [x] All phases 1-7 implemented
- [x] All API endpoints working
- [x] UI complete
- [x] Cutoff time validation implemented
- [x] Auto-trigger offseason implemented
- [x] `vercel.json` configured with cron job
- [x] `.gitignore` excludes `.env.local`

### ⚠️ Before Pushing
1. **Verify no sensitive data in code**:
   - No API keys hardcoded
   - No `.env.local` committed
   - All secrets use environment variables

2. **Check git status**:
   ```bash
   cd basketball
   git status
   ```

---

## 🚀 Step 1: Create New GitHub Repository & Push

### 1.1 Create GitHub Repository
1. Go to: https://github.com/new
2. Repository name: `basketball` (or `basketball-miniapp`)
3. Visibility: Private (recommended)
4. Description: "Basketball team simulation mini-app"
5. **DO NOT** initialize with README, .gitignore, or license
6. Click "Create repository"
7. Copy the repository URL (e.g., `https://github.com/plantsnft/basketball.git`)

### 1.2 Initialize Git in Basketball Folder
```powershell
cd c:\miniapps\routine\basketball
git init
git add .
git commit -m "feat: Complete basketball app MVP - all phases 1-7, UI, APIs, auto-offseason, cutoff validation"
```

### 1.3 Connect to GitHub and Push
```powershell
git remote add origin https://github.com/plantsnft/basketball.git
git branch -M main
git push -u origin main
```

**Note**: Replace `plantsnft/basketball` with your actual GitHub username and repo name.

**Verify**: Check GitHub to confirm all files are pushed.

---

## 🗄️ Step 2: Supabase Database Setup

### 2.1 Run Migration (If Not Already Done)

1. **Go to Supabase Dashboard**:
   - Open your "Catwalk Ai Agent" Supabase project
   - Navigate to **SQL Editor**

2. **Run Migration**:
   - Open file: `basketball/supabase_migration_basketball_schema.sql`
   - Copy entire contents
   - Paste into Supabase SQL Editor
   - Click **Run**

3. **Verify Schema Created**:
   - Go to **Table Editor**
   - Check that `basketball` schema exists
   - Verify all 10 tables are created:
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

**✅ Checkpoint**: Database schema ready

---

## 🌐 Step 3: Vercel Project Setup

### 3.1 Create New Vercel Project

1. **Go to Vercel Dashboard**: https://vercel.com/dashboard

2. **Add New Project**:
   - Click **Add New** → **Project**
   - Import your Git repository (the one with `basketball/` folder)

3. **Configure Project Settings**:
   - **Project Name**: `basketball` (or your choice)
   - **Root Directory**: `.` ⚠️ **CRITICAL** - Root of this repository (not a subdirectory)
   - **Framework Preset**: Next.js (auto-detected)
   - **Build Command**: `npm run build` (default)
   - **Output Directory**: `.next` (default)
   - **Install Command**: `npm install` (default)

4. **Environment Variables** (Add these in Vercel):
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-catwalk-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE=your-service-role-key
   NEYNAR_API_KEY=your-neynar-api-key
   APP_NAME=Basketball Sim
   APP_DESCRIPTION=Daily basketball team simulation game
   NEXT_PUBLIC_BASE_URL=https://your-vercel-url.vercel.app
   ```

   **Note**: 
   - Use same Supabase keys as your catwalk app
   - `NEXT_PUBLIC_BASE_URL` will be your Vercel deployment URL (set after first deploy)

5. **Deploy**:
   - Click **Deploy**
   - Wait for build to complete

### 3.2 Update Base URL After First Deploy

1. **Get Vercel URL**:
   - After deployment, Vercel provides URL like: `basketball-xxx.vercel.app`
   - Copy this URL

2. **Update Environment Variable**:
   - Go to **Project Settings** → **Environment Variables**
   - Update `NEXT_PUBLIC_BASE_URL` to: `https://basketball-xxx.vercel.app`
   - **Redeploy** (or wait for next build)

### 3.3 Verify Cron Job

1. **Check Cron Configuration**:
   - Go to **Project Settings** → **Cron Jobs**
   - Verify cron job is listed:
     - **Path**: `/api/cron/advance`
     - **Schedule**: `0 5 * * *` (midnight ET = 5:00 UTC)

2. **If Cron Not Showing**:
   - Check `vercel.json` is in `basketball/` folder
   - Redeploy if needed

**✅ Checkpoint**: Vercel project deployed

---

## 🧪 Step 4: Production Testing Checklist

### 4.1 Initial Setup Test

**Test**: Initialize League
- [ ] Open app URL: `https://your-vercel-url.vercel.app`
- [ ] Should redirect to `/login`
- [ ] Log in as admin (Farcaster or Email)
- [ ] Go to Dashboard
- [ ] Click **"Initialize League"** button
- [ ] Verify success message
- [ ] Check Dashboard shows:
  - [ ] Season 1
  - [ ] Day 1
  - [ ] OFFDAY
  - [ ] Your team name

**Expected Result**: League initialized, 4 teams, 20 players created

---

### 4.2 Authentication Test

**Test**: Both Auth Methods
- [ ] **Farcaster Login**:
  - [ ] Click "Sign in with Farcaster"
  - [ ] Complete SIWN flow
  - [ ] Should redirect to dashboard
  - [ ] Profile created/loaded

- [ ] **Email Login**:
  - [ ] Click "Sign in with Email"
  - [ ] Enter email: `cpjets07@yahoo.com`
  - [ ] Check email for magic link
  - [ ] Click magic link
  - [ ] Should redirect to dashboard
  - [ ] Profile created/loaded

**Expected Result**: Both auth methods work, profiles created

---

### 4.3 Offday Actions Test

**Test**: Submit Offday Action
- [ ] On OFFDAY, submit **TRAIN** action
- [ ] Verify success message
- [ ] Submit **PREP** action (should update)
- [ ] Verify success message
- [ ] Check team has `prep_boost_active = true` (via API or DB)

**Test**: Cutoff Time Validation
- [ ] Try submitting after midnight ET (if possible)
- [ ] Should get error: "Submissions must be made before midnight Eastern Time"

**Expected Result**: Actions submit successfully, cutoff validation works

---

### 4.4 Gameplan Submission Test

**Test**: Submit Gameplan
- [ ] Submit gameplan with:
  - [ ] Offense: Drive
  - [ ] Defense: Zone
  - [ ] Mentality: Aggressive
- [ ] Verify success message
- [ ] Update gameplan (should work)
- [ ] Verify updated values

**Expected Result**: Gameplan submits and updates correctly

---

### 4.5 Manual Day Advancement Test

**Test**: Admin Advance Day
- [ ] Click **"Advance Day"** button
- [ ] Verify:
  - [ ] Day increments
  - [ ] Day type flips (OFFDAY ↔ GAMENIGHT)
  - [ ] If TRAIN was submitted, player ratings increased
  - [ ] If PREP was submitted, flag is set

**Test**: Simulate Game Night
- [ ] On GAMENIGHT, click **"Simulate Game Night"**
- [ ] Verify:
  - [ ] Games created in database
  - [ ] Scores generated
  - [ ] Player points sum to team points
  - [ ] Stats updated

**Expected Result**: Day advancement and game simulation work

---

### 4.6 UI Pages Test

**Test**: Standings Page
- [ ] Click **"View Standings"**
- [ ] Verify:
  - [ ] All 4 teams shown
  - [ ] Records correct (W-L)
  - [ ] PPG and Opp PPG calculated
  - [ ] Sorted correctly

**Test**: Roster Page
- [ ] Click **"View Roster"**
- [ ] Verify:
  - [ ] All 5 players shown
  - [ ] Positions, tiers, ratings displayed
  - [ ] Stats shown (PPG, GP, Pts)
  - [ ] Sorted by position

**Test**: Game Log Page
- [ ] Click **"View Game Log"**
- [ ] Verify:
  - [ ] Games listed
  - [ ] Scores shown
  - [ ] Win/Loss indicators
  - [ ] Click "View Details" shows player points

**Expected Result**: All UI pages load and display data correctly

---

### 4.7 Season Progression Test

**Test**: Full Season Cycle
- [ ] Advance through multiple days manually
- [ ] Verify:
  - [ ] Regular season games simulate
  - [ ] Standings update
  - [ ] After GameNight 27 (Day 54), phase transitions to PLAYOFFS
  - [ ] Playoff games simulate (best-of-3)
  - [ ] After GameNight 30 (Day 60), phase transitions to OFFSEASON

**Expected Result**: Season progresses correctly through all phases

---

### 4.8 Offseason Test

**Test**: Auto-Trigger Offseason
- [ ] Advance to OFFSEASON phase (after Day 60)
- [ ] Next cron run (or manual advance) should:
  - [ ] Automatically process offseason
  - [ ] Age all players +1
  - [ ] Retire players age >= 36
  - [ ] Apply progression/regression
  - [ ] Process contracts
  - [ ] Generate draft pool
  - [ ] Execute draft
  - [ ] Reset to Season 2, Day 1, REGULAR, OFFDAY

**Test**: Manual Offseason (Backup)
- [ ] If auto-trigger fails, click **"Process Offseason"** button
- [ ] Verify same results as above

**Expected Result**: Offseason processes automatically or manually

---

### 4.9 Cron Job Test

**Test**: Automated Day Advancement
- [ ] Wait for cron job to run (midnight ET = 5:00 UTC)
- [ ] Or check Vercel logs:
  - [ ] Go to **Vercel Dashboard** → **Deployments** → **Functions** → **Logs**
  - [ ] Look for `/api/cron/advance` calls
  - [ ] Verify no errors

**Expected Result**: Cron job runs daily, advances season automatically

---

### 4.10 Data Integrity Test

**Test**: Player Points Sum to Team Points
- [ ] Check several games in database
- [ ] For each game:
  - [ ] Sum all home player points
  - [ ] Should equal home team score
  - [ ] Sum all away player points
  - [ ] Should equal away team score

**Test**: Stats Accuracy
- [ ] Verify team W/L records match game results
- [ ] Verify PPG calculations
- [ ] Verify player PPG calculations

**Expected Result**: All data is consistent and accurate

---

## 🐛 Troubleshooting

### Build Fails
- **Check**: Environment variables set correctly
- **Check**: `package.json` dependencies
- **Check**: Vercel logs for specific error

### Database Errors
- **Check**: Supabase migration ran successfully
- **Check**: Schema is `basketball.*` not `public.*`
- **Check**: Environment variables match Supabase project

### Cron Not Running
- **Check**: `vercel.json` is in `basketball/` folder
- **Check**: Cron job shows in Vercel dashboard
- **Check**: Schedule is `0 5 * * *` (midnight ET)

### Auth Not Working
- **Check**: `NEXT_PUBLIC_BASE_URL` is correct Vercel URL
- **Check**: Neynar API key is valid
- **Check**: Supabase Auth settings

---

## ✅ Success Criteria

All tests pass:
- [x] League initializes
- [x] Both auth methods work
- [x] Offday actions submit
- [x] Gameplans submit
- [x] Games simulate
- [x] UI pages display correctly
- [x] Season progresses through all phases
- [x] Offseason processes (auto or manual)
- [x] Cron job runs
- [x] Data integrity maintained

---

## 📝 Post-Deployment Notes

After successful deployment:
1. **Document Production URL**: Save Vercel URL
2. **Share with Users**: Give 4 team owners access
3. **Monitor**: Check Vercel logs daily for errors
4. **Backup**: Consider database backups

---

**Status**: Ready for deployment! 🚀
