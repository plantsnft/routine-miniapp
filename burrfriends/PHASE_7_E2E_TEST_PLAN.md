# Phase 7: End-to-End Testing Plan

**Goal**: Verify entire flow works correctly with prize-based system.

**Status**: Test plan document for manual and automated testing validation.

---

## 📋 Pre-Test Setup

### Environment Requirements
- [ ] Test environment configured (development/staging)
- [ ] Test Supabase database (NOT production)
- [ ] Master wallet has sufficient BETR balance for prizes
- [ ] Test FIDs available (at least 3-4 different FIDs for multi-player tests)
- [ ] Browser DevTools open (Network tab + Console)
- [ ] Vercel logs accessible (if applicable)

### Test Data Preparation
- [ ] Create test club (if needed)
- [ ] Verify test FIDs are not blocked
- [ ] Verify test wallets are connected in Warpcast
- [ ] Note test FIDs for participant tracking

---

## 7.1: Test Game Creation

### Test 7.1.1: Create Sit and Go Game with Preset
**Steps**:
1. Navigate to game creation page (`/clubs/[slug]/games/new`)
2. Select "Sit and Go" as game setup type
3. Fill in required fields (title, description, etc.)
4. Submit game creation

**Expected Results**:
- [ ] Game created successfully
- [ ] `number_of_winners` automatically set to `1`
- [ ] `prize_amounts` automatically set to `[500000]` (500K BETR)
- [ ] `prize_currency` set to `'BETR'`
- [ ] `buy_in_amount` set to `0` in database
- [ ] `gating_type` set to `'open'` (or `'stake_threshold'` if staking configured)
- [ ] No entry fee fields visible in UI
- [ ] Game appears in games list

**Database Verification**:
```sql
SELECT id, name, number_of_winners, prize_amounts, prize_currency, buy_in_amount, gating_type
FROM poker.burrfriends_games
WHERE id = '<gameId>';
-- Expected: number_of_winners=1, prize_amounts=[500000], buy_in_amount=0
```

---

### Test 7.1.2: Create Scheduled Game with Preset
**Steps**:
1. Navigate to game creation page
2. Select "Scheduled" as game setup type
3. Set scheduled time (future date/time)
4. Fill in required fields
5. Submit game creation

**Expected Results**:
- [ ] Game created successfully
- [ ] `number_of_winners` automatically set to `3`
- [ ] `prize_amounts` automatically set to `[3000000, 2000000, 1000000]` (3M/2M/1M BETR)
- [ ] `prize_currency` set to `'BETR'`
- [ ] `buy_in_amount` set to `0` in database
- [ ] `game_type` set to `'large_event'` (or `max_participants > 9`)
- [ ] No entry fee fields visible in UI

**Database Verification**:
```sql
SELECT id, name, number_of_winners, prize_amounts, prize_currency, buy_in_amount, game_type
FROM poker.burrfriends_games
WHERE id = '<gameId>';
-- Expected: number_of_winners=3, prize_amounts=[3000000,2000000,1000000], buy_in_amount=0
```

---

### Test 7.1.3: Create Custom Prize Game
**Steps**:
1. Navigate to game creation page
2. Select game setup type
3. Manually set `number_of_winners` to custom value (e.g., 5)
4. Manually set `prize_amounts` to custom array (e.g., `[1000000, 500000, 250000, 100000, 50000]`)
5. Submit game creation

**Expected Results**:
- [ ] Game created successfully
- [ ] Custom `number_of_winners` saved correctly
- [ ] Custom `prize_amounts` array saved correctly
- [ ] Array length matches `number_of_winners`
- [ ] `buy_in_amount` set to `0`

**Database Verification**:
```sql
SELECT number_of_winners, prize_amounts
FROM poker.burrfriends_games
WHERE id = '<gameId>';
-- Expected: number_of_winners matches input, prize_amounts matches input array
```

---

### Test 7.1.4: Verify No Entry Fee Fields
**Steps**:
1. Navigate to game creation page
2. Inspect UI form fields

**Expected Results**:
- [ ] No "Entry Fee Amount" input field visible
- [ ] No "Entry Fee Currency" dropdown visible
- [ ] Only prize configuration fields visible (`number_of_winners`, `prize_amounts`)
- [ ] Form validation does not require entry fee fields

---

### Test 7.1.5: Verify Token Gating Still Works
**Steps**:
1. Navigate to game creation page
2. Configure staking requirement (e.g., 50M BETR minimum stake)
3. Submit game creation

**Expected Results**:
- [ ] Game created with `gating_type` set to `'stake_threshold'`
- [ ] `staking_min_amount` saved correctly
- [ ] `staking_token_contract` saved correctly
- [ ] Game shows staking requirement in UI
- [ ] Users without sufficient stake cannot join

