# Settle / Payment URLs — Next Steps & Risk Summary

## Am I 100% sure it will work end-to-end and not break anything?

**No.** I can't be 100% sure without running the full app in dev/staging and doing real settle flows and game-detail loads. Here’s what is **likely fine** and what to **verify**.

---

## What’s likely safe (why)

1. **Additive-only changes**
   - New response fields: `settleTxUrl`, `txUrls`, `settle_tx_url`, `payouts` (and in poker `settle_tx_url`, `payouts`). Existing clients that ignore them keep working.
   - New UI blocks only render when `settle_tx_hash` or `settle_tx_url` or `payouts` exist; no existing UI is removed or rewritten.

2. **Settle logic untouched**
   - `transferBETRToWinners`, `contract.settleGame`, winner/amount derivation, and DB updates for settlements are unchanged. Only the **response shape** is extended.

3. **Build and types**
   - `npm run build` in burrfriends **compiles and type-checks** successfully. Lint in `payouts-by-fid` catch blocks is fixed (`catch { }`).

4. **Table/column usage**
   - **Burrfriends:** `burrfriends_participants` (fid, payout_amount, payout_tx_hash), `buddy_up_settlements`, `betr_guesser_settlements`, `jenga_settlements` — all used elsewhere with the same names.
   - **Poker:** `participants` with `fid`, `payout_amount`, `payout_tx_hash` — same as in settle-contract and games [id] viewer participant fetch.

---

## What to verify before / after deploy

| Check | How | If it fails |
|-------|-----|-------------|
| **Poker `participants` columns** | In Supabase: `poker.participants` has `fid`, `payout_amount`, `payout_tx_hash`. | Poker game-detail `payouts` will be `[]`; settlement link and rest of page still work. |
| **Settle response in UI** | After settle: game state gets `settle_tx_hash` and now also `settle_tx_url`. Old code only used `settle_tx_hash`. | If something explicitly requires `settleTxHash` and not `settleTxUrl`, it still gets `settleTxHash`. |
| **Basescan links** | Click “View on Basescan” for a known `settle_tx_hash`; should open `https://basescan.org/tx/<hash>`. | If `getBaseScanTxUrl` returns `null` (e.g. empty hash), we use `|| '#'` so the link exists but goes nowhere; no hard crash. |
| **`payouts` when no rows** | When game is settled but no settlement/participant rows have `payout_tx_hash` yet (edge case). | `payouts` is `[]` or `undefined`; UI checks `payouts?.length` and shows nothing. |
| **Admin `payouts-by-fid`** | `GET /api/admin/payouts-by-fid?fid=123` as admin. | Each source (`buddy_up_settlements`, etc.) is in a try/catch; one failing doesn’t break the rest. |

---

## Recommended next steps (in order)

### 1. Dev smoke test (before deploy)

- **Burrfriends**
  - `cd burrfriends && npm run dev`
  - Open a **settled** game (buddy-up, betr-guesser, jenga, or burrfriends game) and confirm:
    - “Settlement: View on Basescan” (or equivalent) is shown and links to `https://basescan.org/tx/...`.
    - If the backend returns `payouts`, the per-payout “View tx” / “tx” links work.
  - Run a **settle** (e.g. betr-guesser or buddy-up) and confirm:
    - Success message and that the game card soon shows the new Basescan link (and payouts if applicable).
- **Poker** (if you deploy it)
  - `cd poker && npm run dev`
  - Open a settled game and confirm `settle_tx_url` and `payouts` appear in the response (e.g. via Network tab). The existing poker game UI may not show them yet; that’s acceptable as long as the API returns them.

### 2. Optional: add `winner_fid` filter to `payouts-by-fid`

- Right now we fetch all rows from each settlement/participant table and filter by `winner_fid`/`fid` in JS. For large tables this could be slow.
- If you see slow responses: add `filters: { winner_fid: fid }` (or `fid` for `burrfriends_participants`) where the DB supports it, and keep the in-memory filter as a safeguard.

### 3. Deploy

- Deploy burrfriends (and poker if applicable). Prefer **staging** first, then production.

### 4. Post-deploy checks

- Settle one game per type you use (buddy-up, betr-guesser, jenga, burrfriends prize/paid, and poker if in scope).
- For each: confirm the new Fields in the settle JSON (`settleTxUrl`, `txUrls`, etc.) and that the game-detail “View on Basescan” works.
- Call `GET /api/admin/payouts-by-fid?fid=<a winner>` and confirm `totalReceived`, `count`, and `payouts[].txUrl`.

