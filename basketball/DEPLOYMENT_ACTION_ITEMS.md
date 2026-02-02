# Deployment Action Items - What You Need To Do

## ✅ What I've Done

1. ✅ Verified no hardcoded secrets in code
2. ✅ Verified `.gitignore` excludes `.env.local`
3. ✅ Staged all basketball files for commit
4. ✅ Prepared deployment plan

---

## 🎯 What You Need To Do (In Order)

### Step 1: Commit & Push to Git ⚠️ **DO THIS FIRST**

I've staged the files. You need to commit and push:

```powershell
cd c:\miniapps\routine
git commit -m "feat: Complete basketball app MVP - all phases 1-7, UI, APIs, auto-offseason, cutoff validation"
git push origin master
```

**Verify**: Check your Git provider (GitHub/GitLab) to confirm files are pushed.

---

### Step 2: Supabase Migration ⚠️ **REQUIRED**

**You need to run the SQL migration:**

1. **Go to Supabase Dashboard**:
   - Open your "Catwalk Ai Agent" Supabase project
   - Navigate to **SQL Editor**

2. **Run Migration**:
   - Open file: `c:\miniapps\routine\basketball\supabase_migration_basketball_schema.sql`
   - Copy **entire contents**
   - Paste into Supabase SQL Editor
   - Click **Run**

3. **Verify**:
   - Go to **Table Editor**
   - Check that `basketball` schema exists
   - Should see 10 tables in `basketball` schema

**Status**: ⏳ **Waiting for you to run migration**

---

### Step 3: Vercel Project Setup ⚠️ **REQUIRED**

**You need to create Vercel project:**

1. **Go to**: https://vercel.com/dashboard

2. **Add New Project**:
   - Click **Add New** → **Project**
   - Import your Git repository (the one with `basketball/` folder)

3. **Configure Settings**:
   - **Project Name**: `basketball` (or your choice)
   - **Root Directory**: `basketball` ⚠️ **CRITICAL - Must be `basketball`, not root**
   - **Framework**: Next.js (auto-detected)
   - **Build Command**: `npm run build` (default)
   - **Output Directory**: `.next` (default)

4. **Add Environment Variables** (Before deploying):
   - Click **Environment Variables** section
   - Add these 7 variables (see values needed below):

   ```
   NEXT_PUBLIC_SUPABASE_URL=???
   NEXT_PUBLIC_SUPABASE_ANON_KEY=???
   SUPABASE_SERVICE_ROLE=???
   NEYNAR_API_KEY=???
   APP_NAME=Basketball Sim
   APP_DESCRIPTION=Daily basketball team simulation game
   NEXT_PUBLIC_BASE_URL=https://your-vercel-url.vercel.app
   ```

5. **Deploy**:
   - Click **Deploy**
   - Wait for build

6. **After First Deploy**:
   - Copy your Vercel URL (e.g., `basketball-xxx.vercel.app`)
   - Update `NEXT_PUBLIC_BASE_URL` env var to: `https://basketball-xxx.vercel.app`
   - Redeploy

**Status**: ⏳ **Waiting for you to create Vercel project**

---

### Step 4: Environment Variables ⚠️ **NEED VALUES FROM YOU**

**I need these values from you:**

1. **Supabase (Same as your catwalk app)**:
   - `NEXT_PUBLIC_SUPABASE_URL` = `???`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `???`
   - `SUPABASE_SERVICE_ROLE` = `???`

2. **Neynar**:
   - `NEYNAR_API_KEY` = `???`

3. **App Config** (I can set defaults):
   - `APP_NAME` = `Basketball Sim` ✅ (I'll set this)
   - `APP_DESCRIPTION` = `Daily basketball team simulation game` ✅ (I'll set this)
   - `NEXT_PUBLIC_BASE_URL` = `???` (Set after Vercel deploy)

**Action**: Please provide the 4 values marked with `???` above.

---

## 📋 Summary Checklist

**What I've Done**:
- [x] Verified code is ready
- [x] Staged files for commit
- [x] Created deployment plan

**What You Need To Do**:
- [ ] **Step 1**: Commit & push to Git
- [ ] **Step 2**: Run Supabase migration
- [ ] **Step 3**: Create Vercel project (with Root Directory = `basketball`)
- [ ] **Step 4**: Provide environment variable values
- [ ] **Step 5**: Test in production

---

## 🚀 Quick Start Commands

**After you provide env vars, here's what happens:**

1. You commit & push ✅
2. You run Supabase migration ✅
3. You create Vercel project with env vars ✅
4. Vercel builds & deploys ✅
5. You test in production ✅

---

**Next**: Please provide the 4 environment variable values, then I'll guide you through the rest!
