# Poker Mini App - Deployment Guide

This guide covers:
1. Setting up super owner access (FID 318447)
2. Preparing GitHub
3. Deploying to Vercel

---

## PART 1: Grant FID 318447 Owner/Admin Access

### Step 1: Auto-Seed Clubs and Super Owner (Single-Step Process)

The seeding route now automatically:
- Creates Hellfire & Burrfriends clubs if they don't exist
- Ensures original owners (Tormental & Burr) are in club_members
- Adds FID 318447 as owner/admin of both clubs

**To seed everything:**

1. Make sure your dev server is running:
   ```bash
   cd C:\miniapps\routine\poker
   npm run dev
   ```

2. Send a POST request to the seeding endpoint:
   
   **Using Browser Console (Easiest):**
   - Open your browser and navigate to `http://localhost:3000`
   - Open Developer Console (F12)
   - Run this:
   ```javascript
   fetch('/api/admin/seed-super-owner', { method: 'POST' })
     .then(r => r.json())
     .then(console.log)
   ```
   
   **Using curl:**
   ```bash
   curl -X POST http://localhost:3000/api/admin/seed-super-owner
   ```
   
   **Using Postman/HTTP Client:**
   - POST to `http://localhost:3000/api/admin/seed-super-owner`
   - No body required

3. Expected response:
   ```json
   {
     "ok": true,
     "data": {
       "status": "seeded",
       "message": "Clubs and memberships seeded successfully. Super owner (FID 318447) has access to both clubs."
     }
   }
   ```

4. The route is **idempotent** - you can call it multiple times safely. It will:
   - Create clubs only if they don't exist
   - Update memberships if they already exist
   - Never create duplicates

**Note:** This replaces the need for manual SQL. The route handles everything automatically.

### Step 2: Verify Access

1. Sign in with FID 318447 in your local app
2. Navigate to `/clubs`
3. Verify you see owner controls for both:
   - Hellfire Club
   - Burrfriends
4. Test creating a game for each club
5. Verify you can access the owner portal (`/games/[id]/manage`) for games in both clubs

---

## PART 2: Prepare GitHub

### Step 1: Verify .gitignore

The root `.gitignore` already covers:
- `node_modules/`
- `.env.local`
- `.next/`
- `.vercel/`

This will automatically ignore Poker app artifacts. No changes needed.

### Step 2: Stage and Commit Poker App

**Run these commands in your terminal:**

```bash
cd C:\miniapps\routine

# Stage only the poker directory
git add poker/

# Review what will be committed
git status

# Commit the Poker app
git commit -m "Add Poker mini app (ClubGG management for Hellfire & Burrfriends)"
```

### Step 3: Set Up GitHub Remote

**If you don't have a GitHub remote yet:**

1. Go to https://github.com and log in
2. Click "New repository"
3. Create a repository (e.g., `routine-miniapp` or `poker-miniapp`)
4. **Do NOT initialize with README, .gitignore, or license** (since you already have files)
5. Copy the repository URL (e.g., `https://github.com/YOUR_USERNAME/REPO_NAME.git`)

**Then run:**

```bash
cd C:\miniapps\routine

# Add remote (only if no remote exists)
git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git

# Push to GitHub
git push -u origin main
```

**If you already have a remote:**

```bash
cd C:\miniapps\routine

# Check existing remote
git remote -v

# Push to existing remote
git push origin main
```

**Note:** If your default branch is `master` instead of `main`, replace `main` with `master` in the commands above.

---

## PART 3: Deploy to Vercel

### Prerequisites

- GitHub repository is set up and pushed (from Part 2)
- Your Vercel account is logged in

### Build Configuration

The Poker app uses:
- **Build Command:** `npm run build`
- **Dev Command:** `npm run dev`
- **Root Directory:** `poker` (set in Vercel UI)
- **Framework:** Next.js (auto-detected)

### Step-by-Step Vercel Deployment

1. **Go to Vercel Dashboard**
   - Visit https://vercel.com
   - Log in with your GitHub account

2. **Create New Project**
   - Click "Add New..." → "Project"
   - Find and select your repository from the list
   - Click "Import"

3. **Configure Project**
   - **Framework Preset:** Next.js (should auto-detect)
   - **Root Directory:** Set to `poker` (this is critical!)
     - Click "Edit" next to Root Directory
     - Type: `poker`
     - Click "Continue"

