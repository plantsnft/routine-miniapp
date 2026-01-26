# Phase 1 Verification Checklist

## ✅ Phase 1 Requirements (from SoT)

### 1. Next.js app scaffold in `basketball/` folder ✅
- [x] package.json created
- [x] tsconfig.json created
- [x] next.config.ts created
- [x] tailwind.config.ts created
- [x] postcss.config.mjs created
- [x] .gitignore created

### 2. Supabase project + `basketball` schema + tables ✅
- [x] `supabase_migration_basketball_schema.sql` created
- [x] All 10 tables defined:
  - [x] profiles (supports both auth types)
  - [x] teams (with prep_boost_active)
  - [x] players
  - [x] season_state
  - [x] gameplans
  - [x] offday_actions
  - [x] team_season_stats
  - [x] player_season_stats
  - [x] games
  - [x] game_player_lines
- [x] RLS policies configured
- [x] Foreign keys and constraints

### 3. Neynar SIWN login ✅
- [x] `src/lib/auth.ts` - signInWithFarcaster() using SDK
- [x] `src/app/api/auth/siwn/route.ts` - SIWN verification
- [x] Uses `sdk.actions.signIn()` from Farcaster SDK
- [x] MiniAppInitializer component added

### 4. Supabase email login ✅
- [x] `src/lib/auth.ts` - signInWithEmail()
- [x] `src/app/auth/callback/route.ts` - Magic link callback
- [x] Profile creation on callback

### 5. Create profile record on first login ✅
- [x] `src/app/api/auth/profile/route.ts` - Profile creation endpoint
- [x] Supports both auth types (farcaster/email)
- [x] Checks for existing profile before creating

### 6. Hardcode `is_admin=true` for all profiles ✅
- [x] Schema default: `is_admin boolean NOT NULL DEFAULT true`
- [x] Profile creation sets `is_admin: true`

### 7. Build minimal UI shell ✅
- [x] `src/app/layout.tsx` - Root layout with MiniAppInitializer
- [x] `src/app/page.tsx` - Home (redirects to login)
- [x] `src/app/login/page.tsx` - Login page with both auth options
- [x] `src/app/dashboard/page.tsx` - Dashboard placeholder
- [x] `src/app/globals.css` - Basic styles

### 8. Create `basketballDb.ts` helper with schema isolation ✅
- [x] `src/lib/basketballDb.ts` created
- [x] Uses `Accept-Profile: basketball` and `Content-Profile: basketball` headers
- [x] Table name validation (safety rail)
- [x] CRUD operations: fetch, insert, upsert, update, delete

## ✅ Additional Files Created

- [x] `src/lib/constants.ts` - App constants, team names, UVA players
- [x] `src/lib/neynar.ts` - Neynar client and FID fetching
- [x] `src/components/MiniAppInitializer.tsx` - SDK initialization
- [x] `.env.local.example` - Environment variables template

## ⚠️ What You Need to Do

### 1. Run Database Migration
**Action Required**: Run the SQL migration in your existing Supabase project

**IMPORTANT**: Use your existing "Catwalk Ai Agent" Supabase project (the one you're already using)

1. Go to your Supabase dashboard: https://supabase.com/dashboard
2. Select the **"Catwalk Ai Agent"** project (the one you're currently using)
3. Navigate to **SQL Editor**
4. Copy and paste the **entire contents** of `basketball/supabase_migration_basketball_schema.sql`
5. Click **Run** to execute the migration
6. Verify all tables were created in the `basketball` schema (not `public` schema)
   - You should see 10 new tables in the `basketball` schema
   - Your existing `public.*` tables (like `catwalk_creators`) remain untouched

### 2. Set Up Environment Variables
**Action Required**: Create `.env.local` file

**IMPORTANT**: Use the SAME Supabase credentials as your catwalk app (same project)

1. Copy `.env.local.example` to `.env.local` in the `basketball/` folder
2. Fill in your values (use the same Supabase values as catwalk):
   - `NEXT_PUBLIC_SUPABASE_URL` - **Same as catwalk app** (your "Catwalk Ai Agent" project URL)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` - **Same as catwalk app** (from "Catwalk Ai Agent" project)
   - `SUPABASE_SERVICE_ROLE` - **Same as catwalk app** (from "Catwalk Ai Agent" project)
   - `NEYNAR_API_KEY` - **Same as catwalk app** (if you have one, or get a new one)
   - `APP_NAME` - "Basketball Sim" (or customize)
   - `APP_DESCRIPTION` - "Daily basketball team simulation game"
   - `NEXT_PUBLIC_BASE_URL` - http://localhost:3000 (or your Vercel URL when deployed)

### 3. Install Dependencies
**Action Required**: Install npm packages

```bash
cd basketball
npm install
```

### 4. Test the App
**Action Required**: Run and test locally

```bash
npm run dev
```

Then:
- Visit http://localhost:3000
- Should redirect to /login
- Test Farcaster login (requires Warpcast)
- Test Email login (will send magic link)

## ✅ Verification

All Phase 1 requirements are complete:
- ✅ Next.js scaffold
- ✅ Database schema (ready to run)
- ✅ Auth (Farcaster + Email)
- ✅ Profile creation
- ✅ UI shell
- ✅ Database helper with isolation

**Status**: Phase 1 is complete and ready for testing!
