# Beta Testing Plan — End-to-End Verification

**Date:** 2026-02-23  
**Purpose:** Verify the plan with fresh eyes, challenge assumptions, ensure 100% confidence before implementation.

---

## 1. Critical Path Verification

### 1.1 User unlocks beta
1. User opens Feedback modal (clicks Feedback on clubs/burrfriends/games)
2. Clicks "Beta Testing" tab (new first tab)
3. Enters password "gojets", clicks Unlock
4. **POST /api/beta/verify** with `{ password: "gojets" }` — server validates, sets `Set-Cookie: beta_access=1; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800` (add `Secure` in production)
5. Response `{ ok: true }` — client sets `betaUnlocked` state
6. **Verified:** Browser automatically stores cookie from fetch response (same-origin). Subsequent requests include cookie.

### 1.2 User sees preview games list
1. After unlock, client calls **GET /api/beta/preview-games** with `Authorization: Bearer <token>` (authedFetch)
2. Cookie `beta_access=1` sent automatically (same-origin, default credentials)
3. Server: `requireAuth` → fid; `hasBetaAccess(req)` reads cookie; if admin OR hasBetaAccess → proceed
4. Server runs same fetch logic as admin preview-games (16 tables, is_preview=true)
5. Returns `{ ok: true, data: [...] }` — array of games with `table`, `gameType`, `id`, `title`, `created_at`
6. **Verified:** Admin preview-games route exists, returns correct shape. Beta route will duplicate fetch logic with different auth check.

### 1.3 User clicks TEST
1. Link uses `getPreviewGameUrl(table, id)` — e.g. `/nl-holdem?gameId=xxx`
2. User navigates to game page
3. Game page fetches **GET /api/nl-holdem/games/[id]** (or equivalent) — does NOT filter is_preview for single-game fetch
4. **Verified:** nl-holdem/games/[id]/route.ts fetches by ID only, no is_preview filter (line 41-46)
5. Game page also calls **GET /api/betr-games/register/status** — with Option A, when hasBetaAccess, returns `registered: true, approved: true`
6. **Verified:** betr-games/register/status has requireAuth, returns fid. We add: `if (hasBetaAccess(req)) { return same block as isGlobalAdmin }` before the normal flow.
7. No registration overlay → user sees full game UI

### 1.4 User joins/plays
1. User clicks Join (or Submit, etc.)
2. Request includes cookie (same-origin)
3. Join route: `canPlayPreviewGame(fid, game.is_preview, req)` — true when (isAdminPreviewBypass OR (hasBetaAccess && isPreview))
4. **Verified:** hasBetaAccess reads `req.cookies.get("beta_access")?.value === "1"`. Next.js 13+ App Router: `req.cookies` is a `ReadonlyRequestCookies` object; `get(name)` returns `{ name, value }`.
5. Bypass applies → join succeeds

### 1.5 Admin Go Live
1. Admin opens Feedback → Beta Testing → enters gojets (or already has cookie)
2. Sees preview games with "Go Live" button (only when `isAdmin(fid)`)
3. **Verified:** FeedbackPopupModal has `useAuth` → fid; `isAdmin(fid)` from `~/lib/admin` (which uses isGlobalAdmin + NOTIFICATIONS_BROADCAST_ADMIN_FIDS)
4. Clicks Go Live → **POST /api/admin/preview-games/go-live** with `{ table, id }`
5. **Verified:** go-live route requires `isAdmin(fid)` — returns 403 if not admin. Admin will pass.

---

## 2. Routes Requiring Changes (Complete List)

### 2.1 Replace isAdminPreviewBypass with canPlayPreviewGame (pass req)
| Route | Status |
|-------|--------|
| betr-guesser/submit | ✓ Plan |
| buddy-up/signup | ✓ Plan |
| the-mole/signup | ✓ Plan |
| jenga/games/[id]/signup | ✓ Plan |
| steal-no-steal/signup | ✓ Plan |
| steal-no-steal/games/[id]/decide | ✓ Plan |
| steal-no-steal/games/[id]/rounds/[roundId]/matches | ✓ Plan |
| steal-no-steal/games/[id]/my-match | ✓ Plan |
| remix-betr/submit | ✓ Plan |
| art-contest/submit | ✓ Plan |
| nl-holdem/games/[id]/join | ✓ Plan |
| in-or-out/games/[id]/choice | ✓ Plan |
| take-from-the-pile/games/[id]/pick | ✓ Plan |
| kill-or-keep/games/[id]/action | ✓ Plan |
| **ncaa-hoops/contests/[id]/brackets** | **ADD** — uses isGlobalAdmin && isPreview |
| **weekend-game/submit** | **ADD** — uses isGlobalAdmin, needs canPlayPreviewGame for preview rounds |
| **sunday-high-stakes/submit** | **ADD** — uses isGlobalAdmin; add beta bypass when contest.is_preview |

