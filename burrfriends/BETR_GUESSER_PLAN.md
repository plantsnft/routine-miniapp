# BETR GUESSER: Bug Fix, Assets, Whitelist, and Game Chat

**Scope:** BETR GUESSER only. Source of truth: [BURRFRIENDS_GAME_SETUP_PHASED_PLAN_REVISED.md](BURRFRIENDS_GAME_SETUP_PHASED_PLAN_REVISED.md) Phase 13.

---

## 1. Assets: Use guesser.png on homepage and game page

**Current state:**
- **Game page** (`/betr-guesser`): Already uses `/guesser.png` in [BetrGuesserClient.tsx](src/app/betr-guesser/BetrGuesserClient.tsx) (line ~367, maxHeight 56px). No change needed.
- **Homepage (clubs games):** The BETR GUESSER card in [clubs/[slug]/games/page.tsx](src/app/clubs/[slug]/games/page.tsx) (lines 1509–1529) has **no image**; it only shows title, badge, and subtitle.

**Change:**
- Add `guesser.png` to the BETR GUESSER card on the clubs games page, same pattern as BULLIED, THE MOLE, IN OR OUT, etc.: `<Image src="/guesser.png" alt="BETR GUESSER" width={268} height={268} style={{ ... }} />` at the top of the card content (above the title row).

**SOT:** In Phase 13.6 "BETR GUESSER card", add a bullet: "Game image: `guesser.png` shown on the card (268×268, same placement as other BETR game cards)." Confirm 13.6 / Game page already states guesser.png for detail page; no change there.

---

## 2. Bug: Show player names and PFP everywhere (not FIDs)

**Where FIDs appear today:**

1. **View All Guesses table (admin):** API [GET /api/betr-guesser/games/[id]/guesses](src/app/api/betr-guesser/games/[id]/guesses/route.ts) uses Neynar only; on failure, `userMap` is empty and response has null username/display_name/pfp_url, so client shows "FID X". Client already uses `g.display_name || g.username || \`FID ${g.fid}\`` and PFP when present.
2. **Settled winner on game page:** [BetrGuesserClient.tsx](src/app/betr-guesser/BetrGuesserClient.tsx) line ~448: "Winner: FID {game.winner_fid}". GET game does not return winner display name or PFP.
3. **Calculate-winner prefilled block (admin):** Line ~591: "Winner: FID {calculatedWinner.winnerFid}". calculate-winner API returns only winnerFid, winnerGuess, guessCount.

**Fixes:**

- **Guesses API:** In [guesses/route.ts](src/app/api/betr-guesser/games/[id]/guesses/route.ts), use shared profile cache (`getProfilesFromCache`, `setProfilesInCache` from `~/lib/cache`) before calling Neynar, and only call Neynar for FIDs missing from cache. This reduces Neynar failures and ensures we often have names; when we still don’t, keep fallback "FID X".
- **GET game (winner profile):** When game is settled and `winner_fid` is set, [GET /api/betr-guesser/games/[id]](src/app/api/betr-guesser/games/[id]/route.ts) should attach `winner_display_name` and `winner_pfp_url` (Neynar or cache). Client then shows "Winner: {name} (PFP) guessed {guess}" instead of "FID X".
- **Calculate-winner block:** When admin has loaded "View All Guesses", the winner is in `allGuesses`; use that row’s display_name, username, pfp_url for the calculated-winner line. So: `const winnerRow = allGuesses.find(g => g.fid === calculatedWinner.winnerFid);` then show `winnerRow?.display_name || winnerRow?.username || \`FID ${calculatedWinner.winnerFid}\`` and PFP. If "View All Guesses" hasn’t been loaded, keep "FID X" or optionally extend calculate-winner API to return winnerDisplayName, winnerPfpUrl (one Neynar/cache call for that FID).

