# Settlement notification plan (verified end-to-end)

**Scope:** Update all game types that send winner settlement notifications so that:
1. **Body** ends with: "Click here to view the payment details."
2. **Tap** opens the **game/round page** where the **payment transaction (Basescan)** is visible (when that page exists and shows it).

Verified against the codebase and BURRFRIENDS_GAME_SETUP_PHASED_PLAN_REVISED.md Phase 21.4. No guessing; every route and target URL confirmed.

---

## 1. Summary: what to change

| Game type      | Route (file) | Current body (end) | New body (end) | Current targetUrl | New targetUrl | Page shows payment? |
|----------------|--------------|--------------------|----------------|-------------------|---------------|----------------------|
| Poker          | settle-contract | "Click to view details." | "Click here to view the payment details." | /results?gameId=...&type=poker | **/games/{gameId}** | Yes (View on Basescan) |
| BETR GUESSER   | betr-guesser/.../settle | "Click to view details." | "Click here to view the payment details." | /results?gameId=...&type=betr_guesser | **/betr-guesser?gameId={gameId}** | Yes (Settlement: View on Basescan) |
| BUDDY UP       | buddy-up/.../settle | "Click to view details." | "Click here to view the payment details." | /results?gameId=...&type=buddy_up | **/buddy-up?gameId={gameId}** | Yes (Settlement: View on Basescan) |
| THE MOLE       | the-mole/.../settle | "Click to view details." | "Click here to view the payment details." | /results?gameId=...&type=the_mole | **/the-mole?gameId={gameId}** | Yes (Settlement: View on Basescan) |
| STEAL NO STEAL | steal-no-steal/.../settle | "Click to view details." | "Click here to view the payment details." | /results?gameId=...&type=steal_no_steal | **/steal-no-steal?gameId={gameId}** | Yes (settle_tx_hash → Basescan link) |
| JENGA          | jenga/.../settle | "Click to view details." | "Click here to view the payment details." | /results?gameId=...&type=jenga | **/jenga?gameId={gameId}** | Yes ("View settlement on Basescan") |
| FRAMEDL BETR   | remix-betr/settle | "Click to view details." | "Click here to view the payment details." | /results?gameId=effectiveRoundLabel&type=framedl_betr | **Unchanged** (keep results) | N/A: remix-betr round view does not show settlement tx |

**FRAMEDL exception:** The FRAMEDL (remix-betr) app is round-based. The round view (`/remix-betr?roundId=xxx`) does **not** currently render "View on Basescan" for a settled round. The payment is visible only on `/results` for that round's card. So we **only update the body** for FRAMEDL and **keep targetUrl** as `/results?gameId=effectiveRoundLabel&type=framedl_betr`. No RemixBetrClient changes in this fix.

---

## 2. Exact code edits (by file)

### 2.1 Poker

**File:** `src/app/api/games/[id]/settle-contract/route.ts`  
**Block:** Phase 21, ~lines 1621–1626.

- **body:**  
  `You won ${formatPrizeAmount(amountNum)} BETR! Click to view details.`  
  →  
  `You won ${formatPrizeAmount(amountNum)} BETR! Click here to view the payment details.`
- **targetUrl:**  
  `${APP_URL}/results?gameId=${gameId}&type=poker`  
  →  
  `${APP_URL}/games/${gameId}`

### 2.2 BETR GUESSER

**File:** `src/app/api/betr-guesser/games/[id]/settle/route.ts`  
**Block:** ~lines 147–155.

- **body:**  
  `You won ${formatPrizeAmount(prizeAmount)} BETR! Click to view details.`  
  →  
  `You won ${formatPrizeAmount(prizeAmount)} BETR! Click here to view the payment details.`
- **targetUrl:**  
  `${APP_URL}/results?gameId=${gameId}&type=betr_guesser`  
  →  
  `${APP_URL}/betr-guesser?gameId=${gameId}`

### 2.3 BUDDY UP

**File:** `src/app/api/buddy-up/games/[id]/settle/route.ts`  
**Block:** ~lines 179–186.

- **body:**  
  `You won ${formatPrizeAmount(r.amount)} BETR! Click to view details.`  
  →  
  `You won ${formatPrizeAmount(r.amount)} BETR! Click here to view the payment details.`
- **targetUrl:**  
  `${APP_URL}/results?gameId=${gameId}&type=buddy_up`  
  →  
  `${APP_URL}/buddy-up?gameId=${gameId}`

### 2.4 THE MOLE

**File:** `src/app/api/the-mole/games/[id]/settle/route.ts`  
**Block:** ~lines 206–213.

- **body:**  
  `You won ${formatPrizeAmount(r.amount)} BETR! Click to view details.`  
  →  
  `You won ${formatPrizeAmount(r.amount)} BETR! Click here to view the payment details.`
- **targetUrl:**  
  `${APP_URL}/results?gameId=${gameId}&type=the_mole`  
  →  
  `${APP_URL}/the-mole?gameId=${gameId}`

### 2.5 STEAL NO STEAL

