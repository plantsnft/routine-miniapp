# Farcaster Mini App - End-to-End Testing Checklist

## ✅ Completed Steps
- [x] Manifest URLs updated in Farcaster Dashboard
- [x] Environment variables added to Vercel
- [x] App redeployed
- [x] Images exist (`icon.png`, `image.png`, `splash.png`)

---

## 🔍 Step 1: Verify Technical Setup

### 1.1 Test Manifest Redirect
**Test**: Verify the redirect route works
```bash
curl -I https://basketball-kohl.vercel.app/.well-known/farcaster.json
```
**Expected**: `HTTP/2 307` redirect to Farcaster hosted manifest

**If it fails**: Check Vercel deployment logs, verify route file exists

---

### 1.2 Verify Images Are Accessible
**Test**: Check if images load
- `https://basketball-kohl.vercel.app/icon.png`
- `https://basketball-kohl.vercel.app/image.png`
- `https://basketball-kohl.vercel.app/splash.png`

**Expected**: Images load (not 404)

**If 404**: Images might not be in `public/` folder or not deployed

---

### 1.3 Verify Environment Variables
**Test**: Check if app can connect to services
- Visit: `https://basketball-kohl.vercel.app/login`
- Check browser console for errors
- Check Vercel function logs

**Expected**: No Supabase/Neynar connection errors

**If errors**: Verify env vars are set correctly in Vercel Dashboard

---

## 🎯 Step 2: Test Farcaster Integration

### 2.1 Discover Mini App in Warpcast
**Test**: 
1. Open Warpcast app
2. Go to Mini Apps section
3. Search for "Basketball" or browse Mini Apps
4. Your app should appear with icon and description

**Expected**: App appears in Mini Apps list

**If not visible**: 
- Wait a few minutes (Farcaster may need to refresh)
- Check Farcaster Dashboard → verify manifest is published
- Verify redirect route works (Step 1.1)

---

### 2.2 Open Mini App in Warpcast
**Test**:
1. Click on your Basketball Mini App in Warpcast
2. App should open in Warpcast's in-app browser

**Expected**: 
- App loads without errors
- Login page displays
- No blank screen or error messages

**If fails**: Check Vercel deployment status, verify app URL is correct

---

## 🔐 Step 3: Test Authentication

### 3.1 Test Farcaster Login
**Test**:
1. In Warpcast, open your Mini App
2. Click "Sign in with Farcaster"
3. Complete sign-in flow

**Expected**:
- Sign-in completes successfully
- Redirects to dashboard
- User profile created in database

**If fails**: 
- Check `NEYNAR_API_KEY` is set correctly
- Check Vercel function logs for errors
- Verify Neynar API key has correct permissions

---

### 3.2 Test Email Login
**Test**:
1. Open app in browser (not Warpcast): `https://basketball-kohl.vercel.app/login`
2. Click "Sign in with Email"
3. Enter email address
4. Check email for magic link
5. Click magic link

**Expected**:
- Magic link email received
- Clicking link redirects to dashboard
- User profile created

**If fails**:
- Check `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set
- Check Supabase email settings (SMTP configured)
- Check Vercel function logs

---

## 🏀 Step 4: Test Core App Functionality

### 4.1 Initialize League (Admin Only)
**Test**:
1. Login as admin (first user or user with `is_admin=true`)
2. Go to dashboard
3. Click "Initialize League" button (if visible)
4. OR call API directly: `POST https://basketball-kohl.vercel.app/api/admin/initialize`

**Expected**:
- League initializes successfully
- 4 teams created
- 20 players created (5 per team)
- Season state created (Day 1, OFFDAY, Phase 1)
- Success message displayed

**If fails**:
- Check database schema exists (`basketball.*` tables)
- Check `SUPABASE_SERVICE_ROLE` is set correctly
- Check Vercel function logs for database errors

---

### 4.2 View Dashboard
**Test**:
1. After login, dashboard should load
2. Should show:
   - Season number
   - Day number
   - Phase
   - Day type (OFFDAY or GAMENIGHT)
   - Your team name
   - Offday action buttons (if OFFDAY)
   - Gameplan submission UI
   - Navigation buttons

**Expected**: Dashboard displays all information correctly

**If fails**: Check API endpoints are working (`/api/season-state`, `/api/teams`, etc.)

---

### 4.3 Submit Offday Action
**Test**:
1. Ensure current day is OFFDAY (Day 1 should be OFFDAY after init)
2. Click "TRAIN" or "PREP" button
3. Button should disable after submission

**Expected**:
- Action submits successfully
- Success message appears
- Button shows current selection
- Action saved to database

**If fails**: 
- Check cutoff time validation (must be before midnight ET)
- Check API endpoint `/api/offday-actions`
- Check database connection

