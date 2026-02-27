# Copy Game URL and Share — Implementation Plan (Including Poker App)

## 1. Scope

**Apps:** burrfriends and **poker** (Hellfire Club).

**Pages:**

| App | Page | Route / context | Has Share today? | Add Share? | Add Copy? | URL to copy |
|-----|------|------------------|------------------|------------|-----------|-------------|
| burrfriends | Club/poker games | `src/app/games/[id]/page.tsx` | ✅ | — | ✅ | `APP_URL/games/{id}` |
| burrfriends | BETR GUESSER | `src/app/betr-guesser/page.tsx` (`game` / `selectedGameId`) | ✅ | — | ✅ | `APP_URL/betr-guesser?gameId={selectedGameId}` |
| burrfriends | REMIX BETR | `src/app/remix-betr/page.tsx` | ✅ | — | ✅ | `APP_URL/remix-betr` |
| burrfriends | BUDDY UP | `src/app/buddy-up/page.tsx` (`game` / `selectedGameId`) | ❌ | ✅ | ✅ | `APP_URL/buddy-up?gameId={selectedGameId}` |
| burrfriends | JENGA | `src/app/jenga/page.tsx` (`game` / `gameIdFromUrl`) | ❌ | ✅ | ✅ | `APP_URL/jenga?gameId={gameIdFromUrl}` |
| **poker** | **Club games** | **`poker/src/app/games/[id]/page.tsx`** | **❌** | **✅** | **✅** | **`APP_URL/games/{id}`** |

**URL source:** `APP_URL` from `~/lib/constants` only (no `window.location.origin`).  
- burrfriends: `burrfriends/src/lib/constants.ts`  
- poker: `poker/src/lib/constants.ts` (each app’s `APP_URL` = its own deployment, e.g. poker-swart.vercel.app).

---

## 2. Look and Feel (Shared Across All Pages)

- **Buttons:** `className="btn-secondary"`, `style={{ padding: '6px 12px', fontSize: '0.875rem', minHeight: 'auto' }}`.
- **Labels:** Share = `"Share"`, Copy = `"Copy link"`; when copied, Copy shows `"Copied!"` for 1.5–2 s then back to `"Copy link"`.
- **Placement:** Share and Copy link are in a small flex group: `display: flex`, `gap: 8`, next to the title (or in the same card/header block). Order: Share, then Copy link.

---

## 3. Copy: Behavior and Feedback

- **Action:** `navigator.clipboard.writeText(url)` on button click.
- **Success:** Set local state `linkCopied`/`copied` to `true`; show `"Copied!"` on the button; `setTimeout(..., 1500)` to reset to `"Copy link"`.
- **Failure:** `catch` → `alert('Copy failed. URL: ' + url)` or render the URL in a short inline block so the user can manually copy.
- **URL:** Always `APP_URL + path` (from `~/lib/constants`). No `window.location.origin`.

---

## 4. Share: Behavior (Where We Add It)

- **SDK:** `const { sdk } = await import('@farcaster/miniapp-sdk');` then `sdk?.actions?.composeCast`.
- **Payload:**  
  - `embeds: [url]` where `url` is the **same** value we would copy (e.g. `APP_URL + '/games/' + id` or `APP_URL + '/buddy-up?gameId=' + selectedGameId`).  
  - `text`: app-appropriate (see below).
- **Fallback:** if `!sdk?.actions?.composeCast` or on error: `alert('This feature requires Warpcast. Please open this mini app in Warpcast to share.');` or `alert('Failed to open cast composer. Please try again.');`
- **App-specific Share text:**
  - burrfriends (all): `"Join me in the BETR WITH BURR mini-app"`
  - **poker:** `"Join my poker game"`

---

## 5. Per-Page Implementation

### 5.1 burrfriends `src/app/games/[id]/page.tsx`

- **URL:** `APP_URL + '/games/' + id`
- **Change:** Add **Copy link** next to the existing **Share** in the title row.
- **Layout:** Wrap Share and Copy in a flex group:  
  `style={{ display: 'flex', gap: 8, marginLeft: 12 }}`  
  so the row stays: `[ h2 title (flex:1, textAlign:center) | Share | Copy link ]`.
- **State:** Add `const [linkCopied, setLinkCopied] = useState(false);` and wire Copy button: on click run copy logic, `setLinkCopied(true)`, `setTimeout(() => setLinkCopied(false), 1500)`. Button label: `linkCopied ? 'Copied!' : 'Copy link'`.

### 5.2 burrfriends `src/app/betr-guesser/page.tsx`