**File:** `src/app/api/steal-no-steal/games/[id]/settle/route.ts`  
**Block:** ~lines 150–157.

- **body:**  
  `You won ${formatPrizeAmount(r.amount)} BETR! Click to view details.`  
  →  
  `You won ${formatPrizeAmount(r.amount)} BETR! Click here to view the payment details.`
- **targetUrl:**  
  `${APP_URL}/results?gameId=${gameId}&type=steal_no_steal`  
  →  
  `${APP_URL}/steal-no-steal?gameId=${gameId}`

### 2.6 JENGA

**File:** `src/app/api/jenga/games/[id]/settle/route.ts`  
**Block:** ~lines 225–232.

- **body:**  
  `You won ${formatPrizeAmount(prizeAmount)} BETR! Click to view details.`  
  →  
  `You won ${formatPrizeAmount(prizeAmount)} BETR! Click here to view the payment details.`
- **targetUrl:**  
  `${APP_URL}/results?gameId=${gameId}&type=jenga`  
  →  
  `${APP_URL}/jenga?gameId=${gameId}`

### 2.7 FRAMEDL BETR

**File:** `src/app/api/remix-betr/settle/route.ts`  
**Block:** ~lines 190–196.

- **body only:**  
  `You won ${formatPrizeAmount(r.amount)} BETR! Click to view details.`  
  →  
  `You won ${formatPrizeAmount(r.amount)} BETR! Click here to view the payment details.`
- **targetUrl:** leave as  
  `${APP_URL}/results?gameId=${effectiveRoundLabel}&type=framedl_betr`

---

## 3. Doc update (BURRFRIENDS_GAME_SETUP_PHASED_PLAN_REVISED.md)

**Section:** Phase 21.4 Settlement Notifications (Notification Format), ~lines 3827–3831.

**Current:**

- Body: `"You won {amount} BETR! Click to view details."`
- Target URL: `APP_URL/results?gameId={id}&type={gameType}`

**Replace with:**

- **Body:** `"You won {amount} BETR! Click here to view the payment details."` (all game types).
- **Target URL (by game type):**
  - **Poker:** `APP_URL/games/{id}` — opens game detail page; settlement/payment (Basescan) is shown there.
  - **BETR GUESSER:** `APP_URL/betr-guesser?gameId={id}` — opens game page; "Settlement: View on Basescan" shown when settled.
  - **BUDDY UP:** `APP_URL/buddy-up?gameId={id}` — same.
  - **THE MOLE:** `APP_URL/the-mole?gameId={id}` — same.
  - **STEAL NO STEAL:** `APP_URL/steal-no-steal?gameId={id}` — same.
  - **JENGA:** `APP_URL/jenga?gameId={id}` — same; "View settlement on Basescan" when settled.
  - **FRAMEDL BETR:** `APP_URL/results?gameId={roundLabel}&type=framedl_betr` — round view does not show settlement tx; Results page shows the payment for that round.

**Optional:** Add a short Change Log entry (e.g. settlement notification body and target URLs updated per game type; Phase 21.4 updated).

---

## 4. Verification (no guessing)

- **Poker:** `src/app/games/[id]/page.tsx` — lines 1211–1222 show "Settlement: View on Basescan" when `game.status === 'settled' || 'completed'` and `settle_tx_hash` or `settle_tx_url` present. Deep link `/games/{id}` is used from clubs games list.
- **BETR GUESSER:** `BetrGuesserClient.tsx` — lines 450–452 show "Settlement: View on Basescan" when `settle_tx_hash` or `settle_tx_url`. Uses `?gameId=` for deep link.
- **BUDDY UP:** `BuddyUpV2Client.tsx` — lines 1515–1517 show "Settlement: View on Basescan" when `game.status === 'settled'`. Uses `?gameId=`.
- **THE MOLE:** `TheMoleClient.tsx` — lines 1484–1486 same. Uses `?gameId=`.
- **STEAL NO STEAL:** `StealNoStealClient.tsx` — lines 1077–1081 show Basescan link when `game.settle_tx_hash`. Uses `?gameId=`.
- **JENGA:** `src/app/jenga/page.tsx` — lines 799–800 "View settlement on Basescan" when `game.settle_tx_hash`. Uses `?gameId=`.
- **FRAMEDL:** `RemixBetrClient.tsx` — no "View on Basescan" or settlement tx for a round; Results page shows FRAMEDL cards with tx. So targetUrl stays Results.

All body strings remain under the 128-character Farcaster limit. No other code or routes need changes for this scope.

---

## 5. End-to-end confidence

- Same notification idempotency and `after()` pattern; only payload (body and for 6 types targetUrl) changes.
- Each target URL was confirmed against the app routes and the exact place where "View on Basescan" or settlement tx is rendered.
- FRAMEDL is the only type that does not have a game/round page showing the payment; keeping its targetUrl to Results is intentional and documented.

No open questions for this scope. Optional follow-up: add "Settlement: View on Basescan" to RemixBetrClient for a round when `?roundId=` and round is settled, then switch FRAMEDL targetUrl to `/remix-betr?roundId={roundId}`.
