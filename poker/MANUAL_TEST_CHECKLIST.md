# Manual Test Checklist - Join + Pay Flow

## Pre-Test Setup

### Environment Verification
- [ ] Verify you're on the correct environment (production/preview URL)
- [ ] Verify your FID is not blocked (check `/api/admin/blocks` if admin)
- [ ] Verify your wallet is connected in Warpcast
- [ ] Have browser DevTools open (Network tab + Console)
- [ ] Have Vercel logs open (filtered to your environment)

### Test Data Preparation
- [ ] Create a test game with entry fee (e.g., 0.01 USDC)
- [ ] Note the `gameId` (UUID)
- [ ] Verify game `onchain_status` is `'active'` in database
- [ ] Note your FID for participant checks

---

## Test Flow: Join + Pay

### Step 1: Navigate to Game Detail Page

**Action**: Navigate to `/games/<gameId>`

**Expected Browser Network**:
```
GET /api/games/<gameId>
Status: 200 OK
Response JSON:
{
  "ok": true,
  "data": {
    "id": "<gameId>",
    "name": "...",
    "entry_fee_amount": 0.01,
    "entry_fee_currency": "USDC",
    "onchain_status": "active",
    "onchain_game_id": "...",
    ...
  }
}
```

```
GET /api/games/<gameId>/participants
Status: 200 OK
Response JSON:
{
  "ok": true,
  "data": []  // Empty array if not joined yet
}
```

**Expected Vercel Logs**:
```
[INFO] [games][GET] Fetching game <gameId>
[INFO] [games][participants] Fetching participants for game <gameId>, user FID: <fid>
[API PARTICIPANTS] Game <gameId> returned 0 participants: []
```

**UI Should Show**:
- Game name, entry fee (0.01 USDC)
- "Pay 0.01 USDC & Join" button
- No "✓ You've joined" badge

---

### Step 2: Click "Pay & Join" Button

**Action**: Click the "Pay 0.01 USDC & Join" button

**Expected Browser Network**:
```
POST /api/payments/prepare
Status: 200 OK
Response JSON:
{
  "ok": true,
  "data": {
    "approveTx": { "to": "<USDC_ADDRESS>", "data": "0x..." },
    "joinTx": { "to": "<GAME_ESCROW_CONTRACT>", "data": "0x..." },
    "gameId": "<gameId>",
    "amount": "10000",  // in token units (6 decimals for USDC)
    "currency": "USDC"
  }
}
```

**Expected Vercel Logs**:
```
[INFO] [payments][prepare] Payment preparation started
correlationId: <correlation-id-1>
gameId: <gameId>
fid: <fid>
amount: 0.01
currency: USDC
```

**UI Should Show**:
- Warpcast wallet popup requesting approval
- Two transactions: USDC approval, then joinGame

---

### Step 3: Approve USDC Transaction

**Action**: Approve USDC spending in wallet popup

**Expected Browser Network**:
```
(No API calls - wallet handles approval)
```

**Expected Vercel Logs**:
```
(None - approval is on-chain only)
```

**UI Should Show**:
- Wallet popup closes after approval
- Second popup appears for joinGame transaction

---

### Step 4: Confirm joinGame Transaction

**Action**: Confirm the joinGame transaction in wallet popup

**Expected Browser Network**:
```
POST /api/payments/confirm
Status: 200 OK
Response JSON:
{
  "ok": true,
  "data": {
    "participant": {
      "id": "<participant-id>",
      "game_id": "<gameId>",
      "fid": <fid>,
      "status": "joined",
      "tx_hash": "<tx-hash>",
      "paid_at": "<timestamp>"
    },
    "game_password": "<password>" or null,
    "clubgg_link": "<url>"
  }
}
```

**Expected Vercel Logs**:
```
[INFO] [payments][confirm] Payment confirmation started
correlationId: <correlation-id-2>
fid: <fid>

[INFO] [payments][confirm] Transaction already confirmed (idempotent)
OR
[INFO] [payments][confirm] Payment confirmed successfully
correlationId: <correlation-id-2>
gameId: <gameId>
onchainGameId: <onchain-game-id>
fid: <fid>
txHash: <tx-hash>
participantId: <participant-id>
addressInAllowlist: true
allowedAddressesCount: <number>
dbUpsertOccurred: true
```

**UI Should Show**:
- Wallet popup closes
- UI updates to show "✓ You've joined" or "✓ Paid" badge
- ClubGG link and password (if available) displayed
- "Players Paid/Signed Up" count increments

---

### Step 5: Verify Participant Status

**Action**: Wait 1-2 seconds, then check participants endpoint (should auto-refresh)

