# BUDDY UP v2 – Setup & workflow

This doc explains how we’re building BUDDY UP v2 **in parallel** with v1, how to test it (including with Farcaster auth), and how to **replace v1** when v2 is ready.

---

## 1. What we’re doing

| | v1 (current) | v2 (new) |
|---|--------------|----------|
| **Page** | `/buddy-up` | `/buddy-up-v2` |
| **API** | `/api/buddy-up/*` | **Same** – v2 page uses v1 API |
| **DB** | `poker.buddy_up_*` | **Same** – reuse v1 tables, no new game tables |
| **Status** | Live, unchanged | In development (mostly UI/UX) |

- v1 stays as-is so current players and games keep working.
- v2 is **mostly UI/UX changes**: one new **page** at `/buddy-up-v2` that calls the **existing** `/api/buddy-up/*` API and uses the **existing** `poker.buddy_up_*` tables.
- We **evolve the existing API** for a few backend features (e.g. round-started notification, group chat for admins); both v1 and v2 benefit.
- When v2 is ready, we **fully replace** v1: remove v1 page, rename v2 → `/buddy-up`. One Create flow, one API, same DB.

---

## 2. Testing with Farcaster auth (no local Warpcast)

Farcaster mini apps use “auto login” from the Warpcast (or similar) app. That only works when the mini app is opened **inside** the Farcaster client.

### You **don’t** need to run `npm run dev` on your laptop to test auth

- `npm run dev` is still useful for UI/layout and for API work that doesn’t need Farcaster auth.
- For flows that need Farcaster login (sign up, voting, etc.), use a **deployed** URL that you open **in Warpcast**.

### Use **Vercel Preview** URLs to test v2 with real auth

1. **Create a branch** (e.g. `buddy-up-v2`) and push your v2 work.
2. **Open a Pull Request** into `main`. Vercel will build and deploy a **preview** for that PR.
3. **Copy the preview URL** from the PR (e.g. `https://burrfriends-git-buddy-up-v2-<team>.vercel.app`).
4. **Open that URL in Warpcast**:
   - Paste the URL in a cast and tap it, or  
   - Use “Open link in Warpcast” from your browser (if available), or  
   - Use the in-app browser that follows Farcaster frame/mini-app links.
5. The app will load on that preview URL **with Farcaster auth**, so you can test sign-up, voting, etc.

The red **“PREVIEW DEPLOYMENT”** banner (from `PreviewBanner`) helps you see you’re on a preview, not production.

---

## 3. Branches (simplified)

You can do this in two ways.

### Option A: Work on `main` (simplest)

- All v2 code lives on `main` (e.g. `/buddy-up-v2` page; we evolve `/api/buddy-up/*` in place).
- The “Try v2 (preview)” link on the games page goes to `/buddy-up-v2`.
- When you want a **separate** preview URL (e.g. to test a big change without touching production):
  - Create a short‑lived branch, push, open a PR, and use that PR’s Vercel preview URL in Warpcast.

### Option B: Long‑lived `buddy-up-v2` branch

- All v2 work happens on a `buddy-up-v2` branch.
- You merge to `main` only when you’re ready to **replace v1 with v2** (see “Replacing v1” below).
- `main` stays as production (v1) until that merge.

Use whichever fits how you like to work; both work with Vercel previews and Warpcast.

---

## 4. “Try v2 (preview)” link

On the **BETR GAMES** section of the games page (`/clubs/[slug]/games`), the BUDDY UP card has a small link:

**“Try v2 (preview) →”** → `/buddy-up-v2`

- So testers and you can reach v2 from the same place as v1.
- When we **replace v1**, we remove this link and make the main BUDDY UP card point to the new `/buddy-up` (which will be v2).

---

## 5. Replacing v1 when v2 is ready

When v2 is feature‑complete and tested:

1. **DB**  
   - No change: we reuse `poker.buddy_up_*` tables. No judge/roles table; group chat uses `isAdmin` (same as create games).

