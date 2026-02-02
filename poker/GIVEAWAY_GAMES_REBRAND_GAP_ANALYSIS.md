# Giveaway Games Rebrand - Gap Analysis & Fix Plan

## Executive Summary

After thorough codebase review, I've identified **critical gaps** in the original plan that would cause the rebrand to fail. This document details all gaps and provides a comprehensive fix plan that will work end-to-end.

---

## Critical Gaps Found

### Gap 1: Hardcoded Slug Checks in Pages ⚠️ **CRITICAL**

**Location:** `src/app/clubs/[slug]/page.tsx`
- **Line 39**: Hardcoded check `if (slug !== 'hellfire')`
- **Line 50**: Hardcoded check `foundClub.slug !== 'hellfire'`
- **Impact**: Page will reject new slug and show error

**Location:** `src/app/clubs/[slug]/games/page.tsx`
- **Line 225**: Uses `HELLFIRE_CLUB_SLUG` for conditional rendering
- **Line 249**: Conditional check `slug === HELLFIRE_CLUB_SLUG`
- **Line 251**: Hardcoded text `"Hellfire Poker Club"`
- **Line 258**: Conditional check `slug !== HELLFIRE_CLUB_SLUG`
- **Impact**: Banner, title, and navigation won't work with new slug

**Fix Required:**
- Replace hardcoded `'hellfire'` with `GIVEAWAY_GAMES_CLUB_SLUG` constant
- Update conditional rendering to use new constant
- Update default title text

---

### Gap 2: API Route Hardcodes Slug ⚠️ **CRITICAL**

**Location:** `src/app/api/clubs/route.ts`
- **Line 22**: Hardcoded filter `filters: { slug: 'hellfire' }`
- **Line 76**: Hardcoded check `filters: { slug: 'hellfire' }`
- **Line 89**: Hardcoded value `slug: "hellfire"`
- **Line 91**: Hardcoded value `name: "Hellfire Club"`
- **Line 92**: Hardcoded value `description: "Tormental's poker club"`
- **Impact**: API will not return/seed club with new slug

**Fix Required:**
- Replace all hardcoded `'hellfire'` with `GIVEAWAY_GAMES_CLUB_SLUG`
- Replace hardcoded name/description with constants
- Update error messages

---

### Gap 3: `requireHellfireClub` Function ⚠️ **CRITICAL**

**Location:** `src/lib/pokerPermissions.ts`
- **Line 21**: Function name `requireHellfireClub`
- **Line 33**: Checks `slug !== HELLFIRE_CLUB_SLUG`
- **Line 34**: Error message "Only Hellfire club is supported in MVP"

**Used In:**
- `src/app/api/clubs/[id]/members/route.ts` (lines 23, 88)
- `src/app/api/games/route.ts` (line 186)

**Impact**: API routes will reject new club slug and throw errors

**Fix Required:**
- Rename function to `requireGiveawayGamesClub` (or keep generic: `requireMvpClub`)
- Update error message
- Update all imports/usages

---

### Gap 4: Hardcoded URLs in Multiple Files ⚠️ **HIGH PRIORITY**

**Locations:**
1. `src/app/page.tsx` - Line 5: `redirect('/clubs/hellfire/games')`
2. `src/app/clubs/page.tsx` - Line 11: `router.replace('/clubs/hellfire/games')`
3. `src/components/JoinHellfireBanner.tsx` - Line 132: Hardcoded URL in cast text
4. `src/app/clubs/[slug]/games/page.tsx` - Lines 304-305: Hardcoded URLs in share functionality

**Impact**: Redirects and links will break, users can't navigate

**Fix Required:**
- Replace with `GIVEAWAY_GAMES_CLUB_SLUG` constant
- Update all redirects to use new slug

---

### Gap 5: Seed Data Has Hardcoded Values ⚠️ **MEDIUM PRIORITY**

**Location:** `scripts/seed-data.json`
- Hardcoded club data with `"slug": "hellfire"`, `"name": "Hellfire Club"`, etc.

**Impact**: Seed script will create club with old branding

**Fix Required:**
- Update seed-data.json to use new values
- Or: Update seed-clubs.ts to use constants instead of seed-data.json

---

### Gap 6: Notification Test Route Uses Old Constant ⚠️ **LOW PRIORITY**

