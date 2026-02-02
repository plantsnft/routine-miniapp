# Giveaway Games Rebrand Plan

## Executive Summary

This plan details the complete rebranding from "Hellfire Poker" / "SIAs Poker Room" to "Giveaway Games". The app pivots from poker-specific terminology to a generic platform for running games on ClubGG and giving away tokens or art. **All contract functionality remains unchanged** - only branding, UI text, and naming are updated.

---

## Core Principles

1. **Keep Contract Logic**: All smart contract addresses, payment logic, escrow functionality, and settlement/refund code remains **100% unchanged**
2. **Generic Game Terminology**: Replace poker-specific terms with generic "game" terminology where appropriate
3. **ClubGG Integration**: Maintain all ClubGG integration (credentials, links, etc.) - this is core to the new vision
4. **Giveaway Focus**: Update messaging to emphasize "giveaways" (tokens/art) rather than poker winnings

---

## Phase 1: Constants & Core Configuration

### 1.1 Update `src/lib/constants.ts`

**Current State:**
- `HELLFIRE_CLUB_SLUG = "hellfire"`
- `HELLFIRE_CLUB_NAME = "Hellfire Club"`
- `HELLFIRE_CLUB_DESCRIPTION = "Tormental's poker club"`
- `HELLFIRE_OWNER_FID` (can be null)

**Changes:**
```typescript
// Club configuration
export const GIVEAWAY_GAMES_CLUB_SLUG = "giveaway-games";
export const GIVEAWAY_GAMES_CLUB_NAME = "Giveaway Games";
export const GIVEAWAY_GAMES_CLUB_DESCRIPTION = "Run games on ClubGG and give away tokens or art";

// Giveaway Games Club (MVP-only club)
export const GIVEAWAY_GAMES_OWNER_FID = process.env.GIVEAWAY_GAMES_OWNER_FID 
  ? parseInt(process.env.GIVEAWAY_GAMES_OWNER_FID, 10) 
  : null;
```

**Verification:**
- ✅ All references to `HELLFIRE_CLUB_SLUG`, `HELLFIRE_CLUB_NAME`, `HELLFIRE_CLUB_DESCRIPTION` updated
- ✅ `HELLFIRE_OWNER_FID` → `GIVEAWAY_GAMES_OWNER_FID` (backward compatible via env var)
- ✅ No contract addresses changed (GAME_ESCROW_CONTRACT, BASE_USDC_ADDRESS, etc.)

### 1.2 Update `src/lib/permissions.ts`

**Current State:**
- References `HELLFIRE_CLUB_SLUG` for special club access
- Comments mention "SIAs Poker Room"

**Changes:**
- Remove `HELLFIRE_CLUB_SLUG` import (no longer needed for special access)
- Update comments: "Giveaway Games Club" instead of "SIAs Poker Room"
- Keep all permission logic identical (super owner, global admin checks unchanged)

**Verification:**
- ✅ Permission checks work identically
- ✅ Super owner (318447) still has access to all clubs
- ✅ Club owner checks unchanged

---

## Phase 2: Metadata & Discovery

### 2.1 Update `public/.well-known/farcaster.json`

**Current State:**
```json
{
  "frame": {
    "name": "Poker Lobby",
    "tags": ["poker", "hellfire", "community", "clanker"],
    "tagline": "Poker on Farcaster",
    "description": "Find poker games and be alerted when they start",
    "ogTitle": "Poker Lobby",
    "ogDescription": "Find and stay on top of poker games on Farcaster",
    "subtitle": "Find poker games on Farcaster"
  }
}
```

**Changes:**
```json
{
  "frame": {
    "name": "Giveaway Games",
    "tags": ["games", "giveaways", "clubgg", "community", "tokens", "nft"],
    "tagline": "Run games and give away tokens or art",
    "description": "Create games on ClubGG and give away tokens or NFTs to winners",
    "ogTitle": "Giveaway Games",
    "ogDescription": "Run games on ClubGG and give away tokens or art to winners",
    "subtitle": "Run games and give away tokens or art"
  }
}
```

