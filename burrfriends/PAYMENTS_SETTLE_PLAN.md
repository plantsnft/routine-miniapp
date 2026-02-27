# Payments from Main Wallet & Settle — Consistency & Efficiency Plan

**Scope:** How payments **from** the main/master wallet are performed at settlement (settle), including customized options (prize-based, paid/contract, payout_bps, Last Person Standing, etc.). **Out of scope for this plan:** entry payments (buy-in) via `/api/payments/prepare`, `/api/payments/confirm`, `/api/payments/recover` — those are player→escrow flows; this plan focuses on **settle/payout** (master wallet → winners).

**Status:** Plan only. No code edits.

---

## 1. Current Architecture Overview

### 1.1 Master Wallet Usage

All settle-related **outgoing** BETR (or USDC in paid games) flows use:

- **Env:** `MASTER_WALLET_PRIVATE_KEY`
- **Used in:**
  - `settlement-core.ts` — `transferBETRToWinners` (viem: `privateKeyToAccount`, `writeContract` ERC20 `transfer`)
  - `settle-contract/route.ts`:
    - **Prize-based path:** viem `privateKeyToAccount` + `writeContract` for direct BETR `transfer` to each winner and optionally to LPS
    - **Paid/contract path:** ethers `Wallet` + `contract.settleGame` (escrow contract moves funds; master wallet signs the settle tx)
  - `contract-ops.ts` — contract writes (e.g. `createGame`); not settle-specific
  - `refund/route.ts`, `cancel/route.ts` — also use master wallet for USDC/BETR movements

So: **master wallet** = hot wallet that signs (1) direct BETR transfers in prize-based and simple game settlements, and (2) `settleGame` and other contract calls for paid games.

### 1.2 Two Settlement “Families”

| Family | Routes | Mechanism | Uses `settlement-core`? |
|--------|--------|-----------|--------------------------|
| **Simple BETR (library)** | `buddy-up/.../settle`, `betr-guesser/.../settle`, `jenga/.../settle`, `remix-betr/settle` | Direct BETR `transfer` from master wallet via `transferBETRToWinners` | Yes |
| **Games settle-contract** | `games/[id]/settle-contract` | **Prize-based:** direct BETR `transfer` (own viem logic, no `settlement-core`). **Paid:** `contract.settleGame` (ethers, escrow). | No |

---

## 2. Terminology (Proposed Common Language)

To make behavior and code easier to reason about end-to-end:

| Term | Proposed meaning | Where it appears today |
|------|------------------|-------------------------|
| **Settle** | The act of finalizing a game and distributing payouts. One “settlement” can comprise multiple on-chain txs. | All settle routes |
| **Settlement tx / primary tx** | The single hash we show in the UI as “the” settlement and store in `settle_tx_hash` (typically the first winner payout, or the `settleGame` tx for paid). | `settleTxHash` in responses and DB |
| **Transfer tx** | Each individual ERC20 `transfer` (or `settleGame` for paid games, which is exactly one on-chain tx). | `txHashes`, `transferTxHashes` |
| **Payout** | One credited outcome for one recipient: (FID or address, amount, optional position). Can be “prize” or “award” (e.g. LPS). | `winners`, `payouts`, `recipients`/`amounts` |
| **Prize-based game** | `buy_in_amount === 0` or `prize_amounts` set; no escrow. Payouts = direct BETR from master. | `settle-contract` only |
| **Paid/contract game** | `buy_in_amount > 0`, escrow holds USDC. Payouts via `settleGame(recipients, amounts)`. | `settle-contract` only |
| **Main / master wallet** | Hot wallet whose key is `MASTER_WALLET_PRIVATE_KEY`; signs direct transfers and contract calls. | Everywhere |

**Recommendation:** Use consistently in code and docs: **settle** (verb/noun), **settlement tx** (`settleTxHash`), **transfer txs** (array of hashes), **payout** (one recipient’s outcome), **master wallet**.

---

## 3. Response Shapes

