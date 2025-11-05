# Catwalk Mini-App - Project Summary

**Last Updated:** 2025-01-04  
**Status:** ✅ Working - App is live and functional  
**Primary Domain:** `https://catwalk-smoky.vercel.app` (may need configuration)  
**Working Domain:** `https://routine-plants-projects-156afffe.vercel.app`  

---

## 📋 Project Overview

**Catwalk** is a Farcaster Mini App built on Next.js 15 that provides:
- Daily check-in functionality with streak tracking
- Real-time token price and market data display (CATWALK token on Base)
- Channel feed integration (Instagram-like feed of Catwalk channel casts)
- Leaderboard for check-in streaks
- Wallet integration for EVM and Solana
- Social features (sharing, notifications, haptic feedback)

---

## 🏗️ Architecture & Tech Stack

### Core Technologies
- **Framework:** Next.js 15 (App Router) with TypeScript
- **UI:** React 19, Tailwind CSS
- **Backend:** Next.js API Routes (serverless functions on Vercel)
- **Database:** Supabase (PostgreSQL) for check-ins and price history
- **Authentication:** Farcaster Sign-In with Neynar (SIWN)
- **APIs:**
  - Neynar API (Farcaster user data, channel data, notifications)
  - DexScreener API (token price data)
  - CoinGecko API (token price fallback)
  - BaseScan API (token stats - holders, transactions)
  - Base RPC (direct JSON-RPC calls for on-chain data)
- **Hosting:** Vercel (serverless functions)
- **Version Control:** GitHub (`https://github.com/plantsnft/routine-miniapp`)

### Key Libraries
- `@neynar/react` - Farcaster Mini App SDK
- `@farcaster/miniapp-sdk` - Farcaster SDK actions
- `@neynar/nodejs-sdk` - Server-side Neynar API client
- `wagmi` + `viem` - EVM wallet integration
- `@solana/wallet-adapter-react` - Solana wallet integration
- `@upstash/redis` - KV storage (optional, for notifications)

---

## 🎯 Features & Tabs

### Main Tabs (Bottom Navigation)
1. **Home Tab** (`HomeTab.tsx`)
   - Daily check-in functionality
   - Streak display and countdown timer
   - Catwalk channel follower count
   - Rotating keywords banner
   - "$CATWALK" link to DexScreener

2. **Feed Tab** (`FeedTab.tsx`)
   - Instagram-like feed of last 5 casts from Catwalk channel
   - Shows images, text, author info, engagement stats
   - "View on Warpcast" links

3. **Leaderboard Tab** (`LeaderboardTab.tsx`)
   - Top users by check-in streak
   - User rankings and stats

4. **Actions Tab** (`ActionsTab.tsx`)
   - Share mini app
   - Send notifications
   - Haptic feedback controls
   - Sign in with Farcaster

5. **Context Tab** (`ContextTab.tsx`)
   - Debug info about Farcaster context
   - Client information display

6. **Wallet Tab** (`WalletTab.tsx`)
   - EVM wallet connection (via Wagmi)
   - Solana wallet connection
   - Send ETH/SOL
   - Sign messages (EVM & Solana)

### Token Ticker (Top Banner)
- Real-time scrolling banner showing:
  - Market Cap
  - 24h Price Change (green/red)
  - Volume 24h
  - Recent Purchases
- Updates every 30 seconds
- Price data stored in Supabase every 30 minutes

---

## 📡 API Endpoints

### Authentication
- `GET /api/siwn` - Get SIWN params from query string
- `POST /api/siwn` - Validate SIWN signature and return user FID
- `GET /api/auth/nonce` - Get SIWN nonce
- `POST /api/auth/validate` - Validate SIWN message
- `GET /api/auth/signers` - Get signers
- `GET /api/auth/session-signers` - Get session signers
- `POST /api/auth/signer` - Create signer
- `POST /api/auth/signer/signed_key` - Create signed key request

### Check-ins
- `GET /api/checkin?fid={fid}` - Get user's check-in data (streak, last_checkin)
- `POST /api/checkin` - Create/update check-in (body: `{ fid: number }`)
  - Returns: `{ ok: boolean, streak: number, last_checkin: string, hasCheckedInToday: boolean }`

### Token Data
- `GET /api/token-price` - Get CATWALK token price, market cap, 24h change, volume, liquidity
  - Returns comprehensive token stats from multiple sources
  - Stores price snapshot in Supabase every 30 minutes
  - Calculates 24h change from historical data if external APIs fail
