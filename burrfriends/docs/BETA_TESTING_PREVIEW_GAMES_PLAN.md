# Beta Testing: Move Preview Games to Feedback Tab (Plan)

**Source:** User request + BURRFRIENDS_GAME_SETUP_PHASED_PLAN_REVISED.md  
**Goal:** Move preview games from admin dashboard to the Feedback tab, behind a "Beta Testing" button with password "gojets". Any authenticated user with the password can access and play preview games (not just admins). All preview access lives in Feedback → Beta Testing — not in the Results tab.

---

## 1. Current State

- **Preview games** live in the **Admin Dashboard** (`/admin/dashboard`) in a "Preview Games" section (admin-only)
- **Admin bypass:** `isAdminPreviewBypass(fid, isPreview)` lets global admins play preview games without BETR GAMES registration or staking
- **Feedback tab:** `FeedbackPopupModal` opens from the "Feedback" button on clubs/burrfriends/games header; has tabs "Submit Feedback" and "My Feedback"

---

## 2. Target State

- **Beta Testing** appears as a **tab at the top** of the Feedback modal (first tab, before Submit Feedback)
- Password **"gojets"** (hardcoded) unlocks the beta section
- **Anyone** with the password can see the preview games list and play them
- **All** preview game access (list, TEST links, Go Live) lives in Beta Testing — **remove** Preview Games from admin dashboard
- Admin creates games from dashboard (Create Game modal) but accesses preview games via Feedback → Beta Testing; "Go Live" button appears in Beta tab for admins only
- Preview games behave **identically** to live games — same flow, same performance; only visibility differs (behind beta password)

---

## 3. Implementation Plan

### 3.1 Beta Access (Cookie + API)

**Why a cookie?** The backend must know that a user has entered the correct password. A signed cookie is set after verification so every API request (join, submit, etc.) can check `hasBetaAccess(req)` without re-entering the password. Without it, we couldn't verify on the server that the user unlocked beta. Expiry: 7 days.

1. **POST /api/beta/verify**
   - Body: `{ password: string }`
   - If `password === "gojets"`: set cookie `beta_access=1` (httpOnly, secure, SameSite=Lax, maxAge=7*24*60*60), return `{ ok: true }`
   - Else: return `{ ok: false, error: "Invalid password" }`
   - Auth: `requireAuth` (must be logged in to unlock beta)

2. **GET /api/beta/status**
   - Returns `{ hasAccess: boolean }` by reading `beta_access` cookie
   - Auth: optional (unauthenticated returns `hasAccess: false`)

3. **Helper: `hasBetaAccess(req: NextRequest): boolean`**
   - Location: `src/lib/permissions.ts` or new `src/lib/beta.ts`
   - Reads `req.cookies.get("beta_access")?.value === "1"`

4. **Helper: `canPlayPreviewGame(fid, isPreview, req?): boolean`**
   - Returns `true` when:
     - `isAdminPreviewBypass(fid, isPreview)` OR
     - `(hasBetaAccess(req) && isPreview === true)`
   - Use in all submit/signup/start/chat routes that currently use `isAdminPreviewBypass`

### 3.2 Preview Games List (Non-Admin Access)

5. **GET /api/beta/preview-games** (NEW)
   - Auth: `requireAuth`
   - Access: `isAdmin(fid) OR hasBetaAccess(req)`
   - Returns same payload as `GET /api/admin/preview-games` (reuse logic or call shared helper)
   - Used by Feedback modal Beta Testing tab

### 3.3 Feedback Modal UI

6. **FeedbackPopupModal.tsx**
   - Add tab type: `"beta" | "submit" | "my"`
   - Add **"Beta Testing"** as first tab (leftmost)
   - Beta tab content:
     - If not unlocked: password input + "Unlock" button; on success call POST /api/beta/verify, set local state `betaUnlocked`
     - If unlocked (cookie set or `betaUnlocked`): fetch GET /api/beta/preview-games, render game cards with TEST links (same structure as former admin Preview Games)
   - Use `getPreviewGameUrl(table, id)` — extract to shared util or duplicate mapping
   - **Go Live** button: show per game card when `isAdmin(fid)`; calls POST /api/admin/preview-games/go-live (admin-only API)

### 3.4 Backend: Extend Bypass to Beta Users

**Submit/signup routes** (replace `isAdminPreviewBypass` with `canPlayPreviewGame`):