### 3.1 `settlement-core` Family (Unified)

`createSettlementResponse(settleTxHash, txHashes, winners, additionalData)` produces:

```txt
{
  ok: true,
  data: {
    settleTxHash,     // string
    txHashes,         // string[]
    winners: [ { fid, amount, position } ],
    ...additionalData
  }
}
```

Used by: buddy-up, betr-guesser, jenga, remix-betr. `additionalData` varies (e.g. `winnerFid`, `winnerGuess`, `prizeAmount`, `transferTxHashes` in one route).

### 3.2 `settle-contract` — Prize-Based

```txt
{
  ok: true,
  data: {
    mode: 'prize_based',
    settleTxHash,
    prizesDistributed,
    awardDistributed,
    transferTxHashes,   // same concept as txHashes, different name
    winners: [ { fid, prize, doubled? } ]
  }
}
```

- `transferTxHashes` = all BETR transfer hashes (winners + optional LPS).
- `settleTxHash` = `transferTxHashes[0]`.

### 3.3 `settle-contract` — Paid (Contract)

```txt
{
  ok: true,
  data: {
    settleTxHash,
    recipients,
    amounts,
    payouts: [ { fid?, recipient, amountDecimal, amountBaseUnits, bps? } ],
    contractState
  }
}
```

- Only one on-chain tx: `settleGame`; `settleTxHash` = that tx.
- No `txHashes`/`transferTxHashes` array in this branch (could add `[settleTxHash]` for consistency).

### 3.4 Idempotent “Already Settled”

`settle-contract` returns:

```txt
{
  ok: true,
  data: {
    settleTxHash: null,
    recipients: [],
    amounts: [],
    message: 'Game already settled'
  }
}
```

### 3.5 Inconsistencies

- **`txHashes` vs `transferTxHashes`:** Same semantics; different names. Library uses `txHashes`; settle-contract prize-based uses `transferTxHashes`.
- **`winners` shape:** `{ fid, amount, position }` vs `{ fid, prize, doubled? }`. `amount` vs `prize` is redundant; `position` vs `doubled` are different concerns.
- **Paid-game response:** No array of transfer hashes; only `settleTxHash`. For a single-tx path, `txHashes: [settleTxHash]` would align with the library contract.
- **Jenga** passes `transferTxHashes: [settleTxHash]` in `additionalData`; that’s redundant with `txHashes` and can confuse.

**Recommendation (for later implementation):**

- Standardize on one array name: **`txHashes`** (or **`transferTxHashes`** if you prefer) across all settle responses. For paid `settleGame`, `txHashes: [settleTxHash]`.
- Normalize `winners` (or a shared `payouts` shape) to a common structure: e.g. `{ fid?, address?, amount, position?, metadata? }` so `amount`/`prize` and `doubled` can live under `metadata` or extra optional fields.

---

## 4. DB and Stored Hashes

### 4.1 `settle_tx_hash` on Game Tables

| Game/Table | Stored value | Notes |
|------------|--------------|-------|
| `buddy_up_games` | `txHashes.join(",")` | Multiple hashes, comma-separated |
| `betr_guesser_games` | `txHashes[0]` | Single |
| `jenga_games` | `txHashes[0]` | Single |
| `burrfriends_games` (settle-contract) | `transferTxHashes[0]` or `receipt.hash` | Single |

So: **sometimes one hash, sometimes many comma-separated.** UIs that only display one “settlement tx” typically use the first; the rest are not first-class in the schema.

**Recommendation:**  
- Prefer **one** `settle_tx_hash` (the primary/settlement tx) everywhere.  
- If you need to store all hashes, add `settle_tx_hashes` (array or JSON/array column) and keep `settle_tx_hash` as the first for UI/backward compat.  
- Avoid comma-separated in a single string for parsing and type-safety.

### 4.2 Settlement-Ledger Tables (per-game-type)

