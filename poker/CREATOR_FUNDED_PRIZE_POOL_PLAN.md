# Creator-Funded Prize Pool – Implementation Plan

## Goal

- **Whoever creates the game must put up the funds (tokens/NFTs) for that game.**
- **No one is allowed to take a cut.** Entry fees (if any) must go 100% to the prize pool.
- **Logic:** Creator prefunds the pool; optionally others (e.g. players) add via entry fee; 100% of the pool goes to winners.

No code is being edited yet; this is the plan and verification steps only.

---

## 1. Current State (What Exists Today)

### Poker (entry-fee games)

- **GameEscrow contract:** `createGame(gameId, currency, entryFee)` – backend (master wallet) creates game; `totalCollected = 0`.
- **Players:** `joinGame(gameId)` – they send USDC (or ETH) to the contract; `totalCollected` increases.
- **Settlement:** Backend calls `settleGame(gameId, recipients, amounts)`; contract sends from `totalCollected` to winners. Contract enforces `sum(amounts) <= totalCollected`.
- **Creator:** Does **not** fund. Only players fund via entry fee.
- **Cut:** Contract can send 100% to winners (no platform cut); app uses `payout_bps` (e.g. sum 10000 = 100%).

### Wheel / prize games (giveaway_wheel)

- **PrizeDistribution contract:** No per-game pool. It does `transferFrom(MASTER_WALLET, winner, amount)` and similar for NFTs. Prizes must already sit in **one global** MASTER_WALLET.
- **Game creation:** Backend stores `prize_configuration` in DB (`game_prizes`). No on-chain funding step.
- **Settlement:** Backend uses master wallet key to call `distributeTokens` / `distributeNFTs`; contract pulls from MASTER_WALLET.
- **Creator:** Does **not** fund on-chain at creation; expectation today is that someone sent tokens/NFTs to master wallet elsewhere.

### DB

- `poker.games`: has `creator_fid`, `status`, `game_type`, `prize_type`, etc.
- `poker.game_prizes`: prize configuration per game (tokens/NFTs per position).
- No “funding status” or “pool balance” stored in DB for prize games; no link between creator wallet and game funding.

---

## 2. Target Behavior (What We Want)

1. **Prize / wheel games**
   - At game creation (or before the game is “open”), the **creator must fund the game on-chain**: send the tokens and/or NFTs that match the prize configuration into a **per-game pool**.
   - Only after that pool is funded (and optionally verified by the app) does the game become open.
   - Settlement sends prizes from **that game’s pool** to the winner(s), not from a global master wallet.
   - No platform cut: 100% of the pool goes to winners.

2. **Poker (entry-fee) games**
   - Creator can **prefund** the pot (e.g. add 100 USDC to the game pool).
   - Players then **join** and pay entry fee as today; their fees go into the **same** pool.
   - **All** of that pool (creator + players) goes to winners; no fee or cut. Already possible if `payout_bps` sums to 10000; we keep and enforce that.

3. **Unified rules**
   - Creator must put up the initial funds (or full prize pool) for prize games.
   - Entry fees (if any) go 100% to the prize pool.
   - No signup fee or cut for the platform; no “house cut” from the pool.

---

## 3. Contract Layer

### 3.1 Prize / wheel games: per-game pool (new or extended contract)

We need a contract that holds **per-game** tokens and NFTs and releases them only at settlement.

**Option A – New contract `GamePrizePool` (recommended for clarity)**

- **fundGame(gameId, tokenContract, amount)**  
  - `transferFrom(msg.sender, this, amount)` for the given token; credit `amount` to `gameId` for that token.
- **fundGameNFT(gameId, nftContract, tokenId)**  
  - `transferFrom(msg.sender, this, tokenId)`; record that this NFT is part of `gameId`’s pool.
- **getGameTokenBalance(gameId, tokenContract)**  
  - View: balance of token for that game.
- **getGameNFTs(gameId)**  
  - View: list of (nftContract, tokenId) for that game.
- **releasePrizes(gameId, tokenRecipients, tokenAmounts, nftContracts, nftTokenIds, nftRecipients)**  
  - **Only callable by owner (backend).** Transfer from this contract’s per-game pool to the given recipients. Mark game as settled so it cannot be released again.
- **ReentrancyGuard** and safe ERC20/ERC721 handling (e.g. SafeERC20, safeTransferFrom for NFTs).

**Option B – Extend existing PrizeDistribution**

- Add the same per-game accounting and `fundGame` / `fundGameNFT` / `releasePrizes` (release from pool instead of from MASTER_WALLET for that game).
- Keep existing MASTER_WALLET-based functions for backward compatibility if desired, or phase them out once all games use the pool model.

**Recommendation:** New `GamePrizePool` contract so prize/wheel flow is clearly “fund game → release from pool” with no dependency on a single global wallet. Deployment and env var (e.g. `GAME_PRIZE_POOL_CONTRACT`) can be added alongside existing PrizeDistribution.

### 3.2 Poker: creator (and optionally others) adding to the same pot

