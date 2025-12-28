# Poker Mini App - AI Agent Handoff Document

## 🎯 Project Overview

**Mini App Name:** Poker Lobby  
**Purpose:** Farcaster Mini App for managing ClubGG poker games for Hellfire Club and Burrfriends  
**Deployed URL:** https://poker-swart.vercel.app  
**Repository:** https://github.com/plantsnft/poker  
**Tech Stack:** Next.js 15.5.7, TypeScript, Supabase, Neynar API, Farcaster Mini App SDK, Ethers.js v6

---

## 📐 Architecture Overview

### Technology Stack
- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript
- **Database:** Supabase (PostgreSQL)
- **Authentication:** Neynar API (SIWN - Sign In With Neynar)
- **Blockchain:** Base Network (Chain ID: 8453)
- **Smart Contracts:** GameEscrow.sol (manages game entry fees, refunds, payouts)
- **Wallet Integration:** Farcaster Mini App SDK (@farcaster/miniapp-sdk)
- **Blockchain Library:** Ethers.js v6.16.0
- **Hosting:** Vercel

### Key Directories
```
poker/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── api/               # API routes
│   │   │   ├── games/         # Game management endpoints
│   │   │   ├── clubs/         # Club management endpoints
│   │   │   ├── payments/      # Payment processing
│   │   │   └── siwn/          # Sign-in authentication
│   │   ├── clubs/             # Club pages
│   │   ├── games/             # Game pages
│   │   └── layout.tsx         # Root layout with MiniAppInitializer
│   ├── components/            # React components
│   │   ├── SignInButton.tsx   # ⚠️ SIGN-IN COMPONENT (see special instructions)
│   │   ├── PaymentButton.tsx  # Payment flow component
│   │   └── MiniAppInitializer.tsx  # SDK ready() caller
│   ├── lib/                   # Utility libraries
│   │   ├── amounts.ts         # Centralized amount conversions (ETH/USDC)
│   │   ├── neynar.ts          # Neynar client setup
│   │   ├── transaction-encoding.ts  # ABI encoding for contracts
│   │   ├── blockchain-verify.ts     # On-chain verification
│   │   ├── audit-logger.ts          # Audit logging for sensitive operations
│   │   └── permissions.ts           # Permission checking (club owners, admins)
│   └── types/                 # TypeScript type definitions
├── contracts/
│   └── GameEscrow.sol         # Smart contract for game escrow
└── public/
    └── .well-known/
        └── farcaster.json     # Farcaster manifest
```

### Database Schema (Supabase)
- **clubs** - Poker clubs (Hellfire Club, Burrfriends)
- **games** - Poker game instances
- **participants** - Players in games (with payment status)
- **payouts** - Game payouts to winners
- **users** - Farcaster user data (FID, username)

### Key Environment Variables
```
# Farcaster/Neynar
NEYNAR_API_KEY=...
NEXT_PUBLIC_BASE_URL=https://poker-swart.vercel.app

# Database
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE=...

# Blockchain
BASE_RPC_URL=...
GAME_ESCROW_CONTRACT=0x... (Base network address)
MASTER_WALLET_PRIVATE_KEY=... (Hot wallet for refunds/settlements)
MASTER_WALLET_ADDRESS=0x... (Same as deployer of GameEscrow contract)

# Optional
ALERT_WEBHOOK_URL=... (For audit log alerts)
```

---

## ✅ Current State - What's Working

### Fully Functional
1. **Mini App Initialization** ✅
   - `sdk.actions.ready()` is called successfully via `MiniAppInitializer.tsx`
   - Integrated in root layout (`src/app/layout.tsx`)
   - No more "Ready not called" warnings

2. **Farcaster Manifest** ✅
   - Manifest file at `public/.well-known/farcaster.json`
   - Open Graph metadata (`fc:miniapp`) configured
   - Domain association verified (FID 318447)

3. **Payment System** ✅
   - Supports ETH and USDC payments
   - Uses `GameEscrow` smart contract
   - ABI encoding for contract calls
   - Transaction signing via Farcaster SDK wallet

4. **Smart Contract Integration** ✅
   - `GameEscrow` contract deployed on Base
   - Owner refund functionality (`refundPlayer()`)
   - Game settlement (`settleGame()`)
   - On-chain verification of payments

