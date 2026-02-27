# Deploy Rebranded Poker Lobby to Vercel

## ✅ Pre-Deployment Checklist

### 1. Code Changes Complete
- ✅ Build passes (`npm run build`)
- ✅ All rebranding changes committed
- ✅ No build errors

### 2. Database Migration (IMPORTANT!)
**Before deploying, you need to update the database:**

Run the migration script OR manually update in Supabase:

**Option A: Run Migration Script**
```powershell
cd C:\miniapps\routine\poker
$env:SUPABASE_URL="https://your-project.supabase.co"
$env:SUPABASE_SERVICE_ROLE="your-service-role-key"
npm run migrate:rebrand
```

**Option B: Manual SQL Update (Supabase Dashboard)**
```sql
-- Update the club
UPDATE poker.clubs 
SET 
  slug = 'sias-poker-room',
  name = 'SIAs Poker Room',
  description = 'SIAs Poker Room'
WHERE slug = 'hellfire';

-- Ensure both owners are in club_members
INSERT INTO poker.club_members (club_id, member_fid, role, status)
SELECT 
  id,
  273708,
  'owner',
  'active'
FROM poker.clubs
WHERE slug = 'sias-poker-room'
ON CONFLICT (club_id, member_fid) 
DO UPDATE SET role = 'owner', status = 'active';
```

### 3. Vercel Environment Variables
Verify these are set in Vercel (Settings → Environment Variables):

**Required:**
- ✅ `NEXT_PUBLIC_SUPABASE_URL`
- ✅ `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- ✅ `SUPABASE_SERVICE_ROLE`
- ✅ `NEYNAR_API_KEY`
- ✅ `NEXT_PUBLIC_BASE_URL` (should be `https://poker-swart.vercel.app`)
- ✅ `HELLFIRE_OWNER_FID` (should be `318447`)

**Optional but recommended:**
- `TORMENTAL_FID` (if different from HELLFIRE_OWNER_FID)
- `NEXT_PUBLIC_GAME_ESCROW_CONTRACT`
- `NEXT_PUBLIC_BASE_RPC_URL`
- `MASTER_WALLET_PRIVATE_KEY` (if using refund/settle features)

## 🚀 Deployment Steps

### Step 1: Commit and Push Changes
```bash
git add .
git commit -m "Rebrand: Change from Hellfire to Poker Lobby / SIAs Poker Room"
git push origin main
```

### Step 2: Deploy to Vercel

**Option A: Automatic (if connected to GitHub)**
- Push to `main` branch triggers automatic deployment
- Check Vercel dashboard for deployment status

**Option B: Manual Deploy**
```bash
# If you have Vercel CLI installed
cd C:\miniapps\routine\poker
vercel --prod
```

### Step 3: Verify Deployment

After deployment completes:

1. **Check the deployed URL:**
   - Visit: `https://poker-swart.vercel.app`
   - Should redirect to `/clubs/sias-poker-room/games`

2. **Verify branding:**
   - ✅ Title shows "Poker Lobby" (not "Hellfire Poker Club")
   - ✅ Club name shows "SIAs Poker Room"
   - ✅ ClubGG link points to `https://clubgg.app.link/fFMQldwxAZb`

3. **Test functionality:**
   - ✅ Can view games
   - ✅ Can create games (if owner: FID 318447 or 273708)
   - ✅ Notifications show "New Poker Lobby game"

## 🔍 Post-Deployment Testing

### Test Checklist:
- [ ] Homepage redirects to `/clubs/sias-poker-room/games`
- [ ] Club page loads correctly
- [ ] Games list displays
- [ ] "Poker Lobby" title appears (not "Hellfire")
- [ ] ClubGG button links to new URL
- [ ] Both owners (318447, 273708) can create/manage games
- [ ] Notifications use new branding

## 🐛 Troubleshooting

### Issue: Old slug still works
- **Cause:** Database not migrated yet
- **Fix:** Run migration script or SQL update

### Issue: "Club not found" error
- **Cause:** Database slug mismatch
- **Fix:** Verify club slug in Supabase is `sias-poker-room`

### Issue: Build fails in Vercel
- **Cause:** Missing environment variables
- **Fix:** Check Vercel Settings → Environment Variables

### Issue: Redirects to old slug
- **Cause:** Cached redirects or old code
- **Fix:** Clear browser cache, verify deployment is latest

## 📝 Notes

- The rebranding is **UI-only** - all functionality remains the same
- Database schema unchanged (only club data updated)
- Component names like `HellfireTitle` are internal only (not user-facing)
- Both owners (318447 and 273708) have full access to manage the club
