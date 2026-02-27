# BUDDY UP v2 – Every Fix from Chat and Plan to Address Each

Each item: **Fix** (as suggested or derived from chat), then **Plan to address** (where, what to do, phase).  
“Affirmed” = keep as-is. “Out of scope” = not in BUDDY UP v2 scope (or platform / other product).

---

## 1. Vote count stuck until refresh

**Fix (from chat):**
- “The vote update on a hard mini app refresh”
- “it didn't update with the voting correctly. if you scroll up it is correct at 1/3 !but it's out of sync here”
- “I was able to see the chats update, but it got stuck on one out of three voted even after I had voted (which would've made two)”
- “I had to refresh the app to to see that I had voted”

**Plan to address:**
- **Where:** v2 page (`src/app/buddy-up-v2/page.tsx`)
- **What:** On the voting / “my group” view, poll `GET /api/buddy-up/games/[id]/my-group` or `.../rounds/[roundId]/groups` every 5–10 seconds. Use the response to update “X/Y voted” and “You voted” / checkmark. Ensure “You voted” and the counts come from the same source.
- **Phase:** 1 (P0)

---

## 2. Swipe-down to refresh / auto-refresh

**Fix (from chat):**
- “Maybe swipe down to refresh?”
- “Should auto refresh after like 10 secs. If you're seeing new chats then it should be refreshing”

**Plan to address:**
- **Where:** v2 page
- **What:** (1) Add pull-to-refresh on the main BUDDY UP game view and on the “my group” / voting view. (2) On voting/round views, when the screen is focused, auto-refresh every 10–15 seconds so “X/Y voted” and round status stay in sync.
- **Phase:** 2 (P1)

---

## 3. No “Round N started” notification

**Fix (from chat):**
- “I did not get a notification that round 2 started (@tracyit @jacy) I assume you didn't either? You were the winners so advanced. This is a bug”
- “You should get a notification when it starts”

**Plan to address:**
- **Where:** v1 API – `POST /api/buddy-up/games/[id]/rounds` (`src/app/api/buddy-up/games/[id]/rounds/route.ts`)
- **What:** After the round and groups are created successfully: (1) **Return 200 first**, then send the notification **in `after()`** (same pattern as game-created and game-started). Do not block the HTTP response on notification delivery. (2) Collect all FIDs in the new round (from `eligibleFids` or from the created `groups`). (3) Resolve those FIDs to `notification_subscriptions` (enabled, with token/url). (4) Send a notification: title e.g. “BUDDY UP Round N started”, body “Vote in your group to advance.”, `targetUrl`: `APP_URL/buddy-up?gameId=...`. Use `/buddy-up` always (v1 must read `?gameId=` on load). (5) Use notification id `round_started:{gameId}:{roundNumber}` for idempotency. Reuse `sendNotificationsToSubscriptions`; add or inline a helper to get subscriptions for a list of FIDs. Call it **inside `after()`**. (6) Optionally: in-app confirmation for admin (“Winners have been notified”).
- **Phase:** 2 (P1)

---

## 4. Countdown before “advance to next round” (in-round)

**Fix (from chat):**
- “About 3 mins going to advance the game to next round. I think all winners get a notification”
- “And maybe a countdown for when the next time that game is gonna run…” / “Just like gg lobby”

**Plan to address:**
- **Where:** v2 page (in-round); later: v2 page + backend (scheduled “next BUDDY UP in 2h”).
- **What (in-round):** Optional “Advancing in X:XX” countdown that the admin can set (e.g. 3 minutes) when completing a round—or a simple “Next round in ~3 min” message. When it hits zero: either auto-advance or remind the admin. Start with a manually set message if we want to avoid new backend fields.
- **What (scheduled “next in 2h”):** Defer. Needs: scheduled game times, cron or similar, and UI on games list / club page.
- **Phase:** 3 (P2) for in-round; Later for scheduled.

---

## 5. No “game created / signups open” notification for some

**Fix (from chat):**
- “Do we get a notification to join the game” / “i didn't get one” / “Same” / “I closed my app to see if I would get one”

**Plan to address:**
- **Where:** v1 API – `POST /api/buddy-up/games` (`src/app/api/buddy-up/games/route.ts`)
- **What:** (1) **Eligibility:** Confirm we send to `betr_games_registrations` ∩ enabled `notification_subscriptions`, and that BUDDY UP “game created” logic matches BETR Guesser etc. (2) **Idempotency / logging:** Same pattern as other games; log when we skip (e.g. “no eligible recipients”). (3) **In-app fallback (v2 page):** If there’s an open signup and the user is logged in, show a small “New BUDDY UP – sign up” chip. (4) **Admin (optional):** “Preview who would get this notification” when creating a game.
- **Phase:** 3 (P2) for API; Later for “Preview recipients”.

---

## 6. “Game started” not received by some

**Fix (from chat):**
- “You should get a notification when it starts” (and reports that some didn’t get it)

**Plan to address:**
- **Where:** v1 API – `POST /api/buddy-up/games/[id]/start` (`src/app/api/buddy-up/games/[id]/start/route.ts`)
- **What:** Same as 5: verify audience (`betr_games_registrations` + enabled), idempotency, logging. Ensure `targetUrl` includes `?gameId=...` and is sent as soon as the game moves to `in_progress`. Optional: “Notify again” for admins.
- **Phase:** 3 (P2); “Notify again” Later.

---

## 7. `/buddy-up?gameId=...` only opens the app, doesn’t select the game

**Fix (from chat):**
- “Still just loads the mini app.. odd” / “Actually both links do this. The URLs go to the exact games tho”
- “if you click on this there is nothing in there?” / “i didn't and don't see any open games”

**Plan to address:**
- **Where:** **v1 and v2** (both required). v1 must do this because game-created, game-started, and round-started notifications use `targetUrl: /buddy-up?gameId=...`; v1 users who tap those links otherwise land on the list without the game selected.
- **What:** (1) **On mount:** Read `?gameId=` from the URL (and from `window`/Farcaster context if the client passes it). If present, treat it as the selected game: fetch it and show the right view (signup, in-progress, or post-game). (2) **If `gameId` in URL but 404 / not found:** Show “This game doesn’t exist or has ended” with a link to the BUDDY UP list. (3) **Discovery:** Make “open games” and “game in progress” obvious on first load (see also 11).
- **Phase:** 1 (P0)

---

## 8. “Open Mini App” frame button doesn’t deep-link

**Fix (from chat):**
- “FYI- Hmm clicking open mini app link doesn't work but the actual url brings up the game.”

**Plan to address:**
- **Where:** (a) Docs, (b) our frames if we control them, (c) notifications.
- **What:** (1) If we control the frame: use a URL that works when opened in Warpcast: `.../buddy-up?gameId=...` (same as 7). (2) If it’s Neynar/Farcaster: document that “Open Mini App” may not forward `?gameId=`; rely on 7 when the user follows the raw URL. (3) For all notifications: ensure `targetUrl` includes `?gameId=...`.
- **Phase:** 3 (P3) for doc and checks; 7 is the main fix.

---

## 9. Game in progress at top and highlighted

**Fix (from chat):**
- “i'd like the game in progress to be at the top of the screen. and maybe in a highlighted way so you know it's active.”

**Plan to address:**
- **Where:** v2 page
- **What:** (1) Sort the game list: `in_progress` > `signup` > `settled` (or put settled in “Past games”). (2) Style in-progress games: e.g. border, badge (“Live” / “In progress”), or background so they’re clearly “active”. (3) If there’s a single in-progress game, consider auto-selecting it on first load.
- **Phase:** 2 (P1)

---

## 10. Rules / “How it works”

**Fix (from chat):**
- “what are the rules”

**Plan to address:**
- **Where:** v2 page
- **What:** Add a “How BUDDY UP works” entry: (?) icon or “Rules” link in the header or on the BUDDY UP page. Content: signup → groups → vote for who advances (must all pick same or everyone in the group fails) → next round → last group standing wins; group chat only for your group (and admins). Optionally: first-time tooltip for new players.
- **Phase:** 2 (P1)

---

## 11. Chat input: can’t see what I’m typing

**Fix (from chat):**
- “i can't see what i'm typing in that box” / “Oh yeah that's why I couldn't see what I was typing lol”

**Plan to address:**
- **Where:** v2 page (+ `globals.css` or design tokens if needed)
- **What:** Chat input: use `color` with enough contrast on the background (e.g. `--text-0` or `--text-1` on `--bg-1` or `--bg-2`); placeholder visible but secondary. Check in the miniapp’s real frame (and light/dark if we support both).
- **Phase:** 1 (P0)

---

## 12. “Dark on dark” (general)

**Fix (from chat):**
- “UI feedback: dark on dark text is a no go”

**Plan to address:**
- **Where:** v2 page (+ globals)
- **What:** Audit all inputs, labels, secondary text, and disabled states on BUDDY UP views (list, game, voting, chat). Use `--text-0`, `--text-1`, `--bg-*`, `--stroke` consistently; fix “dark on dark” or “light on light”. Chat and voting are highest priority.
- **Phase:** 1 (P0)

---

## 13. Chat input above the thread

**Fix (from chat):**
- “idk if too difficult but i would move the chat box above the actual chat thread.”

**Plan to address:**
- **Where:** v2 page
- **What:** Try moving the input above the message list and default scroll to bottom for latest. If it feels odd, revert and rely on 11–12 so the input is always visible and readable.
- **Phase:** 3 (P2), optional.

---

## 14. Admins can see group chats without being a player (no separate judge)

**Fix (from chat):**
- “Dflory is a judge for betr games, if we have him permissions, could he also see the chats as a non player?”
- “Me being able to see the chat is amazing.”

**Plan to address (decided: admins as judges, same as create games):**
- **Where:** v1 API: `GET` and `POST /api/buddy-up/games/[id]/groups/[groupId]/chat` (`src/app/api/buddy-up/games/[id]/groups/[groupId]/chat/route.ts`). No new storage.
- **What:** Use the same access as create games: **in group or `isAdmin(fid)`**. Admins (plants, burr via `isAdmin`) have full read and write to any group chat; they serve as judges. No separate judge role, no `betr_judges`, no `BETR_JUDGE_FIDS`. UI: admins get “View Chat” on each group; they can read and post.
- **Phase:** Done.

---

## 15. Levels of access (create, settle, judge, etc.)

**Fix (from chat):**
- “We can give him power to create and settle games too. We can create 'levels' of access. Right now it's just me and you as admin and everyone else is not.”

**Plan to address (deferred for v2):**
- For v2 we use **admins only** (plants, burr via `isAdmin`): create, settle, and group chat all use the same `isAdmin` check as create games. No separate judge, creator, or settler roles.
- **Levels** (creator, settler, judge, etc.) and any `betr_admin_roles`-style storage are **deferred to Later**.
- **Phase:** Later (out of v2 scope).

---

## Affirmed (keep as-is, no “fix” – ensure we don’t regress)

### 16. Profile pop-out / social

**From chat:** “I love how I let you pop out to someone's profile” / “Yea we want it social so if you're chatting with someone you can follow or see profile easily”

**Plan:** Keep profile-from-chat and from voter list, signups, etc. Ensure it works everywhere we show a user (chat, group members, votes, settlement). No code change unless we find a regression.

---

### 17. Signup and “add app” flow

**From chat:** “Sign up was slick for Buddy Up” / “Signing up, adding the app and joining buddy up was all slick no snags”

**Plan:** Do not regress. When we add deep-linking (7), ensure “join from notification” and “join from link” stay smooth.

---

## Out of scope for BUDDY UP v2 (we are not addressing these here)

### 18. “Look like GG” / GG lobby

**From chat:** “Would be cool if it looked like gg” / “Just like gg lobby”

**Plan:** Visual/lobby inspiration only. The functional part (countdown for when the next game runs) is in 4 (scheduled) and 4 (in-round).

---

### 19. Mole-style game

**From chat:** “Hey plants, I wanna do this game but mole style eventually … 5 people go in, 1 is the mole …”

**Plan:** New game concept. Not a BUDDY UP change. Can be a separate product later; would reuse notification patterns. (Levels/roles in 15 are deferred.)

---

### 20. Long-press to rearrange miniapps / folders

**From chat:** “long press and hold mini apps to rearrange” / “organize apps by folder” / “relevant (after it took me 5 minutes to figure out how to move the app to the top)”

**Plan:** Farcaster/Neynar client behavior. No change in our app; can note as a platform request.

---

### 21. BETR Guesser “can’t find anymore” when closed

**From chat:** “BETR GUESSER is closed and you can’t find anymore”

**Plan:** BETR Guesser product. If we later unify “closed game” handling (e.g. “This game has ended” when `gameId` is settled or cancelled), we can apply the same to BUDDY UP.

---

## Summary: fix → where → phase

| # | Fix | Where | Phase |
|---|-----|-------|-------|
| 1 | Vote count stuck until refresh | v2 page | 1 (P0) |
| 2 | Swipe-down / auto-refresh | v2 page | 2 (P1) |
| 3 | No “Round N started” notification | v1 API (rounds) | 2 (P1) |
| 4 | Countdown before next round (in-round; scheduled later) | v2 page | 3 / Later |
| 5 | “Game created” not received | v1 API (games) | 3 (P2) |
| 6 | “Game started” not received | v1 API (start) | 3 (P2) |
| 7 | `?gameId=` not applied on load | v1 and v2 | 1 (P0) |
| 8 | “Open Mini App” button doesn’t deep-link | docs + notifications | 3 (P3) |
| 9 | Game in progress at top, highlighted | v2 page | 2 (P1) |
| 10 | Rules / “How it works” | v2 page | 2 (P1) |
| 11 | Chat input: can’t see what I’m typing | v2 page | 1 (P0) |
| 12 | “Dark on dark” general | v2 page | 1 (P0) |
| 13 | Chat input above thread | v2 page | 3 (P2), optional |
| 14 | Admins can see group chats (isAdmin, same as create games) | v1 API (chat) | Done |
| 15 | Levels of access (creator, settler, judge) | — | Later (out of v2) |
| 16 | Profile pop-out (affirmed) | — | Keep, no regress |
| 17 | Signup / add app (affirmed) | — | Keep, no regress |
| 18–21 | Out of scope | — | Not in v2 |

---

*Source: group chat feedback. BUDDY_UP_V2_FEEDBACK_LIST.md has full quotes and “Fit in v2”; BUDDY_UP_V2_PLAN.md has architecture and phased order.*