**Expected Browser Network**:
```
GET /api/games/<gameId>/participants
Status: 200 OK
Response JSON:
{
  "ok": true,
  "data": [
    {
      "id": "<participant-id>",
      "game_id": "<gameId>",
      "fid": <fid>,
      "status": "joined",
      "tx_hash": "<tx-hash>",
      "paid_at": "<timestamp>"
    }
  ]
}
```

**Expected Vercel Logs**:
```
[INFO] [games][participants] Fetching participants for game <gameId>, user FID: <fid>
[API PARTICIPANTS] Game <gameId> returned 1 participants: [{"status": "joined", ...}]
```

**UI Should Show**:
- "Players Paid/Signed Up: 1/10" (or appropriate count)

---

### Step 6: Navigate to Home Page (Verify Badge)

**Action**: Navigate to `/clubs/hellfire/games`

**Expected Browser Network**:
```
GET /api/games?club_id=<clubId>
Status: 200 OK
Response JSON:
{
  "ok": true,
  "data": [
    {
      "id": "<gameId>",
      "name": "...",
      "entry_fee_amount": 0.01,
      "viewer_has_joined": true,  // <-- KEY FIELD
      "participant_count": 1,
      ...
    },
    ...
  ]
}
```

**Expected Vercel Logs**:
```
[INFO] [games][GET] Fetching games
correlationId: <correlation-id-3>
fid: <fid>
```

**UI Should Show**:
- Game card shows "✓ You've joined" badge
- Participant count is correct

---

### Step 7: Refresh Page (Verify Persistence)

**Action**: Refresh the browser page (F5 or Cmd+R)

**Expected Browser Network**:
```
GET /api/games/<gameId>
Status: 200 OK
(same as Step 1, but now with participant)
```

```
GET /api/games/<gameId>/participants
Status: 200 OK
Response JSON:
{
  "ok": true,
  "data": [
    {
      "status": "joined",
      "tx_hash": "<tx-hash>",
      ...
    }
  ]
}
```

**Expected Vercel Logs**:
```
[INFO] [games][participants] Fetching participants for game <gameId>, user FID: <fid>
[API PARTICIPANTS] Game <gameId> returned 1 participants: [{"status": "joined", ...}]
```

**UI Should Show**:
- Status persists after refresh
- Still shows "✓ You've joined" badge
- Password/link still visible

---

## Failure Decision Tree

If any step fails, use the `correlationId` from the failing request to trace logs in Vercel.

### Step 2 Fails: `/api/payments/prepare` returns error

**Check Vercel logs for correlationId**:

1. **403 Forbidden**:
   ```
   [WARN] [payments][prepare] User is blocked
   ```
   - **Diagnosis**: User is blocked (check `/api/admin/blocks`)
   - **Fix**: Unblock user in admin panel

2. **400 Bad Request - "Game not active"**:
   ```
   [WARN] [payments][prepare] Game not active on-chain
   ```
   - **Diagnosis**: Game `onchain_status !== 'active'` or contract doesn't have game
   - **Fix**: Use admin route to mark game active or check contract

3. **400 Bad Request - "Game does not require payment"**:
   ```
   [WARN] [payments][prepare] Game does not require payment
   ```
   - **Diagnosis**: `buy_in_amount` is 0 or null
   - **Fix**: Check game data in database

---

### Step 4 Fails: `/api/payments/confirm` returns error

**Check Vercel logs for correlationId**:

#### (a) Allowlist Mismatch

**Log Pattern**:
```
[WARN] [payments][confirm] Allowlist check failed - 403
correlationId: <correlation-id>
payerAddress: <actual-address>
allowedAddressesCount: <number>
```

**Browser Response**:
```
Status: 403 Forbidden
{
  "ok": false,
  "error": "Payment sent from wallet not linked to this Farcaster account"
}
```

**Diagnosis**: 
- Transaction was sent from an address not in the user's allowed addresses (custody + verified addresses from Neynar)
- `payerAddress` doesn't match any address in `allowedAddresses`

**Fix**:
- Verify the user's wallet in Neynar matches the transaction sender
- Check if user is using a different wallet than their verified one
- Verify `getAllPlayerWalletAddresses(fid)` returns the correct addresses

---

#### (b) Wrong Env/Contract

**Log Pattern**:
```
[ERROR] [payments][confirm] Transaction verification failed
correlationId: <correlation-id>
error: "Transaction not found" OR "Escrow contract not configured"
```

**Browser Response**:
```
Status: 400 Bad Request
{
  "ok": false,
  "error": "Transaction verification failed..."
}
```

**Diagnosis**:
- Transaction hash doesn't exist on the network (wrong chain/RPC)
- `GAME_ESCROW_CONTRACT` env var not set or wrong address
- `BASE_RPC_URL` pointing to wrong network