| File | Current | Change |
|------|---------|--------|
| `betr-guesser/submit` | isAdminPreviewBypass | canPlayPreviewGame(fid, game.is_preview, req) |
| `buddy-up/signup` | isAdminPreviewBypass | canPlayPreviewGame |
| `the-mole/signup` | isAdminPreviewBypass | canPlayPreviewGame |
| `jenga/games/[id]/signup` | isAdminPreviewBypass | canPlayPreviewGame |
| `steal-no-steal/signup` | isAdminPreviewBypass | canPlayPreviewGame |
| `steal-no-steal/games/[id]/decide` | isAdminPreviewBypass | canPlayPreviewGame |
| `steal-no-steal/games/[id]/rounds/[roundId]/matches` | isAdminPreviewBypass | canPlayPreviewGame |
| `steal-no-steal/games/[id]/my-match` | isAdminPreviewBypass | canPlayPreviewGame |
| `remix-betr/submit` | isAdminPreviewBypass | canPlayPreviewGame |
| `art-contest/submit` | isAdminPreviewBypass | canPlayPreviewGame |
| `nl-holdem/games/[id]/join` | isAdminPreviewBypass | canPlayPreviewGame |
| `in-or-out/games/[id]/choice` | isAdminPreviewBypass | canPlayPreviewGame |
| `in-or-out/games/[id]/start` | isGlobalAdmin && is_preview | isGlobalAdmin OR hasBetaAccess, when is_preview |
| `take-from-the-pile/games/[id]/pick` | isAdminPreviewBypass | canPlayPreviewGame |
| `take-from-the-pile/games/[id]/start` | isGlobalAdmin && is_preview | isGlobalAdmin OR hasBetaAccess, when is_preview |
| `kill-or-keep/games/[id]/action` | isAdminPreviewBypass | canPlayPreviewGame |
| `kill-or-keep/games/[id]/start` | isGlobalAdmin && is_preview | isGlobalAdmin OR hasBetaAccess, when is_preview |
| `bullied/games/[id]/start` | isGlobalAdmin && is_preview | isGlobalAdmin OR hasBetaAccess, when is_preview |
| **`ncaa-hoops/contests/[id]/brackets`** | isGlobalAdmin && isPreview | canPlayPreviewGame (bracket submit) |
| **`weekend-game/submit`** | isGlobalAdmin | canPlayPreviewGame for activeRound.is_preview |
| **`sunday-high-stakes/submit`** | isGlobalAdmin | add beta bypass when contest.is_preview |

**Status routes** (for per-game UI when Option A insufficient):
| **`art-contest/status`** | admin && isPreview → canSubmit | add hasBetaAccess && isPreview → canSubmit |

**Chat/reaction routes** (same pattern):

| File | Change |
|------|--------|
| nl-holdem/games/[id]/chat | canPlayPreviewGame |
| nl-holdem/chat/heartbeat | canPlayPreviewGame |
| nl-holdem/chat/messages/.../reactions | canPlayPreviewGame |
| kill-or-keep/games/[id]/chat | canPlayPreviewGame |
| kill-or-keep/chat/messages/.../reactions | canPlayPreviewGame |
| take-from-the-pile/games/[id]/chat | canPlayPreviewGame |
| take-from-the-pile/chat/messages/.../reactions | canPlayPreviewGame |
| in-or-out/games/[id]/chat | canPlayPreviewGame |
| in-or-out/chat/messages/.../reactions | canPlayPreviewGame |

### 3.5 Registration Overlay Bypass for Beta Users

Beta users need to **see the game UI** on preview game pages without the BETR GAMES registration overlay.

**Option A (simpler):** When `hasBetaAccess`, `GET /api/betr-games/register/status` returns `registered: true, approved: true`.  
- Pro: One place to change. Beta users bypass blur everywhere.  
- Con: Beta users could theoretically play live games without registering. Mitigation: password is shared intentionally for testers; live games still enforce staking/eligibility per game.

**Option B (stricter):** Per-game status routes return `registered: true` when `hasBetaAccess(req)` AND the specific game/contest is preview.  
- Pro: Beta bypass only for preview games.  
- Con: More routes to touch; game pages may use global status for overlay.

**Recommendation:** Option A — when beta cookie is set, treat as registered. Password "gojets" is for trusted testers; scope is minimal.

### 3.6 Admin Dashboard

- **Remove** Preview Games section entirely from admin dashboard
- Admin still has Create Game (with Preview/Live toggle); after creating a preview game, admin goes to Feedback → Beta Testing to see it and use Go Live

---

## 4. Files to Create

| File | Purpose |
|------|---------|
| `src/app/api/beta/verify/route.ts` | POST verify password, set cookie |
| `src/app/api/beta/status/route.ts` | GET beta access status |
| `src/app/api/beta/preview-games/route.ts` | GET preview games (admin or beta access) |
| `src/lib/beta.ts` (optional) | hasBetaAccess, BETA_PASSWORD constant |