- `buddy_up_settlements`, `betr_guesser_settlements`, `jenga_settlements`, `remix_betr_settlements`: each row has `tx_hash` (one transfer per winner).
- `burrfriends_participants`: `payout_tx_hash`, `payout_amount`, `paid_out_at`, `status='settled'` updated by settle-contract.

These are consistent in spirit (one tx hash per payout row or per participant).

### 4.3 `payouts` Table and `/api/games/[id]/payouts`

- `GET /api/games/[id]/payouts` reads from `payouts` (e.g. `recipient_fid`, `payer_fid`).  
- That table is written by **`/api/games/[id]/results`**, not by settle-contract.  
- settle-contract writes **`burrfriends_participants`** (`payout_tx_hash`, `payout_amount`, etc.).

So there are two notions of “payout”:

1. **Participant-level:** `burrfriends_participants.payout_*` (and game-specific settlement tables).
2. **Legacy/alternate:** `payouts` (results-driven).

**Recommendation:** In the plan, treat “payout” as the participant-level outcome. Decide whether `payouts` is still needed for your product; if yes, document when it is written (results) vs when `burrfriends_participants` is updated (settle-contract), so future changes don’t double-count or confuse.

---

## 5. Customization / Game-Specific Options

### 5.1 Amount and Split Rules

| Source | Mechanism | Used by |
|--------|-----------|---------|
| **Admin-provided `winners` with `amount`** | `WinnerEntry[]`; `resolveWinners` + `transferBETRToWinners` | buddy-up, remix-betr, jenga (derived from `prize_amount`), betr-guesser (derived from `prize_amount`) |
| **`prize_amounts` (game config)** | Array length must match winner count; optionally **prize doubling** for high stakers (scheduled games) | settle-contract prize-based |
| **`payout_bps` (game config)** | `[10000]` or e.g. `[6000,3000,1000]`; must sum to 10000; `amount[i] = (totalCollected * bps[i])/10000` | settle-contract paid |
| **`number_of_winners`** | Used to size/validate; actual split comes from `payout_bps` or `prize_amounts` | settle-contract |

### 5.2 Last Person Standing (LPS)

- **Where:** `settle-contract` only (body: `lastPersonStandingFid`, `lastPersonStandingAwardAmount`).
- **When:** Only for “scheduled” games: `game_type === 'large_event'` or `max_participants > 9`.
- **How:** Extra BETR transfer from master wallet to LPS FID. Address from:
  - Batched `getBulkWalletAddresses` (if `addressMap` already has LPS FID from the winner+LPS batch), or
  - `getAllPlayerWalletAddresses(lastPersonStandingFid)`.
- **DB:** `burrfriends_games.last_person_standing_fid`, `last_person_standing_award_amount`; `burrfriends_participants` updated for LPS (combined with prize if also winner, or separate row).

### 5.3 Prize Doubling (Scheduled Games)

- **Where:** settle-contract prize-based only.
- **Logic:** `checkUserStakeByFid(winnerFid, 50_000_000)`; if `meetsRequirement`, `finalPrizeAmounts[i] *= 2`.

### 5.4 Modes and Pathways in settle-contract

- **`winnerFids`:** Request sends `winnerFids`; server derives addresses (Neynar for prize-based; `verifyPaymentOnChain` for paid) and amounts (prize_amounts or `totalCollected`+`payout_bps`).
- **`legacy` (recipients/amounts):** Request sends `recipients` and `amounts`; used as-is (backward compatibility).

---

## 6. Wallet Resolution (FID → Address)

### 6.1 Batched Fetching

- **`settlement-core`:** `fetchBulkWalletAddressesForWinners(winnerFids)` → `getBulkWalletAddresses` (Neynar).
- **settle-contract prize-based:** `getBulkWalletAddresses([...winnerFids, ...(LPS ? [lastPersonStandingFid] : [])])`; result stored in `addressMap` and reused for winners and LPS. Good.

### 6.2 Address Selection (Filter Contracts, Prefer Verified)