**Fix**:
- Verify transaction exists on Base mainnet: `https://basescan.org/tx/<tx-hash>`
- Check `GAME_ESCROW_CONTRACT` env var matches deployed contract
- Verify `BASE_RPC_URL` is correct (Base mainnet RPC)

---

#### (c) DB Upsert Not Happening

**Log Pattern**:
```
[INFO] [payments][confirm] Payment confirmed successfully
correlationId: <correlation-id>
dbUpsertOccurred: true  // <-- Check this
participantId: <participant-id>
```

**But then**:
```
GET /api/games/<gameId>/participants returns empty array
```

**Diagnosis**:
- Upsert succeeded but participant not found in subsequent queries
- Possible: wrong `game_id` or `fid` in query filters
- Possible: Database replication lag

**Fix**:
- Check database directly: `SELECT * FROM poker.participants WHERE game_id = '<gameId>' AND fid = <fid>`
- Verify participant record exists with correct `game_id` and `fid`
- Check if query filters are correct (should filter by both `game_id` and `fid`)

---

#### (d) Caching/Stale Fetch

**Log Pattern**:
```
[INFO] [payments][confirm] Payment confirmed successfully
correlationId: <correlation-id>
participantId: <participant-id>

BUT

GET /api/games/<gameId>/participants
Cache-Control: (missing or not no-store)
```

**Browser Network**:
```
GET /api/games/<gameId>/participants
Status: 200
Response: { "data": [] }  // Empty despite confirmation
```

**Diagnosis**:
- Response is cached (missing `Cache-Control: no-store`)
- Frontend fetch is cached (missing `cache: 'no-store'`)
- Browser cache serving stale data

**Fix**:
- Verify API route has `export const dynamic = 'force-dynamic'`
- Verify response headers include `Cache-Control: no-store, must-revalidate`
- Check frontend fetch calls use `cache: 'no-store'`
- Hard refresh browser (Ctrl+Shift+R)

---

#### (e) Wrong Game Binding

**Log Pattern**:
```
[ERROR] [payments][confirm] Game ID binding check failed - transaction is for different game
correlationId: <correlation-id>
expectedGameId: <expected>
actualGameId: <actual>  // <-- Different!
txHash: <tx-hash>
```

**Browser Response**:
```
Status: 400 Bad Request
{
  "ok": false,
  "error": "This transaction is for a different game..."
}
```

**Diagnosis**:
- Transaction's decoded `gameId` parameter doesn't match expected `onchain_game_id`
- User paid for game A but trying to confirm for game B
- Transaction was for a different game

**Fix**:
- Verify transaction on BaseScan: decode `joinGame` call, check first parameter (gameId)
- Confirm the transaction was actually for this game
- Check if `onchain_game_id` in database matches transaction's gameId

---

## Log Collection Template

Copy this template and fill it in during testing:

```
=== TEST RUN: <DATE/TIME> ===
Environment: <production/preview URL>
Test Game ID: <gameId>
Your FID: <fid>
Your Wallet Address: <from Neynar>

--- Step 1: Navigate to Game ---
Correlation ID: <from logs>
Status: <200/error>
Logs: <paste relevant log lines>

--- Step 2: Click Pay & Join ---
Correlation ID: <from logs>
Status: <200/error>
Logs: <paste relevant log lines>

--- Step 3: Approve USDC ---
Transaction Hash: <if available>
Status: <success/error>

--- Step 4: Confirm Transaction ---
Correlation ID: <from logs>
Transaction Hash: <tx-hash>
Status: <200/error>
Response: <paste JSON response>
Logs: <paste relevant log lines>

--- Step 5: Verify Status ---
Correlation ID: <from logs>
Status: <200/error>
Response: <paste JSON response>
Logs: <paste relevant log lines>

--- Step 6: Home Page ---
Correlation ID: <from logs>
Status: <200/error>
viewer_has_joined: <true/false>
Logs: <paste relevant log lines>

--- Step 7: Refresh ---
Correlation ID: <from logs>
Status: <200/error>
Logs: <paste relevant log lines>

=== ISSUES ENCOUNTERED ===
<Document any failures here with correlation IDs>
```

---

## Quick Reference: Correlation ID Search

In Vercel logs, search for:
```
correlationId:<your-correlation-id>
```

This will show all log entries for that request, making it easy to trace the full flow.

---

## Success Criteria

✅ All 7 steps complete without errors  
✅ Participant record appears in database  
✅ UI shows "joined" status after payment  
✅ Status persists after page refresh  
✅ Home page shows "✓ You've joined" badge  
✅ Password/link displayed (if game has password)

