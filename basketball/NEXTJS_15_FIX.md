# Next.js 15 Route Handler Fix

## Issue
Build failed with error:
```
Type error: Route "src/app/api/games/[gameId]/route.ts" has an invalid "GET" export:
  Type "{ params: { gameId: string; }; }" is not a valid type for the function's second argument.
```

## Root Cause
Next.js 15 changed dynamic route params to be async (Promise-based). The old Next.js 14 pattern no longer works.

## Fix Applied
Updated `src/app/api/games/[gameId]/route.ts`:

**Before (Next.js 14)**:
```typescript
export async function GET(
  req: NextRequest,
  { params }: { params: { gameId: string } }
) {
  const gameId = params.gameId;
```

**After (Next.js 15)**:
```typescript
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params;
```

## Status
✅ Fixed - Route handler now compatible with Next.js 15.5.9

## Note
This is the only dynamic route in the app (`[gameId]`), so this was the only file that needed updating.

---

**Next**: Redeploy on Vercel - build should now succeed!
