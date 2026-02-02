# Quick Deployment Checklist

## 🚀 Deploy in 5 Steps

### Step 1: Create New GitHub Repo & Push ✅
1. Create new GitHub repository: `basketball` (Private)
2. Initialize git in basketball folder:
```powershell
cd c:\miniapps\routine\basketball
git init
git add .
git commit -m "feat: Complete basketball app MVP"
git remote add origin https://github.com/plantsnft/basketball.git
git branch -M main
git push -u origin main
```

### Step 2: Supabase Migration ✅
- [ ] Open Supabase Dashboard → SQL Editor
- [ ] Copy contents of `basketball/supabase_migration_basketball_schema.sql`
- [ ] Paste and Run
- [ ] Verify `basketball` schema exists with 10 tables

### Step 3: Vercel Project Setup ✅
- [ ] Create new Vercel project
- [ ] Import from GitHub: Select `basketball` repository
- [ ] **Root Directory**: `.` ⚠️ CRITICAL (root of this repo, not a subdirectory)
- [ ] Add environment variables (see below)
- [ ] Deploy

### Step 4: Environment Variables ✅
Add these in Vercel (Project Settings → Environment Variables):

```
NEXT_PUBLIC_SUPABASE_URL=https://your-catwalk-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE=your-service-role-key
NEYNAR_API_KEY=your-neynar-api-key
APP_NAME=Basketball Sim
APP_DESCRIPTION=Daily basketball team simulation game
NEXT_PUBLIC_BASE_URL=https://your-vercel-url.vercel.app
```

**Note**: Update `NEXT_PUBLIC_BASE_URL` after first deploy with your Vercel URL.

### Step 5: Production Testing ✅
- [ ] Open app URL
- [ ] Initialize league
- [ ] Test login (Farcaster + Email)
- [ ] Submit offday action
- [ ] Submit gameplan
- [ ] Advance day manually
- [ ] Simulate game
- [ ] Check standings/roster/games pages
- [ ] Verify cron job in Vercel dashboard

---

## 📋 Full Testing Checklist

See `DEPLOYMENT_PLAN.md` for detailed testing steps.

---

## ⚠️ Common Issues

**Build fails?**
- Check environment variables are set
- Check Root Directory is `basketball`

**Database errors?**
- Verify migration ran
- Check schema is `basketball.*`

**Cron not running?**
- Check `vercel.json` is in `basketball/` folder
- Verify cron shows in Vercel dashboard

---

**Ready to deploy!** 🎯