**GameEscrow today:** `totalCollected` only increases when players call `joinGame(gameId)` and pay the fixed entry fee.

**Change:** Add a way to add funds to the same game’s pool **without** joining as a player:

- **addToPool(gameId, amount)**  
  - Same currency as the game (USDC or ETH).  
  - `transferFrom(msg.sender, this, amount)` (or `msg.value` for ETH).  
  - `game.totalCollected += amount`.  
  - No participant record; this is “prize pool top-up”.

Then:

- Creator can call `addToPool(gameId, amount)` after the game is created (backend already called `createGame`).
- Players call `joinGame(gameId)` as today; their entry fees add to `totalCollected`.
- Settlement stays the same: `settleGame(gameId, recipients, amounts)` with `sum(amounts) <= totalCollected`, and we enforce in the app that `payout_bps` sums to 10000 so 100% goes to players.

**Who can call addToPool?**  
- Allow any address (creator or others) so “creator prefunds, then others do it” is possible without extra access control. If later we want “only creator”, we can add a mapping `gameId -> creator` set at `createGame` and a modifier.

---

## 4. Database and API (Backend) Changes

### 4.1 Game status for prize/wheel: “pending funding”

- **New status (or equivalent):** e.g. `pending_funding` for games that have prize_configuration but are not yet open.
- When creator creates a prize/wheel game, backend creates the game row and `game_prizes` rows with status `pending_funding` (or keep `open` but add a separate “funding_verified” flag; below we use status for clarity).
- Game is **not** listed as joinable / spinable until funding is confirmed.

### 4.2 “Confirm funding” for prize/wheel games

- **New endpoint:** e.g. `POST /api/games/[id]/confirm-funding`
  - Allowed: game creator (match `creator_fid` to auth FID) or club owner / global admin.
  - Reads from chain: `getGameTokenBalance(gameId, token)` and `getGameNFTs(gameId)` (or equivalent view from the new contract).
  - Compares to `game_prizes` for this game:
    - For each token in prize_configuration, required amount ≤ contract balance for that game.
    - For each NFT in prize_configuration, that (contract, tokenId) is in the game’s NFT list.
  - If all satisfied: set game `status = 'open'` (and optionally set `funding_verified_at = now()`).
  - If not: return 400 with a clear message (e.g. “Insufficient token balance for game” or “Missing NFT …”).

This gives a **verifiable** path: creator funds on-chain → backend only opens the game when the pool matches the declared prizes.

### 4.3 Game creation flow (prize/wheel)

1. Creator submits create-game (title, prize_configuration, game_type giveaway_wheel, etc.).
2. Backend creates game row with `status = 'pending_funding'`, stores `prize_configuration` in `game_prizes`. Returns `gameId`.
3. Frontend shows “Fund this game” with:
   - Required token amounts and NFT (contract, tokenId) from prize_configuration.
   - Buttons/actions that build and submit:
     - `fundGame(gameId, tokenContract, amount)` for each token line.
     - `fundGameNFT(gameId, nftContract, tokenId)` for each NFT.
4. Creator (and only they need to, unless we allow “anyone can add”) signs these txs from their wallet.
5. After funding, creator (or admin) calls “Confirm funding” in the app; frontend calls `POST /api/games/[id]/confirm-funding`. Backend checks on-chain pool vs `game_prizes`, then sets `status = 'open'`.
6. Game is now open: wheel can be spun, etc. Settlement will call the new contract’s `releasePrizes(gameId, ...)` instead of sending from MASTER_WALLET.

### 4.4 Poker: creator prefund (optional but aligned with “creator funds”)

- After backend creates the game and calls `createGame(gameId, currency, entryFee)` on GameEscrow, frontend can show “Add to prize pool (optional)”.
- Creator signs `addToPool(gameId, amount)` (and approves USDC if needed). No backend “confirm” needed; contract state is the source of truth.
- Players join as today; settlement already uses `totalCollected`. We only need to enforce in validation that `payout_bps` sums to 10000 (no platform cut).

### 4.5 No platform cut (validation)

- In any flow that sets or uses `payout_bps`, validate `sum(payout_bps) === 10000`.
- Reject requests where a “platform” or “house” share is reserved (e.g. reject if any segment is explicitly for a non-player address or if we add a “platform_bps” field, keep it 0). Document in code and in product that 100% of the pool goes to players/winners.

---

## 5. Settlement Changes

### 5.1 Wheel / prize games

- **Today:** Backend uses master wallet key and calls PrizeDistribution’s `distributeTokens` / `distributeNFTs`, which pull from MASTER_WALLET.
- **After change:** Backend calls the new contract’s `releasePrizes(gameId, tokenRecipients, tokenAmounts, nftContracts, nftTokenIds, nftRecipients)` so that prizes are sent **from the game’s pool** (the same contract that received `fundGame` / `fundGameNFT`). No use of MASTER_WALLET for this game’s prizes.
- **Who signs releasePrizes:** Only owner (or a dedicated “settler” role). Backend holds the key that is owner (or settler); same pattern as today’s settle.

### 5.2 Poker

