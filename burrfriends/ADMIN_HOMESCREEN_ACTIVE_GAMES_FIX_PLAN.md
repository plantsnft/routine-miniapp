# Admin homescreen: games shown as active when they are not — fix plan

## Problem

- **Admins’ homescreen** shows BETR GAMES cards (BETR GUESSER, BUDDY UP, THE MOLE, JENGA) as if games are active when there are no active games.
- **Non-admins’ homescreen** behaves correctly: those cards only appear when there are active games (or when “Show Inactive Games” is toggled).

Requirement: use the same logic for admins as for non-admins for **whether** a game card is shown and how it looks. Do **not** remove the admin “Create X Game” buttons.

---

## Root cause

In `src/app/clubs/[slug]/games/page.tsx`, inside the BETR WITH BURR branch (`isHellfireClub`), each BETR game card’s **visibility** is:

- BETR GUESSER: `(isAdmin || betrGuesserGames.length > 0 || showInactiveBetrGames)`
- BUDDY UP:    `(isAdmin || buddyUpGames.length > 0 || showInactiveBetrGames)`
- THE MOLE:    `(isAdmin || moleGames.length > 0 || showInactiveBetrGames)`
- JENGA:       `(isAdmin || jengaGames.length > 0 || showInactiveBetrGames)`

So:

- **Non-admins:** card is shown only when the corresponding `*Games.length > 0` or `showInactiveBetrGames` is true. When there are no games and “Show Inactive” is off, the card is hidden → correct.
- **Admins:** card is **always** shown because of `isAdmin`. The card is also always rendered with `hl-card--active` (active styling). So admins see the card and “active” styling even when there are no active games → bug.

The “Create BETR GUESSER Game”, “Create BUDDY UP Game”, etc. buttons live in the **BETR GAMES section header** in a separate block `{isAdmin && ( ... )}` (lines ~557–602). They do **not** depend on the card being visible. So changing card visibility will not remove those buttons.

---

## Fix (no edits yet — plan only)

Use the **same visibility condition for everyone** (admins and non-admins):

- Show a BETR game card only when **there are games to show** or the user chose “Show Inactive Games”.

Concretely, in `src/app/clubs/[slug]/games/page.tsx`:

1. **BETR GUESSER card**  
   Change:
   - From: `(isAdmin || betrGuesserGames.length > 0 || showInactiveBetrGames)`
   - To:   `(betrGuesserGames.length > 0 || showInactiveBetrGames)`

2. **BUDDY UP card**  
   Change:
   - From: `(isAdmin || buddyUpGames.length > 0 || showInactiveBetrGames)`
   - To:   `(buddyUpGames.length > 0 || showInactiveBetrGames)`

3. **THE MOLE card**  
   Change:
   - From: `(isAdmin || moleGames.length > 0 || showInactiveBetrGames)`
   - To:   `(moleGames.length > 0 || showInactiveBetrGames)`

4. **JENGA card**  
   Change:
   - From: `(isAdmin || jengaGames.length > 0 || showInactiveBetrGames)`
   - To:   `(jengaGames.length > 0 || showInactiveBetrGames)`

**Do not change:**

- The admin-only block that renders “Create BETR GUESSER Game”, “Create BUDDY UP Game”, “Create THE MOLE Game”, “Create JENGA Game”, and “View list”. That block stays as-is so admins can still create games when no card is visible.
- REMIX BETR card (it has no `isAdmin` in its visibility; it’s always shown in the BETR GAMES section).
- BETR POKER section or `displayGames` / active vs history logic.
- Any API or backend.

---

## Resulting behavior (expected)

- **When there are no active games and “Show Inactive Games” is off**
  - Admins: BETR GUESSER / BUDDY UP / THE MOLE / JENGA **cards are hidden**. Admins still see the BETR GAMES header with “Create X Game” and “View list” and can create games.
  - Non-admins: unchanged (cards hidden).

- **When there are active games (or “Show Inactive Games” is on)**
  - Admins and non-admins: see the same cards, with the same active/inactive styling driven by game data.

- **Admin create buttons**
  - Always visible for admins in the BETR GAMES section header; no dependency on card visibility.

---

## End-to-end check

- Data: `betrGuesserGames`, `buddyUpGames`, `moleGames`, `jengaGames` are already loaded from `/api/*/games/active` (and “Show Inactive” does not change these lists; it only controls visibility of cards — if the APIs return only active games, “Show Inactive” may need to be clarified in product; for this bug we only align visibility with non-admin behavior).
- Styling: Cards that are shown already use game data for subtitles (e.g. “Guesses close in…”, “Signups Open”). No change needed for styling logic if we only fix visibility.
- No backend or API changes required.

---

## Clarifying questions (if any)

1. **“Show Inactive Games”**  
   Today the same `/api/*/games/active` lists are used for everyone. Does “Show Inactive Games” currently show cards for games that are in those lists but in a non-open state (e.g. closed/settled), or is the intent to have a separate API/query for “inactive” games? If the former, the fix above is sufficient. If the latter, we may need a follow-up to define what “inactive” means and how to load it.

2. **Runtime logs**  
   You mentioned reviewing runtime logs. If you have specific log lines or errors (e.g. from the browser console or Vercel logs) that show wrong behavior, sharing them would help confirm this is purely the front-end visibility condition and not an API returning stale/wrong data for admins.

3. **Phased plan doc**  
   `BURRFRIENDS_GAME_SETUP_PHASED_PLAN_REVISED.md` describes BETR GUESSER visibility as “Always shown (like REMIX BETR)”. After this fix, BETR GUESSER (and BUDDY UP, THE MOLE, JENGA) will be “shown when there are games or Show Inactive is on”. Do you want the phased plan updated to reflect that, or leave the doc as-is for now?
