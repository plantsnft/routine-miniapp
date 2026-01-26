# Basketball App - Isolation Checklist

## ⚠️ CRITICAL: Do NOT Break Existing Projects

This checklist ensures the basketball app is completely isolated from:
- `burrfriends/` app
- `poker/` app  
- Root `src/` (catwalk app)

---

## ✅ Folder Structure

- [ ] All code lives in `basketball/` folder
- [ ] Never modify files outside `basketball/`
- [ ] Never import from `../burrfriends/` or `../poker/` or `../../src/`
- [ ] All utilities in `basketball/src/lib/`
- [ ] All components in `basketball/src/components/`
- [ ] All API routes in `basketball/src/app/api/`

---

## ✅ Database Schema

- [ ] All tables created in `basketball.*` schema
- [ ] Never access `public.*` schema (catwalk)
- [ ] Never access `poker.*` schema (poker/burrfriends)
- [ ] Use `basketballDb.ts` helper with schema headers:
  - `Accept-Profile: basketball`
  - `Content-Profile: basketball`
- [ ] All SQL migrations in `basketball/supabase_migration_*.sql`
- [ ] Migration files explicitly create `basketball` schema: `CREATE SCHEMA IF NOT EXISTS basketball;`

---

## ✅ Supabase Client

- [ ] Create `basketball/src/lib/basketballDb.ts` (similar to `pokerDb.ts`)
- [ ] Use PostgREST schema headers for all DB operations
- [ ] Validate table names against allowlist of basketball tables only
- [ ] Never use raw Supabase client without schema headers

---

## ✅ Authentication

- [ ] Support both Farcaster (Neynar SIWN) and Email (Supabase Auth)
- [ ] `profiles` table has:
  - `auth_type` (farcaster|email)
  - `farcaster_fid` (nullable)
  - `email` (nullable)
  - One must be non-null
- [ ] Create profile on first login (both auth types)

---

## ✅ Vercel Deployment

- [ ] Separate Vercel project: `basketball`
- [ ] Root Directory in Vercel: `basketball` (not repo root)
- [ ] Own `vercel.json` in `basketball/` folder
- [ ] Own cron jobs in `basketball/vercel.json`
- [ ] Never modify root `vercel.json`

---

## ✅ Environment Variables

- [ ] Can share Supabase URL/keys (same instance)
- [ ] Use `BASKETBALL_*` prefix for app-specific config
- [ ] Own `.env.local.example` in `basketball/`
- [ ] Document all required env vars in SoT

---

## ✅ Package Dependencies

- [ ] Own `package.json` in `basketball/`
- [ ] Own `node_modules` (run `npm install` in `basketball/`)
- [ ] Never import packages from parent directories

---

## ✅ TypeScript Config

- [ ] Own `tsconfig.json` in `basketball/`
- [ ] Path aliases scoped to `basketball/src/`
- [ ] Never reference types from other apps

---

## ✅ Testing

- [ ] Test that basketball app works independently
- [ ] Verify other apps (`burrfriends`, `poker`, root) still work
- [ ] Test database isolation (basketball queries don't touch other schemas)
- [ ] Test deployment doesn't affect other Vercel projects

---

## ✅ Code Review Checklist

Before committing, verify:
- [ ] No imports from `../burrfriends/`, `../poker/`, or `../../src/`
- [ ] All DB queries use `basketballDb.ts` with schema headers
- [ ] All table names are in `basketball.*` schema
- [ ] No modifications to files outside `basketball/`
- [ ] All env vars are app-specific or clearly documented as shared

---

## 🚨 Red Flags (STOP if you see these)

- ❌ Importing from `../burrfriends/src/` or `../poker/src/`
- ❌ Accessing `public.*` or `poker.*` schemas
- ❌ Modifying root `vercel.json` or root `package.json`
- ❌ Creating tables without schema prefix
- ❌ Using raw Supabase client without schema headers
- ❌ Sharing state/utilities with other apps

---

## ✅ Verification Commands

```bash
# Verify folder structure
ls basketball/src/  # Should exist
ls basketball/package.json  # Should exist

# Verify no cross-app imports (run in basketball/)
grep -r "from.*\.\./burrfriends" src/
grep -r "from.*\.\./poker" src/
grep -r "from.*\.\./\.\./src" src/
# Should return no results

# Verify schema isolation
grep -r "public\." basketball/src/  # Should be minimal (only if needed)
grep -r "poker\." basketball/src/  # Should return no results
grep -r "Accept-Profile.*basketball" basketball/src/  # Should exist
```

---

**Remember**: When in doubt, ask. It's better to confirm isolation than to break existing projects.