---

### 4.4 Submit Gameplan
**Test**:
1. On dashboard, set gameplan:
   - Offense: Drive or Shoot
   - Defense: Zone or Man
   - Mentality: Aggressive, Conservative, or Neutral
2. Submit gameplan

**Expected**:
- Gameplan submits successfully
- Success message appears
- Current selections displayed
- Gameplan saved to database

**If fails**: 
- Check cutoff time validation
- Check API endpoint `/api/gameplans`
- Verify next game day calculation

---

### 4.5 Advance Day (Admin)
**Test**:
1. Call admin advance endpoint: `POST https://basketball-kohl.vercel.app/api/admin/advance`
2. OR use dashboard admin controls (if visible)

**Expected**:
- Day advances (Day 1 → Day 2)
- Day type alternates (OFFDAY → GAMENIGHT)
- Season state updates in database

**If fails**: Check admin endpoint, verify user is admin

---

### 4.6 Simulate Game (Admin)
**Test**:
1. Ensure day_type is GAMENIGHT
2. Call simulate endpoint: `POST https://basketball-kohl.vercel.app/api/admin/simulate`
3. OR use dashboard admin controls

**Expected**:
- Games are simulated
- Scores generated
- Player points calculated
- Stats updated
- Games saved to database

**If fails**: 
- Check day_type is GAMENIGHT
- Check gameplans exist (or defaults applied)
- Check game simulation logic

---

### 4.7 View Standings
**Test**:
1. Click "View Standings" on dashboard
2. OR visit: `https://basketball-kohl.vercel.app/standings`

**Expected**:
- Standings table displays
- All 4 teams shown
- Stats displayed (W, L, W%, PPG, Opp PPG)
- Sorted by wins

**If fails**: Check `/api/standings` endpoint

---

### 4.8 View Roster
**Test**:
1. Click "View Roster" on dashboard
2. OR visit: `https://basketball-kohl.vercel.app/roster`

**Expected**:
- Roster table displays
- All 5 players for your team shown
- Player stats displayed
- Sorted by position

**If fails**: Check `/api/roster` endpoint

---

### 4.9 View Game Log
**Test**:
1. Click "View Game Log" on dashboard
2. OR visit: `https://basketball-kohl.vercel.app/games`

**Expected**:
- Game log displays
- All games shown (or filtered by team)
- Game details available
- Click "View Details" shows player points

**If fails**: Check `/api/games` endpoint

---

## ⚠️ Step 5: Verify Webhook (Optional)

**Note**: The manifest references `/api/webhook` but this endpoint doesn't exist yet. This is **optional** for MVP.

**If you want to implement it later**:
- Create `src/app/api/webhook/route.ts`
- Handle Farcaster webhook events (if needed)
- For MVP, you can leave it as 404 or create a placeholder

**Current Status**: Webhook endpoint not implemented (not critical for MVP)

---

## 📋 Summary Checklist

### Critical (Must Work):
- [ ] Manifest redirect works (307)
- [ ] Images load (icon, image, splash)
- [ ] App opens in Warpcast
- [ ] Farcaster login works
- [ ] Email login works
- [ ] League initialization works
- [ ] Dashboard loads
- [ ] Offday action submission works
- [ ] Gameplan submission works
- [ ] Day advancement works
- [ ] Game simulation works

### Important (Should Work):
- [ ] Standings page works
- [ ] Roster page works
- [ ] Game log page works
- [ ] Admin controls visible (if admin)

### Optional (Nice to Have):
- [ ] Webhook endpoint (not implemented yet)
- [ ] Cron job runs automatically (verify in Vercel dashboard)

---

## 🚨 Common Issues & Fixes

### Issue: App doesn't appear in Warpcast
**Fix**: 
- Wait 5-10 minutes for Farcaster to refresh
- Verify redirect route works
- Check Farcaster Dashboard → manifest is published

### Issue: Login fails
**Fix**:
- Check `NEYNAR_API_KEY` is set (for Farcaster)
- Check Supabase env vars are set (for Email)
- Check Vercel function logs for errors

### Issue: Database errors
**Fix**:
- Verify `basketball` schema exists in Supabase
- Check `SUPABASE_SERVICE_ROLE` is set correctly
- Run database migration if needed

### Issue: Images 404
**Fix**:
- Verify images are in `public/` folder
- Check images are committed to git
- Redeploy on Vercel

---

## ✅ Next Steps After Testing

Once all critical items pass:
1. **Share with users**: Give them the Warpcast Mini App link
2. **Monitor**: Check Vercel logs for errors
3. **Iterate**: Fix any issues found during testing

---

**Ready to test!** Start with Step 1 and work through each section systematically.