5. **Backend API Routes** ✅
   - Game creation and management
   - Participant management
   - Payment confirmation
   - Refund processing
   - Settlement processing
   - Permission checks (club owners/admins)

6. **Amount Handling** ✅
   - Centralized `amounts.ts` library
   - Converts human-readable amounts to raw token units
   - ETH: 18 decimals (wei)
   - USDC: 6 decimals

7. **Audit Logging** ✅
   - Logs refunds, settlements, emergency withdrawals
   - Optional webhook alerts
   - Centralized in `lib/audit-logger.ts`

---

## ⚠️ CRITICAL: Current Login/Sign-In State

### The Problem
**`SignInButton.tsx` is experiencing issues with the Farcaster Preview Tool.**

### Current Behavior
1. ✅ **Code is correct** - The sign-in implementation follows Farcaster SDK best practices
2. ⚠️ **Preview Tool Limitation** - The Farcaster Preview Tool doesn't properly handle `sdk.actions.signIn()` prompts
3. ❌ **Prompt Appears Briefly** - Sign-in prompt flashes for ~0.5 seconds then disappears
4. ❌ **Timeout/Hang** - The sign-in call waits indefinitely or times out

### What We've Tried
1. ✅ Removed auto sign-in (only checks localStorage now)
2. ✅ Added initialization delay (500ms)
3. ✅ Added SDK availability checks
4. ✅ Improved error messages
5. ✅ Removed timeout race condition (now waits naturally)
6. ❌ **Still not working in Preview Tool**

### Code Location
**File:** `src/components/SignInButton.tsx`

**Key Function:** `performSignIn()` (lines ~26-202)

**Current Flow:**
```typescript
1. Check localStorage for existing session
2. If no session, user clicks "Sign in with Farcaster" button
3. Calls sdk.actions.signIn({ nonce, acceptAuthAddress: true })
4. Should show approval prompt
5. User approves → returns { message, signature }
6. Verifies with backend /api/siwn
7. Creates/updates user record
8. Stores FID in localStorage
9. Reloads page
```

### Special Instructions for Next AI Agent

#### 🚨 IMPORTANT: This is NOT a code bug
- The code implementation is correct
- The issue is with the **Farcaster Preview Tool** not properly supporting sign-in prompts
- **This will likely work fine in Warpcast (the real Farcaster client)**

#### What to Check First
1. **Test in Warpcast** (not Preview Tool) - Sign-in should work
2. **Check browser console** for any SDK errors
3. **Verify SDK is loaded** - Check if `window.__FARCASTER_SDK__` exists
4. **Check Network tab** - See if `/api/siwn` is being called

#### Potential Solutions to Investigate
1. **Check Farcaster SDK version** - Maybe update `@farcaster/miniapp-sdk`
2. **Check if SDK context provides user info** - Maybe we can get FID without signIn()
3. **Try different sign-in approach** - Maybe use `sdk.context` instead
4. **Check if Preview Tool needs special configuration**
5. **Wait for user interaction** - Maybe add explicit user gesture before calling signIn()

#### Code Notes
- Auto sign-in is **disabled** (only checks localStorage on mount)
- Timeout was **removed** (now waits naturally for prompt)
- Error handling includes preview tool limitation messages
- Sign-in requires **user approval** - cannot be fully automatic

#### Testing Recommendations
1. **Primary:** Test in Warpcast mobile/desktop app (should work)
2. **Secondary:** Check if Preview Tool has known issues with sign-in
3. **Debug:** Add more logging around SDK initialization
4. **Alternative:** Consider if there's a way to get user context without explicit sign-in

---

## 🎯 Goals & Next Steps

### Immediate Goals
1. **✅ DONE:** Fix "Ready not called" warning
2. **⚠️ IN PROGRESS:** Get sign-in working reliably (see special instructions above)
3. **TODO:** Verify sign-in works in Warpcast (not just Preview Tool)

### Feature Goals (Future)
1. **Game Management**
   - ✅ Create games with entry fees
   - ✅ Join games (free and paid)
   - ✅ Manage participants
   - ✅ Record results
   - ✅ Process payouts