- **URL:** `APP_URL + '/betr-guesser?gameId=' + selectedGameId` when `game` / `selectedGameId` exist (Share is already inside `{game && ( ... )}`).
- **Change:** Add **Copy link** next to Share. Replace the single full-width Share button with a row: `[ Share | Copy link ]` (same `btn-secondary` style, not full width).
- **State:** Add `linkCopied` and same copy/feedback as 5.1.

### 5.3 burrfriends `src/app/remix-betr/page.tsx`

- **URL:** `APP_URL + '/remix-betr'`
- **Change:** Add **Copy link** next to **Share** in the existing flex row with “Play in Remix” and Share (`display: 'flex', gap: 8`).
- **State:** Add `linkCopied` and same copy/feedback as 5.1.

### 5.4 burrfriends `src/app/buddy-up/page.tsx`

- **URL:** `APP_URL + '/buddy-up?gameId=' + selectedGameId` when `game` exists.
- **Change:** Inside `{game && ( <> ... )}`, after the “Prize | Status” row in the game card, add a row: `[ Share | Copy link ]` with `handleShare` and copy handler.
- **handleShare:** `composeCast` with `APP_URL + '/buddy-up?gameId=' + selectedGameId` and `text: 'Join me in the BETR WITH BURR mini-app'`. Same try/catch and alert as other Share handlers.
- **State:** Add `linkCopied` and same copy/feedback as 5.1.

### 5.5 burrfriends `src/app/jenga/page.tsx`

- **URL:** `APP_URL + '/jenga?gameId=' + gameIdFromUrl` when `game` exists.
- **Change:** In the `{/* Header */}` block (where `game.title`, Prize, Status are), add a row: `[ Share | Copy link ]`.
- **handleShare:** `composeCast` with `APP_URL + '/jenga?gameId=' + gameIdFromUrl` and `text: 'Join me in the BETR WITH BURR mini-app'`. Same try/catch and alert.
- **State:** Add `linkCopied` and same copy/feedback as 5.1.

### 5.6 poker `poker/src/app/games/[id]/page.tsx`

- **URL:** `APP_URL + '/games/' + id` (poker’s `APP_URL` from `poker/src/lib/constants.ts`).
- **Change:** Replace the **bare** `<h2 className="text-lg font-semibold mb-2 text-primary" style={{ color: 'var(--text-0)', fontWeight: 600 }}>{game.title || 'Untitled Game'}</h2>` with the **same title row as burrfriends** so look and feel match:
  - Outer:  
    `<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: '8px' }}>`
  - Title:  
    `<h2 className="text-lg font-semibold mb-2 text-primary" style={{ color: 'var(--text-0)', fontWeight: 600, flex: 1, textAlign: 'center' }}>{game.title || 'Untitled Game'}</h2>`
  - Button group:  
    `<div style={{ display: 'flex', gap: 8, marginLeft: 12 }}>`  
    - **Share:** `onClick={handleShare}`, `className="btn-secondary"`, `style={{ padding: '6px 12px', fontSize: '0.875rem', minHeight: 'auto' }}`, label `"Share"`.  
    - **Copy link:** same `className` and `style`, label `linkCopied ? 'Copied!' : 'Copy link'`, `onClick={handleCopyGameUrl}`.
- **handleShare:**  
  - `const { APP_URL } = await import('~/lib/constants');`  
  - `const url = APP_URL + '/games/' + id;`  
  - `await sdk.actions.composeCast({ text: 'Join my poker game', embeds: [url] });`  
  - Same try/catch and `alert` fallbacks as burrfriends.
- **handleCopyGameUrl:**  
  - `const { APP_URL } = await import('~/lib/constants');`  
  - `const url = APP_URL + '/games/' + id;`  
  - `await navigator.clipboard.writeText(url);`  
  - `setLinkCopied(true); setTimeout(() => setLinkCopied(false), 1500);`  
  - `catch` → `alert('Copy failed. URL: ' + url)`.
- **State:** `const [linkCopied, setLinkCopied] = useState(false);`

This matches:
- **Layout:** Same `div` + `h2` + flex group as burrfriends `games/[id]`.
- **Styles:** Same `btn-secondary`, padding, fontSize.
- **Behavior:** Share opens Farcaster composer; Copy puts `https://<poker-domain>/games/<id>` on the clipboard and shows “Copied!”.

---

## 6. End-to-End: Poker App

