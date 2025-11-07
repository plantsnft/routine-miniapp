# ✅ STEP 2: Test the Sync Endpoint

## What We're Doing
We're going to test the sync endpoint to make sure it can fetch casts and store them in the database.

## Step 2.1: Deploy Your Code

First, make sure your latest code is deployed to Vercel:

1. **Open terminal in your project folder**
2. **Run this command:**
   ```bash
   npx vercel --prod
   ```
3. **Wait for deployment to finish** (you'll see a URL like `https://routine-xxxxx.vercel.app`)

## Step 2.2: Get Your Deployed URL

After deployment, copy your production URL. It will look like:
```
https://routine-xxxxx.vercel.app
```

## Step 2.3: Test the Sync Endpoint

**Option A: Test in Browser (Easiest)**

1. **Open your browser**
2. **Go to this URL** (replace with your actual Vercel URL):
   ```
   https://your-app-url.vercel.app/api/creator-stats/sync
   ```
3. **You should see a JSON response** like:
   ```json
   {
     "success": true,
     "processed": 31,
     "results": [...]
   }
   ```
4. **This might take 30-60 seconds** - it's fetching casts for all 31 creators

**Option B: Test with curl (Terminal)**

```bash
curl https://your-app-url.vercel.app/api/creator-stats/sync
```

## Step 2.4: Check Supabase Tables

1. **Go to:** https://app.supabase.com
2. **Click:** Your project
3. **Click:** "Table Editor"
4. **Click on:** `creator_casts` table
5. **You should see rows of data** (casts that were stored)

6. **Click on:** `creator_metadata` table
7. **You should see rows** with FIDs, cast counts, cat names, etc.

## ✅ Success Checklist

- [ ] Sync endpoint runs without errors
- [ ] `creator_casts` table has data
- [ ] `creator_metadata` table has data with cast counts
- [ ] Some creators have cat names extracted
- [ ] Some creators have labels extracted

## ⚠️ Common Issues

**"NEYNAR_API_KEY not configured"**
- Make sure `NEYNAR_API_KEY` is set in Vercel environment variables
- Go to Vercel Dashboard → Your Project → Settings → Environment Variables
- Add it if missing, then redeploy

**"SUPABASE_URL not configured"**
- Make sure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are in Vercel
- Check Vercel Dashboard → Settings → Environment Variables

**Sync takes a long time**
- This is normal! It's processing 31 creators
- Each creator requires multiple API calls
- First sync can take 1-2 minutes

**No data in tables**
- Check browser console or Vercel logs for errors
- Make sure NEYNAR_API_KEY is correct
- Make sure Supabase credentials are correct

## 📊 What to Expect

After sync completes, you should see:
- **creator_casts table:** Hundreds of cast records
- **creator_metadata table:** 31 rows (one per creator FID)
- **cat_names:** Some creators will have cat names (depends on their casts)
- **labels:** Some creators will have labels like "off leash", "backpack", etc.
- **location:** Some creators will have locations from their profiles

## 🔍 Review the Data

Take a look at the extracted data:
1. **Check cat names** - Are they accurate?
2. **Check labels** - Do they make sense?
3. **Check location** - Is it correct?

**Don't worry if some data looks wrong** - we'll fix it manually later!

## ✅ Next Step

Once Step 2 is complete and you see data in the tables, tell me and we'll do Step 3!

---

## 🆘 Need Help?

If you see errors, check:
1. Vercel deployment logs
2. Browser console (F12)
3. Supabase table editor for data

Tell me what you see and I'll help fix it!