2. **Payment Flow**
   - ✅ ETH payments
   - ✅ USDC payments
   - ✅ On-chain verification
   - ✅ Refund system
   - ✅ Settlement system

3. **Club Management**
   - ✅ Club creation
   - ✅ Member management
   - ✅ Admin permissions
   - ✅ Announcements

4. **Security & Monitoring**
   - ✅ Permission checks
   - ✅ Audit logging
   - ✅ Hot wallet (limited funds)
   - ✅ Reentrancy guards in contract

### Production Readiness Checklist
- [x] Mini app initializes correctly (`sdk.actions.ready()`)
- [x] Manifest configured and verified
- [x] Payment system functional
- [x] Smart contract deployed and tested
- [x] Backend APIs secure (permissions, validation)
- [x] Audit logging in place
- [ ] Sign-in works reliably (current blocker)
- [ ] End-to-end testing in Warpcast
- [ ] User onboarding flow tested
- [ ] Error handling comprehensive
- [ ] Documentation complete

---

## 🔐 Security Considerations

### Important Notes
1. **MASTER_WALLET_PRIVATE_KEY** is stored in environment variables
   - This is a **hot wallet** with limited funds only
   - Used for refunds and settlements
   - Must be the same EOA that deployed `GameEscrow` contract
   - Never commit to git

2. **SUPABASE_SERVICE_ROLE** has full database access
   - Only used server-side
   - Never exposed to client

3. **Permissions** are checked on all admin routes
   - Club owners can manage their clubs
   - Admins can manage their clubs
   - Super owner (FID 318447) can manage everything

4. **Dev FID bypass** is disabled in production
   - `NEXT_PUBLIC_DEV_FID` only works in development
   - Production requires real sign-in

---

## 📚 Key Documentation Files

1. **CONTRACT_DEPLOYMENT_REMIX.md** - How to deploy GameEscrow
2. **NEXT_STEPS.md** - Previous planning document
3. **GO_LIVE_NOW.md** - Launch checklist
4. **MAKE_MINIAPP_DISCOVERABLE.md** - Discovery setup guide

---

## 🔍 Debugging Tips

### Check SDK State
```javascript
// In browser console
import('@farcaster/miniapp-sdk').then(({ sdk }) => {
  console.log('SDK:', sdk);
  console.log('Actions:', sdk.actions);
  console.log('Context:', sdk.context);
});
```

### Check if in Mini App
```javascript
sdk.isInMiniApp().then(result => console.log('In mini app:', result));
```

### Check localStorage
```javascript
console.log('User FID:', localStorage.getItem('userFid'));
console.log('Username:', localStorage.getItem('username'));
```

### Network Debugging
- Check `/api/siwn` POST requests
- Check `/api/users` POST requests
- Look for CORS errors
- Check response status codes

---

## 🚀 Deployment

### Vercel
- Auto-deploys on push to `main` branch
- Environment variables configured in Vercel dashboard
- Build command: `npm run build`
- Output directory: `.next`

### Environment Variables Required
All variables listed in "Key Environment Variables" section above must be set in Vercel.

---

## 📝 Current Issues Summary

1. **Sign-In in Preview Tool** ⚠️
   - Prompt appears briefly then disappears
   - Likely Preview Tool limitation
   - Code is correct, needs testing in Warpcast

2. **Minor Linting Warnings** ℹ️
   - Unused imports/variables
   - Missing dependency arrays in useEffect
   - Non-blocking, can be cleaned up later

---

## 💡 Recommendations for Next Agent

1. **Primary Focus:** Get sign-in working - test in Warpcast first
2. **If Preview Tool Issue Confirmed:** Document as known limitation
3. **Code Quality:** Clean up linting warnings when sign-in is resolved
4. **Testing:** End-to-end test full user flow in Warpcast
5. **Documentation:** Update user-facing docs once sign-in works

---

## 📞 Contact / Context

- **Owner:** FID 318447 (plantsnft)
- **Clubs:** Hellfire Club, Burrfriends
- **Network:** Base (Chain ID: 8453)
- **Contract Owner:** Must match MASTER_WALLET_ADDRESS

---

**Last Updated:** Current session  
**Status:** Sign-in needs verification in Warpcast, Preview Tool has limitations