- `GET /api/token-price/debug` - Debug endpoint for token price
- `GET /api/token-price/test` - Test endpoint for token price
- `GET /api/recent-purchases` - Get recent token purchase events

### Social/Channel
- `GET /api/channel-feed` - Get last 5 casts from Catwalk channel
- `GET /api/channel-stats` - Get Catwalk channel follower count
- `GET /api/leaderboard` - Get top users by streak
- `GET /api/best-friends?fid={fid}` - Get user's best friends
- `GET /api/users?fids={fid1,fid2}` - Get user data by FIDs

### Notifications
- `POST /api/send-notification` - Send notification to user
  - Body: `{ fid: number, notificationDetails: {...} }`
  - Uses Neynar API if available, otherwise Upstash Redis

### Webhooks
- `POST /api/webhook` - Handle Neynar webhooks

### Metadata
- `GET /.well-known/farcaster.json` - Farcaster domain manifest
- `GET /api/opengraph-image` - Generate OG image for sharing
- `GET /share/[fid]` - Share page for specific user (redirects to home)

---

## 📁 File Structure

```
src/
├── app/                          # Next.js App Router
│   ├── api/                      # API routes
│   │   ├── auth/                 # Authentication endpoints
│   │   ├── checkin/              # Check-in endpoints
│   │   ├── token-price/          # Token data endpoints
│   │   ├── channel-feed/         # Channel feed endpoint
│   │   ├── channel-stats/        # Channel stats endpoint
│   │   ├── leaderboard/          # Leaderboard endpoint
│   │   └── ...
│   ├── daily-checkin.tsx         # Daily check-in page component
│   ├── page.tsx                  # Root page (renders App)
│   ├── layout.tsx                # Root layout
│   ├── providers.tsx             # React providers
│   └── share/[fid]/              # Share pages
│
├── components/
│   ├── App.tsx                   # Main app container (tab management)
│   ├── ErrorBoundary.tsx         # Error boundary component
│   ├── CheckinAnimation.tsx      # Check-in success animation
│   ├── CheckinButton.tsx         # Check-in button component
│   ├── StreakDisplay.tsx         # Streak display component
│   ├── ui/
│   │   ├── Header.tsx            # App header
│   │   ├── Footer.tsx            # Bottom navigation
│   │   ├── TokenTicker.tsx       # Token price ticker banner
│   │   ├── tabs/                 # Tab components
│   │   │   ├── HomeTab.tsx
│   │   │   ├── FeedTab.tsx
│   │   │   ├── LeaderboardTab.tsx
│   │   │   ├── ActionsTab.tsx
│   │   │   ├── ContextTab.tsx
│   │   │   └── WalletTab.tsx
│   │   └── wallet/               # Wallet components
│   └── providers/                # React providers
│
├── hooks/
│   ├── useAuth.ts                # Authentication hook
│   ├── useCheckin.ts             # Check-in functionality hook
│   ├── useNeynarUser.ts          # Neynar user data hook
│   ├── useQuickAuth.ts           # Quick auth hook
│   └── useDetectClickOutside.ts  # Click outside detection
│
├── lib/
│   ├── constants.ts              # App constants (APP_URL, APP_NAME, etc.)
│   ├── utils.ts                  # Utility functions
│   ├── supabase.ts               # Supabase client and functions
│   ├── neynar.ts                 # Neynar client singleton
│   ├── auth.ts                   # Auth utilities
│   ├── dateUtils.ts              # Date/time utilities
│   ├── types.ts                  # TypeScript types
│   └── ...
│
└── ...
```

---

## 🔐 Environment Variables

### Required (Server & Client)
- `NEXT_PUBLIC_URL` - App URL (e.g., `https://catwalk-smoky.vercel.app`)
- `NEXT_PUBLIC_APP_NAME` - App name (defaults to "Catwalk")
- `NEXT_PUBLIC_APP_DESCRIPTION` - App description
- `NEXT_PUBLIC_APP_BUTTON_TEXT` - Button text for mini app
- `NEXT_PUBLIC_FARCASTER_NETWORK` - Network (usually "mainnet")
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key

### Required (Server Only)
- `NEYNAR_API_KEY` - Neynar API key
- `NEYNAR_CLIENT_ID` - Neynar client ID
- `SUPABASE_SERVICE_ROLE` - Supabase service role key (for admin operations)
- `SEED_PHRASE` - Signer seed phrase (12 words, space-separated)
- `SPONSOR_SIGNER` - Set to "true" for sponsor signer