**Database Verification**:
```sql
SELECT gating_type, staking_min_amount, staking_token_contract
FROM poker.burrfriends_games
WHERE id = '<gameId>';
-- Expected: gating_type='stake_threshold', staking_min_amount and staking_token_contract set
```

---

## 7.2: Test Game Joining

### Test 7.2.1: Join Game (No Payment Required)
**Steps**:
1. Navigate to game detail page (`/games/<gameId>`)
2. Click "Join Game" button
3. Verify no payment prompt appears
4. Verify participant record created

**Expected Results**:
- [ ] "Join Game" button visible (not "Pay Entry Fee" button)
- [ ] Clicking "Join Game" immediately adds participant
- [ ] No payment transaction required
- [ ] Participant record created with `status: 'joined'`
- [ ] Participant record has `tx_hash: null` and `paid_at: null`
- [ ] Participant count increases
- [ ] Success message displayed

**API Verification**:
```bash
POST /api/games/<gameId>/join
# Expected: 200 OK, participant created
```

**Database Verification**:
```sql
SELECT fid, status, tx_hash, paid_at
FROM poker.burrfriends_participants
WHERE game_id = '<gameId>' AND fid = <testFid>;
-- Expected: status='joined', tx_hash=NULL, paid_at=NULL
```

---

### Test 7.2.2: Join Game with Staking Requirement
**Prerequisites**: Game with `gating_type='stake_threshold'` and `staking_min_amount` set

**Steps**:
1. Create game with staking requirement (e.g., 50M BETR)
2. Attempt to join with FID that has insufficient stake
3. Attempt to join with FID that has sufficient stake

**Expected Results**:
- [ ] FID with insufficient stake: Join fails with appropriate error
- [ ] FID with sufficient stake: Join succeeds
- [ ] Staking check performed via `checkUserStakeByFid`
- [ ] Error message clear and helpful

**API Verification**:
```bash
POST /api/games/<gameId>/join
# With insufficient stake: Expected 403 or 400 with error message
# With sufficient stake: Expected 200 OK
```

---

### Test 7.2.3: Join Sit and Go - Auto-Start When Full
**Steps**:
1. Create Sit and Go game (`max_participants: 9`, `game_date: null`)
2. Have 9 different FIDs join the game
3. Verify game auto-starts when 9th participant joins

**Expected Results**:
- [ ] First 8 participants: Game status remains `'open'`
- [ ] 9th participant joins: Game status changes to `'active'` (or appropriate status)
- [ ] Auto-start logic triggers
- [ ] Notification sent (if configured)
- [ ] Game no longer accepts new participants

**Database Verification**:
```sql
SELECT status, participant_count
FROM poker.burrfriends_games
WHERE id = '<gameId>';
-- After 9th join: status should change from 'open' to 'active'
```

**API Verification**:
```bash
GET /api/games/<gameId>
# After 9th join: status should be 'active' or 'in_progress'
```

---

### Test 7.2.4: Join Scheduled Game - Starts at Scheduled Time
**Steps**:
1. Create Scheduled game with future `game_date`
2. Have multiple participants join
3. Wait for scheduled time (or manually trigger if testing)
4. Verify game starts at scheduled time

**Expected Results**:
- [ ] Participants can join before scheduled time
- [ ] Game status remains `'open'` until scheduled time
- [ ] At scheduled time: Game status changes appropriately
- [ ] Game accepts participants until scheduled time

**Database Verification**:
```sql
SELECT status, game_date
FROM poker.burrfriends_games
WHERE id = '<gameId>';
-- Before scheduled time: status='open'
-- At/after scheduled time: status should change
```

---

## 7.3: Test Settlement

### Test 7.3.1: Settle Sit and Go - 1 Winner Gets 500K BETR
**Prerequisites**: 
- Sit and Go game with 1 winner preset
- Game has participants
- Winners selected

**Steps**:
1. Navigate to game detail page
2. Open settlement modal
3. Select 1 winner
4. Submit settlement

**Expected Results**:
- [ ] Settlement succeeds
- [ ] Winner receives 500K BETR via direct transfer
- [ ] Transfer transaction hash stored in `payout_tx_hash`
- [ ] Participant record updated: `status: 'settled'`, `payout_amount: 500000`
- [ ] Game record updated: `status: 'settled'`, `settle_tx_hash` set
- [ ] Direct transfer visible on blockchain (check transaction hash)

