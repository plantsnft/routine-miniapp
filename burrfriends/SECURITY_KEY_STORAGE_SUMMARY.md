# Security & Key Storage Summary - AI Agent Review

## Overview
This document summarizes where and how sensitive keys/credentials are stored and used in the Poker Mini App, for security review and end-to-end process validation.

---

## 🔐 Key Storage Locations

### Local Development
**Location**: `C:\miniapps\routine\poker\.env.local`
- **Status**: ✅ Ignored by git (in `.gitignore`)
- **Access**: Only on developer's local machine
- **Purpose**: Local development and testing

### Production (Vercel)
**Location**: Vercel Dashboard → Project → Settings → Environment Variables
- **Status**: ✅ Secure cloud storage (encrypted by Vercel)
- **Access**: Server-side only, never exposed to client
- **Purpose**: Production deployments

### Git Repository
**Status**: ❌ NO keys are committed to git
- `.env.local` is in `.gitignore`
- Example files (`.env.local.example`) have placeholder values only
- No actual secrets in repository history

---

## 📋 Keys/Credentials Used

### 1. Supabase Database Keys

**Keys**:
- `NEXT_PUBLIC_SUPABASE_URL` - Database project URL (public)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Public anonymous key (safe to expose)
- `SUPABASE_SERVICE_ROLE` - ⚠️ **SECRET** - Full database access

**Storage**:
- ✅ Local: `.env.local`
- ✅ Production: Vercel Environment Variables

**Usage**:
- `NEXT_PUBLIC_*` keys: Used in client-side code (exposed in browser)
- `SUPABASE_SERVICE_ROLE`: Server-side only (API routes), bypasses RLS

**Security Notes**:
- `SUPABASE_SERVICE_ROLE` has full database access - should never be in client-side code ✅
- Used only in API routes (`src/app/api/**/*.ts`) ✅
- RLS policies should still be enforced where possible

---

### 2. Neynar API Key

**Key**: `NEYNAR_API_KEY`
- Value: `768ACB76-E4C1-488E-9BD7-3BAA76EC0F04`

**Storage**:
- ✅ Local: `.env.local`
- ✅ Production: Vercel Environment Variables

**Usage**:
- Server-side only (backend API routes)
- Used to fetch Farcaster user data and wallet addresses
- Never exposed to client

**Security Notes**:
- API key has rate limits and usage tracking
- Should be rotated if compromised
- Used in `src/lib/neynar.ts` and API routes only ✅

---

### 3. Master Wallet Private Key ⚠️ **CRITICAL SECRET**

**Key**: `MASTER_WALLET_PRIVATE_KEY`
- **Wallet Address**: `0xd942a322Fa7d360F22C525a652F51cA0FC4aF012`
- **Purpose**: Signs on-chain transactions for refunds and settlements

**Storage**:
- ✅ Local: `.env.local` (development only)
- ✅ Production: Vercel Environment Variables (server-side only)

**Usage**:
- **ONLY** used in server-side API routes:
  - `src/app/api/games/[id]/refund/route.ts` - Refunds player entry fees
  - `src/app/api/games/[id]/settle-contract/route.ts` - Distributes payouts
- Used with `ethers.js` to sign transactions on Base network
- Never exposed to client-side code ✅

**Security Risk Level**: 🔴 **HIGH**
- Controls funds in escrow contract
- Can refund players and settle games
- Must be kept absolutely secret

**Protection**:
- ✅ Never committed to git
- ✅ Only in server-side code
- ✅ Should be stored in secure environment variables
- ✅ Access limited to backend API routes only
- ⚠️ Should consider using hardware wallet or key management service for production

---

### 4. Smart Contract Address

**Key**: `NEXT_PUBLIC_GAME_ESCROW_CONTRACT`
- Value: `0xa20767F64Dc02e4607D031Eff9A2FfF59f0f5f1D`
- **Status**: Public (contract address on Base network)

**Storage**:
- ✅ Hardcoded in `src/lib/constants.ts` (with fallback to env var)
- ✅ Local: `.env.local` (optional override)
- ✅ Production: Vercel Environment Variables

**Usage**:
- Client-side (to prepare transactions)
- Server-side (for contract calls)
- Public contract address - no security risk

---

## 🔄 End-to-End Security Flow

### Payment Flow (Player → Contract)
1. **Player initiates payment** (client-side)
   - Uses Farcaster SDK (`sdk.actions.sendTransaction()`)
   - Transaction signed by player's embedded wallet
   - ✅ No server-side keys needed

2. **Transaction sent to contract**
   - Player's wallet signs and sends
   - Contract receives payment
   - ✅ Master wallet not involved

3. **Backend verification** (`/api/payments/confirm`)
   - Verifies transaction on-chain
   - Updates database
   - ✅ Read-only, no signing required

---

### Refund Flow (Owner → Player)
1. **Owner requests refund** (UI)
   - Frontend calls `/api/games/[id]/refund`
   - ✅ Client never sees private key