- No change to contract settlement: still `settleGame(gameId, recipients, amounts)` from GameEscrow. `totalCollected` already includes creator’s `addToPool` and all `joinGame` payments. We only ensure payout_bps sum to 10000 so 100% goes to winners.

---

## 6. End-to-End Verification (How We Know It Works)

### 6.1 Prize / wheel game (creator-funded only, no entry fee)

1. Creator creates game with e.g. 100 USDC prize for position 1; game stored with `status = 'pending_funding'`, one row in `game_prizes` (position 1, 100 USDC).
2. Creator’s wallet calls `fundGame(gameId, USDC, 100e6)` (and approved USDC to the pool contract). Contract balance for that gameId + USDC is 100e6.
3. Creator (or admin) calls `POST /api/games/[id]/confirm-funding`. Backend reads 100e6 from contract for (gameId, USDC), compares to required 100, sets status to `open`.
4. Players join (no payment); wheel is spun; winner is set.
5. Admin calls settle. Backend calls `releasePrizes(gameId, [winnerAddress], [100e6], [], [], [])`. Contract sends 100 USDC from its own balance (game pool) to winner. Game marked settled on contract.
6. **Check:** Winner has +100 USDC; contract has 0 for that game; no MASTER_WALLET used for this game.

### 6.2 Prize / wheel game with NFT

1. Creator creates game with one NFT prize (contract C, tokenId T); game `pending_funding`, `game_prizes` has one NFT row.
2. Creator calls `fundGameNFT(gameId, C, T)`. NFT is transferred to the pool contract and recorded for gameId.
3. Confirm-funding: backend checks `getGameNFTs(gameId)` contains (C, T); sets status `open`.
4. After spin and winner set, settle calls `releasePrizes(..., [], [], [C], [T], [winnerAddress])`. NFT is sent from contract to winner.
5. **Check:** Winner owns NFT; contract no longer holds it for that game.

### 6.3 Poker with creator prefund

1. Backend creates game and calls `createGame(gameId, USDC, 10e6)` (10 USDC entry). totalCollected = 0.
2. Creator calls `addToPool(gameId, 50e6)`. totalCollected = 50e6.
3. Five players join; each pays 10 USDC. totalCollected = 50 + 50 = 100e6.
4. Settlement: payout_bps e.g. [6000, 3000, 1000] (60%, 30%, 10%). Backend calls `settleGame(gameId, [addr1, addr2, addr3], [60e6, 30e6, 10e6])`. Contract checks 60+30+10 = 100e6 ≤ totalCollected and sends.
5. **Check:** Sum of payouts = 100% of totalCollected; no fee; creator’s 50 and players’ 50 all distributed.

### 6.4 No cut

- In all flows, validate `payout_bps` sum = 10000 (or equivalent) and that we never send any share to a “platform” or “house” address. Automated test: create game, fund, settle, then assert all contract balance for that game is 0 and all declared winners received the correct amounts.

---

## 7. Implementation Order (Suggested)

1. **Contract**
   - Deploy **GamePrizePool** (or extend PrizeDistribution) with `fundGame`, `fundGameNFT`, view functions, and `releasePrizes`. Add **addToPool** to **GameEscrow** for poker.
2. **Backend**
   - Add `POST /api/games/[id]/confirm-funding` (read pool from chain, compare to `game_prizes`, set status to `open`).
   - For prize/wheel games, create with `status = 'pending_funding'` when prize_configuration is present.
   - In settle-contract for wheel/prize games, call the new pool contract’s `releasePrizes` instead of PrizeDistribution from MASTER_WALLET.
   - Enforce `payout_bps` sum = 10000 and no platform cut wherever payouts are set or used.
3. **Frontend**
   - After creating a prize/wheel game, show “Fund this game” (token amounts and NFTs from prize_configuration), with wallet actions for `fundGame` / `fundGameNFT`.
   - “Confirm funding” button that calls `POST /api/games/[id]/confirm-funding`.
   - For poker, optional “Add to prize pool” that calls `addToPool(gameId, amount)` (and approval if needed).
4. **Config / env**
   - New env var for pool contract address (e.g. `GAME_PRIZE_POOL_CONTRACT`); use it in confirm-funding and in settlement for prize games.

---

## 8. Summary

| Area | Current | Target |
|------|--------|--------|
| Prize/wheel funding | Prizes expected in one global MASTER_WALLET; creator does not fund at creation | Per-game pool; creator must fund (tokens/NFTs) before game opens; settlement from pool |
| Poker pool | Only players’ entry fees (totalCollected) | Creator can addToPool; players joinGame; totalCollected = creator + players; 100% to winners |
| Platform cut | None in contract; app can enforce 100% | Explicit validation: payout_bps sum = 10000; no reserved share |
| Verification | N/A | confirm-funding checks on-chain pool vs game_prizes; settlement uses releasePrizes from pool |

This plan is designed so that (1) the creator must put up the funds for the game, (2) entry fees go 100% to the prize pool, and (3) we can verify end-to-end with the steps in Section 6 without editing code until you approve.