**Verification:**
- ✅ Farcaster discovery metadata updated
- ✅ Tags reflect new purpose (games, giveaways, tokens, nft)
- ✅ All URLs remain the same (homeUrl, iconUrl, etc.)

### 2.2 Update `src/lib/miniapp-metadata.ts`

**Current State:**
- `name: 'Poker Lobby'`

**Changes:**
```typescript
name: 'Giveaway Games',
```

**Verification:**
- ✅ Mini app embed metadata updated
- ✅ Button title can remain "Open Mini App" (generic)

### 2.3 Update `src/app/layout.tsx` Metadata

**Current State:**
```typescript
title: "Poker Lobby",
description: "Find poker games on Farcaster",
```

**Changes:**
```typescript
title: "Giveaway Games",
description: "Run games on ClubGG and give away tokens or art",
```

**Verification:**
- ✅ HTML `<title>` tag updated
- ✅ Open Graph metadata updated
- ✅ SEO descriptions updated

---

## Phase 3: Component Renames & Updates

### 3.1 Rename Components

**Files to Rename:**
1. `src/components/HellfireTitle.tsx` → `src/components/GiveawayGamesTitle.tsx`
2. `src/components/JoinHellfireBanner.tsx` → `src/components/JoinGiveawayGamesBanner.tsx`

**Changes in `GiveawayGamesTitle.tsx`:**
- Component name: `HellfireTitle` → `GiveawayGamesTitle`
- Default text: `'Hellfire Poker Club'` → `'Giveaway Games'`
- CSS class: `hellfire-title` → `giveaway-games-title` (update in component and CSS)
- Update spawn point comments (remove "Hellfire", "Poker", "Club" references)
- Keep all animation/smoke effects (visual only, no functional change)

**Changes in `JoinGiveawayGamesBanner.tsx`:**
- Component name: `JoinHellfireBanner` → `JoinGiveawayGamesBanner`
- Props interface: `JoinHellfireBannerProps` → `JoinGiveawayGamesBannerProps`
- Update hardcoded URL: `'/clubs/hellfire/games'` → `'/clubs/giveaway-games/games'`
- Update cast text: Remove "hellfire poker club" references
- Keep all functionality (auto-rotate, touch handling, etc.)

**Verification:**
- ✅ All imports updated in files that use these components
- ✅ Component functionality unchanged (only names/text)
- ✅ CSS classes updated in `globals.css` if needed

### 3.2 Update `src/styles/theme.css`

**Current State:**
- Comment: `"Hellfire Poker Design Tokens"`

**Changes:**
```css
/**
 * Giveaway Games Design Tokens
 * 
 * Single source of truth for design system variables.
 * Import this file in globals.css to apply across the app.
 */
```

**Verification:**
- ✅ Design tokens unchanged (colors, spacing, etc. remain the same)
- ✅ Only comment updated

---

## Phase 4: UI Text & Messaging

### 4.1 Update Notification Messages

**File: `src/lib/notifications.ts`**
- Comment: `"Push notification utilities for Hellfire Poker"` → `"Push notification utilities for Giveaway Games"`

**File: `src/app/api/notifications/test-self/route.ts`**
- Body: `'This is a test push notification from Hellfire Poker'` → `'This is a test push notification from Giveaway Games'`

**File: `src/app/api/notifications/test/route.ts`**
- Similar updates for test notifications

**Verification:**
- ✅ Notification functionality unchanged
- ✅ Only user-facing text updated

### 4.2 Update Page Content

**File: `src/app/page.tsx`**
- Redirect: `'/clubs/hellfire/games'` → `'/clubs/giveaway-games/games'`
- Update comment: Remove "Hellfire" reference

**File: `src/app/clubs/page.tsx`**
- Any hardcoded "Hellfire" references → "Giveaway Games"