- **`settlement-core`:** `selectWalletAddress(addrs)` using `KNOWN_CONTRACTS`; if multiple, take last (prefer verified over custody).
- **settle-contract prize-based:** Inline logic: same KNOWN_CONTRACTS (BETR staking, BETR token, escrow, USDC), same “last if multiple” rule. **Duplication** of `selectWalletAddress` semantics.

**Recommendation:** settle-contract prize-based (and any new path that chooses a wallet from Neynar) should call `selectWalletAddress` from `settlement-core` (or move `selectWalletAddress` + `KNOWN_CONTRACTS` to a shared `neynar-wallet` or `wallet-utils` module) to avoid drift.

### 6.3 Paid Games

- Address comes from **`verifyPaymentOnChain`** using `participant.tx_hash` → `payerAddress`. No Neynar for that step. Batch is only for prize-based (and LPS).

---

## 7. Balance Checks and Safety

### 7.1 Before Sending

- **`settlement-core`:** `transferBETRToWinners` checks `balanceOf(master) >= totalWei` (sum of `ethers.parseUnits(amount, 18)`). Throws if insufficient.
- **settle-contract prize-based:** Same idea: `balanceOf(master) >= totalPrizesNeeded + awardAmountNeeded` (BETR, 18 decimals). Good.

### 7.2 Tx Hash Count vs Resolved Winners

- **Library users:** After `transferBETRToWinners`, check `txHashes.length === resolved.length`; if not, return 500 and do **not** write to DB. Prevents partial-write corruption.
- **settle-contract prize-based:** No explicit check that `transferTxHashes.length === finalRecipients.length + (LPS ? 1 : 0)`. The loop pushes one hash per transfer, so it should match; an explicit assert would align with the library’s safety.

### 7.3 Paid Games

- Contract enforces `sum(amounts) <= totalCollected` and that the game is in the right state. No separate server-side balance check for the escrow.

---

## 8. Who Uses `settlement-core` vs Inline Logic

| Route | Uses `settlement-core` | Inline / Custom |
|-------|------------------------|------------------|
| buddy-up settle | `fetchBulkWalletAddressesForWinners`, `resolveWinners`, `transferBETRToWinners`, `createSettlementResponse` | Eligibility: `buddy_up_signups` |
| betr-guesser settle | same | `calculateBetrGuesserWinner`; eligibility: game state |
| jenga settle | same | Eligibility: `turn_order`, not `eliminated_fids`; optional `transferTxHashes` in `additionalData` |
| remix-betr settle | same | Eligibility: submitters (scores ∩ registrations); `remix_betr_settlements` |
| **settle-contract (prize-based)** | **No** | Own viem BETR transfer loop, balance check, `getBulkWalletAddresses`, inline `selectWalletAddress`-style logic, LPS handling, `createSettlementResponse` not used |
| **settle-contract (paid)** | **No** | ethers + `contract.settleGame`; no BETR transfer, no `settlement-core` |

**Gap:** settle-contract prize-based reimplements: balance check, ERC20 transfer loop, wallet filtering/selection. Refactoring to use `transferBETRToWinners` (or a variant that accepts pre-resolved `ResolvedWinner[]` and optional extra `{ address, amount }[]` for LPS) would reduce duplication and keep behavior in sync (e.g. balance check, tx-hash-count assert).

---

## 9. Efficiency

### 9.1 Neynar

- **Library users:** One `fetchBulkWalletAddressesForWinners(winnerFids)` for all winners. Good.
- **settle-contract prize-based:** One `getBulkWalletAddresses([...winnerFids, ...(LPS ? [lastPersonStandingFid] : [])])`; reused for winners and LPS. Good.
- **settle-contract paid (winnerFids):** For paid games, addresses come from `verifyPaymentOnChain` (on-chain), not Neynar; Neynar batch is only for prize-based. No waste.

### 9.2 Transfers

- **BETR:** One `transfer` per winner and one per LPS. No batching at the ERC20 level. Batching would require a different contract or multicall; out of scope for this plan.
- **Paid:** One `settleGame(recipients, amounts)`; contract does the distribution. Efficient.

---