**Location:** `src/app/api/notifications/test/route.ts`
- **Line 12**: Imports `HELLFIRE_OWNER_FID`
- **Line 32**: Checks `fid !== HELLFIRE_OWNER_FID`

**Impact**: Test endpoint may reject valid users if env var not updated

**Fix Required:**
- Update to use `GIVEAWAY_GAMES_OWNER_FID` (or make it optional/generic)

---

### Gap 7: Database Migration Strategy Missing ⚠️ **CRITICAL**

**Issue**: The plan mentions updating the database but doesn't specify:
1. How to handle existing games linked to old club
2. Whether to update slug in-place or create new club
3. How to handle foreign key constraints

**Database Schema Analysis:**
- `poker.clubs.slug` has UNIQUE constraint - can't have both slugs
- `poker.games.club_id` references `poker.clubs.id` (UUID, not slug)
- **Good news**: Games reference by UUID, so updating slug won't break relationships

**Fix Required:**
- Create migration script to update existing club record
- Strategy: Update slug in-place (recommended) since games use UUID references

---

## Comprehensive Fix Plan

### Phase 1: Update Constants (FOUNDATION)

**File:** `src/lib/constants.ts`

```typescript
// OLD:
export const HELLFIRE_CLUB_SLUG = "hellfire";
export const HELLFIRE_CLUB_NAME = "Hellfire Club";
export const HELLFIRE_CLUB_DESCRIPTION = "Tormental's poker club";
export const HELLFIRE_OWNER_FID = process.env.HELLFIRE_OWNER_FID ? ... : null;

// NEW:
export const GIVEAWAY_GAMES_CLUB_SLUG = "giveaway-games";
export const GIVEAWAY_GAMES_CLUB_NAME = "Giveaway Games";
export const GIVEAWAY_GAMES_CLUB_DESCRIPTION = "Run games on ClubGG and give away tokens or art";
export const GIVEAWAY_GAMES_OWNER_FID = process.env.GIVEAWAY_GAMES_OWNER_FID 
  ? parseInt(process.env.GIVEAWAY_GAMES_OWNER_FID, 10) 
  : (process.env.HELLFIRE_OWNER_FID ? parseInt(process.env.HELLFIRE_OWNER_FID, 10) : null); // Backward compat
```

**Why backward compat?** Allows gradual migration of env vars.

---

### Phase 2: Fix API Routes

**File:** `src/app/api/clubs/route.ts`

**Changes:**
1. Import: `HELLFIRE_CLUB_SLUG` → `GIVEAWAY_GAMES_CLUB_SLUG`
2. Import: `HELLFIRE_OWNER_FID` → `GIVEAWAY_GAMES_OWNER_FID`
3. Line 22: `filters: { slug: 'hellfire' }` → `filters: { slug: GIVEAWAY_GAMES_CLUB_SLUG }`
4. Line 76: `filters: { slug: 'hellfire' }` → `filters: { slug: GIVEAWAY_GAMES_CLUB_SLUG }`
5. Line 70: `HELLFIRE_OWNER_FID` → `GIVEAWAY_GAMES_OWNER_FID`
6. Line 89-92: Use constants instead of hardcoded strings
7. Update comments: "Hellfire" → "Giveaway Games"

**File:** `src/lib/pokerPermissions.ts`

**Changes:**
1. Import: `HELLFIRE_CLUB_SLUG` → `GIVEAWAY_GAMES_CLUB_SLUG`
2. Rename function: `requireHellfireClub` → `requireGiveawayGamesClub`
3. Line 33: Update check to use new constant
4. Line 34: Update error message: "Only Giveaway Games club is supported in MVP"
5. Update function comment

**Files Using `requireHellfireClub`:**
- `src/app/api/clubs/[id]/members/route.ts` - Update import and function call
- `src/app/api/games/route.ts` - Update import and function call

---

### Phase 3: Fix Page Components

**File:** `src/app/clubs/[slug]/page.tsx`

**Changes:**
1. Remove hardcoded `'hellfire'` checks
2. Import `GIVEAWAY_GAMES_CLUB_SLUG`
3. Line 39: `if (slug !== 'hellfire')` → `if (slug !== GIVEAWAY_GAMES_CLUB_SLUG)`
4. Line 50: `foundClub.slug !== 'hellfire'` → `foundClub.slug !== GIVEAWAY_GAMES_CLUB_SLUG`
5. Update error messages