**Database Verification**:
```sql
SELECT status, payout_amount, payout_tx_hash, paid_out_at
FROM poker.burrfriends_participants
WHERE game_id = '<gameId>' AND fid = <winnerFid>;
-- Expected: status='settled', payout_amount=500000, payout_tx_hash set, paid_out_at set

SELECT status, settle_tx_hash
FROM poker.burrfriends_games
WHERE id = '<gameId>';
-- Expected: status='settled', settle_tx_hash set
```

**Blockchain Verification**:
- Check transaction hash on Base explorer
- Verify BETR transfer from master wallet to winner address
- Verify amount is 500K BETR (500000 * 10^18 wei)

---

### Test 7.3.2: Settle Scheduled Game - Top 3 Get 3M/2M/1M BETR
**Prerequisites**: 
- Scheduled game with 3 winners preset
- Game has participants
- 3 winners selected

**Steps**:
1. Navigate to game detail page
2. Open settlement modal
3. Select 3 winners (in order: 1st, 2nd, 3rd)
4. Submit settlement

**Expected Results**:
- [ ] Settlement succeeds
- [ ] 1st place winner receives 3M BETR
- [ ] 2nd place winner receives 2M BETR
- [ ] 3rd place winner receives 1M BETR
- [ ] All transfers executed via direct transfers
- [ ] All participant records updated correctly
- [ ] Game record updated: `status: 'settled'`

**Database Verification**:
```sql
SELECT fid, payout_amount, payout_tx_hash
FROM poker.burrfriends_participants
WHERE game_id = '<gameId>' AND status = 'settled'
ORDER BY payout_amount DESC;
-- Expected: 3 records with payout_amounts: 3000000, 2000000, 1000000
```

**Blockchain Verification**:
- Verify 3 separate transfer transactions
- Verify amounts: 3M, 2M, 1M BETR respectively

---

### Test 7.3.3: Settle with High Staker (50M+ BETR) - Prize Doubled
**Prerequisites**: 
- Scheduled game (not Sit and Go)
- Winner has 50M+ BETR staked
- Staking check configured

**Steps**:
1. Settle game with winner who has 50M+ BETR staked
2. Submit settlement

**Expected Results**:
- [ ] Settlement succeeds
- [ ] Winner's prize amount is doubled (e.g., 3M → 6M BETR)
- [ ] Staking check performed via `checkUserStakeByFid`
- [ ] Direct transfer sends doubled amount
- [ ] Participant record shows doubled `payout_amount`

**Database Verification**:
```sql
SELECT payout_amount
FROM poker.burrfriends_participants
WHERE game_id = '<gameId>' AND fid = <highStakerFid>;
-- Expected: payout_amount = base_prize * 2 (e.g., 6000000 for 3M base prize)
```

**Blockchain Verification**:
- Verify transfer amount is doubled
- Verify staking check was performed (check logs)

---

### Test 7.3.4: Settle with Last Person Standing Award
**Prerequisites**: 
- Scheduled game
- Game has participants
- Winners selected

**Steps**:
1. Navigate to game detail page
2. Open settlement modal
3. Select winners
4. Check "Last Person Standing Award" checkbox
5. Select award recipient (from participant dropdown)
6. Enter award amount (e.g., 1M BETR)
7. Submit settlement

**Expected Results**:
- [ ] Settlement succeeds
- [ ] Award recipient receives award amount via separate transfer
- [ ] Game record updated: `last_person_standing_fid` and `last_person_standing_award_amount` set
- [ ] If award recipient is also a winner: Their `payout_amount` includes both prize + award
- [ ] If award recipient is not a winner: Separate participant record updated with award

**Database Verification**:
```sql
SELECT last_person_standing_fid, last_person_standing_award_amount
FROM poker.burrfriends_games
WHERE id = '<gameId>';
-- Expected: Both fields set

SELECT payout_amount
FROM poker.burrfriends_participants
WHERE game_id = '<gameId>' AND fid = <awardRecipientFid>;
-- Expected: payout_amount includes award (prize + award if winner, or just award if not)
```

**Blockchain Verification**:
- Verify separate transfer for award
- Verify amount matches award amount

---

### Test 7.3.5: Verify Prize Doubling Only Applies to Scheduled Games
**Prerequisites**: 
- Sit and Go game
- Winner has 50M+ BETR staked

**Steps**:
1. Create Sit and Go game
2. Settle with high staker as winner

**Expected Results**:
- [ ] Settlement succeeds
- [ ] Prize is NOT doubled (remains at base amount, e.g., 500K BETR)
- [ ] Staking check may be performed, but doubling logic not applied
- [ ] Participant record shows base prize amount only