## 10. Gaps and Suggested Changes (Summary)

1. **Naming**
   - Unify **`txHashes`** vs **`transferTxHashes`** and always expose an array of hashes (for paid: `[settleTxHash]`).
   - Align **`winners`** / **`payouts`** to a common shape where possible.

2. **DB**
   - Prefer a single **`settle_tx_hash`** (primary) on games; if you need full set, add **`settle_tx_hashes`** and avoid comma-separated in a string.
   - Clarify **`payouts`** vs **`burrfriends_participants.payout_*`** and when each is written.

3. **settle-contract prize-based and `settlement-core`**
   - Reuse **`selectWalletAddress`** (or shared equivalent) in settle-contract instead of inlined filtering.
   - Consider reusing **`transferBETRToWinners`** (or a `ResolvedWinner[]` + optional LPS extension) so balance check and transfer loop stay in one place. LPS can be appended as extra “winners” or handled by a thin wrapper.

4. **Response shape**
   - Have settle-contract prize-based return a shape compatible with **`createSettlementResponse`** (or a shared superset), including `txHashes` and a `winners`-like list.
   - For paid, add **`txHashes: [settleTxHash]`** for consistency.

5. **Safety**
   - In settle-contract prize-based: add an explicit **`transferTxHashes.length === expectedCount`** check before any DB update.

6. **Docs and types**
   - Centralize the **terminology** (settle, settlement tx, transfer tx, payout, master wallet, prize-based, paid/contract) in a short internal doc or OpenAPI description.
   - TypeScript: shared types for **`SettleResponse`** (and variants for prize vs contract) so routes and clients use the same contracts.

---

## 11. Clarifying Questions for You

1. **Scope of “payment” in future work**  
   Should we also refactor **entry** flows (`/api/payments/prepare`, `confirm`, `recover`) in a later pass for naming and structure, or do you want to limit shared language and refactors to **settle/payout** only?

2. **`payouts` table vs `burrfriends_participants.payout_*`**  
   Is `payouts` still required for reports or other product flows? If yes, should settle-contract (or a shared “post-settle” step) also write to `payouts` when it updates `burrfriends_participants`, so there is one source of truth for “who got paid and how much”?

3. **Poker app**  
   `poker/src/app/api/games/[id]/settle-contract/route.ts` exists separately from `burrfriends/.../settle-contract`. Should the plan’s recommendations (and any refactors) apply to **both** burrfriends and poker, or is poker deprecated / out of scope?

---

## 12. Implementation Order (If You Proceed)

Suggested order so each step stays E2E-consistent:

1. **Terminology and types**  
   - Add `PAYMENTS_SETTLE_TERMINOLOGY.md` (or a section in an existing doc) and shared TS types for settle responses.

2. **`settle_tx_hash` and optional `settle_tx_hashes`**  
   - Normalize DB: one primary hash; add array column if needed; change buddy-up from `join(",")` to that.

3. **`selectWalletAddress` reuse**  
   - In settle-contract prize-based, replace inline filtering with `selectWalletAddress` from settlement-core (or a shared module).

4. **Response shape**  
   - Standardize on `txHashes` (or `transferTxHashes`) and a common `winners`/`payouts` shape; extend `createSettlementResponse` or add a factory for settle-contract prize-based and paid.

5. **Refactor settle-contract prize-based to use `transferBETRToWinners` (or extended variant)**  
   - Build `ResolvedWinner[]` from `addressMap` + `selectWalletAddress`; optionally append LPS as an extra “winner”; call `transferBETRToWinners`; add tx-count assert; then DB and response. Reduces duplication and keeps balance check and transfer logic in one place.

6. **`payouts` vs `burrfriends_participants`**  
   - After you answer Q2, either document only or add a single write path (e.g. from settle-contract) into `payouts` when appropriate.

7. **Poker `settle-contract`**  
   - If in scope, apply the same patterns (wallet selection, response shape, DB) so both apps behave consistently.

---

*End of plan. No code has been changed.*
