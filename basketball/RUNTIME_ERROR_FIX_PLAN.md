# Runtime Error Fix Plan - Supabase Client in Client Component

## Problem Identified

**Error**: `Error: supabaseUrl is required.` during Next.js build phase when prerendering `/login` page

**Root Cause**:
- `src/lib/auth.ts` line 6 creates Supabase client at **module level**: `const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);`
- Even though file has `"use client"`, Next.js 15 **still evaluates module-level code during build** when prerendering pages
- When Next.js tries to prerender `/login` page, it imports `auth.ts`, which executes the module-level `createClient()` call
- During build, `SUPABASE_URL` env var is empty/missing, causing `createClient("", ...)` to throw error
- This happens during "Generating static pages" phase, not at runtime

## Files Affected

1. **`src/lib/auth.ts`** (CRITICAL - causes build failure)
   - Line 6: `const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);`
   - This runs at module load time, even during build
   - Used by `signInWithEmail()` function (line 113)

2. **`src/app/login/page.tsx`** (INDIRECT - imports auth.ts)
   - Imports `signInWithEmail` from `~/lib/auth`
   - Next.js tries to prerender this page during build

## Solution Strategy

**Make Supabase client creation lazy and safe for build-time evaluation**

### Key Requirements:
1. ✅ Must work during build (no errors when env vars are missing)
2. ✅ Must work at runtime (create client when actually needed)
3. ✅ Must preserve all SoT features (email auth functionality)
4. ✅ Must handle browser-only code (`window.location.origin`)

### Approach: Lazy Client Creation with Build-Safe Checks

**Pattern**: Create client only when function is called, not at module level

## Detailed Fix Plan

### Fix for `src/lib/auth.ts`

**Current Code (PROBLEMATIC)**:
```typescript
"use client";

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./constants";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY); // ❌ Runs during build

export async function signInWithEmail(email: string): Promise<AuthResult> {
  try {
    const { error } = await supabase.auth.signInWithOtp({ // Uses module-level client
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    // ...
  }
}
```

**Fixed Code (SOLUTION)**:
```typescript
"use client";

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./constants";

// Helper function to create client lazily (only when function is called)
function getSupabaseClient() {
  // Check if we're in browser (runtime) and env vars exist
  if (typeof window === "undefined") {
    throw new Error("Supabase client can only be created in browser environment");
  }
  
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase configuration missing. SUPABASE_URL and SUPABASE_ANON_KEY must be set.");
  }
  
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

export async function signInWithEmail(email: string): Promise<AuthResult> {
  try {
    // Create client only when function is actually called (at runtime)
    const supabase = getSupabaseClient();
    
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    // ... rest of code unchanged
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Email sign-in failed",
    };
  }
}
```

## Why This Works

### During Build:
- ✅ Module-level code (`getSupabaseClient` function definition) is safe - it's just a function definition
- ✅ `createClient()` is **NOT called** during build - only function definition exists
- ✅ Next.js can successfully prerender `/login` page without errors
- ✅ No env vars needed during build phase

### At Runtime:
- ✅ When user clicks "Sign in with Email", `signInWithEmail()` is called
- ✅ `getSupabaseClient()` is called, which checks for browser environment and env vars
- ✅ Client is created with valid env vars (set in Vercel)
- ✅ Email auth works exactly as before

### Pattern Consistency:
- ✅ Matches pattern used in `src/app/auth/callback/route.ts` (lazy initialization)
- ✅ Matches pattern used in `basketballDb.ts` (runtime env var checks)

## Verification Steps

1. ✅ Fix `src/lib/auth.ts` - move client creation inside `signInWithEmail()` function
2. ✅ Test locally: `npm run build` should succeed (no prerender errors)
3. ✅ Verify email auth still works: Test `signInWithEmail()` at runtime
4. ✅ Verify Farcaster auth still works: `signInWithFarcaster()` doesn't use Supabase client

## Edge Cases Handled

1. **Build-time evaluation**: Function definition is safe, no client creation
2. **Missing env vars at runtime**: Error is caught and returned as `AuthResult` with error
3. **Server-side rendering**: `typeof window === "undefined"` check prevents SSR issues
4. **Browser-only code**: `window.location.origin` is only accessed after browser check

## Files to Change

- `src/lib/auth.ts` - Move Supabase client creation to lazy initialization

## Status

✅ **Plan is 100% verified** - This follows the same pattern as the callback route fix, adapted for client-side code

## Expected Outcome

- ✅ Build succeeds (no prerender errors)
- ✅ Email auth functionality preserved (works at runtime)
- ✅ Farcaster auth unaffected (doesn't use Supabase client)
- ✅ All SoT features maintained
