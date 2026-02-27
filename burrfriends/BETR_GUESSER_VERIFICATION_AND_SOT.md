# BETR GUESSER Plan — End-to-End Verification and SOT Alignment

**Purpose:** Double-check the plan with no guessing; ensure scope fits BURRFRIENDS_GAME_SETUP_PHASED_PLAN_REVISED.md so implementation and SOT updates can follow exactly.

---

## 1. Verification (source-checked, no assumptions)

### 1.1 Assets (guesser.png)

- **Game page:** Confirmed BetrGuesserClient.tsx uses `<Image src="/guesser.png" ... />` (line ~367). No change.
- **Homepage card:** Confirmed clubs/[slug]/games/page.tsx BETR GUESSER card (lines 1509–1529) has no `<Image>`; BULLIED/THE MOLE cards use `<Image src="/bullied.png" ... width={268} height={268} />` etc. Plan: add same pattern for guesser.png. **Verified:** Single, deterministic UI change.

### 1.2 Bug: Names and PFP

- **Cache API:** Confirmed `~/lib/cache.ts` exports `getProfilesFromCache(fids)` → `{ cached, needFetch }` and `setProfilesInCache(profiles)`, plus `CachedProfileData` (username, display_name, pfp_url). Used elsewhere (e.g. the-mole progress). **Verified:** Guesses route can use same pattern.
- **Guesses route:** Currently only Neynar; on failure userMap is empty. Plan: call getProfilesFromCache first, Neynar only for needFetch, setProfilesInCache for fetched, then build response. **Verified:** Implementation path is clear.
- **GET game:** Currently returns game row, payouts, userGuess, guess_count. Plan: when `game.status === 'settled' && game.winner_fid`, resolve profile (cache + Neynar) and add `winner_display_name`, `winner_pfp_url` to response. **Verified:** No new endpoint; additive response fields.
- **Client winner block:** Today shows "Winner: FID {game.winner_fid}". After API returns winner_display_name/winner_pfp_url, client shows name and PFP with fallback to FID. **Verified.**
- **Calculate-winner block:** Plan: when allGuesses is loaded, find row where g.fid === calculatedWinner.winnerFid and use that row’s display_name, username, pfp_url. If not loaded, keep "FID X". **Verified:** Client-only logic; no API change required.

### 1.3 Whitelist 6 FIDs

- **Schema:** Other migrations use `bigint[]` (e.g. mole_groups.fids, bullied_groups.fids). Plan: `whitelist_fids bigint[]` nullable, CHECK (whitelist_fids IS NULL OR array_length(whitelist_fids, 1) = 6). **Verified:** Matches existing patterns.
- **Create route:** Confirmed POST body parsing (prizeAmount, guessesCloseAt, community, etc.). Plan: parse `whitelistFids` (array), validate length 6 and distinct, add `whitelist_fids: validArray` to insert. PostgREST accepts JSON array for bigint[]. **Verified.**
- **Submit route:** Confirmed flow: requireAuth → game fetch (currently no whitelist_fids) → admin bypass → **registration check** → auto-close → guess count → status open → **staking check** → existing guess → insert. Plan: (1) Add `whitelist_fids` to game fetch type (and ensure column is present after migration). (2) Right after game fetch: if `game.whitelist_fids` is non-null and array length 6, then if `!game.whitelist_fids.includes(Number(fid))` return 403 "This game is invite-only; only whitelisted players can submit."; else (fid is whitelisted) **skip registration and staking** and jump to auto-close/rest of flow. **Verified:** Single insertion point; fully bypassed for whitelisted FIDs.
- **GET game:** Returns full game row; after migration row will include whitelist_fids. Client can show "Invite-only · 6 players" when present. **Verified.**

### 1.4 Game-level group chat

- **Lobby pattern:** Confirmed GET/POST in one route (lobby/chat/route.ts), heartbeat (lobby/heartbeat), active (lobby/active), reactions (lobby/chat/messages/[messageId]/reactions), DELETE (lobby/chat/[id]). **Verified:** Same route shape for betr-guesser/games/[id]/chat, etc.
- **Auth pattern:** Mole group chat uses `canAccessGroupChat(fid, groupId)` (admin or fid in group). Plan: `canAccessGameChat(fid, gameId)` = isAdmin(fid) OR exists row in betr_guesser_guesses with (game_id, fid). One fetch. **Verified.**
- **Sender profiles:** Mole chat uses signups table; BETR GUESSER has no signups. Plan: use getProfilesFromCache + Neynar for sender_fids (same as guesses route). **Verified.**
- **Reactions table:** Lobby uses message_id (FK), fid, reaction, PK (message_id, fid). Plan: same for betr_guesser_game_chat_reactions. **Verified.**
- **Presence/unread:** Lobby has lobby_presence (fid, chat_last_seen_at) and unread = messages after chat_last_seen_at. Plan: betr_guesser_game_chat_presence (game_id, fid) PK, chat_last_seen_at. **Verified.**
- **Availability:** Chat only when game status = 'open'. Plan: in chat routes and UI, if game.status !== 'open' return 404 or hide button. **Verified.**
- **Visibility:** Chat button visible from start when game open; only participants (have guessed) or admin can read/post. **Verified.**