**Database Verification**:
```sql
SELECT payout_amount
FROM poker.burrfriends_participants
WHERE game_id = '<gameId>' AND fid = <highStakerFid>;
-- Expected: payout_amount = base_prize (NOT doubled, e.g., 500000)
```

---

### Test 7.3.6: Verify Award Selection Only Available for Scheduled Games
**Steps**:
1. Navigate to Sit and Go game detail page
2. Open settlement modal

**Expected Results**:
- [ ] "Last Person Standing Award" section NOT visible in settlement modal
- [ ] Award checkbox/inputs not available
- [ ] Only winner selection available

**Steps**:
1. Navigate to Scheduled game detail page
2. Open settlement modal

**Expected Results**:
- [ ] "Last Person Standing Award" section IS visible
- [ ] Award checkbox available
- [ ] Award recipient dropdown populated with participants
- [ ] Award amount input available

---

## 7.4: Test Stats

### Test 7.4.1: Play Multiple Games - Stats Calculate Correctly
**Steps**:
1. Play 5 games (join and participate)
2. Win 2 games, lose 3 games
3. Check stats page

**Expected Results**:
- [ ] `games_played` = 5
- [ ] `games_won` = 2
- [ ] `win_rate` = 40% (2/5 * 100)
- [ ] `total_winnings` = sum of all prizes won
- [ ] `net_profit` = `total_winnings` (no entry fees to subtract)

**Database Verification**:
```sql
SELECT games_played, games_won, total_winnings, net_profit
FROM poker.burrfriends_stats
WHERE fid = <testFid>;
-- Expected: games_played=5, games_won=2, net_profit=total_winnings
```

---

### Test 7.4.2: Win Some, Lose Some - games_played Counts All Games
**Steps**:
1. Join 3 games
2. Win 1 game, lose 2 games
3. Check stats

**Expected Results**:
- [ ] `games_played` = 3 (counts all games, not just wins)
- [ ] `games_won` = 1
- [ ] Stats calculation includes all games where user participated

**Database Verification**:
```sql
-- Verify participant records
SELECT COUNT(*) as total_games
FROM poker.burrfriends_participants
WHERE fid = <testFid>;

-- Verify stats match
SELECT games_played, games_won
FROM poker.burrfriends_stats
WHERE fid = <testFid>;
-- Expected: games_played matches total participant count
```

---

### Test 7.4.3: Verify total_winnings Includes Prizes and Awards
**Steps**:
1. Win 2 games with prizes: 500K and 3M BETR
2. Win 1 game with prize + Last Person Standing Award: 2M + 1M = 3M BETR
3. Check stats

**Expected Results**:
- [ ] `total_winnings` = 500K + 3M + 3M = 6.5M BETR
- [ ] Awards included in `total_winnings`
- [ ] All prize amounts included

**Database Verification**:
```sql
SELECT payout_amount
FROM poker.burrfriends_participants
WHERE fid = <testFid> AND status = 'settled';

SELECT total_winnings
FROM poker.burrfriends_stats
WHERE fid = <testFid>;
-- Expected: total_winnings = sum of all payout_amounts
```

---

### Test 7.4.4: Verify net_profit Equals total_winnings (No Entry Fees)
**Steps**:
1. Win games with various prizes
2. Check stats

**Expected Results**:
- [ ] `net_profit` = `total_winnings` (exactly equal)
- [ ] No entry fees subtracted
- [ ] UI shows "(no entry fees)" note next to Net Profit

**Database Verification**:
```sql
SELECT total_winnings, net_profit
FROM poker.burrfriends_stats
WHERE fid = <testFid>;
-- Expected: net_profit = total_winnings
```

**UI Verification**:
- Check PlayerStats component
- Verify "Net Profit" shows with "(no entry fees)" helper text
- Verify no "Total Entry Fees" field displayed
- Verify no ROI calculation displayed

---

## 7.5: Test Edge Cases

### Test 7.5.1: Game with 1 Winner, Custom Prize Amount
**Steps**:
1. Create game with `number_of_winners: 1`
2. Set custom `prize_amounts: [1000000]` (1M BETR)
3. Settle with 1 winner

**Expected Results**:
- [ ] Settlement succeeds
- [ ] Winner receives 1M BETR (custom amount, not preset)
- [ ] Prize amount matches custom configuration

---

### Test 7.5.2: Game with 10 Winners (Max)
**Steps**:
1. Create game with `number_of_winners: 10`
2. Set `prize_amounts` array with 10 amounts
3. Settle with 10 winners

**Expected Results**:
- [ ] Settlement succeeds
- [ ] All 10 winners receive prizes
- [ ] Prize amounts match array (in order)
- [ ] All 10 transfers executed

