# Code Review Suggestions

## Overview
This document contains suggestions for improving code cleanliness, readability, and performance without changing logic or behavior.

---

## 1. `src/lib/creatorStats.ts`

### Variable Naming Improvements

**Line 213:** Indentation issue
```typescript
// Current:
    return result;
      } catch (_e) {
// Should be:
    return result;
  } catch (_e) {
```

**Line 213-217:** Formatting
- Fix indentation in catch block (extra spaces)

### Suggested Improvements

1. **Add constant for duplicate error code:**
```typescript
const DUPLICATE_KEY_ERROR_CODE = '23505';
```

2. **Extract common error handling pattern:**
```typescript
function handleDuplicateKeyError(errorData: any, entityName: string, identifier: string): boolean {
  if (errorData.code === DUPLICATE_KEY_ERROR_CODE) {
    console.log(`[Creator Stats] ${entityName} ${identifier} already exists, skipping`);
    return true;
  }
  return false;
}
```

3. **Add JSDoc for extractCatNames:**
```typescript
/**
 * Extract cat names from cast text using pattern matching.
 * 
 * Looks for patterns like:
 * - "my cat [name]"
 * - "[name] the cat"
 * - Hashtags like #CatName
 * 
 * @param castText - The cast text to search
 * @returns Array of unique cat names found (filtered for common false positives)
 */
```

---

## 2. `src/app/api/creator-stats/sync/route.ts`

### Variable Naming

**Line 78:** Extract cursor display logic
```typescript
// Current:
cursor ? ` (cursor: ${cursor.substring(0, 20)}...)` : ''
// Better:
const cursorDisplay = cursor ? ` (cursor: ${cursor.substring(0, 20)}...)` : '';
console.log(`[Creator Stats Sync] Fetching page ${pageCount}${cursorDisplay}...`);
```

**Line 163-165:** More descriptive variable name
```typescript
// Current:
const catwalkCasts = topLevelCasts.filter((cast: any) => {
  return cast.author?.fid === fid;
});
// Better:
const creatorCasts = topLevelCasts.filter((cast: any) => {
  return cast.author?.fid === fid;
});
```

### Extract Repeated Logic

**Lines 173-193 and 320-342:** User fetching is duplicated
```typescript
// Extract to helper function:
async function fetchUserLocation(fid: number, apiKey: string): Promise<string | null> {
  try {
    const userResponse = await fetch(
      `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`,
      { headers: { "x-api-key": apiKey } }
    );
    if (!userResponse.ok) return null;
    
    const userData = await userResponse.json();
    const user = userData.users?.[0]?.user || userData.users?.[0];
    return user ? parseLocationFromUser(user) : null;
  } catch (error: any) {
    console.error(`[Creator Stats Sync] Error fetching user data for FID ${fid}:`, error?.message);
    return null;
  }
}
```

### Comments

**Line 348-358:** Add comment explaining cat profile creation
```typescript
// Create cat profiles for each unique cat name found in casts
// Images are collected from all casts (limited to MAX_CAT_PROFILE_PHOTOS)
// TODO: Future enhancement - match images to specific cat names from cast context
```

---

## 3. `src/app/api/creator-stats/top-casts/route.ts`

### Variable Naming

**Line 53:** More descriptive name
```typescript
// Current:
const allCasts = await getCreatorCasts(creatorFid, undefined, true);
// Better:
const allCreatorCasts = await getCreatorCasts(creatorFid, undefined, true);
```

### Extract Sorting Logic

**Lines 59-68:** Extract to helper function (used in multiple places)
```typescript
/**
 * Sort casts by likes (descending), then by timestamp (descending).
 * Used for consistent sorting across the app.
 */
function sortCastsByLikesAndDate(casts: CreatorCast[]): CreatorCast[] {
  return casts.sort((a, b) => {
    const aLikes = a.likes_count || 0;
    const bLikes = b.likes_count || 0;
    if (aLikes !== bLikes) {
      return bLikes - aLikes; // Higher likes first
    }
    // Secondary sort: timestamp descending (newer first if likes are equal)
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });
}
```