---

## 5. Files to Modify

| File | Changes |
|------|---------|
| `src/lib/permissions.ts` | Add `canPlayPreviewGame(fid, isPreview, req?)`, `hasBetaAccess(req)` |
| `src/components/FeedbackPopupModal.tsx` | Add Beta Testing tab, password gate, preview games list |
| `src/app/api/betr-games/register/status/route.ts` | When hasBetaAccess, return registered: true, approved: true |
| All submit/signup/start/chat routes listed in §3.4 | Use canPlayPreviewGame or hasBetaAccess |

---

## 6. BURRFRIENDS_GAME_SETUP_PHASED_PLAN_REVISED.md Updates

- **Preview Games section (§49–56):** Add subsection "Beta Testing (Phase 29.2)" describing:
  - Beta Testing tab in Feedback modal
  - Password "gojets" for any account
  - GET /api/beta/verify, GET /api/beta/status, GET /api/beta/preview-games
  - canPlayPreviewGame extends isAdminPreviewBypass for beta cookie holders
  - betr-games/register/status returns registered for hasBetaAccess
- **Phase 29.1:** Note that beta users (with cookie) get same bypass as admins for preview games
- **Change log:** Add entry for Phase 29.2 Beta Testing

---

## 7. URL Mapping (Same as Admin)

Reuse `getPreviewGameUrl` logic for Beta tab:

- Poker → `/games/{id}`
- BETR GUESSER → `/betr-guesser?gameId={id}`
- BUDDY UP → `/buddy-up?gameId={id}`
- JENGA → `/jenga?gameId={id}`
- THE MOLE → `/the-mole?gameId={id}`
- STEAL OR NO STEAL → `/steal-no-steal?gameId={id}`
- FRAMEDL BETR → `/remix-betr?roundId={id}`
- WEEKEND GAME → `/weekend-game?roundId={id}`
- BULLIED → `/bullied?gameId={id}`
- IN OR OUT → `/in-or-out?gameId={id}`
- TAKE FROM THE PILE → `/take-from-the-pile?gameId={id}`
- KILL OR KEEP → `/kill-or-keep?gameId={id}`
- ART CONTEST → `/art-contest?contestId={id}`
- SUNDAY HIGH STAKES → `/sunday-high-stakes?contestId={id}`
- NL HOLDEM → `/nl-holdem?gameId={id}`
- NCAA HOOPS → `/ncaa-hoops?contestId={id}`

---

## 8. Testing Checklist

1. Admin: create preview game (Create Game, Preview toggle) → open Feedback → Beta Testing → enter "gojets" → sees game → TEST and Go Live work
2. Non-admin: open Feedback → Beta Testing tab → enter "gojets" → sees preview games → clicks TEST → can play (full flow like live)
3. Non-admin: wrong password → stays on password screen
4. Beta user: cookie expires after 7 days → must re-enter password
5. Beta user: can submit/signup/chat in preview games (identical behavior to live)
6. Beta user: registration overlay bypassed when cookie set
7. Admin dashboard: no Preview Games section; create flow unchanged

---

## 9. Resolved Decisions

1. **Registration bypass:** Option A — when beta cookie is set, treat as registered (betr-games/register/status returns registered: true). Games act like live; beta is for trusted testers.
2. **Cookie expiry:** 7 days.
3. **Admin dashboard:** Remove Preview Games section; all preview access via Feedback → Beta Testing (admins see Go Live there).

---

## 10. Bug: "No game found" on Heads-Up Join (Separate Investigation)

**Report:** User A joins a 1v1 (heads-up) game; User B tries to join and gets "no game found" while User A is still playing.

**Potential causes:**
- **NL Holdem:** When User A joins, table fills (2/2), `startGameWhenFull` runs, status → in_progress. User B would normally get "Signups are closed" (400), not "Game not found" (404). A 404 implies the game fetch returned no rows — could be wrong gameId, schema, or a different game type.
- **Poker (burrfriends_games):** `requireGameAccess` runs before game fetch; if it throws "not found", the error could propagate. Check `pokerPermissions.requireGameAccess` and `pokerDb.fetch` for `burrfriends_games`.
- **Client display:** The UI might show a generic "no game found" for 404, 400, or 403 — the exact API error should be logged.

**Suggested debug:** Capture exact API response (status + body) when User B joins; confirm game type (NL Holdem vs Poker); verify both users use same gameId. This bug is orthogonal to Beta Testing but should be fixed.
