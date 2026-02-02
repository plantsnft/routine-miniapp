# Giveaway Games Rebrand - Deployment Instructions

## ✅ Code Changes Complete

All code changes have been implemented and are ready for deployment. The following items are complete:

- ✅ All constants updated (`GIVEAWAY_GAMES_*`)
- ✅ All API routes updated
- ✅ All page components updated
- ✅ All redirects updated
- ✅ All component references updated
- ✅ All metadata files updated
- ✅ All notification titles updated
- ✅ Middleware for backward compatibility added
- ✅ Migration script created
- ✅ No linter errors

---

## 📋 What You Need to Do

### Step 1: Deploy Code Changes

Deploy your code to production (Vercel/GitHub/etc). All code changes are complete and ready.

**Verify build succeeds:**
```bash
cd poker
npm run build
```

---

### Step 2: Run Database Migration

**⚠️ IMPORTANT:** After deploying code, you MUST run the migration script to update the database.

**Copy-paste this command:**

```bash
cd poker
tsx scripts/migrate-to-giveaway-games.ts
```

**What this does:**
- Finds the existing club with slug `"hellfire"`
- Updates it to slug `"giveaway-games"`
- Updates name to `"Giveaway Games"`
- Updates description
- **Preserves all games** (they reference by UUID, so they remain linked)

**Expected output:**
```
Starting migration to Giveaway Games...

1. Looking for existing "hellfire" club...
   ✓ Found club: Hellfire Club (ID: ...)
   Current slug: hellfire

2. Checking for linked games...
   Found X game(s) linked to this club (showing first 10)
   Games will remain linked after migration (they reference by UUID, not slug)

3. Updating club information...
   ✓ Updated club:
     Slug: hellfire → giveaway-games
     Name: Hellfire Club → Giveaway Games
     Description: ... → Run games on ClubGG and give away tokens or art

4. Verifying update...
   ✓ Verification successful!
   Club ID: ... (unchanged)
   Owner FID: ... (unchanged)

✅ Migration complete!
   Club: Giveaway Games
   Slug: giveaway-games
   All X game(s) remain linked to this club
```

**If you see an error:**
- If it says "No existing 'hellfire' club found" → The club may already be migrated or doesn't exist. Check your database.
- If it says "Club already exists" → Migration may have already been run. Verify in your database.

---

### Step 3: Verify Everything Works

After migration, test these flows:

1. **Home page redirect:**
   - Visit `/` → Should redirect to `/clubs/giveaway-games/games`

2. **Games page:**
   - Visit `/clubs/giveaway-games/games` → Should load and show "Giveaway Games" title

3. **Old URLs (backward compatibility):**
   - Visit `/clubs/hellfire/games` → Should redirect to `/clubs/giveaway-games/games`

4. **Create a game:**
   - Create a new game → Should work normally

5. **Existing games:**
   - All existing games should still be accessible (they reference by UUID)

6. **Payment flow:**
   - Join a paid game → Should work (contract unchanged)

---

## 🔧 Environment Variables (Optional)

If you want to update environment variables:

**Old:**
```
HELLFIRE_OWNER_FID=318447
```

**New (optional):**
```
GIVEAWAY_GAMES_OWNER_FID=318447
```

**Note:** The code has backward compatibility, so `HELLFIRE_OWNER_FID` will still work if `GIVEAWAY_GAMES_OWNER_FID` is not set. You can update this gradually.

---

## 📝 Summary of Changes

### Files Changed: ~25 files

**Critical:**
- `src/lib/constants.ts` - New constants
- `src/lib/pokerPermissions.ts` - Function renamed
- `src/app/api/clubs/route.ts` - Uses new constants
- `src/app/api/clubs/[id]/members/route.ts` - Uses new function
- `src/app/api/games/route.ts` - Uses new function + notification title
- `src/app/clubs/[slug]/page.tsx` - Uses new constant
- `src/app/clubs/[slug]/games/page.tsx` - Uses new constant
- `src/app/page.tsx` - Redirect uses new constant
- `src/app/clubs/page.tsx` - Redirect uses new constant

**User-Facing:**
- `src/components/HellfireTitle.tsx` - Default text updated
- `src/components/JoinHellfireBanner.tsx` - URLs and text updated
- `src/components/ScrollingBanner.tsx` - Welcome message updated
- `public/.well-known/farcaster.json` - Metadata updated
- `src/app/layout.tsx` - Title/description updated
- `src/lib/miniapp-metadata.ts` - Name updated

**New:**
- `src/middleware.ts` - Redirects old URLs to new ones
- `scripts/migrate-to-giveaway-games.ts` - Database migration script

**Data:**
- `scripts/seed-data.json` - Updated seed data

**Config:**
- `package.json` - Name updated
- `src/styles/theme.css` - Comment updated
- `src/app/globals.css` - Comment updated

---

## ⚠️ Important Notes

1. **Database Migration is REQUIRED** - The app won't work correctly until you run the migration script. The API will return an empty array until the database is updated.

2. **Games Remain Linked** - All existing games reference clubs by UUID (not slug), so they will remain linked after migration.

3. **Contract Logic Unchanged** - All smart contract addresses and payment logic remain exactly the same. No blockchain changes needed.

4. **Backward Compatibility** - Old URLs (`/clubs/hellfire/*`) will automatically redirect to new URLs via middleware.

---

## 🐛 Troubleshooting

**Issue: "Club not found" after deployment**
- **Solution:** Run the migration script. The code expects slug `"giveaway-games"` but database still has `"hellfire"`.

**Issue: Migration script says "No existing 'hellfire' club found"**
- **Check:** Verify your database has a club. You may need to seed it first or the migration may have already run.

**Issue: Old URLs don't redirect**
- **Check:** Verify `src/middleware.ts` was deployed. The middleware should handle redirects automatically.

**Issue: Build fails**
- **Check:** Run `npm run build` locally to see errors. All imports should resolve correctly.

---

## ✅ Success Criteria

After deployment and migration, you should see:

- ✅ Home page redirects to `/clubs/giveaway-games/games`
- ✅ Games page shows "Giveaway Games" title
- ✅ All existing games are accessible
- ✅ Creating new games works
- ✅ Payment flow works
- ✅ Old URLs redirect to new ones
- ✅ Notifications show "Giveaway Games" branding

---

**Ready to deploy!** 🚀
