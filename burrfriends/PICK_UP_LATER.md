# Pick Up Later — Settle URLs, Payouts & Optimizations

Short summary of what’s done and what’s left so you can continue later.

---

## 1. What’s done

- **Settle URLs & payouts (Burrfriends + Poker)**
  - All settle responses include `settleTxUrl`, `txUrls` (Basescan).
  - Game-detail APIs return `settle_tx_url` and `payouts` with `txUrl` for each payout.
  - UI: “Settlement: View on Basescan” and per-payout “View tx” where applicable (games, jenga, buddy-up, betr-guesser).

- **Admin `GET /api/admin/payouts-by-fid?fid=`**
  - Aggregates from: buddy_up_settlements, betr_guesser_settlements, jenga_settlements, remix_betr_settlements, burrfriends_participants.
  - Returns `totalReceived`, `count`, `payouts[]` with `txUrl`.

- **Cleanup**
  - Unused `getClubForGame` import removed from `src/app/api/games/[id]/route.ts`.

- **Your change**
  - Jenga: `initializeTower` → `initializeTowerV2` in `src/app/api/jenga/games/route.ts` (`~/lib/jenga-tower-state-v2`).

---

## 2. Plan to optimize / finish (in order)

### Step 1 — Dev smoke test (before deploy)

- **Burrfriends:** `cd burrfriends; npm run dev`
  - Open a **settled** game (buddy-up, betr-guesser, jenga, burrfriends): “View on Basescan” works, per-payout “View tx” if `payouts` exist.
  - Run a **settle**: success, then game card shows Basescan link (and payouts if applicable).
- **Poker** (if in scope): `cd poker; npm run dev` → open settled game, confirm `settle_tx_url` and `payouts` in Network tab.

---

### Step 2 — Optional: `payouts-by-fid` DB-side filters

**Goal:** Avoid fetching all rows and filtering in JS; use DB `filters` when tables have `winner_fid` or `fid`.

**File:** `src/app/api/admin/payouts-by-fid/route.ts`

**Edits:** `pokerDb.fetch` supports `filters`. Add:

| Block | Table | Add `filters` |
|-------|--------|----------------|
| buddy_up_settlements | buddy_up_settlements | `filters: { winner_fid: fid }` |
| betr_guesser_settlements | betr_guesser_settlements | `filters: { winner_fid: fid }` |
| jenga_settlements | jenga_settlements | `filters: { winner_fid: fid }` |
| remix_betr_settlements | remix_betr_settlements | `filters: { winner_fid: fid }` |
| burrfriends_participants | burrfriends_participants | `filters: { fid }` |

Example (buddy_up block):

```ts
const buddy = await pokerDb.fetch<any>("buddy_up_settlements", {
  filters: { winner_fid: fid },
  select: "game_id,winner_fid,prize_amount,tx_hash",
  limit: 500,
});
```

Keep the in-memory `if (Number(r.winner_fid) === fid && r.tx_hash)` (and equivalents) as a safeguard. For `burrfriends_participants` keep `if (Number(r.fid) === fid && r.payout_tx_hash)`.

---

### Step 3 — Deploy

- Deploy burrfriends (and poker if applicable). Prefer **staging** first, then production.

---

### Step 4 — Post-deploy checks

- Settle one game per type you use; confirm `settleTxUrl` / `txUrls` and game-detail “View on Basescan.”
- Call `GET /api/admin/payouts-by-fid?fid=<winner>` and confirm `totalReceived`, `count`, `payouts[].txUrl`.

---

### Step 5 — Optional: Remix-betr history — Basescan links

**Goal:** In Remix-betr “Past rounds,” show “View on Basescan” per winner when `tx_hash` exists.

**5a. API — `src/app/api/remix-betr/history/route.ts`**

- Add: `import { getBaseScanTxUrl } from "~/lib/explorer";`
- In the `winners` map (where you already set `tx_hash: w.tx_hash ?? undefined`), add:
  - `txUrl: getBaseScanTxUrl(w.tx_hash) ?? null`

**5b. UI — `src/app/remix-betr/page.tsx`**

- Extend `HistoryRound` winner type:
  - `tx_hash?: string | null; txUrl?: string | null;`
- In the “Past rounds” list, where each winner is rendered (e.g. `#${w.position} … — {w.amount} BETR`), add:
  - `{w.txUrl && <a href={w.txUrl} target="_blank" rel="noopener noreferrer">View on Basescan</a>}`

---

## 3. Key paths

| What | Path |
|------|------|
| Explorer helpers | `src/lib/explorer.ts` |
| Settlement response shape | `src/lib/settlement-core.ts` |
| Admin payouts-by-fid | `src/app/api/admin/payouts-by-fid/route.ts` |
| Remix-betr history API | `src/app/api/remix-betr/history/route.ts` |
| Remix-betr page (history UI) | `src/app/remix-betr/page.tsx` |
| Game detail + payouts | `src/app/api/games/[id]/route.ts`, `buddy-up/games/[id]`, `jenga/games/[id]`, `betr-guesser/games/[id]` |

---

## 4. If something breaks

- **Revert (Settle-URL / payouts work):** see **“Quick revert”** in `SETTLE_URLS_NEXT_STEPS_AND_RISKS.md`.
- **Troubleshooting:** same doc, section **“If something breaks.”**

---

## 5. Other docs

- **`SETTLE_URLS_NEXT_STEPS_AND_RISKS.md`** — Confidence, what to verify, revert list.
- **`PAYMENTS_SETTLE_PLAN.md`** — Terminology, response shapes, settle vs paid/prize-based.

---

## 6. One-line state

**Done:** Settle + game-detail URLs and payouts (Burrfriends + Poker), admin payouts-by-fid, lint fix, your jenga `initializeTowerV2` switch. **Next:** Dev smoke → optional payouts-by-fid filters → deploy → post-deploy checks → optional Remix-betr history `txUrl`.
