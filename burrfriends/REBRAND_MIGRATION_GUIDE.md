# Club Rebrand Migration Guide

This guide walks you through migrating the existing "hellfire" club to "sias-poker-room" with the new branding.

## Prerequisites

1. **Environment Variables**: Ensure you have Supabase credentials set:
   ```bash
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE=your-service-role-key
   ```

2. **Backup** (Optional but recommended): 
   - Take a snapshot of your Supabase database before running the migration
   - Or at least note the current club data

## Migration Steps

### Step 1: Run the Migration Script

From the `poker/` directory:

**Windows PowerShell:**
```powershell
cd C:\miniapps\routine\poker
npm run migrate:rebrand
```

**Windows CMD:**
```cmd
cd C:\miniapps\routine\poker
npm run migrate:rebrand
```

**Linux/Mac:**
```bash
cd poker
npm run migrate:rebrand
```

### What the Script Does

1. ✅ Finds the existing "hellfire" club
2. ✅ Updates the club:
   - Slug: `hellfire` → `sias-poker-room`
   - Name: `Hellfire Club` → `SIAs Poker Room`
   - Description: Updated to new description
3. ✅ Ensures both owners are in `club_members`:
   - FID 318447 (Tormental) - owner role
   - FID 273708 (siadude) - owner role

### Expected Output

```
Starting club rebrand migration...
Target: sias-poker-room (SIAs Poker Room)

1. Looking for existing "hellfire" club...
   ✓ Found club: Hellfire Club (ID: <uuid>)

2. Updating club information...
   ✓ Updated club to: SIAs Poker Room (slug: sias-poker-room)

3. Updating club members...
   ✓ Added member: FID 273708 (owner)
   ✓ Updated member: FID 318447 (owner)
   Summary: 1 added, 1 updated

✅ Migration complete!
   Club: SIAs Poker Room
   Slug: sias-poker-room
   Owners: 318447, 273708
```

## Step 2: Verify the Migration

### Option A: Check via Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to **Table Editor** → `poker.clubs`
3. Verify:
   - ✅ One club with slug `sias-poker-room`
   - ✅ Name is `SIAs Poker Room`
   - ✅ Owner FID is `318447`

4. Navigate to **Table Editor** → `poker.club_members`
5. Verify:
   - ✅ Both FIDs (318447 and 273708) are members
   - ✅ Both have `role = 'owner'`
   - ✅ Both have `status = 'active'`

### Option B: Check via API

1. Start your dev server:
   ```bash
   npm run dev
   ```

2. Visit: `http://localhost:3000/clubs/sias-poker-room/games`
   - Should redirect or show the club page
   - Should display "Poker Lobby" as the title
   - Should show "SIAs Poker Room" club name

## Step 3: Test Functionality

### Test Checklist

- [ ] **Homepage redirect**: Visit `/` → should redirect to `/clubs/sias-poker-room/games`
- [ ] **Club page loads**: Visit `/clubs/sias-poker-room` → should show club info
- [ ] **Games page loads**: Visit `/clubs/sias-poker-room/games` → should show games list
- [ ] **Title displays**: Should see "Poker Lobby" title (not "Hellfire Poker Club")
- [ ] **ClubGG link**: Click "Club GG" button → should open `https://clubgg.app.link/fFMQldwxAZb`
- [ ] **Owner access**: Both FIDs (318447 and 273708) should be able to:
  - [ ] Create games
  - [ ] Manage participants
  - [ ] View admin features
- [ ] **Notifications**: Create a test game → notification title should say "New Poker Lobby game"

## Troubleshooting

### Error: "No existing 'hellfire' club found"

**Possible causes:**
- Club was already migrated
- Club was deleted
- Wrong Supabase project

**Solution:**
- Check if club with slug `sias-poker-room` already exists
- If it exists, the migration may have already run
- Verify you're using the correct Supabase project

### Error: "Failed to update member"

**Possible causes:**
- Database connection issue
- Permission issue

**Solution:**
- Verify `SUPABASE_SERVICE_ROLE` is set correctly
- Check Supabase dashboard for any errors
- Try running the script again (it's idempotent)

### Old slug still works

**Note:** If you have existing games or links using the old slug, they will break. You may need to:
1. Update any hardcoded links in your codebase
2. Set up redirects (if needed)
3. Update any external references

## Rollback (if needed)

If you need to rollback:

1. **Via Supabase SQL Editor:**
   ```sql
   UPDATE poker.clubs 
   SET slug = 'hellfire', 
       name = 'Hellfire Club',
       description = 'Tormental''s poker club'
   WHERE slug = 'sias-poker-room';
   ```

2. **Or restore from backup** if you took one

## Next Steps After Migration

1. ✅ Deploy code changes to production (Vercel)
2. ✅ Update environment variables in Vercel (if needed)
3. ✅ Test in production environment
4. ✅ Update any external documentation/links

## Questions?

If you encounter issues:
1. Check the script output for error messages
2. Verify environment variables are set correctly
3. Check Supabase logs for database errors
4. Ensure you have the correct permissions (service role key)
