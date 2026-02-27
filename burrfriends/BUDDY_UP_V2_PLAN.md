# BUDDY UP v2 – Plan (architecture, where, order)

Based on your answers: **reuse v1 tables**, **mostly UI/UX**, **evolve v1 API** for a few backend features, **full replace** when v2 is ready.

---

## 1. Scope

- **DB:** Reuse `poker.buddy_up_*` (games, signups, rounds, groups, votes, settlements, chat). No new game tables, no `version` column.
- **API:** Reuse `/api/buddy-up/*`. Evolve it for: round-started notification. No `/api/buddy-up-v2/`.
- **Page:** New `/buddy-up-v2` only. Copy from v1, then apply UI/UX fixes. Calls existing `/api/buddy-up/*`.
- **Create / settle:** `CreateBuddyUpGameModal` and settle flow stay as-is; they already use the same API. When we swap, no change needed.
- **Admins as judges:** No separate judge role. Admins (plants, burr via isAdmin) have full chat access, same as create games. No extra storage.

---

## 2. What goes where

### v2 page only (UI)

| Feedback | Where | What to do |
|----------|-------|------------|
| **1.1** Vote count stuck | v2 page | Poll my-group or groups every 5–10s on voting view; keep “X/Y voted” and “You voted” in sync. |
| **1.2** Swipe-down / auto-refresh | v2 page | Pull-to-refresh on game view and voting view; optional auto-refresh every 10–15s when focused. |
| **4.1** `?gameId=` not applied | **v1 and v2** | On mount: read `?gameId=` from URL; if present, select that game and fetch. If 404: “This game doesn’t exist or has ended.” |
| **5.1** Game in progress at top, highlighted | v2 page | Sort: in_progress > signup > settled; style in-progress with badge/border. |
| **5.2** Rules / How it works | v2 page | (?) or “Rules” link; short bullets: signup → groups → vote (must agree or all fail) → next round → last standing wins; group chat. |
| **6.1, 6.2** Chat input contrast, dark-on-dark | v2 page (+ globals) | Chat input: `--text-0`/`--text-1` on `--bg-1`/`--bg-2`; audit inputs/labels on BUDDY UP views. |
| **6.3** Chat input above thread | v2 page | Option: input above messages, scroll to bottom for latest; or keep below but ensure it’s always visible. |

### v1 API (evolve in place; v1 and v2 both benefit)

| Feedback | Where | What to do |
|----------|-------|------------|
| **2.1** Round N started notification | `POST /api/buddy-up/games/[id]/rounds` | After creating round and groups: send “Round N started – vote in your group” to all FIDs in `groups` (eligibleFids). New notification id e.g. `round_started:{gameId}:{roundNumber}`. Reuse `sendNotificationsToSubscriptions`; need helper to resolve subscriptions for a list of FIDs (or inline). |
| **3.1, 3.2** Game created / started not received | `POST /api/buddy-up/games`, `POST …/start` | Confirm audience (betr_games_registrations + enabled), idempotency, logging. Ensure `targetUrl` includes `?gameId=`. |
| **Group chat access** | `GET` and `POST /api/buddy-up/games/[id]/groups/[groupId]/chat` | Same as create games: in group **or** `isAdmin(fid)`. Admins (plants, burr) serve as judges: full read and write. No separate judge role or storage. |

---

## 3. Phased order (suggested)

**Phase 1 – Parity + P0 (quick win)**  
- Copy v1 page → `buddy-up-v2/page.tsx`; point all fetches to `/api/buddy-up/`.  
- **4.1** Deep link `?gameId=` on load: **on both v1 and v2**. v1 must do this because notifications use `/buddy-up?gameId=...`.  
- **1.1** Polling for vote/state on voting view.  
- **6.1, 6.2** Chat input contrast and dark-on-dark audit.  

→ v2 is usable; P0 pain addressed.

**Phase 2 – P1**  
- **2.1** Round-started notification in `rounds` route.  
- **1.2** Pull-to-refresh and/or auto-refresh.  
- **5.1** Game in progress at top, highlighted.  
- **5.2** “How BUDDY UP works” rules.  

**Phase 3 – P2 (as needed)**  
- **3.1, 3.2** Notification reliability (audience, logging).  
- **6.3** Chat input above thread (if we try it).  
- **2.2** In-round countdown (simpler: admin-set “Advancing in X:XX” or similar).  

**Phase 4 – P3 / Later**  
- **4.2** “Open Mini App” frame: document, ensure 4.1 covers raw URL.  
- **2.2** Scheduled-game countdown (“Next BUDDY UP in 2h”).  

---

## 4. Round-started notification (detail)