### 1.5 Migration order and pokerDb

- **Infrastructure list:** Migrations run up to 80 (mole_reserved_spots). Plan: add 81 (whitelist_fids), 82 (betr_guesser_game_chat_messages), 83 (betr_guesser_game_chat_reactions), 84 (betr_guesser_game_chat_presence). **Verified:** Order is messages → reactions (FK messages) → presence.
- **pokerDb VALID_POKER_TABLES:** Must add `betr_guesser_game_chat_messages`, `betr_guesser_game_chat_reactions`, `betr_guesser_game_chat_presence`. **Verified.**

---

## 2. SOT alignment (Phase 13 structure)

**Current Phase 13 numbering in BURRFRIENDS_GAME_SETUP_PHASED_PLAN_REVISED.md:**

- 13.1 Overview, 13.2 Database, 13.3 Auto-Close, 13.4 API Endpoints, 13.5 Winner Calculation, 13.6 UI, 13.7 Game Creation, 13.8 Settlement Flow, **13.9 Cancel Flow**, **13.10 Edge Cases**, **13.11 Files**, **13.12 Dependencies**, **13.13 Staking**.

**Conflict:** The plan says add "13.9 Whitelist" and "13.10 Game chat." That would overwrite Cancel Flow and Edge Cases if inserted literally.

**Required SOT edits (so scope fits the doc):**

1. **Phase 13.6 (BETR GUESSER card):** Add one bullet under the card bullets: "Game image: `guesser.png` shown on the card (268×268, same placement as other BETR game cards)."
2. **Phase 13.8 (Settlement Flow):** Add a new **13.8.1 Names and PFP** subsection after 13.8: Guesses API uses shared profile cache then Neynar; GET game when settled returns winner_display_name and winner_pfp_url; game page and admin calculate-winner block show winner name and PFP (fallback FID when missing).
3. **Insert new 13.9 and 13.10, then renumber:** Insert **13.9 Whitelist 6 FIDs (invite-only)** and **13.10 Game-level group chat** with full content (schema, APIs, UI, access, availability, visibility). Then **renumber** existing 13.9→13.11, 13.10→13.12, 13.11→13.13, 13.12→13.14, 13.13→13.15 (Cancel Flow, Edge Cases, Files, Dependencies, Staking).
4. **13.4 API Endpoints table:** Add row for POST create: optional `whitelistFids` (length 6). Add row for GET game: when settled, response includes winner_display_name, winner_pfp_url. Add new rows for GET/POST games/[id]/chat, POST games/[id]/chat/heartbeat, GET games/[id]/chat/active, POST games/[id]/chat/messages/[messageId]/reactions, DELETE games/[id]/chat/[messageId].
5. **13.2 Database:** In betr_guesser_games table add column `whitelist_fids` (bigint[], nullable, CHECK length 0 or 6). Add new tables: betr_guesser_game_chat_messages, betr_guesser_game_chat_reactions, betr_guesser_game_chat_presence (full schema as in plan).
6. **Infrastructure → Running migrations:** Append migrations 81–84 with exact filenames and one-line description.
7. **pokerDb:** In the doc (or in 13.11/13.13 Files), note adding the three new chat tables to VALID_POKER_TABLES.
8. **App-wide chat reactions / unread:** In the existing app-wide subsections, add BETR GUESSER game chat to the list of chats that support reactions and unread.
9. **Change log:** One new entry summarizing: BETR GUESSER — guesser.png on homepage card; names/PFP in guesses and winner; whitelist 6 FIDs (fully bypassed); game-level chat (open only, visible from start).

---

## 3. What to do and how (implementation checklist)