**File:** `src/app/clubs/[slug]/games/page.tsx`

**Changes:**
1. Import: `HELLFIRE_CLUB_SLUG` → `GIVEAWAY_GAMES_CLUB_SLUG`
2. Line 225: Update check to use new constant
3. Line 249: Update conditional to use new constant
4. Line 251: Update title text to `"Giveaway Games"`
5. Line 258: Update conditional to use new constant
6. Update banner items text (remove "Hellfire Poker Club" references)
7. Update hardcoded URLs (lines 304-305)

**File:** `src/app/page.tsx`

**Changes:**
1. Import `GIVEAWAY_GAMES_CLUB_SLUG`
2. Line 5: `redirect('/clubs/hellfire/games')` → `redirect(\`/clubs/${GIVEAWAY_GAMES_CLUB_SLUG}/games\`)`

**File:** `src/app/clubs/page.tsx`

**Changes:**
1. Import `GIVEAWAY_GAMES_CLUB_SLUG`
2. Line 11: `router.replace('/clubs/hellfire/games')` → `router.replace(\`/clubs/${GIVEAWAY_GAMES_CLUB_SLUG}/games\`)`
3. Update loading message

---

### Phase 4: Fix Component References

**File:** `src/components/JoinHellfireBanner.tsx` (or renamed version)

**Changes:**
1. Line 132: Update hardcoded URL to use constant
2. Update cast text to remove "hellfire poker club"

**File:** `src/components/HellfireTitle.tsx` (or renamed version)

**Changes:**
1. Default prop: `'Hellfire Poker Club'` → `'Giveaway Games'`
2. Update spawn point comments

---

### Phase 5: Update Seed Data

**File:** `scripts/seed-data.json`

**Changes:**
```json
{
  "clubs": [
    {
      "slug": "giveaway-games",
      "name": "Giveaway Games",
      "description": "Run games on ClubGG and give away tokens or art",
      "owner_fid": 318447
    }
  ],
  "members": {
    "giveaway-games": [318447]
  }
}
```

**OR** (Better approach): Update `scripts/seed-clubs.ts` to use constants instead of seed-data.json

---

### Phase 6: Database Migration Script

**Create:** `scripts/migrate-to-giveaway-games.ts`

**Strategy:**
1. Find existing club with slug `'hellfire'`
2. Update club record:
   - `slug = 'giveaway-games'`
   - `name = 'Giveaway Games'`
   - `description = 'Run games on ClubGG and give away tokens or art'`
3. Keep `id`, `owner_fid`, and all other fields unchanged
4. Verify no games are orphaned (they reference by UUID, so safe)

**Why this works:**
- Games reference clubs by `club_id` (UUID), not slug
- Updating slug doesn't break foreign key relationships
- All existing games remain linked to the same club

**Script Template:**
```typescript
import { pokerDb } from '../src/lib/pokerDb';
import { GIVEAWAY_GAMES_CLUB_SLUG, GIVEAWAY_GAMES_CLUB_NAME, GIVEAWAY_GAMES_CLUB_DESCRIPTION } from '../src/lib/constants';

async function migrateToGiveawayGames() {
  // 1. Find existing club
  const oldClub = await pokerDb.fetch('clubs', {
    filters: { slug: 'hellfire' },
    limit: 1,
  });

  if (oldClub.length === 0) {
    console.log('No existing "hellfire" club found. Run seed-clubs.ts first.');
    return;
  }

  const club = oldClub[0] as any;
  
  // 2. Update club (upsert to handle unique constraint)
  await pokerDb.update('clubs', 
    { id: club.id },
    {
      slug: GIVEAWAY_GAMES_CLUB_SLUG,
      name: GIVEAWAY_GAMES_CLUB_NAME,
      description: GIVEAWAY_GAMES_CLUB_DESCRIPTION,
    } as any
  );

  console.log('✅ Migration complete!');
}
```

---

### Phase 7: Backward Compatibility (Optional but Recommended)

**Add Redirect Middleware:**