2. **Page – swap in place**  
   - Remove the v1 page: `src/app/buddy-up/page.tsx` (or rename/back up).  
   - Rename v2 → v1: `src/app/buddy-up-v2/page.tsx` → `src/app/buddy-up/page.tsx`.  
   - In that page: update any links or `fetch` URLs from `/buddy-up-v2` to `/buddy-up` (e.g. Share, Copy link, Back). The page already uses `/api/buddy-up/*`; no API rename.

3. **Games page**  
   - Remove the “Try v2 (preview)” link.  
   - The main BUDDY UP card already points to `/buddy-up`, which is now v2.

4. **Create / settle / notifications**  
   - `CreateBuddyUpGameModal` and any notifications that use `/buddy-up?gameId=...` keep working, since the path stays `/buddy-up`.

5. **Deploy**  
   - Merge to `main` and deploy. After that, BUDDY UP is v2.

---

## 6. Files and places to touch

### Already done in this setup

- `src/app/buddy-up-v2/page.tsx` – v2 page (starts as “Under construction”).
- `src/app/clubs/[slug]/games/page.tsx` – “Try v2 (preview)” link on the BUDDY UP card.

### When you start building real v2 behavior

- **v2 page:** `src/app/buddy-up-v2/page.tsx` – copy from v1 and apply UI/UX fixes (see BUDDY_UP_V2_PLAN.md).
- **v1 API (evolve in place):** e.g. `rounds/route.ts` (round-started notification), `groups/[groupId]/chat/route.ts` (admin chat access via `isAdmin`, same as create games). Both v1 and v2 benefit.
- **CreateBuddyUpGameModal** – no change; it already uses `/api/buddy-up/games`. When we swap, it keeps creating games for the same API/DB.
- **DB:** No new tables. Group chat uses `isAdmin`; admins (plants, burr) serve as judges with full read/write. No `betr_judges` or `BETR_JUDGE_FIDS`.
- `src/components/CreateBuddyUpGameModal.tsx` – later you may add a “Create v2 game” or switch the modal to create v2 games; for now it can keep creating v1 games.
- DB: `supabase_migration_buddy_up_v2_*.sql` when you define new or changed tables for v2.

---

## 7. Decisions (answered)

| Question | Answer |
|----------|--------|
| **What changes in v2?** | Mostly **UI/UX** (gameplay, rounds, group sizes, voting, prizes, staking stay as in v1). |
| **New DB tables or reuse v1?** | **Reuse v1** `poker.buddy_up_*` tables. No `buddy_up_v2_*`, no `version` column. |
| **Who sees "Try v2 (preview)"?** | **Everyone** (no change). |
| **Create flow when v2 is live?** | **Fully replace v1.** One "Create BUDDY UP game" → same API/DB. No separate "Create v2" flow. |

**Vercel:** We assume you deploy from `main` and get preview URLs for PRs; the "open preview in Warpcast" flow relies on that. If different, we can adjust.

---

## 8. Open questions

- **Hotfix v1?** Vote refresh and chat contrast can stay v2-only. **Deep link `?gameId=` is required on v1** — not optional. Notifications use `targetUrl: /buddy-up?gameId=...`; v1 users who tap those links must land on the selected game.

---

## 9. Quick reference

| Task | How |
|------|-----|
| Open v2 | Games page → BUDDY UP card → “Try v2 (preview)”, or go to `/buddy-up-v2`. |
| Test v2 with Farcaster auth | Push to a branch → PR → Vercel preview URL → open that URL **in Warpcast**. |
| Work on v2 | Edit `src/app/buddy-up-v2/page.tsx`; evolve `src/app/api/buddy-up/*` for round notification, admin chat access, etc. |
| Replace v1 with v2 | Swap routes as in §5, remove “Try v2” link, deploy. |

---

*If you use a long‑lived `buddy-up-v2` branch: merge to `main` only when you’re about to do the swap in §5; until then, use that branch’s Vercel preview for v2.*
