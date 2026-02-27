# Vercel Environment Variables Checklist - Burrfriends

## Instructions

1. Go to your Vercel project: https://vercel.com/dashboard
2. Select the `burrfriends` project
3. Go to **Settings** → **Environment Variables**
4. Add each variable below (copy from poker project where indicated)

---

## 🔴 CRITICAL (Required for App to Function)

### Supabase (Shared with Poker App)
Copy these from your poker Vercel project:

- **`NEXT_PUBLIC_SUPABASE_URL`**
  - Value: `https://bfjinpptqwoemnavthon.supabase.co`
  - Example: `https://bfjinpptqwoemnavthon.supabase.co`

- **`NEXT_PUBLIC_SUPABASE_ANON_KEY`**
  - Value: Your Supabase anonymous key (from poker project)
  - Example: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

- **`SUPABASE_SERVICE_ROLE`**
  - Value: Your Supabase service role key (from poker project)
  - Example: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
  - ⚠️ **Keep this secret!** Mark as "Sensitive" in Vercel

### Neynar API (Shared with Poker App)
Copy from poker project:

- **`NEYNAR_API_KEY`**
  - Value: Your Neynar API key (from poker project)
  - Example: `768ACB76-E4C1-488E-9BD7-3BAA76EC0F04`
  - ⚠️ Mark as "Sensitive"

### Master Wallet (Shared with Poker App)
Copy from poker project:

- **`MASTER_WALLET_PRIVATE_KEY`**
  - Value: Private key for `0xd942a322Fa7d360F22C525a652F51cA0FC4aF012`
  - ⚠️ **CRITICAL SECURITY** - Mark as "Sensitive"
  - ⚠️ Never commit this to Git

### Encryption Key (Shared with Poker App)
Copy from poker project:

- **`POKER_CREDS_ENCRYPTION_KEY`**
  - Value: Base64-encoded 32-byte key (from poker project)
  - ⚠️ Must match poker app for compatibility
  - ⚠️ Mark as "Sensitive"

---

## 🟡 APP CONFIGURATION (Burrfriends-Specific)

### App Identity

- **`APP_NAME`**
  - Value: `Burrfriends`
  - Used for: Farcaster manifest, page titles

- **`APP_DESCRIPTION`**
  - Value: `play poker with burr and friends`
  - Used for: Farcaster manifest, meta tags

### Base URL

- **`NEXT_PUBLIC_BASE_URL`**
  - Value: `https://burrfriends.vercel.app` (or your custom domain)
  - ⚠️ **Important:** Update this after first deployment if Vercel assigns a different URL
  - Used for: Farcaster manifest, OAuth callbacks, API endpoints

---

## 🟢 SMART CONTRACTS (Burrfriends-Specific)

### Game Escrow Contract

- **`GAME_ESCROW_CONTRACT`**
  - Value: `0x6ed7a9d7aabbd68f03d4448dc092c96225b4e920`
  - Used for: Server-side contract interactions

- **`NEXT_PUBLIC_GAME_ESCROW_CONTRACT`**
  - Value: `0x6ed7a9d7aabbd68f03d4448dc092c96225b4e920`
  - Used for: Client-side contract interactions

### Base Network RPC

Copy from poker project (or use public RPC):

- **`BASE_RPC_URL`**
  - Value: `https://mainnet.base.org` (or your preferred Base RPC)
  - Used for: Server-side blockchain queries

- **`NEXT_PUBLIC_BASE_RPC_URL`**
  - Value: `https://mainnet.base.org` (or your preferred Base RPC)
  - Used for: Client-side blockchain queries

---

## 🔵 OPTIONAL (Recommended)

### Club Owner & Admins

- **`BURRFRIENDS_OWNER_FID`**
  - Value: `318447` (default)
  - Used for: Club owner permissions

- **`TORMENTAL_FID`**
  - Value: Your global admin FID (optional)
  - Used for: Global admin permissions

- **`NOTIFICATIONS_BROADCAST_ADMIN_FIDS`**
  - Value: Comma-separated FIDs (e.g., `318447,123456`)
  - Used for: Push notification recipients

### Features

- **`ENABLE_PUSH_NOTIFICATIONS`**
  - Value: `true` (or leave unset to disable)
  - Used for: Enabling push notifications

- **`NEXT_PUBLIC_DEBUG_PARTICIPANTS`**
  - Value: `1` (or leave unset)
  - Used for: Debug mode for participants API

---

## 📋 Quick Copy-Paste Checklist

Copy these values from your **poker Vercel project**:
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE`
- [ ] `NEYNAR_API_KEY`
- [ ] `MASTER_WALLET_PRIVATE_KEY`
- [ ] `POKER_CREDS_ENCRYPTION_KEY`
- [ ] `BASE_RPC_URL`
- [ ] `NEXT_PUBLIC_BASE_RPC_URL`

Set these **burrfriends-specific** values:
- [ ] `APP_NAME=Burrfriends`
- [ ] `APP_DESCRIPTION=play poker with burr and friends`
- [ ] `NEXT_PUBLIC_BASE_URL=https://burrfriends.vercel.app` (update after first deploy)
- [ ] `GAME_ESCROW_CONTRACT=0x6ed7a9d7aabbd68f03d4448dc092c96225b4e920`
- [ ] `NEXT_PUBLIC_GAME_ESCROW_CONTRACT=0x6ed7a9d7aabbd68f03d4448dc092c96225b4e920`

Optional (recommended):
- [ ] `BURRFRIENDS_OWNER_FID=318447`
- [ ] `ENABLE_PUSH_NOTIFICATIONS=true`

---

## ✅ After Setting Variables

1. **Save** all environment variables in Vercel
2. **Redeploy** the project (or wait for auto-deploy)
3. **Verify** the deployment succeeds
4. **Update** `NEXT_PUBLIC_BASE_URL` if Vercel assigned a different URL
5. **Test** the app at your Vercel URL

---

## 🔍 How to Copy from Poker Project

1. Go to Vercel dashboard
2. Select your **poker** project
3. Go to **Settings** → **Environment Variables**
4. Copy each value listed above
5. Paste into **burrfriends** project environment variables

---

## ⚠️ Important Notes

- **Never commit** `MASTER_WALLET_PRIVATE_KEY` or `SUPABASE_SERVICE_ROLE` to Git
- **Mark sensitive variables** as "Sensitive" in Vercel (they'll be hidden in logs)
- **Update `NEXT_PUBLIC_BASE_URL`** after first deployment to match your actual Vercel URL
- **All shared variables** must match poker app exactly (Supabase, Neynar, wallet, encryption key)
