# BUDDY UP v2 – Feedback List (from group chat + suggested fixes)

From the v1 tester group chat. Grouped by area; each item says **what**, **why it matters**, and **how it can fit into v2**. Not everything has to be in v2, but this is the full list to choose from.

→ **For every fix with an explicit plan to address each:** see **BUDDY_UP_V2_FIXES_AND_PLAN.md**.

---

## 1. Voting / state not updating (high impact)

### 1.1 Vote count stuck until refresh
**Feedback:**  
- “The vote update on a hard mini app refresh”  
- “it didn't update with the voting correctly. if you scroll up it is correct at 1/3 !but it's out of sync here”  
- “I was able to see the chats update, but it got stuck on one out of three voted even after I had voted (which would've made two)”  
- “I had to refresh the app to to see that I had voted”

**Issue:**  
“X/Y voted” and your own “You voted” state don’t update; only a full mini‑app refresh fixes it. Chat does update, so the mismatch is noticeable.

**Fit in v2:**  
- **Polling:** On the voting view, poll `GET /api/buddy-up/games/[id]/rounds/[roundId]/groups` (or my-group) every 5–10 seconds so vote counts and “has voted” update without refresh.  
- **Or real-time:** If we add Server-Sent Events or websockets later, use that for vote updates.  
- Ensure the “You voted” / checkmark updates from the same source as the counts.

---

### 1.2 Swipe-down / pull-to-refresh
**Feedback:**  
- “Maybe swipe down to refresh?”  
- “Should auto refresh after like 10 secs. If you're seeing new chats then it should be refreshing”

**Issue:**  
No way to manually refresh; auto-refresh only happens in some places (e.g. chat) but not votes/round state.

**Fit in v2:**  
- **Pull-to-refresh** on the main BUDDY UP game view (and, if we keep it, on “my group” / voting screen).  
- **Auto-refresh** on voting/round views every 10–15 seconds when that screen is focused, so “X/Y voted” and round status stay in sync even without pull-to-refresh.  
- Reuse the same pattern for chat if it doesn’t already refresh (chat seemed to work; votes didn’t).

---

## 2. Round transitions and notifications

### 2.1 No “Round N started” notification
**Feedback:**  
- “I did not get a notification that round 2 started (@tracyit @jacy) I assume you didn't either? You were the winners so advanced. This is a bug”  
- “You should get a notification when it starts”

**Issue:**  
When the admin completes a round and the next round begins, players who advanced (and possibly others) don’t get a push. They only find out by opening the app.

**Fit in v2:**  
- When admin calls “Complete round” and the next round is created/started, send a **“Round N started – you’re in”** (or “Round N started – vote now”) notification to:  
  - players who advanced to that round, and  
  - optionally all players who were in the game.  
- Reuse the same pattern we use for “game started” (e.g. `prepareGameCreationNotification`-style flow) but for a new event: `round_started:{gameId}:{roundNumber}`.  
- In-app: after completing a round, show a short “Winners have been notified” (or similar) so admins know it worked.

---

### 2.2 Countdown before “advance to next round”
**Feedback:**  
- “About 3 mins going to advance the game to next round. I think all winners get a notification”  
- “And maybe a countdown for when the next time that game is gonna run so people who like particular games or all of them know when to jump in”  
- “Just like gg lobby”

**Issue:**  
- **In-round:** No visible countdown before the admin advances; it’s ad‑hoc.  
- **Scheduled games:** No “next run” countdown (e.g. “BUDDY UP in 2h”). That’s a bigger feature.

**Fit in v2:**  
- **In-round (simpler):** Optional “Advancing in X:XX” countdown that the admin can set (e.g. 3 minutes) when completing a round. When it hits zero, we could auto-advance or just remind the admin. Alternatively, a simple “Next round in ~3 min” message that’s manually set.  
- **Scheduled games (larger):** “Next BUDDY UP in 2h” on the games list or club page would need: scheduled game times, cron or similar, and UI. Can be a later v2 phase or post‑v2.

---

## 3. Notifications – join and start

### 3.1 No “game created / signups open” notification for some
**Feedback:**  
- “Do we get a notification to join the game” / “i didn't get one” / “Same” / “I closed my app to see if I would get one”

**Issue:**  
“Game created” or “Signups open” notifications didn’t reach several testers. Could be: not registered for BETR games, notifications off, or delivery bug.

**Fit in v2:**  
- **Eligibility:** Confirm we’re sending to the right set (e.g. `betr_games_registrations` + enabled subscriptions) and that the “game created” logic for BUDDY UP matches other games (BETR Guesser, etc.).  
- **Idempotency / logging:** Ensure we’re not dropping sends (same pattern as other games) and that we log when we skip (e.g. “no eligible recipients”).  
- **In-app fallback:** On the BUDDY UP list or club page, if there’s an open signup and the user is logged in, we could show a small “New BUDDY UP – sign up” chip even if the push failed.  
- **Admin check:** “Preview who would get this notification” when creating a game could help debug.

---

### 3.2 “Game started” not received by some
**Feedback:**  
- “You should get a notification when it starts”  
- Combined with 3.1: some didn’t get start either.

**Issue:**  
Same as 3.1 but for the “game started” event. We do send it; delivery is inconsistent for some users.

**Fit in v2:**  
- Same as 3.1: verify audience, idempotency, and logging.  
- Ensure “game started” for BUDDY UP includes a deep link with `gameId` and is sent as soon as the game moves to `in_progress`.  
- Optional: “Notify again” action for admins if we know a cohort might have missed it.

---

## 4. Deep links and “I don’t see open games”

### 4.1 `/buddy-up?gameId=...` sometimes only opens the app
**Feedback:**  
- “Still just loads the mini app.. odd” / “Actually both links do this. The URLs go to the exact games tho”  
- “if you click on this there is nothing in there?”  
- “i didn't and don't see any open games”

**Issue:**  
Opening `https://burrfriends.vercel.app/buddy-up?gameId=...` sometimes opens the mini app at `/buddy-up` without applying `gameId`: no game pre-selected, so it looks like “no open games” if the list is empty or the user doesn’t know to pick it.

**Fit in v2:**  
- **On load:** On `/buddy-up-v2` (and `/buddy-up` if we keep it in sync), on mount:  
  - read `?gameId=` from the URL (and from `window`/Farcaster context if the client ever passes it there);  
  - if `gameId` is present and valid, automatically select that game, fetch it, and show it (signup, in-progress, or post-game).  
- **Empty list:** If `gameId` is in the URL but we get 404 or “not found”, show a clear message: “This game doesn’t exist or has ended” with a link to the main BUDDY UP list, instead of a generic empty state.  
- **Discovery:** Ensure “open games” (and “game in progress”) are obvious on first load; see 5.2.

---

### 4.2 “Open Mini App” frame button doesn’t deep-link
**Feedback:**  
- “FYI- Hmm clicking open mini app link doesn't work but the actual url brings up the game.”

**Issue:**  
The “Open Mini App” button in a Farcaster frame/embed doesn’t open the miniapp with `?gameId=...`; the raw URL does. Likely a frame SDK / URL format issue.

**Fit in v2:**  
- If we control the frame: use a URL that we know works when opened in Warpcast (same as 4.1: `.../buddy-up?gameId=...`).  
- If it’s a Neynar or Farcaster-provided button: we can’t change the client, but we can (a) document that “Open Mini App” may not forward query params and (b) ensure the fallback in 4.1 works when the user lands on `/buddy-up` with `gameId` in the URL after following the raw link.  
- For notifications: ensure `targetUrl` always includes `?gameId=...` so “open” from the notification goes to the right game.

---

## 5. Layout and discovery

### 5.1 Game in progress at top and highlighted
**Feedback:**  
- “i'd like the game in progress to be at the top of the screen. and maybe in a highlighted way so you know it's active.”

**Issue:**  
Active game isn’t clearly prioritized; easy to miss when there are multiple or when “signup” and “in progress” look similar.

**Fit in v2:**  
- On `/buddy-up-v2`:  
  - sort so **in_progress** games are above **signup**;  
  - optional: **settled** at bottom or in a “Past games” section.  
- Give in‑progress games a distinct style: border, badge (“Live” / “In progress”), or background so they’re obviously “active”.  
- If there’s a single active game, consider auto-selecting it on first load.

---

### 5.2 Rules / “How it works”
**Feedback:**  
- “what are the rules”

**Issue:**  
No in-app explanation of BUDDY UP (rounds, groups, voting, “all must agree or all fail”, chat, etc.).

**Fit in v2:**  
- **“How BUDDY UP works”** entry point: (?) icon or “Rules” link on the BUDDY UP page or in the header.  
- Content: short bullets — signup → groups → vote for who advances (must all pick same or everyone in group fails) → next round → last group standing wins; group chat only for your group (+ admins).  
- Optionally: first-time tooltip or short intro for new players.  
- Reuse or adapt for BETR Guesser / other BETR games if we want one “Rules” pattern.

---

## 6. Chat UI

### 6.1 Chat input: can’t see what I’m typing
**Feedback:**  
- “i can't see what i'm typing in that box” / “Oh yeah that's why I couldn't see what I was typing lol”

**Issue:**  
Input has low contrast (e.g. dark text on dark background).

**Fit in v2:**  
- **Chat input:**  
  - text: `color` with enough contrast on the background (e.g. `--text-0` or `--text-1` on `--bg-1` or `--bg-2`);  
  - placeholder: visible but clearly secondary.  
- Check in both light and dark (if we support both) and in the miniapp’s real frame.

---

### 6.2 “Dark on dark” general
**Feedback:**  
- “UI feedback: dark on dark text is a no go”

**Issue:**  
Broader contrast problem across the app.

**Fit in v2:**  
- **Audit:** All inputs, labels, secondary text, and disabled states on BUDDY UP views (list, game, voting, chat).  
- Use design tokens (`--text-0`, `--text-1`, `--bg-*`, `--stroke`) consistently and fix any “dark on dark” or “light on light” spots.  
- Chat and voting screens are highest priority given the feedback.

---

### 6.3 Chat input above the thread
**Feedback:**  
- “idk if too difficult but i would move the chat box above the actual chat thread.”

**Issue:**  
They want the input above the messages (opposite of typical “messages on top, input at bottom”).

**Fit in v2:**  
- **Option A:** Input at top, messages below (scroll to bottom for latest). Good if we want “type first, then scroll to see context.”  
- **Option B:** Keep input at bottom but make it always visible (sticky) and ensure the last messages are in view by default; they might have meant “I want to see the input without scrolling.”  
- Easiest A/B: move the input component above the message list and invert scroll anchor (default to bottom). If it feels odd, we can switch back and instead improve visibility (6.1, 6.2).

---

## 7. Admin and roles

### 7.1 Admins can see group chats without being a player (admins as judges)
**Feedback:**  
- “Dflory is a judge for betr games, if we have him permissions, could he also see the chats as a non player?”  
- “Me being able to see the chat is amazing.”

**Issue:**  
Only group members and “full” admins see a group’s chat. We want admins to be able to view (and moderate) any group’s chat.

**Fit in v2 (decided):**  
- **No separate judge role.** Admins (plants, burr via `isAdmin`) serve as judges: same access as create games.  
- **API:** `GET` and `POST /api/buddy-up/games/[id]/groups/[groupId]/chat` allow: **in group or `isAdmin(fid)`**. Admins have full read and write.  
- **UI:** Admins get “View Chat” on each group; they can read and post.  
- **Storage:** None. Reuse `isAdmin`; no `betr_judges` or `BETR_JUDGE_FIDS`.

---

### 7.2 Levels of access (create, settle, judge, etc.)
**Feedback:**  
- “We can give him power to create and settle games too. We can create 'levels' of access. Right now it's just me and you as admin and everyone else is not.”

**Issue:**  
Only one admin level; need create, settle, judge, view-only, etc.

**Fit in v2 (deferred):**  
- For v2 we use **admins only** (plants, burr via `isAdmin`): create, settle, and group chat all use the same `isAdmin` check. No separate judge, creator, or settler.  
- **Levels** (creator, settler, judge, `betr_admin_roles`, etc.) are **deferred to Later**.

---

## 8. Affirmed (keep as-is or double down)

### 8.1 Profile pop-out / social
**Feedback:**  
- “I love how I let you pop out to someone's profile”  
- “Yea we want it social so if you're chatting with someone you can follow or see profile easily”

**Fit in v2:**  
- Keep profile-from-chat (and from voter list, signups, etc.).  
- Ensure it works from every place we show a user (chat, group members, votes, settlement).

---

### 8.2 Signup and “add app” flow
**Feedback:**  
- “Sign up was slick for Buddy Up”  
- “Signing up, adding the app and joining buddy up was all slick no snags”

**Fit in v2:**  
- Don’t regress signup or “add app” flows.  
- When we change deep-linking (4.1), ensure “join from notification” and “join from link” still feel smooth.

---

## 9. Out of scope for BUDDY UP v2 (but useful context)

### 9.1 “Look like GG” / GG lobby
**Feedback:**  
- “Would be cool if it looked like gg” / “Just like gg lobby”

**Fit:**  
- Visual and lobby design inspiration for a later pass; not a concrete v2 fix.  
- The “countdown for when the next game runs” (2.2) is the functional part we can do.

---

### 9.2 Mole-style game
**Feedback:**  
- “Hey plants, I wanna do this game but mole style eventually … 5 people go in, 1 is the mole …”

**Fit:**  
- New game concept, not a BUDDY UP change.  
- Can be a separate “BETR Mole” or similar product later; we’d reuse notification patterns. (Levels in 7.2 are deferred.)

---

### 9.3 Long-press to rearrange miniapps / folders
**Feedback:**  
- “long press and hold mini apps to rearrange” / “organize apps by folder”  
- “relevant (after it took me 5 minutes to figure out how to move the app to the top)”

**Fit:**  
- This is Farcaster/Neynar client behavior, not something we control in our app.  
- No change in our codebase; we can note it as a platform request.

---

### 9.4 BETR Guesser “can’t find anymore” when closed
**Feedback:**  
- “BETR GUESSER is closed and you can’t find anymore”

**Fit:**  
- BETR Guesser product/UX.  
- If we later unify “closed game” handling across BETR games, we could apply that to BUDDY UP too (e.g. “This game has ended” when `gameId` is settled or cancelled).

---

## 10. Summary: suggested v2 priority

| Priority | Item | Area | Where |
|----------|------|------|-------|
| P0 | Vote/state not updating without refresh (1.1) | Voting | v2 page |
| P0 | Deep link `?gameId=` not applied on load (4.1) | Deep links | v2 page |
| P0 | Chat input “can’t see what I’m typing” (6.1) + dark-on-dark (6.2) | Chat / UI |
| P1 | Round started notification (2.1) | Notifications |
| P1 | Swipe-down / auto-refresh (1.2) | Voting / UX |
| P1 | Game in progress at top and highlighted (5.1) | Layout |
| P1 | “How BUDDY UP works” rules (5.2) | Onboarding |
| P2 | Join / game started notification reliability (3.1, 3.2) | Notifications |
| P2 | Admins can view/write group chats (7.1); same as create games | Admin (Done) |
| P2 | Chat input above thread (6.3) – if we try it | Chat |
| P2 | Countdown before next round (2.2 in-round part) | Rounds |
| Later | Levels of access / creator vs settler (7.2) | Admin (deferred) |
| P3 | “Open Mini App” frame behavior (4.2) – document + fallback | Deep links |
| Later | Scheduled game countdown (“next in 2h”) (2.2) | Discovery |
| Later | “Notify again” / “Preview recipients” for admins | Notifications |

---

## 11. Implementation mapping (reuse v1 API + tables)

- **v2 page:** `src/app/buddy-up-v2/page.tsx` – UI/UX: polling, pull-to-refresh, deep link on load, sort/highlight, rules, chat contrast, input position. Uses **existing** `/api/buddy-up/*`.
- **v1 API:** Evolve `src/app/api/buddy-up/` in place: round-started in `games/[id]/rounds/route.ts`; admin chat access (`isAdmin`, same as create games) in `groups/[groupId]/chat/route.ts`; notification tweaks in `games/` and `games/[id]/start/`. Both v1 and v2 benefit.
- **Storage:** No new tables. Chat uses `isAdmin`; admins (plants, burr) serve as judges. No `buddy_up_*` changes.

See **BUDDY_UP_V2_PLAN.md** for full “Where” per item and phased order.

---

*Doc generated from group chat feedback. Revisit when we lock v2 scope.*
