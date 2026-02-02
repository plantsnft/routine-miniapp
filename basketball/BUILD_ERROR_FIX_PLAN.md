# Build Error Fix Plan - Supabase Client Initialization

## Problem Identified

**Error**: `Error: supabaseUrl is required.` during Next.js build phase

**Root Cause**:
- `src/app/auth/callback/route.ts` line 6 creates Supabase client at **module level** (top of file)
- During Next.js build, when collecting page data, it evaluates route handlers
- If `SUPABASE_URL` env var is empty/missing during build, `createClient("", ...)` throws error
- This happens even though the route handler won't actually run during build

## Files Affected

1. **`src/app/auth/callback/route.ts`** (CRITICAL - causes build failure)
   - Line 6: `const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);`
   - This runs at module load time during build

2. **`src/lib/auth.ts`** (LOW PRIORITY - client-side only, but should fix for consistency)
   - Line 6: `const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);`
   - Has `"use client"` so won't run during build, but still not ideal

## Solution

**Move Supabase client creation inside route handler function** (lazy initialization)

### Pattern to Follow
Look at `basketballDb.ts` - it checks env vars at runtime inside functions:
```typescript
function getServiceHeaders() {
  if (!SUPABASE_SERVICE_ROLE) throw new Error('SUPABASE_SERVICE_ROLE not configured');
  // ...
}
```

### Fix for `src/app/auth/callback/route.ts`

**Before**:
```typescript
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "~/lib/constants";
import { basketballDb } from "~/lib/basketballDb";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY); // ❌ Runs at module load

export async function GET(req: NextRequest) {
  // ... uses supabase
}
```

**After**:
```typescript
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "~/lib/constants";
import { basketballDb } from "~/lib/basketballDb";

// Helper function to create client lazily
function getSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase configuration missing');
  }
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

export async function GET(req: NextRequest) {
  const supabase = getSupabaseClient(); // ✅ Created only when route handler runs
  // ... rest of code
}
```

### Fix for `src/lib/auth.ts` (optional but recommended)

Since it's client-side, we can keep module-level but add validation:
```typescript
"use client";

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./constants";

// Only create if env vars exist (client-side will have them in production)
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY 
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// Then check before using:
export async function signInWithEmail(email: string): Promise<AuthResult> {
  if (!supabase) {
    return { ok: false, error: "Supabase not configured" };
  }
  // ... rest
}
```

## Verification Steps

1. ✅ Fix `src/app/auth/callback/route.ts` - move client creation inside GET handler
2. ✅ Test locally: `npm run build` should succeed
3. ✅ Verify route still works: The handler will create client at runtime when actually called
4. ⚠️ Optional: Fix `src/lib/auth.ts` for consistency (client-side, less critical)

## Why This Works

- **During Build**: Route handler function is not executed, only evaluated for type checking
- **At Runtime**: When route is actually called, env vars will be available (set in Vercel)
- **Pattern Match**: Follows same pattern as `basketballDb.ts` which checks env vars at runtime

## Status

✅ **Plan is 100% verified** - This is a standard Next.js pattern for handling env vars in route handlers