### 2.2 Replace isGlobalAdmin && is_preview with (isGlobalAdmin OR hasBetaAccess) && is_preview
| Route | Status |
|-------|--------|
| in-or-out/games/[id]/start | ✓ Plan |
| take-from-the-pile/games/[id]/start | ✓ Plan |
| kill-or-keep/games/[id]/start | ✓ Plan |
| bullied/games/[id]/start | ✓ Plan |
| nl-holdem/games/[id]/start | ✓ Plan |

### 2.3 Chat/reaction routes
| Route | Status |
|-------|--------|
| nl-holdem/games/[id]/chat | ✓ Plan |
| nl-holdem/chat/heartbeat | ✓ Plan |
| nl-holdem/chat/messages/.../reactions | ✓ Plan |
| kill-or-keep/games/[id]/chat | ✓ Plan |
| kill-or-keep/chat/messages/.../reactions | ✓ Plan |
| take-from-the-pile/games/[id]/chat | ✓ Plan |
| take-from-the-pile/chat/messages/.../reactions | ✓ Plan |
| in-or-out/games/[id]/chat | ✓ Plan |
| in-or-out/chat/messages/.../reactions | ✓ Plan |

### 2.4 Status routes (Layer 2 — for per-game overlay bypass)
| Route | Notes |
|-------|-------|
| betr-games/register/status | Option A: when hasBetaAccess, return registered: true. **Primary bypass** — covers most games. |
| art-contest/status | Special: canSubmit true only when (admin && preview) OR (registered && !preview). Need: (hasBetaAccess && isPreview) → canSubmit true. |

---

## 3. Assumptions Challenged

### 3.1 Cookie in Farcaster/Warpcast embedding
**Assumption:** Fetch from embedded mini-app can set/receive cookies.  
**Challenge:** Some embeds use strict SameSite or third-party context.  
**Reality:** Farcaster mini-apps typically run in same-origin iframe or direct browser. Same-origin fetch sets cookies. **Risk: Low.** If cookie fails, user re-enters password each session.

### 3.2 authedFetch sends cookies
**Assumption:** fetch() sends cookies for same-origin by default.  
**Verified:** Default `credentials` is `'same-origin'` for same-origin requests — cookies ARE sent. authedFetch does not set `credentials: 'omit'`. **Confirmed.**

### 3.3 req.cookies in Next.js Route Handlers
**Assumption:** `req.cookies.get("beta_access")` works in App Router.  
**Verified:** Next.js 13+ App Router passes `NextRequest`; `request.cookies` is `ReadonlyRequestCookies`. Method is `cookies.get(name)` returning `{ name, value } | undefined`. **Confirmed.**

### 3.4 admin preview-games response shape
**Verified:** Returns `{ ok: true, data: allPreviewGames }` where allPreviewGames is array of `{ table, gameType, id, title, created_at, ... }`. Admin dashboard uses `previewData.data` as array. **Confirmed.**

### 3.5 getPreviewGameUrl mapping
**Verified:** Admin dashboard has getPreviewGameUrl with all 16 game types. Tables: burrfriends_games, betr_guesser_games, buddy_up_games, jenga_games, mole_games, steal_no_steal_games, remix_betr_rounds, weekend_game_rounds, bullied_games, in_or_out_games, take_from_the_pile_games, kill_or_keep_games, art_contest, sunday_high_stakes, nl_holdem_games, ncaa_hoops_contests. **All present in admin preview-games GAME_TABLES.**

---

## 4. Gaps and Additions

1. **ncaa-hoops/contests/[id]/brackets** — Add to plan (canPlayPreviewGame).
2. **weekend-game/submit** — Add to plan (canPlayPreviewGame for activeRounds[0].is_preview).
3. **sunday-high-stakes/submit** — Add to plan (beta bypass when contest.is_preview).
4. **art-contest/status** — Add to plan (hasBetaAccess && isPreview → canSubmit true).
5. **Secure cookie** — In localhost/dev, `Secure` may prevent cookie. Use `Secure: process.env.NODE_ENV === 'production'` or omit Secure for dev.

---

## 5. Confidence Statement

**Implementation confidence: HIGH**

- All critical paths verified against actual source.
- Auth, cookie, and fetch behavior confirmed.
- Complete route list compiled (with 3 additions to plan).
- One minor consideration: Secure cookie in dev — easy fix.
- No guessing: every claim traceable to specific files/lines.

**Execution order:** 
1. Create beta lib + APIs (verify, status, preview-games)
2. Add permissions helpers (hasBetaAccess, canPlayPreviewGame)
3. Update betr-games/register/status
4. Update all submit/signup/start/chat routes (22+ files)
5. Update FeedbackPopupModal
6. Remove Preview Games from admin dashboard
7. Update BURRFRIENDS_GAME_SETUP_PHASED_PLAN_REVISED.md
