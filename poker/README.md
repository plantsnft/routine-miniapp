# Poker Mini App

Farcaster Mini App for managing ClubGG poker games for Hellfire Club (MVP-only).

## Features

- **Authentication**: Sign in with Farcaster (Quick Auth JWT)
- **Open Signup**: Any Farcaster user can join games (no roster/membership required)
- **Global Blocklist**: Admins can block users from joining games or making payments
- **Club Management**: Hellfire Club (MVP-only, single club)
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
cd poker
npm install
```

2. Set up Supabase:
   - Create a new Supabase project
   - Run the SQL schema from `supabase_schema.sql` in the Supabase SQL Editor
   - Get your project URL, anon key, and service role key

3. Get Neynar API credentials:
   - Sign up at https://neynar.com
   - Get your API key and Client ID

4. Create `.env.local` in the `poker/` directory:
```env
NEXT_PUBLIC_APP_NAME=Farcaster Poker
NEXT_PUBLIC_APP_DESCRIPTION=Hellfire Club ClubGG manager
NEXT_PUBLIC_FARCASTER_NETWORK=mainnet

NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE=your_supabase_service_role_key

NEYNAR_API_KEY=your_neynar_api_key
NEYNAR_CLIENT_ID=your_neynar_client_id

SEED_PHRASE=your twelve word seed phrase
SPONSOR_SIGNER=true

HELLFIRE_OWNER_FID=tormental_fid_number
TORMENTAL_FID=tormental_fid_number

NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

5. Run development server:
```bash
npm run dev
```

6. Seed the clubs (first time only):
   - Visit `/api/clubs` with POST request (or the clubs page will auto-seed)

## Database Schema

The app uses the following main tables:
- `users` - Farcaster users
- `clubs` - Hellfire Club (MVP-only)
- `club_members` - Club membership
- `games` - Scheduled poker games
- `game_participants` - Player participation and eligibility
- `game_results` - Game results and positions
- `payouts` - Payout records
- `club_announcements` - Club announcements/broadcasts

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
poker/
├── src/
│   ├── app/
│   │   ├── api/          # API routes
│   │   ├── clubs/        # Club pages
│   │   ├── games/        # Game pages
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/       # React components
│   └── lib/              # Utilities and helpers
│       ├── betrmint.ts   # Betrmint integration (stub)
│       ├── crypto.ts     # Password encryption
│       ├── eligibility.ts # Eligibility checking
│       ├── neynar.ts     # Neynar client
│       └── supabase.ts   # Supabase client
├── supabase_schema.sql   # Database schema
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

- Betrmint integration is currently stubbed and needs real API integration
- Password encryption uses simple base64 (MVP) - should be upgraded for production
- RLS policies are basic and may need refinement for production