**SOT:** In Phase 13, add a short subsection (e.g. **13.8.1 Names and PFP**): "Guesses API uses shared profile cache then Neynar so admin View All Guesses shows names and PFP. GET game when settled returns winner_display_name and winner_pfp_url. Game page and admin calculate-winner block show winner name and PFP (fallback FID only when missing)."

---

## 3. Feature: Whitelist 6 FIDs (invite-only game)

**Behavior:** Admin can optionally set exactly 6 FIDs when creating a BETR GUESSER game. If set, only those 6 can submit a guess; nobody else can play. No "signups" table for BETR GUESSER—we only restrict who can submit.

**Schema (new migration):**
- Add to `poker.betr_guesser_games`: `whitelist_fids bigint[]` (nullable). Constraint: NULL or array length exactly 6 (e.g. `CHECK (whitelist_fids IS NULL OR array_length(whitelist_fids, 1) = 6)`).

**Create flow:**
- **POST /api/betr-guesser/games:** Accept optional `whitelistFids: number[]` (length must be 6; validate 6 distinct FIDs). Store in `whitelist_fids`.
- **Submit API (POST /api/betr-guesser/submit):** If `game.whitelist_fids` is not null, allow submit only when `fid` is in `whitelist_fids`; otherwise return 403 "This game is invite-only; only whitelisted players can submit."
- **GET game:** Return `whitelist_fids` (and optionally `isInviteOnly: true` when non-null).

**Whitelist = fully bypassed:** The 6 whitelisted FIDs do not need BETR games registration or staking; they can submit a guess without any other check.

**UI:**
- **Create BETR GUESSER modal** ([CreateBetrGuesserGameModal.tsx](src/components/CreateBetrGuesserGameModal.tsx)): Optional "Whitelist 6 players (invite-only)": six number inputs or one comma-separated FID field; validation "Exactly 6 FIDs." Send `whitelistFids: [f1,...,f6]` in create body.
- **Game page:** When `whitelist_fids` is set, show "Invite-only · 6 players" (badge or line). Non-whitelisted users see the same message on submit (API returns 403).

**SOT:** New subsection **13.9 Whitelist 6 FIDs (invite-only)**: schema, create API, submit API rule (whitelisted users bypass registration/staking), GET game response, Create modal and game page UI. Add migration to Infrastructure → Running migrations.

---

## 4. Feature: Game-level group chat (same behavior as lobby, separate room)

**Behavior:** One chat room per BETR GUESSER game. Same behavior as homepage lobby chat: messages (newest first), heartbeat (in chat + last-seen), unread count, reactions (👍 ❌ 🔥 😱), admin delete. Access = user has submitted a guess for this game OR is admin (no staking gate for this chat).

**Availability:** Chat is available only when the game is **open** (status = 'open'). Hide or disable the chat entry point when game is closed, settled, or cancelled.

**Visibility:** The "Chat" button is visible from the start (when game is open)—not gated on "someone has guessed." Only users who have submitted a guess (or admin) can read and send messages; others see the button but get empty thread or "Submit a guess to join the chat" if they open it before guessing.

**Schema (new migrations):**
- **Messages:** `poker.betr_guesser_game_chat_messages` — id, game_id (FK betr_guesser_games), sender_fid, message (text, e.g. 500 char), created_at. Indexes: game_id, (game_id, created_at DESC).
- **Reactions:** `poker.betr_guesser_game_chat_reactions` — message_id (FK), fid, reaction; UNIQUE(message_id, fid). Same pattern as lobby.
- **Presence:** `poker.betr_guesser_game_chat_presence` — (game_id, fid) PK, chat_last_seen_at (timestamptz nullable). Unread = messages with created_at > COALESCE(chat_last_seen_at, 'epoch').

