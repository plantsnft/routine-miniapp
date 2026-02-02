# Catwalk-Only Deployment: Verified Plan

## Current State (Verified)

### 1. Repo structure (monorepo)

- **Root = Catwalk app**
  - `package.json` name: `"catwalk"`
  - `src/` = Next.js app (portal, engagement, webhooks, cron, etc.)
  - `vercel.json`, `next.config.ts`, `tailwind.config.ts` at root
  - This is what runs at **catwalk-smoky.vercel.app**

- **Other apps (not deployed by this Vercel project)**
  - `basketball/` – separate app (excluded from root build)
  - `burrfriends/` – separate app (excluded from root build)
  - `poker/` – separate app (excluded from root build)
  - `catwalkagent/` – scripts only (not a Next app)

- **Build behavior**
  - `tsconfig.json` has `"exclude": ["node_modules", "poker", "burrfriends", "basketball"]`
  - Root `next build` only compiles root `src/` and root config; it does not build basketball, burrfriends, or poker.

### 2. How Catwalk is deployed today

- **One Vercel project:** "routine"
- **Domain:** catwalk-smoky.vercel.app
- **Git:** Connected to `plantsnft/routine-miniapp`, branch `master`
- **Root directory:** Not set in `vercel.json` → Vercel uses **repo root**
- **Build:** Runs `next build` at repo root → builds only the root Next.js app = **Catwalk**
- **Result:** Every push to `master` triggers one build and one deployment: the Catwalk app. Basketball, burrfriends, and poker are **not** built or deployed by this project.

So today: **only the Catwalk app is deployed** by this Vercel project. The other folders are just present in the repo; they are excluded from the root build and are not deployed here.

---

## What “only push to the catwalk mini app” can mean

### Interpretation A: “Only Catwalk should deploy from this repo”

- **Status:** Already true.
- This Vercel project builds only the root app (Catwalk). No separate deployment of basketball/poker/burrfriends from this project.

### Interpretation B: “Only deploy when Catwalk-relevant files change”

- **Status:** Not in place today. Any push to `master` (including changes only in `basketball/`, `burrfriends/`, `poker/`, or docs) triggers a Catwalk build.
- **Optional improvement:** Use Vercel’s **Ignore Build Step** so that builds run only when “Catwalk” paths (and shared root config) change.

---

## Verified plan options

### Option 1: Do nothing (keep current behavior)

- **What happens:** Push to `master` → Vercel builds from root → deploys Catwalk to catwalk-smoky.vercel.app. Other folders never get deployed by this project.
- **When to use:** If you’re fine with a build on every push (even when only other apps or docs change).
- **Action:** None. No code or config changes.

---

### Option 2: Deploy only when Catwalk-relevant files change (recommended if you want fewer builds)

- **Goal:** Trigger a Catwalk deployment only when files that affect the Catwalk app change. Pushes that only touch basketball, burrfriends, poker, or unrelated docs do not trigger a build.
- **How:** Use Vercel’s **Ignore Build Step** (Vercel runs a command; if it exits 0 → build, non‑zero → skip build).

**Steps (no edits yet; plan only):**

1. **Add Ignore Build Step in Vercel**
   - Vercel Dashboard → Project **routine** → **Settings** → **Git**
   - Find **“Ignore Build Step”**
   - Choose **“Override”** and set a custom command (see below).

2. **Command behavior**
   - Exit **0** → run build (deploy Catwalk).
   - Exit **1** → skip build (do not deploy).

3. **What counts as “Catwalk-relevant”**
   - Anything that affects the root Next.js app:
     - `src/**`
     - `public/**`
     - Root config: `package.json`, `package-lock.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `tsconfig.json`, `components.json`, `vercel.json`
     - Root env/tooling: `.env*`, `index.d.ts`, `next-env.d.ts`
   - **Not** Catwalk (skip build if only these change):
     - `basketball/**`
     - `burrfriends/**`
     - `poker/**`
     - `catwalkagent/**`
     - `contracts/**`
     - `scripts/**` (unless you later decide scripts affect Catwalk)
     - Root-level `.md` files (docs only)

4. **Implementing the ignore step**
   - **Option A – Script in repo (recommended):** Add a small script (e.g. `scripts/vercel-ignore-build.mjs` or `.github/vercel-ignore-build.sh`) that:
     - Uses `git diff` against the commit that triggered the build (Vercel provides `VERCEL_GIT_PREVIOUS_SHA` and `VERCEL_GIT_COMMIT_REF`) to see what changed.
     - Exits 0 if any changed file is under Catwalk-relevant paths (and root config), 1 otherwise.
   - **Option B – Inline in Vercel:** In “Ignore Build Step”, use a one-liner that runs that logic (e.g. `node scripts/vercel-ignore-build.mjs`).

5. **Vercel env (optional but useful)**
   - Ensure the project has access to the Git refs (Vercel usually provides `VERCEL_GIT_PREVIOUS_SHA`, `VERCEL_GIT_COMMIT_SHA`, `VERCEL_GIT_COMMIT_REF`). No need to set these manually; they’re provided in the build.

**Result:** Pushes that only change basketball, burrfriends, poker, or docs no longer trigger a Catwalk build. Only “Catwalk-relevant” changes deploy to catwalk-smoky.vercel.app.

---

### Option 3: Separate repo for Catwalk only

- **Goal:** Catwalk has its own repo; only that repo is connected to the Vercel project. Pushing other apps never touches Catwalk’s deployment.
- **How:** New repo (e.g. `plantsnft/catwalk-miniapp`) containing only the root Catwalk app (root `src/`, root config, root `public/`, etc.). Move or copy only those paths. Point Vercel project “routine” at this new repo.
- **Trade-off:** Bigger one-time move; you gain total isolation and no need for an ignore-build script. No code edits to the app itself; only repo structure and Vercel Git connection change.

---

## Recommendation (verified, no guessing)

- **If you only want to confirm:** “Only Catwalk is deployed from this project” → **Option 1**. Already true; no change.
- **If you want to avoid builds when you only change other apps or docs:** Implement **Option 2** (Ignore Build Step + script that considers Catwalk-relevant paths only).
- **If you want strict separation and are okay moving repo:** Use **Option 3** (separate Catwalk repo).

---

## Summary table

| Question | Answer |
|----------|--------|
| What is deployed to catwalk-smoky.vercel.app? | The **root** Next.js app (Catwalk) only. |
| Are basketball / burrfriends / poker deployed by this project? | **No.** They are excluded from the root build and are not deployed here. |
| Does every push to `master` currently trigger a Catwalk build? | **Yes.** |
| Can we trigger builds only when Catwalk-relevant files change? | **Yes.** Use Vercel Ignore Build Step + a script that exits 0 only when Catwalk-relevant paths change (Option 2). |
| Do we need to edit app code for “only Catwalk” deployment? | **No.** Option 1 = no edits. Option 2 = add a small script and set Ignore Build Step in Vercel. Option 3 = repo move and Vercel re-link only. |

---

## Next step (your choice)

1. **Keep as-is:** Do nothing; you’re already deploying only Catwalk from this project.
2. **Fewer builds:** Implement Option 2 (Ignore Build Step + Catwalk-path script); I can outline the exact script and Vercel UI steps when you’re ready.
3. **Separate repo:** Proceed with Option 3 (new repo + Vercel re-link); I can give a step-by-step checklist.

No code or config has been changed in this plan; it is verification and a clear path for how to deploy only the Catwalk mini app.
