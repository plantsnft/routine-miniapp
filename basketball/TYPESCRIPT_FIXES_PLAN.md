# TypeScript Fixes Plan - All Errors

## Issues Found (9 total)

### 1. `src/app/api/profile/route.ts` ✅ FIXED
- **Error**: `email` can be `null`, but `filters` doesn't allow `null`
- **Fix**: Changed `else` to `else if (email)` to ensure email is truthy

### 2. `src/app/api/auth/profile/route.ts` ✅ FIXED  
- **Error**: Same as #1
- **Fix**: Changed `else` to `else if (auth_type === "email" && email)`

### 3. `src/app/dashboard/page.tsx` (6 errors) ⚠️ NEEDS FIX
- **Error**: `gameplan?.defense || "Zone"` returns `string`, but function expects `"Zone" | "Man"`
- **Error**: `gameplan?.offense || "Drive"` returns `string`, but function expects `"Drive" | "Shoot"`
- **Lines**: 395, 412, 435, 452, 476, 493, 510
- **Fix**: Add type assertions: `as "Zone"` or `as "Drive"` or `as "Man"` or `as "Shoot"`

### 4. `src/lib/gameSimulation.ts` (2 errors) ⚠️ NEEDS FIX
- **Error**: `gameRecord[0].id` - Property 'id' does not exist
- **Lines**: 481, 815
- **Fix**: Type the insert result similar to initialize route - define Game interface and use generic type parameter

### 5. `src/lib/neynar.ts` (1 error) ⚠️ NEEDS FIX
- **Error**: `client.searchUser(username)` - Argument type mismatch
- **Line**: 23
- **Fix**: Check Neynar SDK v2.19.0 API - might need `{ q: username }` instead of just `username`

---

## Fix Strategy

### Fix 3: Dashboard Type Assertions
Add `as const` or type assertions to ensure literal types:
```typescript
gameplan?.defense || ("Zone" as "Zone" | "Man")
gameplan?.offense || ("Drive" as "Drive" | "Shoot")
```

### Fix 4: GameSimulation Type
Define `Game` interface and type insert:
```typescript
interface Game {
  id: string;
  season_number: number;
  day_number: number;
  // ... other fields
}

const gameRecord = await basketballDb.insert<InputType, Game>("games", {...});
```

### Fix 5: Neynar API
Check if `searchUser` needs object parameter:
```typescript
const result = await client.searchUser({ q: username });
```

---

## Implementation Order
1. Fix neynar.ts (check API first)
2. Fix gameSimulation.ts (similar pattern to initialize)
3. Fix dashboard/page.tsx (type assertions)

---

**Status**: Ready to implement fixes