- **When:** `POST /api/buddy-up/games/[id]/rounds` succeeds (round and groups created).  
- **Send after response:** Create round and groups, **return 200 first**, then send the notification **in `after()`** (same pattern as game-created and game-started). Do not block the HTTP response on notification delivery.  
- **Recipients:** All FIDs in `eligibleFids` (or collect from `groups`).  
- **Payload:** e.g. title “BUDDY UP Round N started”, body “Vote in your group to advance.”, `targetUrl`: `APP_URL/buddy-up?gameId=…` Use `/buddy-up` always so v1 (and v2 after swap) can read `?gameId=` on load.  
- **ID:** `round_started:{gameId}:{roundNumber}` for idempotency.  
- **Mechanism:** Reuse notification infra. We need to resolve `fid[]` → `Subscription[]` (by `notification_subscriptions` where `fid IN (...) AND enabled`). If there’s no helper, add one or inline in the rounds route.

---

## 5. Admins as judges (no separate role)

- **Access:** Group chat uses the same logic as create games: **in group or `isAdmin(fid)`**. Admins (e.g. plants, burr) have full read and write to any group chat; same as create games.
- **No extra storage:** No `betr_judges` or `BETR_JUDGE_FIDS`. Reuse `isAdmin`.
- **UI:** Admins get "View Chat" on each group; they can read and post. No separate judge mode.  

---

## 6. Swap (reminder)

When v2 is ready: delete v1 page, rename `buddy-up-v2` → `buddy-up`, in that page replace `/buddy-up-v2` with `/buddy-up` where needed (Share, Copy, Back). Remove “Try v2 (preview)” from the games page. Deploy. No API or Create modal changes.

---

## 7. Open (from BUDDY_UP_V2_SETUP)

- **Hotfix v1?** Vote refresh and chat contrast can stay v2-only if you prefer. **Deep link `?gameId=` is required on v1** — not optional. Notifications (game-created, game-started, round-started) use `targetUrl: /buddy-up?gameId=...`. If v1 does not read `?gameId=` on load, v1 users who tap those links land on the list without the game selected.

---

## 8. Must-fixes (end-to-end)

These must be done or the flow breaks or we introduce bugs:

| # | Issue | Fix |
|---|-------|-----|
| 1 | **Deep link on v1** | v1 must read `?gameId=` on mount and select/fetch that game (or show "This game doesn't exist or has ended"). Notifications point to `/buddy-up?gameId=...`; v1 is still live. |
| 2 | **Round-started blocks response** | Send round-started notification **in `after()`** after returning the round-creation response. Same pattern as `POST /api/buddy-up/games` and `POST .../start`. |
| 3 | **Game-created/started targetUrl** | Already correct in code: `/buddy-up?gameId=...`. No change needed. |

---

## 9. Progress and next steps

**Done:**
- **4.1 Deep link on v1** – `src/app/buddy-up/page.tsx` reads `?gameId=` on mount, selects that game, shows “This game doesn’t exist or has ended” + “View open games” when 404. Must-fix #1 done.
- **Group chat access (admins as judges)** – `groups/[groupId]/chat/route.ts` uses `isAdmin` (in group or isAdmin); same as create games. Admins (plants, burr) have full read and write. No separate judge role or storage.
- **4.2 Open Mini App** – `BUDDY_UP_DEEP_LINKS.md` documents that "Open Mini App" may not forward `?gameId=`; 4.1 covers raw URL; checklist and future scheduled-game countdown.
- **2.2 In-round countdown** – `advance_at` on `buddy_up_games`; Complete round accepts `advanceInSeconds` (60,120,180,300); v2 shows "Advancing in M:SS" and Complete modal: Advance now / In 1–5 min; "Start Round" disabled while countdown is active. Scheduled-game ("Next BUDDY UP in 2h") implemented below.
- **2.2 Scheduled-game countdown** – `poker.buddy_up_schedule` (singleton `id=1`); `GET /api/buddy-up/next-run`, `POST /api/buddy-up/schedule` (admin: `clear`, `inHours`, `nextRunAt`); games page BUDDY UP card shows "Next BUDDY UP in Xh Xm" / "Xm Xs" when `next_run_at` is in the future; admin "Next: 1h | 2h | 3h | Clear". GET next-run clears past `next_run_at` and returns null. No auto-creation of games; display only.

**Done (swap):**
- **v1→v2 Swap** – v1 removed; `buddy-up-v2` renamed to `buddy-up`. "Try v2 (preview)" removed. `/buddy-up` now serves v2. Create/settle/notifications unchanged.

**Next:**
- (none; BUDDY UP v2 is live at /buddy-up)

---

* **BUDDY_UP_V2_FIXES_AND_PLAN.md** – Every fix from the chat with the exact plan to address each (where, what, phase).  
* **BUDDY_UP_V2_FEEDBACK_LIST.md** – Full feedback and fit-in-v2.  
* **BUDDY_UP_V2_SETUP.md** – Workflow, testing, and swap steps.  
* **BUDDY_UP_DEEP_LINKS.md** – Deep links, "Open Mini App" frame, and future scheduled-game countdown.