**APIs (mirror lobby):**
- **GET/POST /api/betr-guesser/games/[id]/chat** — List messages (newest first); send message. Auth: requester has a row in betr_guesser_guesses for this game_id OR is admin. Sender profiles: Neynar or cache (no signups table; use same cache as guesses).
- **POST /api/betr-guesser/games/[id]/chat/heartbeat** — Body `{ inChat: boolean }`. Upsert presence; when inChat true set chat_last_seen_at = now().
- **GET /api/betr-guesser/games/[id]/chat/active** — inChatCount, unreadChatCount. Auth: participant or admin.
- **POST /api/betr-guesser/games/[id]/chat/messages/[messageId]/reactions** — Set/change/remove reaction. Auth: participant or admin.
- **DELETE /api/betr-guesser/games/[id]/chat/[messageId]** — Admin delete (optional).

**UI:**
- New component **BetrGuesserGameChatModal** (or reuse a generic GameChatModal parameterized by game type): same patterns as [LobbyChatModal.tsx](src/components/LobbyChatModal.tsx)—poll messages (e.g. 5s), heartbeat (e.g. 30s) when open, MessageWithReactions, newest first, unread badge when closed.
- **Placement:** On BETR GUESSER page (`/betr-guesser`), add "Game chat" (or "Chat") button whenever game status is **open**; when closed show unread count if any. Button visible from the start (no requirement that anyone has guessed yet). Only users who have guessed (or admin) can read/post; others see empty or "Submit a guess to join the chat."

**SOT:** New subsection **13.10 Game-level group chat**: tables (messages, reactions, presence), API list, UI (same behavior as Lobby Phase 19), access = has guessed in this game or admin. Chat available only when game is open; Chat button visible from the start. Add migrations to Infrastructure; add `betr_guesser_game_chat_*` to pokerDb VALID_POKER_TABLES. In "App-wide chat reactions" and "App-wide unread", include BETR GUESSER game chat.

---

## 5. SOT doc edits (BURRFRIENDS_GAME_SETUP_PHASED_PLAN_REVISED.md)

- **Phase 13.6 (Games page / BETR GUESSER card):** Add bullet that card shows `guesser.png` (268×268). Confirm game page already says guesser.png.
- **Phase 13 (new 13.8.1 or similar):** Names and PFP everywhere (guesses API cache, GET game winner profile, client winner and calculate-winner display).
- **Phase 13.9 (new):** Whitelist 6 FIDs (schema, create, submit, GET, modal, game page).
- **Phase 13.10 (new):** Game-level group chat (schema, APIs, UI, access, migrations, pokerDb).
- **Infrastructure → Running migrations:** Add: (1) whitelist_fids migration for betr_guesser_games; (2) betr_guesser_game_chat_messages; (3) betr_guesser_game_chat_reactions; (4) betr_guesser_game_chat_presence.
- **Change log:** One entry: BETR GUESSER — guesser.png on homepage card; names/PFP in admin guesses and winner display; whitelist 6 FIDs; game-level chat (lobby-style).

---

## 6. Implementation order and confidence

1. **Assets:** Add guesser.png to BETR GUESSER card on clubs games page (one UI change). Game page already correct.
2. **Bug:** Guesses API add cache; GET game add winner_display_name, winner_pfp_url when settled; client use winner profile and (when available) allGuesses for calculate-winner name/PFP. No new migrations.
3. **Whitelist:** Migration + create API + submit API + GET game + CreateBetrGuesserGameModal + game page badge/message.
4. **Game chat:** Migrations (messages, reactions, presence) + API routes + BetrGuesserGameChatModal + game page button and unread.
5. **SOT:** Update Phase 13 and Infrastructure/Change log as above.

**Confidence:** Asset change is trivial. Guesses cache and GET winner profile are small, low-risk changes. Whitelist is additive (nullable column). Game chat mirrors lobby and existing BETR game chats; access rule (has guessed or admin) is simple and testable end-to-end.

---

## 7. Decisions (locked in)

1. **Whitelist:** The 6 whitelisted users are **fully bypassed**—no BETR games registration or staking check required.
2. **Game chat availability:** Chat is available **only when the game is open** (not when closed, settled, or cancelled).
3. **Game chat visibility:** The Chat button is **visible from the start** when the game is open; only users who have submitted a guess (or admin) can read and send messages.