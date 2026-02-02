# Phase 3: End-to-End Testing Guide

## ✅ Phase 2 Verification Results - ALL PASSED

Based on your terminal output:
- ✅ 4 profiles found with correct FIDs and admin status
- ✅ 4 teams created (Houston, Atlanta, Vegas, NYC)
- ✅ Team assignments correct (Vegas → plantsnft FID 318447)
- ✅ 20 players created (5 per team, correct distribution)
- ✅ All positions present (PG/SG/SF/PF/C)
- ✅ Season state: Season 1, Day 1, REGULAR, OFFDAY
- ✅ Stats records created

**Status: Phase 2 Complete ✅ - Ready for Phase 3**

---

## Phase 3: End-to-End Verification

### Goal
Test that the application works end-to-end from user sign-in through dashboard interaction.

### Testing Steps

#### 1. Sign In as plantsnft
**Action**: 
- Go to your deployed app: `https://basketball-kohl.vercel.app`
- Sign in using Farcaster (plantsnft account, FID 318447)

**Expected Result**:
- ✅ Sign-in succeeds
- ✅ Redirected to dashboard
- ✅ No "Team not found" error

#### 2. Verify Dashboard Displays Correctly
**Check**:
- ✅ **Vegas team** appears on dashboard
- ✅ **Season info**: Shows "Season 1, Day 1"
- ✅ **Day type**: Shows "OFFDAY"
- ✅ **Team name**: "Vegas" is displayed

**Expected Result**:
- Dashboard loads without errors
- Team information is visible

#### 3. Verify Roster/Players
**Check**:
- ✅ **5 players** are displayed
- ✅ Player names are visible (UVA 1980-1986 names)
- ✅ Player positions shown (PG, SG, SF, PF, C)
- ✅ Player tiers shown (1 Elite, 1 Great, 3 Good)
- ✅ Player ratings visible

**Expected Result**:
- All 5 players from Vegas team are displayed
- Player information is complete

#### 4. Verify Admin Controls
**Check**:
- ✅ **"Admin Controls"** section is visible
- ✅ Admin controls are accessible (not hidden)
- ✅ Can see admin action buttons

**Expected Result**:
- Admin section appears (since `is_admin: true` for plantsnft)

#### 5. Test Offday Action Submission
**Action**:
- On OFFDAY (current state), try to submit an offday action
- Choose either **TRAIN** or **PREP**

**Expected Result**:
- ✅ Submission form/button is visible
- ✅ Can submit action successfully
- ✅ Confirmation message appears
- ✅ Action is stored in database

**Verify in Database** (optional):
```sql
SELECT * FROM basketball.offday_actions 
WHERE team_id = (SELECT id FROM basketball.teams WHERE name = 'Vegas')
AND season_number = 1 AND day_number = 1;
```

#### 6. Test Gameplan Submission
**Action**:
- Try to submit a gameplan
- Set: **Offense** (Drive or Shoot), **Defense** (Zone or Man), **Mentality** (Aggressive, Balanced, or Conservative)

**Expected Result**:
- ✅ Gameplan form/buttons are visible
- ✅ Can submit gameplan successfully
- ✅ Confirmation message appears
- ✅ Gameplan is stored in database

**Verify in Database** (optional):
```sql
SELECT * FROM basketball.gameplans 
WHERE team_id = (SELECT id FROM basketball.teams WHERE name = 'Vegas')
AND season_number = 1 AND day_number = 1;
```

#### 7. Verify Next Game Info
**Check**:
- ✅ Dashboard shows **next opponent** (if applicable)
- ✅ Next game day is displayed
- ✅ Schedule information is visible

**Expected Result**:
- Next game information is displayed correctly

---

## Testing Checklist

Use this checklist as you test:

- [ ] **Sign-in works** (Farcaster login successful)
- [ ] **Dashboard loads** (no errors, no "Team not found")
- [ ] **Vegas team displayed** (correct team name)
- [ ] **5 players visible** (all roster players shown)
- [ ] **Player info complete** (names, positions, tiers, ratings)
- [ ] **Admin controls visible** (admin section appears)
- [ ] **Offday action submission works** (TRAIN or PREP)
- [ ] **Gameplan submission works** (Offense/Defense/Mentality)
- [ ] **Season info correct** (Season 1, Day 1, OFFDAY)
- [ ] **Next game info displayed** (if applicable)

---

## What to Report

After testing, report:
1. ✅ What worked
2. ❌ Any errors or issues
3. 📸 Screenshots (if helpful)
4. 🔍 Any unexpected behavior

---

## Troubleshooting

### "Team not found" Error
- **Check**: Verify team exists in database
- **Fix**: Re-run Phase 2 initialization if needed

### Admin Controls Not Visible
- **Check**: Verify `is_admin: true` in profile
- **Fix**: Update profile in database if needed

### Cannot Submit Actions
- **Check**: Verify it's an OFFDAY (current state shows OFFDAY)
- **Check**: Verify cutoff time validation (before midnight ET)
- **Check**: Browser console for errors

### Players Not Showing
- **Check**: Verify players exist for Vegas team in database
- **Fix**: Re-run Phase 2 if needed

---

## Next Steps After Phase 3

Once Phase 3 is complete:
- ✅ All basic functionality verified
- ✅ Ready for gameplay testing (Phase 4)
- ✅ Ready for game simulation testing (Phase 5)
- ✅ Ready for cron job testing (Phase 6)

---

## Quick Database Verification

If you want to verify data before testing, run:

```bash
node scripts/check-state.mjs
```

This will show:
- Current season state
- All teams
- Player counts

---

**Ready to start Phase 3 testing!** 🚀