**Create:** `src/middleware.ts` (if not exists) or update existing

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { GIVEAWAY_GAMES_CLUB_SLUG } from './lib/constants';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Redirect old slug to new slug
  if (pathname.startsWith('/clubs/hellfire')) {
    const newPath = pathname.replace('/clubs/hellfire', `/clubs/${GIVEAWAY_GAMES_CLUB_SLUG}`);
    return NextResponse.redirect(new URL(newPath, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/clubs/hellfire/:path*',
};
```

**Why:** Allows old URLs/bookmarks to still work

---

## Verification Checklist (Updated)

### Pre-Deployment
- [ ] All constants updated in `constants.ts`
- [ ] All hardcoded `'hellfire'` strings replaced with constant
- [ ] All API routes updated
- [ ] All page components updated
- [ ] All redirects updated
- [ ] `requireHellfireClub` renamed and updated
- [ ] Seed data updated
- [ ] Migration script created and tested

### Post-Deployment
- [ ] Database migration script run successfully
- [ ] Old slug redirects work (if middleware added)
- [ ] New slug works in all pages
- [ ] API returns club with new slug
- [ ] Games still linked to club (verify by UUID)
- [ ] No broken links or redirects
- [ ] All user-facing text updated

### Contract Verification (CRITICAL - Must Not Change)
- [ ] `GAME_ESCROW_CONTRACT` address unchanged
- [ ] `BASE_USDC_ADDRESS` unchanged
- [ ] `MASTER_WALLET_ADDRESS` unchanged
- [ ] Payment verification logic unchanged
- [ ] Settlement logic unchanged
- [ ] Refund logic unchanged

---

## Deployment Order (CRITICAL)

1. **Deploy Code Changes First**
   - All code updates (constants, routes, pages, components)
   - New branding in place
   - Old slug still works via constants (temporarily)

2. **Run Database Migration**
   - Execute migration script
   - Update club slug from `'hellfire'` to `'giveaway-games'`
   - Verify games still linked

3. **Deploy Middleware (Optional)**
   - Add redirect from old slug to new slug
   - Test redirects work

4. **Update Environment Variables (Optional)**
   - `HELLFIRE_OWNER_FID` → `GIVEAWAY_GAMES_OWNER_FID`
   - Or keep both (backward compat handles it)

5. **Verify Everything**
   - Test all pages
   - Test API endpoints
   - Test payment flow
   - Test game creation
   - Test settlement/refunds

---

## Risk Assessment

### Low Risk ✅
- Component renames (cosmetic)
- UI text updates (cosmetic)
- Metadata updates (cosmetic)

### Medium Risk ⚠️
- Database migration (needs careful execution)
- URL redirects (needs testing)
- Seed script updates (needs verification)

### High Risk 🔴
- API route changes (affects functionality)
- Page component slug checks (affects routing)
- `requireHellfireClub` function (affects API security)

**Mitigation:**
- Test all API endpoints after changes
- Test all page routes after changes
- Verify database migration doesn't break relationships
- Keep old slug working via redirect during transition

---

## Files That MUST Be Updated (Complete List)

### Critical (Will Break Without Update)
1. `src/lib/constants.ts` - Constants definition
2. `src/lib/pokerPermissions.ts` - Function rename + logic
3. `src/app/api/clubs/route.ts` - Hardcoded slug filters
4. `src/app/api/clubs/[id]/members/route.ts` - Function import
5. `src/app/api/games/route.ts` - Function import
6. `src/app/clubs/[slug]/page.tsx` - Hardcoded slug checks
7. `src/app/clubs/[slug]/games/page.tsx` - Hardcoded slug checks + URLs
8. `src/app/page.tsx` - Hardcoded redirect
9. `src/app/clubs/page.tsx` - Hardcoded redirect

### Important (User-Facing)
10. `src/components/JoinHellfireBanner.tsx` - Hardcoded URLs
11. `src/components/HellfireTitle.tsx` - Default text
12. `scripts/seed-data.json` - Seed data
13. `scripts/seed-clubs.ts` - Use constants

### Optional (Nice to Have)
14. `src/app/api/notifications/test/route.ts` - Owner FID check
15. `src/middleware.ts` - Redirect middleware (create if needed)

---

## Summary

**Total Files to Update: ~15 files**

**Critical Path:**
1. Update constants
2. Fix API routes (3 files)
3. Fix page components (3 files)
4. Create migration script
5. Test thoroughly
6. Deploy code
7. Run migration
8. Verify

**Estimated Time: 10-12 hours** (including testing)

**Risk Level: Medium** (mitigated by thorough testing and staged deployment)

---

**This plan addresses all gaps and will work end-to-end once implemented.**