### Optional
- `BASESCAN_API_KEY` - BaseScan API key (for enhanced token stats)
- `UPSTASH_REDIS_REST_URL` - Upstash Redis URL (for notifications)
- `UPSTASH_REDIS_REST_TOKEN` - Upstash Redis token

**Note:** All environment variables should be set in:
1. `.env.local` (local development, gitignored)
2. Vercel Project Settings → Environment Variables (production)

---

## 🗄️ Database Schema (Supabase)

### `checkins` Table
```sql
CREATE TABLE public.checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fid bigint NOT NULL,
  last_checkin timestamptz,
  streak integer NOT NULL DEFAULT 1,
  inserted_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX checkins_fid_unique ON public.checkins (fid);
```

### `price_history` Table
```sql
CREATE TABLE public.price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_address text NOT NULL,
  price numeric NOT NULL,
  price_usd numeric NOT NULL,
  market_cap numeric,
  volume_24h numeric,
  timestamp timestamptz NOT NULL DEFAULT now(),
  inserted_at timestamptz DEFAULT now()
);

CREATE INDEX idx_price_history_token_address_timestamp 
  ON public.price_history (token_address, timestamp DESC);
```

**RLS Policies:**
- Read access: Everyone can read
- Insert access: Authenticated users (API uses service role)

---

## 🔧 Recent Optimizations & Changes

### Code Quality Improvements
1. **Removed Redundancies:**
   - Consolidated URL fallback logic to use `APP_URL` constant from `constants.ts`
   - Removed duplicate `process.env.NEXT_PUBLIC_URL` checks in favor of `APP_URL`
   - Updated `src/app/api/users/route.ts` to use `getNeynarClient()` singleton instead of creating new instances

2. **Error Handling:**
   - Added `ErrorBoundary` component to catch React errors gracefully
   - Added timeouts to Supabase queries (8 seconds)
   - Improved error handling in hooks to prevent infinite loops
   - Added graceful degradation when APIs fail

3. **Performance:**
   - Fixed infinite loop issues in `useEffect` hooks
   - Added loading state checks to prevent overlapping API requests
   - Implemented AbortController for fetch requests with timeouts

### Token Price System
- **Price Data Sources (in order of priority):**
  1. DexScreener API (primary)
  2. CoinGecko API (fallback)
  3. Uniswap V3 pool reserves (on-chain calculation)
  4. Supabase historical data (24h change calculation)

- **Price Storage:**
  - Price snapshots stored in Supabase every 30 minutes
  - 24h price change calculated from historical data if external APIs don't provide it
  - Automatic cleanup of old price history data