1. **Open game:** User goes to poker app → /clubs/hellfire/games → clicks a game → `/games/[id]`.
2. **UI:** Title row shows `[ game title (centered) | Share | Copy link ]` in the game card, same structure as burrfriends.
3. **Copy link:** Click → `navigator.clipboard.writeText(APP_URL + '/games/' + id)`. `APP_URL` = poker’s `NEXT_PUBLIC_BASE_URL` or `https://${VERCEL_URL}` (e.g. `https://poker-swart.vercel.app`). Pasted link is `https://poker-swart.vercel.app/games/<uuid>`.
4. **Open pasted link:** In Warpcast or browser → poker app loads `/games/<uuid>`; game loads if it exists. Same as notifications’ `targetUrl: new URL(\`/games/${game.id}?fromNotif=...\`, APP_URL).href` but without `?fromNotif` for a clean share.
5. **Share:** Click → `composeCast({ text: 'Join my poker game', embeds: [APP_URL + '/games/' + id] })` → Farcaster composer with that embed. Publish → cast contains link to the same game. Opening the embed goes to poker `/games/<id>`.
6. **Look and feel:** `hl-card`, `btn-secondary`, same padding/font as burrfriends `games/[id]`; title row layout identical.

---

## 7. End-to-End: burrfriends (Quick Check)

- **games/[id], betr-guesser, remix-betr:** Copy uses `APP_URL` from `burrfriends/src/lib/constants`; Share unchanged or extended with Copy. Links open in burrfriends.
- **buddy-up, jenga:** Share + Copy added; URLs `...?gameId=...` match notification `targetUrl` patterns. Open in burrfriends and land on the same game.

---

## 8. Files to Touch

| App | File | Edits |
|-----|------|--------|
| burrfriends | `src/app/games/[id]/page.tsx` | `linkCopied` state; `handleCopyGameUrl`; wrap Share in flex group and add Copy button. |
| burrfriends | `src/app/betr-guesser/page.tsx` | `linkCopied`; Copy handler; change Share row to [Share \| Copy]. |
| burrfriends | `src/app/remix-betr/page.tsx` | `linkCopied`; Copy handler; add Copy button next to Share. |
| burrfriends | `src/app/buddy-up/page.tsx` | `handleShare`; `linkCopied`; Copy handler; add [Share \| Copy] row in game card. |
| burrfriends | `src/app/jenga/page.tsx` | `handleShare`; `linkCopied`; Copy handler; add [Share \| Copy] in header. |
| **poker** | **`src/app/games/[id]/page.tsx`** | **Replace bare h2 with title row (h2 + [Share \| Copy]); add `handleShare`, `handleCopyGameUrl`, `linkCopied`.** |

---

## 9. Doc Update (Source of Truth)

Add to **`BURRFRIENDS_GAME_SETUP_PHASED_PLAN_REVISED.md`**:

- **Phase 7.7: Copy Game URL (and Share where missing)**  
  - Objectives, URL rules, Copy/Share behavior, placement, and per-page notes as in §1–5.  
  - Subsection **Poker app (parallel):** same feature in `poker/src/app/games/[id]/page.tsx`; `APP_URL` from `poker/src/lib/constants`; Share text `"Join my poker game"`; title row and button styles to match burrfriends for consistent look and feel.

- **Change Log:**  
  - *Copy Game URL (and Share where missing) — burrfriends + poker:* Copy link next to Share on `games/[id]`, betr-guesser, remix-betr. Share + Copy on buddy-up, jenga. **Poker:** Add Share + Copy on `games/[id]` with same layout and styles as burrfriends. Phase 7.7. Poker app in scope; works E2E with `APP_URL/games/{id}` and `composeCast` for Share.

---

## 10. Edge Cases and Checks

- **APP_URL:** burrfriends and poker each use their own `~/lib/constants` and `APP_URL`; no cross-app URL. ✓  
- **Poker `id`:** From `use(params)`; same as notification `targetUrl` and `/api/games` usage. ✓  
- **Clipboard:** User gesture only; `catch` and show URL if `writeText` fails. ✓  
- **BETR GUESSER / BUDDY UP / JENGA:** Copy/Share only when `game` (and `selectedGameId` or `gameIdFromUrl`) exists. ✓  
- **Dependencies:** burrfriends and poker both have `@farcaster/miniapp-sdk` and use `composeCast` elsewhere. ✓  

---

## 11. Summary

- **Scope:** burrfriends (games/[id], betr-guesser, remix-betr, buddy-up, jenga) and **poker (games/[id])**.
- **Poker:** Add Share + Copy in a new title row that mirrors burrfriends `games/[id]`; `APP_URL/games/{id}`; Share text `"Join my poker game"`; same `btn-secondary` and layout. Implemented in `poker/src/app/games/[id]/page.tsx` with `handleShare`, `handleCopyGameUrl`, and `linkCopied` state.
- **E2E:** Copy produces a direct game URL for the same app; Share produces a cast whose embed opens that game. Poker links open in the poker app; burrfriends links in burrfriends. Look and feel aligned across poker and burrfriends `games/[id]`.