**File: `src/app/clubs/[slug]/page.tsx`**
- Update any club-specific messaging
- Keep all functionality

**Verification:**
- ✅ Routing works correctly
- ✅ Club slug updated in redirects

### 4.3 Update Game-Related Text

**Files to Review for Poker-Specific Terminology:**
- `src/app/games/[id]/page.tsx` - Update any "poker" references in UI text
- `src/app/clubs/[slug]/games/page.tsx` - Update game list descriptions
- `src/app/clubs/[slug]/games/new/page.tsx` - Update game creation form labels
- `src/components/ScrollingBanner.tsx` - Update banner text

**Key Terminology Changes:**
- "Poker game" → "Game" (where generic)
- "Poker room" → "Game room" or remove
- "Poker club" → "Game club" or "Giveaway Games"
- "Poker lobby" → "Game lobby" or "Giveaway Games"
- Keep "ClubGG" references (core to functionality)
- Keep "entry fee", "payment", "settlement" (generic terms)

**Verification:**
- ✅ All user-facing text updated
- ✅ No functional changes to game logic
- ✅ ClubGG integration unchanged

---

## Phase 5: API & Backend Updates

### 5.1 Update API Route Comments

**Files with "Poker" or "Hellfire" in comments:**
- `src/app/api/clubs/route.ts` - Update comments
- `src/app/api/games/route.ts` - Update comments
- `src/app/api/payments/*/route.ts` - Update comments
- `src/lib/game-creation.ts` - Update comments
- `src/lib/pokerDb.ts` - **KEEP NAME** (database helper, not user-facing)
- `src/lib/pokerPermissions.ts` - **KEEP NAME** (permissions helper, not user-facing)

**Changes:**
- Update comments to reference "Giveaway Games" instead of "Poker Lobby" or "Hellfire"
- Keep all function names and logic identical

**Verification:**
- ✅ API functionality unchanged
- ✅ Only documentation/comments updated

### 5.2 Update Database Seed Scripts

**File: `scripts/seed-clubs.ts`**
- Update club name, slug, description to match new constants
- Use `GIVEAWAY_GAMES_CLUB_SLUG`, `GIVEAWAY_GAMES_CLUB_NAME`, etc.

**File: `scripts/seed-data.json`**
- Update any hardcoded club references

**Verification:**
- ✅ Seed scripts create correct club data
- ✅ Database schema unchanged (only data content changes)

---

## Phase 6: Package & Configuration

### 6.1 Update `package.json`

**Current State:**
```json
{
  "name": "poker-miniapp",
  "scripts": {
    "seed:clubs": "tsx scripts/seed-clubs.ts",
    "cleanup:burrfriends": "tsx scripts/cleanup-burrfriends.ts"
  }
}
```

**Changes:**
```json
{
  "name": "giveaway-games-miniapp",
  "scripts": {
    "seed:clubs": "tsx scripts/seed-clubs.ts"
    // Remove cleanup:burrfriends if not needed
  }
}
```