### 5. Remix-betr (optional, not done yet)

- Remix-betr has no “game [id]” route; it’s round-based. The **settle** endpoint already returns `settleTxUrl` and `txUrls` via `createSettlementResponse`.
- To show Basescan in **history**: in `remix-betr/history` (or wherever round data is built), include `txUrl: getBaseScanTxUrl(row.tx_hash)` for each winner and surface it in the UI.

---

## If something breaks

- **Settle fails (500)**  
  - Unlikely to be from these edits; we didn’t change transfer or contract logic. If it happens, check server logs and revert only the settle-contract / settlement-core / settle-route changes.

- **Game detail 500 when settled**  
  - Possible if `burrfriends_participants` or poker `participants` lacks `payout_amount` or `payout_tx_hash`. The payouts fetch is in a try/catch; a throw would make `payouts` stay `[]` and the handler would only fail if something else in the route threw. If you see 500, temporarily remove the payouts block (the `let payouts = ...` and `...(payouts.length > 0 && { payouts })` / equivalent) and redeploy to confirm.

- **“View on Basescan” 404**  
  - `getBaseScanTxUrl` only builds `https://basescan.org/tx/<hash>`. If the hash is wrong or from another chain, Basescan will 404. Fix is data/source of the hash, not this helper.

- **Poker behaves differently**  
  - We only added optional fields and a payouts block that uses `participants`. If poker’s `participants` schema differs (e.g. `player_fid` instead of `fid`), the payouts array could be empty. Re-check `poker.participants` columns and, if needed, map `player_fid` → `fid` in the payouts mapping.

---

## Quick revert (if you must)

To roll back only the **Settle-URL / payment-URL** work:

- **Burrfriends:** revert under `src/` (and optionally `SETTLE_URLS_NEXT_STEPS_AND_RISKS.md`):
  - `lib/explorer.ts` (remove `getBaseScanTxUrls`, `parseSettleTxHashes`)
  - `lib/settlement-core.ts` (remove `settleTxUrl`, `txUrls` from `createSettlementResponse` and the `getBaseScanTxUrl` import)
  - `app/api/games/[id]/settle-contract/route.ts` (remove `settleTxUrl`, `txUrls` and `getBaseScanTxUrl`/`getBaseScanTxUrls` imports)
  - `app/api/games/[id]/route.ts` (remove `settle_tx_url`, `payouts`, `getBaseScanTxUrl`)
  - `app/api/buddy-up/games/[id]/route.ts` (remove `settle_tx_url`, `tx_hashes`, `tx_urls`, `payouts`, explorer imports)
  - `app/api/jenga/games/[id]/route.ts` (remove `settle_tx_url`, `payouts`, `getBaseScanTxUrl`)
  - `app/api/betr-guesser/games/[id]/route.ts` (remove `settle_tx_url`, `payouts`, `getBaseScanTxUrl`)
  - `app/api/admin/payouts-by-fid/` (delete the route directory)
  - `app/games/[id]/page.tsx` (remove Settlement/Payouts block and `settle_tx_url` in setGame)
  - `app/jenga/page.tsx`, `app/buddy-up/page.tsx`, `app/betr-guesser/page.tsx` (remove `settle_tx_url`/`tx_urls`/`payouts` usage and `getBaseScanTxUrl` import, and revert settle-success messages)
  - `lib/types.ts` (remove `settle_tx_url` from `Game`)
- **Poker:** revert under `src/`:
  - `app/api/games/[id]/settle-contract/route.ts` (remove `settleTxUrl`, `txUrls`, `getBaseScanTxUrl` import)
  - `app/api/games/[id]/route.ts` (remove `settle_tx_url`, `payouts`, `getBaseScanTxUrl`)
  - `lib/types.ts` (remove `settle_tx_url` from `Game`)

---

## Summary

- **Confidence:** High that existing behavior is preserved; medium that every new path (all game types, poker, admin payouts-by-fid) works as intended until exercised in your env.
- **Next steps:** Dev smoke test → optional `payouts-by-fid` filter → deploy (staging first) → post-deploy settle + game-detail + admin checks; optionally add Remix-betr history `txUrl`.
- **If it breaks:** Use the revert list above; the change set is localized and reversible.