**Database Verification**:
```sql
SELECT COUNT(*) as winner_count
FROM poker.burrfriends_participants
WHERE game_id = '<gameId>' AND status = 'settled';
-- Expected: winner_count = 10
```

---

### Test 7.5.3: Scheduled Game with No Last Person Standing Award
**Steps**:
1. Create Scheduled game
2. Settle without selecting Last Person Standing Award

**Expected Results**:
- [ ] Settlement succeeds
- [ ] Game record: `last_person_standing_fid = null`, `last_person_standing_award_amount = null`
- [ ] No award transfer executed
- [ ] Only prize transfers executed

---

### Test 7.5.4: Scheduled Game - Award Goes to Winner (Double Payout)
**Steps**:
1. Create Scheduled game
2. Settle with winner selected
3. Select same winner for Last Person Standing Award
4. Set award amount (e.g., 1M BETR)

**Expected Results**:
- [ ] Settlement succeeds
- [ ] Winner receives: prize + award (e.g., 3M + 1M = 4M BETR)
- [ ] Participant record: `payout_amount` = prize + award
- [ ] Two transfers executed (or one combined transfer)

**Database Verification**:
```sql
SELECT payout_amount
FROM poker.burrfriends_participants
WHERE game_id = '<gameId>' AND fid = <winnerFid>;
-- Expected: payout_amount = base_prize + award_amount
```

---

### Test 7.5.5: Scheduled Game - Award Goes to Non-Winner
**Steps**:
1. Create Scheduled game
2. Settle with winners selected
3. Select non-winner participant for Last Person Standing Award
4. Set award amount

**Expected Results**:
- [ ] Settlement succeeds
- [ ] Non-winner receives award amount only
- [ ] Participant record created/updated with award
- [ ] Separate transfer executed for award

**Database Verification**:
```sql
SELECT payout_amount, status
FROM poker.burrfriends_participants
WHERE game_id = '<gameId>' AND fid = <nonWinnerFid>;
-- Expected: payout_amount = award_amount, status = 'settled'
```

---

### Test 7.5.6: Multiple High Stakers (50M+ BETR) in Same Game
**Steps**:
1. Create Scheduled game
2. Settle with multiple winners who all have 50M+ BETR staked

**Expected Results**:
- [ ] Settlement succeeds
- [ ] All high stakers receive doubled prizes
- [ ] Each winner's prize doubled independently
- [ ] All transfers executed with doubled amounts

**Database Verification**:
```sql
SELECT fid, payout_amount
FROM poker.burrfriends_participants
WHERE game_id = '<gameId>' AND status = 'settled'
ORDER BY payout_amount DESC;
-- Expected: All high stakers have payout_amount = base_prize * 2
```

---

### Test 7.5.7: Sit and Go with High Staker (Should NOT Get Doubled)
**Steps**:
1. Create Sit and Go game
2. Settle with high staker (50M+ BETR) as winner

**Expected Results**:
- [ ] Settlement succeeds
- [ ] High staker receives base prize only (500K BETR, NOT doubled)
- [ ] Prize doubling logic not applied (Sit and Go games excluded)
- [ ] Participant record shows base prize amount

**Database Verification**:
```sql
SELECT payout_amount
FROM poker.burrfriends_participants
WHERE game_id = '<gameId>' AND fid = <highStakerFid>;
-- Expected: payout_amount = 500000 (NOT 1000000)
```

---

## 📊 Test Results Summary

### Test Execution Log
- **Date**: _______________
- **Tester**: _______________
- **Environment**: _______________

### Results by Section
- **7.1 Game Creation**: ___ / 5 tests passed
- **7.2 Game Joining**: ___ / 4 tests passed
- **7.3 Settlement**: ___ / 6 tests passed
- **7.4 Stats**: ___ / 4 tests passed
- **7.5 Edge Cases**: ___ / 7 tests passed

**Total**: ___ / 26 tests passed

### Issues Found
1. _________________________________________________
2. _________________________________________________
3. _________________________________________________

### Notes
_________________________________________________
_________________________________________________

---

## ✅ Phase 7 Complete When:
- [x] All test scenarios documented
- [ ] All test scenarios executed
- [ ] All test scenarios pass
- [ ] Edge cases handled correctly
- [ ] End-to-end flow works from game creation to settlement
- [ ] Issues documented and resolved

---

## 🔗 Related Documentation
- `BURRFRIENDS_GAME_SETUP_PHASED_PLAN_REVISED.md` - Master plan document
- `MANUAL_TEST_CHECKLIST.md` - Legacy payment flow tests (reference only)
- `TEST_HARNESS_SUMMARY.md` - Automated test infrastructure
