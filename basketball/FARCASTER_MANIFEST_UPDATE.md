# Farcaster Manifest Update Guide

## ✅ Current Status
- Domain updated in Farcaster Dashboard: `basketball-kohl.vercel.app` ✅
- Manifest redirect route created: `/.well-known/farcaster.json` ✅

## ⚠️ Action Required: Update Manifest URLs

The manifest JSON you provided still has `basketball-xyz.vercel.app` in the URLs. You need to update these in the **Farcaster Dashboard**:

### URLs to Update:
1. **Icon URL**: `https://basketball-kohl.vercel.app/icon.png`
2. **Home URL**: `https://basketball-kohl.vercel.app`
3. **Image URL**: `https://basketball-kohl.vercel.app/image.png`
4. **Splash Image URL**: `https://basketball-kohl.vercel.app/splash.png`
5. **Webhook URL**: `https://basketball-kohl.vercel.app/api/webhook`

### How to Update:
1. Go to Farcaster Dashboard → Manage Manifests
2. Edit your manifest (ID: `019bfe38-2418-754c-e284-767d848ced1a`)
3. Update all URLs from `basketball-xyz.vercel.app` to `basketball-kohl.vercel.app`
4. Save changes

---

## 🔑 Required Environment Variables

You currently only have `NEXT_PUBLIC_BASE_URL` set. **You need these additional env vars for the app to work:**

### ✅ Required (Must Have):
```
NEXT_PUBLIC_SUPABASE_URL=https://your-catwalk-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE=your-service-role-key
NEYNAR_API_KEY=your-neynar-api-key
NEXT_PUBLIC_BASE_URL=https://basketball-kohl.vercel.app  ✅ (you have this)
```

### ⚠️ Why These Are Required:
- **Supabase URLs/Keys**: Database connection (app won't work without this)
- **Neynar API Key**: Farcaster authentication (login won't work without this)

### 📝 Optional (Have Defaults):
```
APP_NAME=Basketball Sim  (defaults to "Basketball Sim" if not set)
APP_DESCRIPTION=Daily basketball team simulation game  (has default)
```

### 🔒 Optional (Security):
```
CRON_SECRET=your-secret-key  (recommended for production to protect cron endpoint)
```

---

## 📋 Quick Checklist

- [ ] Update manifest URLs in Farcaster Dashboard (change `basketball-xyz` → `basketball-kohl`)
- [ ] Add `NEXT_PUBLIC_SUPABASE_URL` to Vercel env vars
- [ ] Add `NEXT_PUBLIC_SUPABASE_ANON_KEY` to Vercel env vars
- [ ] Add `SUPABASE_SERVICE_ROLE` to Vercel env vars
- [ ] Add `NEYNAR_API_KEY` to Vercel env vars
- [ ] (Optional) Add `APP_NAME` and `APP_DESCRIPTION` to Vercel env vars
- [ ] Redeploy on Vercel after adding env vars
- [ ] Test the redirect: `curl -I https://basketball-kohl.vercel.app/.well-known/farcaster.json`
- [ ] Test Mini App in Warpcast

---

## 🚨 Critical: Without These Env Vars

**The app will fail with errors:**
- ❌ Database queries will fail (no Supabase connection)
- ❌ Farcaster login will fail (no Neynar API key)
- ❌ Email login will fail (no Supabase auth)

**Get these values from:**
- **Supabase**: Same values as your catwalk app (Dashboard → Project Settings → API)
- **Neynar**: Your Neynar API key (from Neynar dashboard)
