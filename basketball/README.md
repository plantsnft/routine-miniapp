# Basketball Sim - Daily Team Simulation Game

A lightweight basketball team-owner simulation game built for Farcaster.

## Features

- **4 human-controlled teams** in one shared league
- **Dual Authentication**: Farcaster (Neynar SIWN) + Email (Supabase Auth)
- **Daily Decisions**: Train or prep on offdays, set gameplans for next game
- **Automated Game Simulation**: Games run daily via Vercel cron
- **Full Season Cycle**: Regular season → Playoffs → Offseason → Draft
- **Complete Stats**: Team records, player stats, game logs

## Tech Stack

- **Frontend**: Next.js 15.5.9+ (App Router)
- **Backend**: Supabase (PostgreSQL with `basketball.*` schema)
- **Auth**: Neynar SIWN (Farcaster) + Supabase Auth (Email)
- **Deployment**: Vercel (with cron jobs)
- **Language**: TypeScript

## Quick Start

### Prerequisites

- Node.js 18+
- Supabase account (uses existing "Catwalk Ai Agent" project)
- Neynar API key
- Vercel account

### Local Development

```bash
# Clone repository
git clone https://github.com/plantsnft/basketball.git
cd basketball

# Install dependencies
npm install

# Set up environment variables
cp .env.local.example .env.local
# Edit .env.local with your values

# Run development server
npm run dev
```

### Environment Variables

See `.env.local.example` for required variables:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE`
- `NEYNAR_API_KEY`
- `NEXT_PUBLIC_BASE_URL`

## Deployment

See `DEPLOYMENT_PLAN.md` for complete deployment instructions.

**Quick Steps**:
1. Push to GitHub
2. Run Supabase migration (`supabase_migration_basketball_schema.sql`)
3. Create Vercel project (Root Directory = `.`)
4. Add environment variables
5. Deploy

## Documentation

- **Source of Truth**: `docs/SOURCE_OF_TRUTH.md` - Complete implementation guide
- **End-to-End Flow**: `docs/END_TO_END_FLOW.md` - Testing checklist
- **Deployment Plan**: `DEPLOYMENT_PLAN.md` - Production deployment guide

## Project Structure

```
basketball/
├── src/
│   ├── app/              # Next.js App Router pages & API routes
│   ├── components/       # React components
│   ├── lib/              # Utilities (DB, auth, game simulation)
│   └── hooks/            # React hooks
├── docs/                 # Documentation
├── supabase_migration_*.sql  # Database migrations
└── vercel.json           # Vercel cron configuration
```

## License

MIT