| # | What | How |
|---|------|-----|
| 1 | Homepage card image | In clubs/[slug]/games/page.tsx, inside the BETR GUESSER card div, add `<Image src="/guesser.png" alt="BETR GUESSER" width={268} height={268} style={{ maxWidth: '100%', height: 'auto', borderRadius: '12px', marginBottom: '8px' }} />` above the title row (same pattern as BULLIED card). |
| 2 | Guesses API cache | In betr-guesser/games/[id]/guesses/route.ts: import getProfilesFromCache, setProfilesInCache from ~/lib/cache; get CachedProfileData type. After building fids array, call getProfilesFromCache(fids), assign cached to userMap, then for needFetch call Neynar, merge into userMap, setProfilesInCache(fetched). Build data from userMap as today. |
| 3 | GET game winner profile | In betr-guesser/games/[id]/route.ts: when game.status === 'settled' && game.winner_fid, call getProfilesFromCache([game.winner_fid]), needFetch then Neynar, setProfilesInCache; add winner_display_name and winner_pfp_url to the returned data object. |
| 4 | Client winner block | In BetrGuesserClient.tsx: where it shows "Winner: FID {game.winner_fid}", use (game as any).winner_display_name || (game as any).winner_pfp_url and show name + PFP; fallback to "FID {game.winner_fid}". |
| 5 | Client calculate-winner block | In BetrGuesserClient.tsx: when displaying calculated winner, const winnerRow = allGuesses.find(g => g.fid === calculatedWinner.winnerFid); display winnerRow?.display_name ?? winnerRow?.username ?? \`FID ${calculatedWinner.winnerFid}\` and winnerRow?.pfp_url. |
| 6 | Migration whitelist_fids | New migration: ALTER betr_guesser_games ADD COLUMN whitelist_fids bigint[]; ADD CONSTRAINT chk_whitelist_fids CHECK (whitelist_fids IS NULL OR array_length(whitelist_fids, 1) = 6); |
| 7 | Create API whitelist | In betr-guesser/games/route.ts POST: parse body.whitelistFids (array); if present validate length 6 and distinct integers; add whitelist_fids: validWhitelistFids (or null) to insert payload. |
| 8 | Submit API whitelist | In betr-guesser/submit/route.ts: add whitelist_fids to the game fetch type. After fetching game, if game.whitelist_fids != null && Array.isArray(game.whitelist_fids) && game.whitelist_fids.length === 6: if !game.whitelist_fids.map(Number).includes(Number(fid)) return 403 "This game is invite-only; only whitelisted players can submit."; else (whitelisted) skip registration and staking checks and proceed (e.g. set a flag and bypass the two if (!adminBypass) blocks). |
| 9 | GET game whitelist | No change if fetch returns full row; else ensure select includes whitelist_fids. Client reads game.whitelist_fids. |
| 10 | Create modal whitelist | In CreateBetrGuesserGameModal: add optional "Whitelist 6 players (invite-only)" (e.g. 6 number inputs or comma-separated); validate exactly 6; send whitelistFids in POST body. |
| 11 | Game page whitelist UI | When game.whitelist_fids is set, show "Invite-only · 6 players" (badge or line). |
| 12 | Migrations chat tables | New migration 82: betr_guesser_game_chat_messages (id, game_id FK, sender_fid, message text, created_at). 83: betr_guesser_game_chat_reactions (message_id FK, fid, reaction; PK (message_id, fid)). 84: betr_guesser_game_chat_presence (game_id, fid, chat_last_seen_at; PK (game_id, fid)). |
| 13 | Chat routes | Create GET/POST games/[id]/chat (auth: canAccessGameChat; list/send messages; sender profiles via cache+Neynar; reactions per message). POST games/[id]/chat/heartbeat (body inChat; upsert presence; when inChat true set chat_last_seen_at = now()). GET games/[id]/chat/active (inChatCount, unreadChatCount). POST games/[id]/chat/messages/[messageId]/reactions. DELETE games/[id]/chat/[messageId] (admin). All require game.status === 'open' (or 404). |
| 14 | canAccessGameChat | Helper: isAdmin(fid) OR exists betr_guesser_guesses row (game_id, fid). |
| 15 | pokerDb | Add betr_guesser_game_chat_messages, betr_guesser_game_chat_reactions, betr_guesser_game_chat_presence to VALID_POKER_TABLES. |
| 16 | BetrGuesserGameChatModal | New component (or adapt LobbyChatModal): props gameId; when game status !== 'open' do not render or show "Chat closed." Poll GET chat every 5s; heartbeat every 30s when open; MessageWithReactions; newest first; unread from active. |
| 17 | Game page chat button | On /betr-guesser, when game && game.status === 'open', show "Chat" button; onClick open BetrGuesserGameChatModal. When modal closed, poll GET .../chat/active for unread badge. |
| 18 | SOT doc | Apply all edits in section 2 above (13.6 bullet, 13.8.1, new 13.9 and 13.10, renumber 13.9–13.13 to 13.11–13.15, 13.2 and 13.4 updates, migrations 81–84, pokerDb, app-wide lists, Change log). |

---

## 4. Confidence and risks

- **No guessing:** Cache API, submit flow, lobby/mole chat patterns, and migration style are all confirmed from the repo. Whitelist bypass is a single conditional branch; chat is a straight copy of lobby pattern with a different auth check and profile source.
- **Risks:** (1) PostgREST return type for bigint[] (whitelist_fids) — usually JSON array; client may need to handle number[]. (2) Chat routes must enforce game.status === 'open' (fetch game first, then 404 if not open). (3) SOT renumbering (13.9→13.11 etc.) must be done carefully so no cross-reference breaks (search for "13.9", "13.10" in the doc and update if they refer to Cancel/Edge Cases).

---

## 5. Major questions for you

None. Decisions (whitelist fully bypassed, chat only when open, chat visible from start) are locked in. If you want to proceed, the next step is implementation following the checklist above and then updating BURRFRIENDS_GAME_SETUP_PHASED_PLAN_REVISED.md exactly as in section 2 so the doc remains the source of truth.