### Performance

**Line 58-69:** Database already sorts, so client-side sort is redundant
- Consider removing client-side sort if database sort is reliable
- Or add comment explaining why both are needed

---

## 4. `src/app/api/creator-stats/casts-by-label/route.ts`

### Extract Common Patterns

**Lines 88-95, 108-115, 124-133:** Sorting logic is duplicated 3 times
```typescript
// Extract to helper (same as in top-casts):
function sortCastsByLikesAndDate(casts: CreatorCast[]): CreatorCast[] {
  // ... (same as above)
}
```

**Lines 135-159:** Image parsing is duplicated
```typescript
// Use helper from top-casts or extract to shared utility:
function normalizeCastImages(images: any): string[] {
  // ... (extract parsing logic)
}
```

### Variable Naming

**Line 28:** More descriptive
```typescript
// Current:
let castsWithLabel: typeof allCasts = [];
// Better:
let matchingCasts: typeof allCasts = [];
```

**Line 69:** More descriptive
```typescript
// Current:
const uniqueCasts = new Map<string, typeof allCasts[0]>();
// Better:
const uniqueCastsMap = new Map<string, typeof allCasts[0]>();
```

### Comments

**Line 30-32:** Expand comment to explain strategy
```typescript
/**
 * Label matching strategy:
 * 1. Exact match using extractLabels (normalized)
 * 2. Text matching if < 5 results (more lenient)
 * 3. Fill remaining slots with top casts by likes
 * 4. Fallback: show top 5 by likes if no matches
 */
```

---

## 5. `src/components/CreatorCard.tsx`

### Extract Repeated Logic

**Lines 451-463 and lines 10-24 in top-casts:** Image parsing is duplicated
```typescript
// Extract to shared utility:
function parseCastImages(images: any): string[] {
  if (!images) return [];
  if (typeof images === 'string') {
    try {
      const parsed = JSON.parse(images);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('[Image Parser] Failed to parse images string:', e);
      return [];
    }
  }
  return Array.isArray(images) ? images : [];
}
```

**Lines 466-478 and 109-120:** Date formatting is duplicated
```typescript
// Extract to utility:
function formatCastDate(timestamp: string, format: 'short' | 'long' = 'long'): string {
  try {
    const date = new Date(timestamp);
    if (format === 'short') {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: 'numeric'
      });
    }
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  } catch (e) {
    console.error('[Date Formatter] Failed to parse date:', e);
    return 'Unknown date';
  }
}
```

### Variable Naming

**Line 64:** More descriptive check
```typescript
// Current:
if (loadingTopCasts || topCasts.length > 0) return;
// Better:
const hasAlreadyLoaded = loadingTopCasts || topCasts.length > 0;
if (hasAlreadyLoaded) return;
```

**Line 448:** More descriptive
```typescript
// Current:
const isFirst = index === 0;
// Better:
const isSelectedCast = index === 0 && selectedCastHash === cast.cast_hash;
```

### Extract Constants

**Lines 485-550:** Extract style objects to constants
```typescript
const FIRST_CAST_STYLE = {
  border: "3px solid #c1b400",
  borderRadius: 12,
  padding: "20px",
};

const OTHER_CAST_STYLE = {
  border: "2px solid #c1b400",
  borderRadius: 10,
  padding: "16px",
};
```

---

## 6. Performance Optimizations for Vercel

### Database Query Optimization

1. **Add database indexes** (already in schema, but verify):
   - `creator_casts.fid` - for filtering by creator
   - `creator_casts.likes_count` - for sorting by popularity
   - `creator_casts.timestamp` - for sorting by date
   - `creator_metadata.last_cast_date` - for sorting active/inactive

2. **Batch database operations:**
   - Consider batching cast inserts (PostgreSQL supports bulk insert)
   - Currently inserts one-by-one, could batch 10-50 at a time

3. **Cache frequently accessed data:**
   - Cache creator metadata in memory with TTL (5-10 minutes)
   - Cache top 5 casts per creator (invalidate on sync)

### API Response Optimization