### Token Ticker Features
- Displays: Market Cap, 24h Change, Volume, Recent Purchases
- 24h change formatted with green (positive) / red (negative) colors
- Updates every 30 seconds
- Graceful error handling (doesn't crash app if API fails)

---

## 🎨 Branding & Styling

### Colors
- **Background:** `#000000` (black)
- **Accent:** `#c1b400` (gold)
- **Text:** `#ffffff` (white)
- **Error:** `#ff4444` (red)
- **Success:** `#00ff00` (green)

### Typography
- Uses Tailwind CSS default font stack
- Headings: Bold, various sizes
- Body: Regular weight

---

## 🚀 Development Workflow

### Local Development
```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Server runs on http://localhost:3000
```

### Testing with Warpcast
1. Start local dev server
2. Use ngrok or similar tool to expose localhost:
   ```bash
   npx ngrok http 3000
   ```
3. In Warpcast Mini-App Preview, paste the ngrok URL
4. Test sign-in and check-in functionality

### Deployment
```bash
# Build for production
npm run build

# Deploy to Vercel (if using GitHub integration, just push)
git add .
git commit -m "Your message"
git push

# Or use Vercel CLI
npm run deploy:vercel
```

### Environment Setup on Vercel
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add all required environment variables (see above)
3. Redeploy after adding/updating variables

---

## 📝 Known Issues & Considerations

### Domain Configuration
- **Primary domain** (`catwalk-smoky.vercel.app`) may have connection issues
- **Working domain** (`routine-plants-projects-156afffe.vercel.app`) is currently functional
- **Recommendation:** Configure `catwalk-smoky.vercel.app` in Vercel:
  1. Remove domain from Vercel
  2. Wait 2 minutes
  3. Re-add domain and assign to Production
  4. Wait 5 minutes for DNS propagation

### API Rate Limits
- DexScreener: No official rate limit documented, but be respectful
- CoinGecko: Free tier has rate limits (50 calls/minute)
- Neynar: Depends on plan (Starter plan should be sufficient)
- BaseScan: Free tier has rate limits

### Supabase Queries
- All Supabase queries have 8-second timeouts
- Functions return `null` on error instead of throwing (graceful degradation)
- Check-in API has timeout protection with `Promise.race`

### React Hooks
- `useEffect` dependencies carefully managed to prevent infinite loops
- Loading state checks prevent overlapping requests
- AbortController used for fetch timeouts

---

## 🔮 Future Enhancements (Ideas)

### Features
- [ ] Push notifications for check-in reminders
- [ ] Social features (follow users, see friends' streaks)
- [ ] Achievements/badges for milestones
- [ ] Token rewards for check-ins (if applicable)
- [ ] More detailed analytics dashboard
- [ ] Export streak data
- [ ] Share streak achievements to Warpcast

### Technical Improvements
- [ ] Add caching layer (Redis) for frequently accessed data
- [ ] Implement rate limiting on API routes
- [ ] Add API request logging and monitoring
- [ ] Optimize token price calculation (reduce API calls)
- [ ] Add unit tests and integration tests
- [ ] Improve error messages and user feedback
- [ ] Add analytics tracking (optional)

### UI/UX
- [ ] Dark/light mode toggle (currently dark only)
- [ ] Animations and transitions
- [ ] Loading skeletons instead of spinners
- [ ] Better mobile responsiveness
- [ ] Accessibility improvements (ARIA labels, keyboard navigation)

---

## 📚 Key Files to Understand

### For Adding Features
1. `src/components/App.tsx` - Main app structure and tab management
2. `src/components/ui/tabs/HomeTab.tsx` - Home tab implementation
3. `src/hooks/useCheckin.ts` - Check-in logic
4. `src/app/api/checkin/route.ts` - Check-in API endpoint

### For API Changes
1. `src/app/api/token-price/route.ts` - Token price logic (complex, handles multiple sources)
2. `src/lib/supabase.ts` - Database operations
3. `src/lib/neynar.ts` - Neynar API client

### For Styling
1. `src/app/globals.css` - Global styles
2. `tailwind.config.ts` - Tailwind configuration
3. `src/lib/constants.ts` - App constants (colors, URLs, etc.)

### For Authentication
1. `src/app/api/siwn/route.ts` - SIWN handler
2. `src/hooks/useAuth.ts` - Auth hook
3. `src/lib/auth.ts` - Auth utilities

---

## 🐛 Troubleshooting

### App Not Loading
- Check Vercel deployment logs
- Verify environment variables are set
- Check if domain is properly configured
- Look for server-side rendering errors in logs

### Check-ins Not Working
- Verify Supabase connection (check `SUPABASE_URL` and keys)
- Check Supabase RLS policies
- Look at `/api/checkin` logs in Vercel
- Verify FID is being passed correctly

### Token Price Not Showing
- Check DexScreener API status
- Verify token address is correct (`0xa5eb1cAD0dFC1c4f8d4f84f995aeDA9a7A047B07`)
- Check Supabase `price_history` table has data
- Look at `/api/token-price` logs in Vercel

### SIWN Not Working
- Verify `NEYNAR_API_KEY` and `NEYNAR_CLIENT_ID` are set
- Check `SEED_PHRASE` and `SPONSOR_SIGNER` are configured
- Ensure `NEXT_PUBLIC_URL` matches deployed URL
- Check `/api/siwn` logs for errors

---

## 📞 Support & Resources

- **Neynar Docs:** https://docs.neynar.com/
- **Farcaster Docs:** https://docs.farcaster.xyz/
- **Next.js Docs:** https://nextjs.org/docs
- **Supabase Docs:** https://supabase.com/docs
- **Vercel Docs:** https://vercel.com/docs

---

## ✅ Quick Checklist for New Features

When adding a new feature:
- [ ] Add TypeScript types if needed
- [ ] Add error handling (try/catch, timeouts)
- [ ] Add loading states in UI
- [ ] Test in local development
- [ ] Test in Warpcast Mini-App Preview
- [ ] Update this summary if needed
- [ ] Deploy to Vercel and verify
- [ ] Check Vercel logs for errors

---

**Note:** This is a living document. Update it as the project evolves!
