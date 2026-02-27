# Burrfriends Mini App

Farcaster Mini App for managing ClubGG poker games for Burrfriends club.

## Features

- **Authentication**: Sign in with Farcaster (Quick Auth JWT)
- **Open Signup**: Any Farcaster user can join games (no roster/membership required)
- **Global Blocklist**: Admins can block users from joining games or making payments
- **Club Management**: Burrfriends Club
- **Game Creation**: Admins can create games with three gating types:
  - Open/Free games
  - Paid entry
  - Staked in Betrmint pool
- **Eligibility Checks**: Automatic gating enforcement based on payment status or stake amounts
- **Password Viewing**: Gated access to ClubGG game passwords for eligible players
- **Owner Portal**: Manage participants, whitelist FIDs, mark payments as received
- **Announcements**: Club owners can broadcast announcements to players
- **Results Tracking**: Owners can record game results and payouts

## Setup

1. Install dependencies:
```bash
cd burrfriends
npm install
```

2. Set up environment variables:
   - Copy `.env.local.example` to `.env.local`
   - Fill in your actual values (see Environment Variables section below)

3. Set up Supabase:
   - Uses shared Supabase project: `bfjinpptqwoemnavthon`
   - Tables are in `poker` schema: `burrfriends_games`, `burrfriends_participants`, `burrfriends_game_results`
   - Get your project URL, anon key, and service role key from Supabase dashboard

4. Get Neynar API credentials:
   - Sign up at https://neynar.com
   - Get your API key (shared with poker app)

5. Deploy Game Escrow Contract:
   - Deploy `contracts/BurrfriendsGameEscrow.sol` via Remix to Base network
   - Use master wallet: `0xd942a322Fa7d360F22C525a652F51cA0FC4aF012`
   - Contract deployed at: `0x6ed7a9d7aabbd68f03d4448dc092c96225b4e920`
   - Set `GAME_ESCROW_CONTRACT` in Vercel environment variables (not local `.env.local` to avoid conflicts)

6. Run development server:
```bash
npm run dev
```

7. Seed the burrfriends club (first time only):
   - Visit `/api/clubs` with POST request (or the clubs page will auto-seed)
   - Club slug: `burrfriends`

## Environment Variables

See `.env.local.example` for a complete template. Required variables:

### Critical (Required):
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL (shared: `bfjinpptqwoemnavthon`)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE` - Supabase service role key
- `NEYNAR_API_KEY` - Neynar API key for Farcaster authentication
- `MASTER_WALLET_PRIVATE_KEY` - Private key for master wallet (`0xd942a322Fa7d360F22C525a652F51cA0FC4aF012`)
- `POKER_CREDS_ENCRYPTION_KEY` - Encryption key for ClubGG credentials (must match poker app)

### App Configuration:
- `APP_NAME` - App name: "Burrfriends"
- `APP_DESCRIPTION` - App description: "play poker with burr and friends"
- `NEXT_PUBLIC_BASE_URL` - Base URL (local: `http://localhost:3000`, production: your Vercel URL)

### Smart Contracts:
- `GAME_ESCROW_CONTRACT` / `NEXT_PUBLIC_GAME_ESCROW_CONTRACT` - Deployed BurrfriendsGameEscrow contract address (deploy via Remix first)
- `BASE_RPC_URL` / `NEXT_PUBLIC_BASE_RPC_URL` - Base network RPC URL (`https://mainnet.base.org`)

### Optional:
- `BURRFRIENDS_OWNER_FID` - Club owner FID (default: 318447)
- `TORMENTAL_FID` - Global admin FID (optional)
- `NOTIFICATIONS_BROADCAST_ADMIN_FIDS` - Comma-separated admin FIDs for notifications
- `ENABLE_PUSH_NOTIFICATIONS` - Set to `'true'` to enable push notifications

## Database Schema

The app uses the following tables in the `poker` schema (shared Supabase instance):
- `clubs` - Shared clubs table (includes burrfriends club)
- `club_members` - Shared club membership table
- `burrfriends_games` - Burrfriends-specific games (separate from `poker.games`)
- `burrfriends_participants` - Burrfriends-specific participants (separate from `poker.participants`)
- `burrfriends_game_results` - Burrfriends-specific game results (separate from `poker.game_results`)
- `payouts` - Shared payouts table
- `club_announcements` - Shared announcements table

## API Routes

- `GET/POST /api/siwn` - Farcaster authentication
- `GET/POST /api/users` - User management
- `GET/POST /api/clubs` - Club management and seeding
- `GET/POST /api/games` - Game creation and listing
- `POST /api/games/[id]/join` - Join a game
- `GET /api/games/[id]/password` - Get game password (gated)
- `GET/POST /api/games/[id]/participants` - Participant management
- `GET/POST /api/games/[id]/results` - Game results
- `GET/POST /api/clubs/[id]/announcements` - Announcements

## Project Structure

```
burrfriends/
├── src/
│   ├── app/
│   │   ├── api/          # API routes
│   │   ├── clubs/        # Club pages
│   │   ├── games/        # Game pages
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/       # React components
│   └── lib/              # Utilities and helpers
│       ├── contract-ops.ts # Smart contract interactions
│       ├── crypto/        # Credentials encryption
│       ├── game-registration.ts # Registration logic
│       ├── neynar.ts      # Neynar client
│       └── pokerDb.ts     # Supabase database access
├── contracts/
│   └── BurrfriendsGameEscrow.sol    # Smart contract (deploy via Remix)
├── supabase_migration_*.sql # Database migrations
└── package.json
```

## Testing

### Running Tests

```bash
# Run integration tests
npm run test

# Run integration tests in watch mode
npm run test:watch

# Run E2E tests (Playwright)
npm run test:e2e

# Run production smoke tests
npm run test:smoke
```

### Release Smoke Steps

Before deploying to production, run the smoke test script to verify critical endpoints:

```bash
# Set environment variables
export BASE_URL="https://your-app.vercel.app"
export AUTH_TOKEN="<jwt-token-from-farcaster-quick-auth>"
export TEST_GAME_ID="<game-id-to-test>"
export TEST_TX_HASH="<transaction-hash-to-verify>"
export TEST_FID="<fid-to-check-in-participants>"

# Run smoke test
npm run test:smoke
```

**Getting AUTH_TOKEN**:
- Open browser console on your app
- Run: `await sdk.quickAuth.getToken()`
- Copy the token

**Expected Output**:
```
🚀 Production Smoke Test
Base URL: https://your-app.vercel.app
Game ID: f12b1fa1-c882-4741-afcd-17c0fac1419a
TX Hash: 0xf6fb8bf2cb5bf58c5d5e7d2074b724ceb7b43cc29a69ebb23202d2e8876f8818
FID: 318447

✅ Health Check
✅ Payment Confirm
✅ Participants Check

📊 Test Summary
──────────────────────────────────────────────────
✅ Health Check
✅ Payment Confirm
✅ Participants Check
──────────────────────────────────────────────────

✅ All smoke tests PASSED
```

## Notes

- Uses BETR token (`0x051024B653E8ec69E72693F776c41C2A9401FB07`) instead of EGGS
- Maximum game cost: 100 million BETR
- Shared Supabase instance with poker app, but separate tables for data isolation
- Same master wallet as poker app for contract operations
- Password encryption uses AES-GCM (shared key with poker app for compatibility)