**Verification:**
- ✅ Package name updated (doesn't affect functionality)
- ✅ Scripts still work

---

## Phase 7: Documentation & Comments

### 7.1 Update Code Comments

**Files with "Poker" or "Hellfire" in comments:**
- All files in `src/lib/` - Update comments
- All files in `src/app/api/` - Update comments
- All files in `src/components/` - Update comments

**Changes:**
- Replace "Poker Lobby" with "Giveaway Games"
- Replace "Hellfire" with "Giveaway Games"
- Replace "poker game" with "game" (where generic)
- Keep technical terms (ClubGG, escrow, settlement, etc.)

**Verification:**
- ✅ Code functionality unchanged
- ✅ Comments accurately reflect new branding

### 7.2 Update README & Docs

**Files to Update:**
- `README.md` - Update project description
- Any markdown docs in root (if they reference old branding)

**Changes:**
- Update project description
- Update any setup instructions that reference old names
- Keep technical documentation (API, deployment, etc.)

---

## Phase 8: Verification Checklist

### 8.1 Functional Verification

- [ ] All pages load correctly
- [ ] Club creation/management works
- [ ] Game creation works
- [ ] Payment flow works (USDC payments unchanged)
- [ ] ClubGG credentials work (password encryption/decryption)
- [ ] Game settlement works
- [ ] Refunds work
- [ ] Notifications work
- [ ] Admin controls work (super owner, club owner)

### 8.2 Branding Verification

- [ ] No "Hellfire" references in UI
- [ ] No "Poker Lobby" references in UI
- [ ] No "SIAs Poker Room" references in UI
- [ ] "Giveaway Games" appears in all user-facing text
- [ ] Farcaster metadata updated
- [ ] HTML metadata updated
- [ ] Component names updated

### 8.3 Contract Verification

- [ ] `GAME_ESCROW_CONTRACT` address unchanged
- [ ] `BASE_USDC_ADDRESS` unchanged
- [ ] `MASTER_WALLET_ADDRESS` unchanged
- [ ] Payment verification logic unchanged
- [ ] Settlement logic unchanged
- [ ] Refund logic unchanged
- [ ] All contract function calls unchanged

### 8.4 Database Verification

- [ ] Club slug updated in database (via seed script or migration)
- [ ] Existing games still accessible
- [ ] No data loss
- [ ] RLS policies still work

---

## Phase 9: Migration Strategy

### 9.1 Database Migration

**Option A: Update Existing Club (Recommended)**
- Update existing club record: `slug = 'giveaway-games'`, `name = 'Giveaway Games'`
- Update description
- **Pros**: No data loss, existing games remain linked
- **Cons**: Need to ensure all references updated

**Option B: Create New Club**
- Create new club with new slug
- Migrate games to new club (if needed)
- **Pros**: Clean slate
- **Cons**: Potential data migration complexity

**Recommendation: Option A** - Update existing club record to maintain data integrity.

### 9.2 Deployment Order

1. **Deploy Code Changes First**
   - All code changes (constants, components, UI text)
   - New branding in place
   - Old club slug still works (backward compatibility)

2. **Update Database**
   - Run seed script or migration to update club record
   - Update slug from `'hellfire'` to `'giveaway-games'`

3. **Update Redirects**
   - Update any hardcoded redirects to new slug
   - Update Farcaster cast embeds

4. **Verify**
   - Test all functionality
   - Check all user-facing text
   - Verify contract operations

---

## Phase 10: Edge Cases & Special Considerations

### 10.1 Backward Compatibility

**Club Slug:**
- Old URL: `/clubs/hellfire/games`
- New URL: `/clubs/giveaway-games/games`
- **Action**: Add redirect from old slug to new slug (or update database to use new slug but keep old slug as alias)

**Farcaster Casts:**
- Existing casts may embed old URLs
- **Action**: Ensure old URLs redirect or update to new slug

### 10.2 Environment Variables

**New Variables (Optional):**
- `GIVEAWAY_GAMES_OWNER_FID` - Can replace `HELLFIRE_OWNER_FID`
- Keep all existing contract-related env vars unchanged

### 10.3 Component Props

**HellfireTitle → GiveawayGamesTitle:**
- Default prop: `text = 'Giveaway Games'` (was `'Hellfire Poker Club'`)
- All existing usages should pass explicit text or use new default

**JoinHellfireBanner → JoinGiveawayGamesBanner:**
- Props interface unchanged
- Only internal text/URLs updated

---

## Summary of Changes

### Files Modified (Estimated: ~50-60 files)

**Core Configuration:**
- `src/lib/constants.ts`
- `src/lib/permissions.ts`

**Metadata:**
- `public/.well-known/farcaster.json`
- `src/lib/miniapp-metadata.ts`
- `src/app/layout.tsx`

**Components:**
- `src/components/HellfireTitle.tsx` → `GiveawayGamesTitle.tsx` (rename + update)
- `src/components/JoinHellfireBanner.tsx` → `JoinGiveawayGamesBanner.tsx` (rename + update)
- `src/components/ScrollingBanner.tsx` (text updates)

**Pages:**
- `src/app/page.tsx`
- `src/app/clubs/page.tsx`
- `src/app/clubs/[slug]/page.tsx`
- `src/app/clubs/[slug]/games/page.tsx`
- `src/app/clubs/[slug]/games/new/page.tsx`
- `src/app/games/[id]/page.tsx`

**API Routes:**
- `src/app/api/clubs/route.ts` (comments)
- `src/app/api/games/route.ts` (comments)
- `src/app/api/notifications/*/route.ts` (text)
- Various other API routes (comments only)

**Styles:**
- `src/styles/theme.css` (comment)

**Scripts:**
- `scripts/seed-clubs.ts`
- `scripts/seed-data.json`

**Config:**
- `package.json`

**Documentation:**
- `README.md`
- Various markdown docs

### Files NOT Modified

**Contract Logic (Keep 100% Unchanged):**
- `src/lib/contract-ops.ts`
- `src/lib/payment-verifier.ts`
- `src/app/api/games/[id]/settle-contract/route.ts`
- `src/app/api/games/[id]/cancel/route.ts`
- `contracts/GameEscrow.sol`
- All payment/escrow/refund logic

**Database Helpers (Keep Names):**
- `src/lib/pokerDb.ts` (internal helper, not user-facing)
- `src/lib/pokerPermissions.ts` (internal helper, not user-facing)

**Core Functionality:**
- All game creation logic
- All payment processing
- All settlement logic
- All refund logic
- All ClubGG integration

---

## Verification Commands

After implementation, run these to verify:

```bash
# Check for remaining "Hellfire" references (should be minimal - only in comments or old data)
grep -r "Hellfire" poker/src --exclude-dir=node_modules

# Check for remaining "Poker Lobby" references
grep -r "Poker Lobby" poker/src --exclude-dir=node_modules

# Check for remaining "SIAs" references
grep -r "SIAs" poker/src --exclude-dir=node_modules

# Verify contract addresses unchanged
grep -r "GAME_ESCROW_CONTRACT\|BASE_USDC_ADDRESS\|MASTER_WALLET_ADDRESS" poker/src/lib/constants.ts

# Verify new branding appears
grep -r "Giveaway Games" poker/src --exclude-dir=node_modules | wc -l
```

---

## Success Criteria

✅ **All user-facing text says "Giveaway Games"**  
✅ **No "Hellfire" or "Poker Lobby" in UI**  
✅ **All contract functionality works identically**  
✅ **ClubGG integration unchanged**  
✅ **Payment/escrow/settlement/refund logic unchanged**  
✅ **Database integrity maintained**  
✅ **Farcaster discovery metadata updated**  
✅ **All pages load and function correctly**

---

## Notes

- **Club Slug Decision**: Recommend updating database club slug to `'giveaway-games'` but keeping redirect from `'hellfire'` for backward compatibility
- **Component Renames**: Consider keeping old component files temporarily with deprecation warnings, then remove in follow-up
- **Database Migration**: May need to update existing club record in production database
- **Testing**: Thoroughly test payment flow, game creation, and settlement after rebrand to ensure nothing broke

---

## Timeline Estimate

- **Phase 1-2 (Constants & Metadata)**: 30 minutes
- **Phase 3 (Component Renames)**: 1 hour
- **Phase 4 (UI Text)**: 2-3 hours
- **Phase 5 (API Comments)**: 1 hour
- **Phase 6 (Package Config)**: 15 minutes
- **Phase 7 (Documentation)**: 1 hour
- **Phase 8 (Verification)**: 1-2 hours
- **Phase 9 (Migration)**: 30 minutes
- **Total**: ~8-10 hours of focused work

---

**End of Plan**