4. **Environment Variables**
   Add all variables from your `poker/.env.local` file (see `.env.local.example` for reference):
   
   **Required:**
   - `NEXT_PUBLIC_SUPABASE_URL` = (your Supabase project URL)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (your Supabase anon key)
   - `SUPABASE_SERVICE_ROLE` = (your Supabase service role key)
   - `NEYNAR_API_KEY` = (your Neynar API key)
   - `NEYNAR_CLIENT_ID` = (your Neynar client ID)
   - `HELLFIRE_OWNER_FID` = (Tormental's FID number)
   - `BURRFRIENDS_OWNER_FID` = (Burr's FID number)
   
   **Optional:**
   - `NEXT_PUBLIC_APP_NAME` = `Farcaster Poker`
   - `NEXT_PUBLIC_APP_DESCRIPTION` = `Hellfire & Burrfriends ClubGG manager`
   - `NEXT_PUBLIC_FARCASTER_NETWORK` = `mainnet`
   - `NEXT_PUBLIC_BASE_URL` = (leave empty, Vercel will auto-fill)
   - `SEED_PHRASE` = (only if needed for casts/notifications)
   - `SPONSOR_SIGNER` = `true` (only if using SEED_PHRASE)

5. **Project Name**
   - Set a clear name like: `poker-miniapp` or `clubgg-poker-farcaster`
   - This ensures it's separate from your Catwalk/Routine project

6. **Deploy**
   - Click "Deploy"
   - Wait for the build to complete (usually 2-5 minutes)

### Post-Deployment Verification

1. **Check Deployment URL**
   - Vercel will provide a URL like `https://poker-miniapp.vercel.app`
   - Copy this URL

2. **Seed Clubs and Super Owner in Production**
   - Open your deployment URL in a browser
   - Open the browser console (F12)
   - Run:
     ```javascript
     fetch('/api/admin/seed-super-owner', { method: 'POST' })
       .then(r => r.json())
       .then(console.log)
     ```
   - Expected response: `{"ok": true, "data": {"status": "seeded", ...}}`
   - This automatically creates clubs and sets up all memberships in production

3. **Verify Poker App**
   - Sign in with Farcaster
   - Test the following:
     - ✅ Clubs page shows Hellfire and Burrfriends
     - ✅ Owner controls are visible (if signed in as owner)
     - ✅ Can create games
     - ✅ Can access game management portal
     - ✅ Can create announcements

**Note:** The seeding route is idempotent - you can call it multiple times safely. It will create clubs only if they don't exist and update memberships if needed.

---

## Summary of Changes Made

### Code Changes (All in `poker/` directory):

1. **Added Super Owner Constant**
   - `poker/src/lib/constants.ts`: Added `SUPER_OWNER_FID = 318447`

2. **Created Permission Helper**
   - `poker/src/lib/permissions.ts`: New file with `isClubOwnerOrAdmin()` function

3. **Updated All Owner Checks**
   - All API routes now use `isClubOwnerOrAdmin()` instead of direct `owner_fid` comparisons
   - All UI components updated to use the permission helper
   - Updated files:
     - `poker/src/app/api/games/route.ts`
     - `poker/src/app/api/games/[id]/participants/route.ts`
     - `poker/src/app/api/games/[id]/results/route.ts`
     - `poker/src/app/api/clubs/[id]/announcements/route.ts`
     - `poker/src/app/clubs/page.tsx`
     - `poker/src/app/clubs/[slug]/games/page.tsx`
     - `poker/src/app/clubs/[slug]/games/new/page.tsx`
     - `poker/src/app/clubs/[slug]/announcements/page.tsx`
     - `poker/src/app/games/[id]/page.tsx`
     - `poker/src/app/games/[id]/manage/page.tsx`

4. **Created Database Seeding Route**
   - `poker/src/app/api/admin/seed-super-owner/route.ts`: API route that auto-creates clubs and seeds all memberships

### How Permissions Work Now:

- **Super Owner (FID 318447)**: Has full owner access to ALL clubs (Hellfire and Burrfriends)
- **Original Owners**: Tormental (Hellfire) and Burr (Burrfriends) retain their ownership
- **Permission Logic**: The `isClubOwnerOrAdmin()` function checks:
  1. Is the viewer the super owner? → Grant access
  2. Is the viewer the club owner? → Grant access
  3. Otherwise → Deny access

---

## Next Steps & Recommendations

1. **Test Thoroughly**
   - Test all owner functions as FID 318447
   - Verify original owners still have access
   - Test game creation, participant management, announcements

2. **Future Enhancements**
   - Replace Betrmint stub with real API integration
   - Upgrade password encryption (currently base64)
   - Add push notifications for announcements
   - Enhance RLS policies for production security

3. **Monitoring**
   - Set up Vercel monitoring/alerts
   - Monitor Supabase usage and costs
   - Track game creation and participation metrics

---

## Troubleshooting

**Issue: Super owner not showing as owner in UI**
- Check database: Run GET `/api/admin/seed-super-owner` to verify membership
- Ensure you're signed in with FID 318447
- Clear browser cache/localStorage

**Issue: Vercel build fails**
- Check Root Directory is set to `poker`
- Verify all environment variables are set
- Check build logs for specific errors

**Issue: Permission denied errors**
- Verify `isClubOwnerOrAdmin()` is being called correctly
- Check that FID 318447 is in `club_members` table with `role='owner'`
- Ensure you're passing the correct FID in API requests

---

## Quick Test Plan

After making changes, test the auto-seeding functionality:

### Local Testing:

1. **Start the dev server:**
   ```bash
   cd C:\miniapps\routine\poker
   npm run dev
   ```

2. **Check current status (GET):**
   - Open browser console (F12) on `http://localhost:3000`
   - Run:
   ```javascript
   fetch('/api/admin/seed-super-owner')
     .then(r => r.json())
     .then(console.log)
   ```
   - Should show club existence and membership status

3. **Run the seeding (POST):**
   ```javascript
   fetch('/api/admin/seed-super-owner', { method: 'POST' })
     .then(r => r.json())
     .then(console.log)
   ```
   - Expected response: `{"ok": true, "data": {"status": "seeded", ...}}`

4. **Verify in the app:**
   - Sign in with FID 318447
   - Navigate to `/clubs`
   - ✅ Both Hellfire and Burrfriends should appear
   - ✅ Owner controls should be visible for both clubs
   - ✅ Can click "View Games" for both
   - ✅ Can create games for both clubs
   - ✅ Can access game management portals

5. **Test idempotency:**
   - Call POST `/api/admin/seed-super-owner` again
   - Should return success without errors (idempotent)

6. **Optional - Verify database:**
   - Check Supabase dashboard:
     - `clubs` table should have 2 rows (Hellfire, Burrfriends)
     - `club_members` table should have 4 rows:
       - Hellfire owner (from env)
       - Burrfriends owner (from env)
       - FID 318447 for Hellfire
       - FID 318447 for Burrfriends

The seeding route now handles everything automatically - no manual SQL required!