1. **Add response caching headers:**
   ```typescript
   // In API routes:
   return NextResponse.json(data, {
     headers: {
       'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'
     }
   });
   ```

2. **Limit response size:**
   - Top casts already limited to 5 ✅
   - Consider pagination for large creator lists

### Code-Level Optimizations

1. **Reduce duplicate sorting:**
   - Database sorts, then client sorts again (redundant)
   - Trust database sort or remove client sort

2. **Memoize expensive computations:**
   - Label popularity calculation (line 290-316 in sync route)
   - Could be cached per creator

3. **Use Set for O(1) lookups:**
   - Already using Set for unique cat names ✅
   - Consider Set for cast hash lookups

---

## 7. Code Organization

### Create Shared Utilities File

Create `src/lib/castUtils.ts`:
```typescript
/**
 * Shared utilities for cast processing.
 */

export function parseCastImages(images: any): string[] { /* ... */ }
export function formatCastDate(timestamp: string, format?: 'short' | 'long'): string { /* ... */ }
export function sortCastsByLikesAndDate(casts: CreatorCast[]): CreatorCast[] { /* ... */ }
```

### Extract Constants

Create `src/lib/dbConstants.ts`:
```typescript
export const DUPLICATE_KEY_ERROR_CODE = '23505';
export const MAX_TOP_CASTS = 5;
export const MAX_CAT_PROFILE_PHOTOS = 10;
export const DB_COMMIT_DELAY_MS = 100;
```

---

## 8. Comments and Documentation

### Add Missing JSDoc

1. **extractCatNames** - Add pattern examples
2. **extractLabels** - Add label keyword list reference
3. **fetchTopCasts** - Add note about caching
4. **parseLocationFromUser** - Add format examples

### Improve Inline Comments

1. **Line 148-152 in sync route:** Explain top-level cast filtering logic
2. **Line 288-316 in sync route:** Explain label popularity calculation
3. **Line 435-445 in CreatorCard:** Explain cast reordering logic

---

## 9. Error Handling

### Consistent Error Handling

1. **Standardize error messages:**
   - Use consistent format: `[Component/Function] Error: message`
   - Include context (FID, cast_hash, etc.)

2. **Add error boundaries:**
   - Already have ErrorBoundary in App.tsx ✅
   - Consider adding try-catch in critical paths

### Graceful Degradation

1. **Handle missing data:**
   - Already handling empty arrays ✅
   - Consider fallback UI for missing images

---

## 10. Type Safety

### Add Type Guards

```typescript
function isCreatorCast(obj: any): obj is CreatorCast {
  return obj && 
         typeof obj.cast_hash === 'string' &&
         typeof obj.fid === 'number' &&
         typeof obj.timestamp === 'string';
}
```

### Improve Type Definitions

```typescript
// Instead of `any`, use proper types:
interface NeynarCast {
  hash: string;
  author?: { fid?: number; username?: string; display_name?: string };
  text?: string;
  timestamp?: string;
  embeds?: Array<{ url?: string; images?: string[] }>;
  reactions?: { likes?: number | any[]; recasts?: number | any[] };
  // ... etc
}
```

---

## Summary of Changes Needed

### High Priority (Cleanliness)
1. ✅ Fix indentation in `creatorStats.ts` line 213
2. ✅ Extract duplicate sorting logic to helper function
3. ✅ Extract duplicate image parsing to helper function
4. ✅ Extract duplicate date formatting to helper function
5. ✅ Extract duplicate user fetching to helper function

### Medium Priority (Organization)
6. Create `src/lib/castUtils.ts` for shared utilities
7. Create `src/lib/dbConstants.ts` for constants
8. Improve variable naming (more descriptive)

### Low Priority (Optimization)
9. Add response caching headers
10. Consider batching database operations
11. Remove redundant client-side sorting if DB sort is reliable

### Documentation
12. Add missing JSDoc comments
13. Improve inline comments for complex logic

---

## Notes

- All changes are **non-breaking** and **safe**
- Logic and behavior remain unchanged
- Focus is on **readability** and **maintainability**
- Performance optimizations are **optional** and can be done incrementally