2. **Backend processes refund** (`src/app/api/games/[id]/refund/route.ts`)
   - Loads `MASTER_WALLET_PRIVATE_KEY` from env (server-side only) ✅
   - Verifies owner permissions ✅
   - Uses `ethers.js` to sign transaction
   - Calls `contract.refundPlayer()` on-chain
   - Updates database

3. **Security checks**:
   - ✅ Permission check: Only club owner/admin can refund
   - ✅ Private key never exposed to client
   - ✅ Transaction signed server-side only

---

### Settlement Flow (Owner → Winners)
1. **Owner enters results** (UI)
   - Frontend calls `/api/games/[id]/settle-contract`
   - ✅ Client never sees private key

2. **Backend processes settlement** (`src/app/api/games/[id]/settle-contract/route.ts`)
   - Loads `MASTER_WALLET_PRIVATE_KEY` from env (server-side only) ✅
   - Verifies owner permissions ✅
   - Validates recipient addresses ✅
   - Uses `ethers.js` to sign transaction
   - Calls `contract.settleGame()` on-chain
   - Updates database

3. **Security checks**:
   - ✅ Permission check: Only club owner/admin can settle
   - ✅ Private key never exposed to client
   - ✅ Address validation before contract call

---

## 🛡️ Security Best Practices Implemented

### ✅ Implemented
1. **Environment Variables**: All secrets in env vars, not hardcoded
2. **Git Ignore**: `.env.local` never committed
3. **Server-Side Only**: `MASTER_WALLET_PRIVATE_KEY` only in API routes
4. **Permission Checks**: Owner/admin verification before contract calls
5. **Address Validation**: Validates addresses before contract interactions
6. **Error Handling**: Secure error messages (don't leak keys)

### ⚠️ Recommendations for Review
1. **Key Rotation**: Plan for rotating `MASTER_WALLET_PRIVATE_KEY` if compromised
2. **Key Management**: Consider using AWS Secrets Manager or similar for production
3. **Hardware Wallet**: Consider using hardware wallet for master wallet (with fallback)
4. **Rate Limiting**: Add rate limiting to refund/settle endpoints
5. **Audit Logging**: Log all refund/settle operations
6. **Multi-Sig**: Consider multi-signature wallet for master wallet
7. **Gas Limits**: Set reasonable gas limits on contract calls
8. **Time Locks**: Consider time locks for large settlements

---

## 🔍 Code Locations to Review

### Where Private Key is Used:
1. `src/app/api/games/[id]/refund/route.ts` (line ~100+)
   - Loads from `process.env.MASTER_WALLET_PRIVATE_KEY`
   - Creates ethers wallet instance
   - Signs refund transaction

2. `src/app/api/games/[id]/settle-contract/route.ts` (line ~90+)
   - Loads from `process.env.MASTER_WALLET_PRIVATE_KEY`
   - Creates ethers wallet instance
   - Signs settlement transaction

### Where Keys are Referenced (but not used):
1. `src/lib/constants.ts` - Public constants only
2. `src/lib/neynar.ts` - Uses `NEYNAR_API_KEY` (server-side)
3. API routes - Various use `SUPABASE_SERVICE_ROLE` (server-side)

---

## 📊 Risk Assessment

| Key | Risk Level | Exposure | Mitigation |
|-----|-----------|----------|------------|
| `MASTER_WALLET_PRIVATE_KEY` | 🔴 HIGH | Server-side only | ✅ Env vars, permission checks |
| `SUPABASE_SERVICE_ROLE` | 🟡 MEDIUM | Server-side only | ✅ Env vars, RLS where possible |
| `NEYNAR_API_KEY` | 🟡 MEDIUM | Server-side only | ✅ Env vars, rate limited |
| `NEXT_PUBLIC_SUPABASE_URL` | 🟢 LOW | Client-side (public) | ✅ Public data, safe to expose |
| Contract Address | 🟢 LOW | Public blockchain | ✅ No security risk |

---

## 🎯 Questions for AI Agent Review

1. **Key Storage**: Are there better ways to store the master wallet private key?
2. **Access Control**: Are permission checks sufficient before contract calls?
3. **Error Handling**: Do error messages leak sensitive information?
4. **Transaction Security**: Are contract calls secure against reentrancy/attacks?
5. **Key Rotation**: How should key rotation be handled if compromised?
6. **Monitoring**: Should we add monitoring/alerting for contract calls?
7. **Backup/Recovery**: What happens if master wallet is lost?
8. **Multi-Sig**: Should master wallet be multi-signature?
9. **Gas Management**: Are gas limits appropriate?
10. **Audit Trail**: Is there sufficient logging for security audits?

---

## 📝 Summary

**Current State**:
- ✅ Keys stored securely in environment variables
- ✅ Private key never exposed to client
- ✅ Permission checks before sensitive operations
- ✅ Server-side only execution of contract calls

**Key Strengths**:
- Separation of client/server responsibilities
- Environment variable usage
- Permission-based access control

**Areas for Improvement**:
- Key management service for production
- Enhanced monitoring/alerting
- Multi-signature wallet consideration
- Audit logging

---

**Last Updated**: After implementing backend contract calls for refund/settle functionality
**Review Purpose**: Security audit and end-to-end process validation

