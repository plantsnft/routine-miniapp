# Cursor Agent Prompt: Build ClubGG Poker Management Farcaster Mini App

## 🎯 Project Goal

Build a new Farcaster Mini App called **"Poker"** that helps manage ClubGG poker games within the Farcaster ecosystem. This app manages game information (passwords, club access, payouts) for games played on ClubGG, but does NOT implement the actual poker game engine. The app facilitates:
- **Club Management**: Control who can join your poker club
- **Password Management**: Store and share game passwords securely
- **Payout Tracking**: Record game results and facilitate payouts via Farcaster wallets
- **Game History**: Track all games and player statistics

This app should be completely separate from the existing "Catwalk" (also called "Routine") mini app and bot, with ZERO impact on existing code.

**CRITICAL REQUIREMENT:** All code must be in a new folder called `poker/` at the workspace root (`C:\miniapps\routine\poker\`). Do NOT modify any files outside this folder.

**DEVELOPMENT APPROACH:** Build this in many small, incremental steps. Each step should be a complete, working feature that adds value. Test each step before moving to the next.

**IMPORTANT CLARIFICATION:** This app does NOT implement poker gameplay. Games are played on ClubGG platform. This app manages:
- Club membership and access control
- Game passwords and information sharing
- Payout tracking and requests
- Game history and player statistics

Think of this as a "ClubGG game management dashboard" for Farcaster users.

---

## 📋 Current Setup Reference

You are working in a workspace that already contains a Farcaster Mini App called "Catwalk" (also referenced as "Routine" in some places). The existing app is located at:

- **Workspace Root:** `C:\miniapps\routine\`
- **Existing App:** Catwalk/Routine (daily check-in app with token price tracking)
- **GitHub Repo:** `https://github.com/plantsnft/routine-miniapp` (default branch: `master`)

### Existing Tech Stack (for reference - reuse patterns, not code)
- **Framework:** Next.js 15 (App Router) with TypeScript
- **UI:** React 19, Tailwind CSS
- **Backend:** Next.js API Routes (serverless functions)
- **Database:** Supabase (PostgreSQL)
- **Authentication:** Farcaster Sign-In with Neynar (SIWN)
- **APIs:** Neynar API, Supabase
- **Hosting:** Vercel
- **Version Control:** GitHub

### Key Files to Reference (DO NOT MODIFY - only use as patterns)
- `src/app/api/siwn/route.ts` - SIWN authentication pattern
- `src/lib/neynar.ts` - Neynar client setup
- `src/lib/supabase.ts` - Supabase client and database operations
- `src/lib/constants.ts` - App constants and configuration
- `package.json` - Dependencies and scripts
- `next.config.ts` - Next.js configuration
- `vercel.json` - Vercel deployment configuration
- `tailwind.config.ts` - Tailwind CSS configuration

---

## 🏗️ New Project Structure

Create the poker app in a completely new folder structure:

```
C:\miniapps\routine\
├── poker/                          # NEW FOLDER - All poker app code goes here
│   ├── src/
│   │   ├── app/                    # Next.js App Router
│   │   │   ├── api/                # API routes
│   │   │   │   ├── siwn/           # SIWN authentication
│   │   │   │   ├── games/          # Game management endpoints
│   │   │   │   ├── players/        # Player management endpoints
│   │   │   │   └── ...
│   │   │   ├── page.tsx            # Root page
│   │   │   ├── layout.tsx          # Root layout
│   │   │   └── providers.tsx       # React providers
│   │   ├── components/
│   │   │   ├── App.tsx             # Main app container
│   │   │   ├── ui/                 # UI components
│   │   │   │   ├── tabs/          # Tab components
│   │   │   │   └── ...
│   │   ├── hooks/                  # React hooks
│   │   ├── lib/                    # Utilities and helpers
│   │   │   ├── neynar.ts          # Neynar client
│   │   │   ├── supabase.ts        # Supabase client
│   │   │   ├── constants.ts       # App constants
│   │   │   └── ...
│   │   └── types/                  # TypeScript types
│   ├── public/                     # Static assets
│   ├── package.json                # Dependencies
│   ├── next.config.ts              # Next.js config
│   ├── tailwind.config.ts          # Tailwind config
│   ├── tsconfig.json               # TypeScript config
│   ├── vercel.json                 # Vercel config
│   ├── .env.local                  # Local environment variables (gitignored)
│   └── README.md                   # Project documentation
│
├── catwalkagent/                   # EXISTING - DO NOT MODIFY
├── src/                            # EXISTING - DO NOT MODIFY
├── package.json                    # EXISTING - DO NOT MODIFY
└── ...                             # ALL OTHER EXISTING FILES - DO NOT MODIFY
```

---

## 🛠️ Technology Stack

Use the same technologies as the existing app, but set up independently:

1. **Neynar** - For Farcaster authentication and user data
   - Use Neynar Starter plan (same as existing app)
   - Implement SIWN (Sign-In with Neynar) authentication
   - Use `@neynar/nodejs-sdk` for server-side operations
   - Use `@neynar/react` for client-side components

2. **Supabase** - For database storage
   - Create a NEW Supabase project (separate from Catwalk app)
   - Store game state, player data, game history
   - Use PostgreSQL for relational data

3. **Vercel** - For hosting and deployment
   - Create a NEW Vercel project for the poker app
   - Deploy as a separate Next.js application
   - Configure environment variables independently

4. **GitHub** - For version control
   - Option 1: Create a new repository for the poker app
   - Option 2: Create a new branch in the existing repo (if user prefers)
   - Keep code completely separate from existing app

5. **Farcaster Wallets** - For payout management
   - Users link their Farcaster wallet addresses
   - Display wallet addresses for payout recipients
   - Track payout status (payouts are manual, not automated)
   - Use Farcaster wallet SDK if needed for wallet operations

---

## 🎮 ClubGG Poker Management Features

### Core Features (MVP - Build Incrementally)

#### Step 1: Authentication & User Profiles
1. **User Authentication**
   - Sign in with Farcaster (SIWN)
   - Store user FID and profile data
   - Session management
   - Create user profile on first sign-in

#### Step 2: Club Management
2. **Club Creation & Membership**
   - Create a poker club (linked to ClubGG club)
   - Set club name, description, ClubGG club ID
   - Club owner/admin role management
   - Member list display

3. **Access Control**
   - Whitelist: Only approved FIDs can join
   - Blacklist: Block specific FIDs from joining
   - Open club: Anyone can join
   - Invite-only: Only invited FIDs can join
   - View/manage club members

#### Step 3: Game Password Management
4. **Game Information Storage**
   - Create game entries (linked to ClubGG game)
   - Store game password (encrypted)
   - Game details: date, time, buy-in, game type
   - ClubGG game ID/link storage

5. **Password Sharing**
   - Share password with approved club members only
   - Time-limited password access (expires after game starts)
   - One-time password reveal (prevents re-sharing)
   - Password visibility based on membership status

#### Step 4: Payout Management
6. **Game Results Tracking**
   - Record game results (who won, payouts)
   - Store payout amounts per player
   - Track buy-ins and total pot
   - Game completion status

7. **Farcaster Wallet Integration**
   - Link Farcaster wallet addresses to FIDs
   - Display wallet addresses for payouts
   - Payout request system (winner requests payout)
   - Payout status tracking (pending, completed, failed)
   - Payout history

#### Step 5: Game History & Statistics
8. **Game History**
   - View all past games
   - Filter by date, club, player
   - Game details (participants, results, payouts)
   - Export game history

9. **Player Statistics**
   - Total games played
   - Total winnings/losses
   - Win rate
   - Biggest win/loss
   - Player leaderboard

### Future Features (Nice to Have - After MVP)
- Game scheduling/calendar
- Automated payout reminders
- Club analytics dashboard
- Integration with ClubGG API (if available)
- Notifications for new games
- Social sharing (share wins to Warpcast)
- Tournament bracket management

---

## 📊 Database Schema (Supabase)

Create the following tables in a NEW Supabase project. Build them incrementally as you implement each feature.

### Step 1: `users` Table (Authentication & Profiles)
```sql
CREATE TABLE public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fid bigint NOT NULL UNIQUE,
  username text,
  display_name text,
  wallet_address text, -- Farcaster wallet address for payouts
  inserted_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX users_fid_unique ON public.users (fid);
CREATE INDEX users_wallet_address_idx ON public.users (wallet_address);
```

### Step 2: `clubs` Table (Club Management)
```sql
CREATE TABLE public.clubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_fid bigint NOT NULL REFERENCES public.users(fid),
  name text NOT NULL,
  description text,
  clubgg_club_id text, -- ClubGG club identifier
  access_type text NOT NULL DEFAULT 'open', -- 'open', 'whitelist', 'blacklist', 'invite_only'
  inserted_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX clubs_owner_fid_idx ON public.clubs (owner_fid);
```

### Step 3: `club_members` Table (Membership Management)
```sql
CREATE TABLE public.club_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  member_fid bigint NOT NULL REFERENCES public.users(fid),
  role text NOT NULL DEFAULT 'member', -- 'owner', 'admin', 'member'
  status text NOT NULL DEFAULT 'active', -- 'active', 'banned', 'pending'
  inserted_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(club_id, member_fid)
);

CREATE INDEX club_members_club_id_idx ON public.club_members (club_id);
CREATE INDEX club_members_member_fid_idx ON public.club_members (member_fid);
```

### Step 4: `club_access_lists` Table (Whitelist/Blacklist)
```sql
CREATE TABLE public.club_access_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  fid bigint NOT NULL,
  list_type text NOT NULL, -- 'whitelist', 'blacklist'
  inserted_at timestamptz DEFAULT now(),
  UNIQUE(club_id, fid, list_type)
);

CREATE INDEX club_access_lists_club_id_idx ON public.club_access_lists (club_id);
CREATE INDEX club_access_lists_fid_idx ON public.club_access_lists (fid);
```

### Step 5: `games` Table (Game Information)
```sql
CREATE TABLE public.games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  creator_fid bigint NOT NULL REFERENCES public.users(fid),
  clubgg_game_id text, -- ClubGG game identifier/link
  game_password_encrypted text, -- Encrypted password
  game_password_hash text, -- Hash for verification (optional)
  game_name text,
  game_type text, -- 'cash_game', 'tournament', 'sit_and_go'
  buy_in_amount numeric,
  scheduled_time timestamptz,
  status text NOT NULL DEFAULT 'scheduled', -- 'scheduled', 'active', 'completed', 'cancelled'
  password_expires_at timestamptz, -- When password access expires
  inserted_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX games_club_id_idx ON public.games (club_id);
CREATE INDEX games_creator_fid_idx ON public.games (creator_fid);
CREATE INDEX games_status_idx ON public.games (status);
CREATE INDEX games_scheduled_time_idx ON public.games (scheduled_time);
```

### Step 6: `game_participants` Table (Who's Playing)
```sql
CREATE TABLE public.game_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_fid bigint NOT NULL REFERENCES public.users(fid),
  buy_in_amount numeric NOT NULL,
  has_seen_password boolean NOT NULL DEFAULT false,
  password_viewed_at timestamptz,
  inserted_at timestamptz DEFAULT now(),
  UNIQUE(game_id, player_fid)
);

CREATE INDEX game_participants_game_id_idx ON public.game_participants (game_id);
CREATE INDEX game_participants_player_fid_idx ON public.game_participants (player_fid);
```

### Step 7: `game_results` Table (Payout Tracking)
```sql
CREATE TABLE public.game_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_fid bigint NOT NULL REFERENCES public.users(fid),
  position integer, -- Final position (1 = winner)
  buy_in_amount numeric NOT NULL,
  payout_amount numeric NOT NULL DEFAULT 0, -- Positive for win, negative/zero for loss
  net_profit numeric NOT NULL, -- payout_amount - buy_in_amount
  notes text, -- Optional notes about the game
  inserted_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX game_results_game_id_idx ON public.game_results (game_id);
CREATE INDEX game_results_player_fid_idx ON public.game_results (player_fid);
```

### Step 8: `payouts` Table (Payout Management)
```sql
CREATE TABLE public.payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id),
  payer_fid bigint NOT NULL REFERENCES public.users(fid), -- Who should pay
  recipient_fid bigint NOT NULL REFERENCES public.users(fid), -- Who should receive
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USD', -- 'USD', 'ETH', 'USDC', etc.
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'requested', 'completed', 'failed', 'cancelled'
  recipient_wallet_address text, -- Wallet address for payout
  transaction_hash text, -- Blockchain transaction hash if completed
  requested_at timestamptz,
  completed_at timestamptz,
  notes text,
  inserted_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX payouts_game_id_idx ON public.payouts (game_id);
CREATE INDEX payouts_payer_fid_idx ON public.payouts (payer_fid);
CREATE INDEX payouts_recipient_fid_idx ON public.payouts (recipient_fid);
CREATE INDEX payouts_status_idx ON public.payouts (status);
```

---

## 🔐 Environment Variables

Create a `.env.local` file in the `poker/` folder with the following variables:

### Required (Server & Client)
```env
NEXT_PUBLIC_URL=https://poker-[your-project].vercel.app
NEXT_PUBLIC_APP_NAME=Poker
NEXT_PUBLIC_APP_DESCRIPTION=Play poker with your Farcaster friends
NEXT_PUBLIC_APP_BUTTON_TEXT=Play Poker
NEXT_PUBLIC_FARCASTER_NETWORK=mainnet
NEXT_PUBLIC_SUPABASE_URL=[your-new-supabase-project-url]
NEXT_PUBLIC_SUPABASE_ANON_KEY=[your-new-supabase-anon-key]
```

### Required (Server Only)
```env
NEYNAR_API_KEY=[your-neynar-api-key]
NEYNAR_CLIENT_ID=[your-neynar-client-id]
SUPABASE_SERVICE_ROLE=[your-new-supabase-service-role-key]
SEED_PHRASE=[your-signer-seed-phrase-12-words]
SPONSOR_SIGNER=true
```

### Optional (if using OpenAI)
```env
OPENAI_API_KEY=[your-openai-api-key]
```

**IMPORTANT:** 
- Use a NEW Supabase project (not the same one as Catwalk)
- You can reuse the same Neynar API key if you have one
- Set up a new Vercel project for deployment
- Never commit `.env.local` to git

---

## 📦 Dependencies

Install the following packages in `poker/package.json`:

### Core Dependencies
```json
{
  "dependencies": {
    "@farcaster/auth-client": ">=0.3.0 <1.0.0",
    "@farcaster/mini-app-solana": ">=0.0.17 <1.0.0",
    "@farcaster/miniapp-node": ">=0.1.5 <1.0.0",
    "@farcaster/miniapp-sdk": ">=0.1.6 <1.0.0",
    "@farcaster/miniapp-wagmi-connector": "^1.0.0",
    "@farcaster/quick-auth": ">=0.0.7 <1.0.0",
    "@neynar/nodejs-sdk": "^2.19.0",
    "@neynar/react": "^1.2.15",
    "@tanstack/react-query": "^5.61.0",
    "next": "^15",
    "react": "^19",
    "react-dom": "^19",
    "siwe": "^3.0.0",
    "zod": "^3.24.2",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.6.0",
    "lucide-react": "^0.469.0"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "typescript": "^5",
    "tailwindcss": "^3.4.1",
    "postcss": "^8",
    "eslint": "^8",
    "eslint-config-next": "15.0.3"
  }
}
```

---

## 🚀 Implementation Steps (Incremental Approach)

Build this app in many small, working steps. Each step should be complete and testable before moving to the next.

### Step 1: Project Foundation
**Goal:** Get basic Next.js app running with authentication

1. Create `poker/` folder structure
2. Initialize Next.js 15 with TypeScript
3. Set up Tailwind CSS
4. Install core dependencies
5. Create basic layout and page structure
6. Set up Supabase project (new project)
7. Implement SIWN authentication (`/api/siwn`)
8. Create Neynar client utility
9. Test: User can sign in with Farcaster

### Step 2: User Profiles
**Goal:** Store and display user information

10. Create `users` table in Supabase
11. Implement user profile creation on first sign-in
12. Create `/api/users` endpoint (GET, POST)
13. Build user profile UI component
14. Test: User profile is created and displayed

### Step 3: Club Creation
**Goal:** Users can create poker clubs

15. Create `clubs` table in Supabase
16. Implement `/api/clubs` endpoint (POST to create)
17. Build club creation form UI
18. Display user's clubs list
19. Test: User can create a club

### Step 4: Club Membership (Basic)
**Goal:** Track club members

20. Create `club_members` table
21. Implement `/api/clubs/[id]/members` endpoint
22. Add "Join Club" functionality
23. Display club member list
24. Test: Users can join clubs and see members

### Step 5: Access Control - Whitelist/Blacklist
**Goal:** Control who can join clubs

25. Create `club_access_lists` table
26. Implement access control logic (check whitelist/blacklist)
27. Add UI to manage whitelist/blacklist
28. Update join club logic to check access
29. Test: Whitelist/blacklist works correctly

### Step 6: Game Creation
**Goal:** Create game entries with ClubGG info

30. Create `games` table
31. Implement `/api/games` endpoint (POST to create)
32. Build game creation form (name, ClubGG ID, password, etc.)
33. Display games list for a club
34. Test: User can create games

### Step 7: Password Storage (Encrypted)
**Goal:** Securely store game passwords

35. Implement password encryption (use simple encryption or hashing)
36. Store encrypted password in database
37. Add password field to game creation form
38. Test: Passwords are stored securely

### Step 8: Password Sharing (Basic)
**Goal:** Share passwords with club members

39. Create `game_participants` table
40. Implement password reveal for club members
41. Add "View Password" button (only for members)
42. Track who has seen password
43. Test: Members can view passwords, non-members cannot

### Step 9: Password Expiration
**Goal:** Passwords expire after game starts

44. Add password expiration logic
45. Update password reveal to check expiration
46. Add UI indicator for expired passwords
47. Test: Expired passwords cannot be viewed

### Step 10: Game Participants
**Goal:** Track who's playing in each game

48. Implement participant management (`/api/games/[id]/participants`)
49. Add "Join Game" functionality
50. Display participant list for each game
51. Test: Users can join games and see participants

### Step 11: Wallet Address Management
**Goal:** Link wallet addresses for payouts

52. Add wallet address field to user profile
53. Implement wallet address update endpoint
54. Build wallet address input UI
55. Display wallet addresses in user profiles
56. Test: Users can add/update wallet addresses

### Step 12: Game Results Entry
**Goal:** Record game results and payouts

57. Create `game_results` table
58. Implement `/api/games/[id]/results` endpoint (POST)
59. Build results entry form (player, position, payout)
60. Display results for completed games
61. Test: Game results can be recorded

### Step 13: Payout Tracking
**Goal:** Track payout requests and status

64. Create `payouts` table
65. Implement `/api/payouts` endpoint
66. Build payout request UI
67. Display payout status (pending, completed, etc.)
68. Test: Payouts can be requested and tracked

### Step 14: Payout History
**Goal:** View payout history

69. Implement payout history endpoint
70. Build payout history UI
71. Add filters (by game, player, status)
72. Test: Payout history is displayed correctly

### Step 15: Game History
**Goal:** View all past games

73. Implement game history endpoint with filters
74. Build game history UI
75. Add search/filter functionality
76. Test: Game history displays correctly

### Step 16: Player Statistics
**Goal:** Display player stats

77. Calculate player statistics (total games, wins, losses, net profit)
78. Implement `/api/players/[fid]/stats` endpoint
79. Build player stats UI component
80. Test: Statistics are calculated and displayed correctly

### Step 17: Leaderboard
**Goal:** Show top players

81. Implement leaderboard endpoint
82. Build leaderboard UI
83. Add sorting options (by wins, profit, games played)
84. Test: Leaderboard displays correctly

### Step 18: UI Polish & Navigation
**Goal:** Improve user experience

85. Create tab-based navigation (Home, Clubs, Games, History, Profile)
86. Build HomeTab (dashboard with recent games, stats)
87. Build ClubsTab (manage clubs)
88. Build GamesTab (view/create games)
89. Build HistoryTab (game history)
90. Build ProfileTab (user profile and stats)
91. Test: Navigation works smoothly

### Step 19: Testing & Deployment
**Goal:** Deploy to production

92. Test all features locally with Warpcast Preview
93. Set up Vercel project
94. Configure all environment variables
95. Deploy to Vercel
96. Test in production environment
97. Fix any production issues

---

## 📝 API Endpoints to Implement (Build Incrementally)

### Authentication (Step 1)
- `GET /api/siwn` - Get SIWN params from query string
- `POST /api/siwn` - Validate SIWN signature and return user FID

### Users (Step 2)
- `GET /api/users?fid={fid}` - Get user profile
- `POST /api/users` - Create/update user profile
- `PATCH /api/users/[fid]` - Update user (e.g., wallet address)

### Clubs (Step 3-5)
- `GET /api/clubs` - List clubs (with filters: owner, member, etc.)
- `POST /api/clubs` - Create new club
- `GET /api/clubs/[id]` - Get club details
- `PATCH /api/clubs/[id]` - Update club (name, description, access type)
- `DELETE /api/clubs/[id]` - Delete club (owner only)
- `GET /api/clubs/[id]/members` - Get club members
- `POST /api/clubs/[id]/members` - Add member to club
- `DELETE /api/clubs/[id]/members/[fid]` - Remove member from club
- `GET /api/clubs/[id]/access-list` - Get whitelist/blacklist
- `POST /api/clubs/[id]/access-list` - Add to whitelist/blacklist
- `DELETE /api/clubs/[id]/access-list/[fid]` - Remove from access list
- `POST /api/clubs/[id]/join` - Request to join club (checks access control)

### Games (Step 6-10)
- `GET /api/games` - List games (with filters: club, status, date, etc.)
- `POST /api/games` - Create new game
- `GET /api/games/[id]` - Get game details
- `PATCH /api/games/[id]` - Update game (status, etc.)
- `DELETE /api/games/[id]` - Delete game (creator only)
- `GET /api/games/[id]/password` - Get game password (members only, checks expiration)
- `GET /api/games/[id]/participants` - Get game participants
- `POST /api/games/[id]/participants` - Add participant to game
- `DELETE /api/games/[id]/participants/[fid]` - Remove participant

### Game Results (Step 12)
- `GET /api/games/[id]/results` - Get game results
- `POST /api/games/[id]/results` - Record game results (multiple players)
- `PATCH /api/games/[id]/results/[result_id]` - Update result entry

### Payouts (Step 13-14)
- `GET /api/payouts` - List payouts (with filters: game, player, status)
- `POST /api/payouts` - Create payout request
- `GET /api/payouts/[id]` - Get payout details
- `PATCH /api/payouts/[id]` - Update payout status (pending → completed, etc.)
- `GET /api/payouts/history` - Get payout history for user

### Statistics (Step 16-17)
- `GET /api/players/[fid]/stats` - Get player statistics
- `GET /api/leaderboard` - Get leaderboard (with sort options: wins, profit, games)

---

## 🎨 UI Components Structure

### Main App (`src/components/App.tsx`)
- Tab-based navigation (similar to existing app)
- Tabs: Home, Clubs, Games, History, Profile

### Tab Components
- `HomeTab.tsx` - Dashboard with recent games, quick stats, upcoming games
- `ClubsTab.tsx` - List user's clubs, create new club, manage club settings
- `GamesTab.tsx` - List games, create new game, view game details
- `HistoryTab.tsx` - Game history with filters, search
- `ProfileTab.tsx` - User profile, wallet address, statistics

### Club Components
- `ClubCard.tsx` - Display club info (name, member count, access type)
- `ClubForm.tsx` - Create/edit club form
- `ClubMembersList.tsx` - List of club members with roles
- `AccessListManager.tsx` - Manage whitelist/blacklist
- `JoinClubButton.tsx` - Join club button with access check

### Game Components
- `GameCard.tsx` - Display game info (name, date, participants, status)
- `GameForm.tsx` - Create/edit game form (ClubGG ID, password, etc.)
- `PasswordDisplay.tsx` - Show password (with expiration check, one-time view)
- `GameParticipantsList.tsx` - List of game participants
- `GameResultsForm.tsx` - Enter game results (players, positions, payouts)

### Payout Components
- `PayoutCard.tsx` - Display payout info (amount, status, recipient)
- `PayoutRequestForm.tsx` - Request payout form
- `PayoutHistoryList.tsx` - List of payouts with filters

### Statistics Components
- `PlayerStats.tsx` - Display player statistics
- `Leaderboard.tsx` - Top players leaderboard with sorting

---

## 🔒 Security Considerations

1. **Authentication**
   - Always verify FID via SIWN before allowing any actions
   - Validate user owns the FID they claim
   - Check user permissions (club owner, admin, member) before sensitive operations

2. **Access Control**
   - Verify club membership before allowing access to club resources
   - Check whitelist/blacklist before allowing club joins
   - Only club owners/admins can modify club settings
   - Only game creators can modify game details

3. **Password Security**
   - Encrypt passwords before storing in database
   - Only share passwords with approved club members
   - Check password expiration before revealing
   - Track who has viewed passwords (optional: one-time view)

4. **Database**
   - Use Supabase RLS policies to restrict access
   - Never expose service role key to client
   - Validate all inputs before database operations
   - Use parameterized queries to prevent SQL injection

5. **Rate Limiting**
   - Implement rate limiting on API routes
   - Prevent spam/abuse (especially on password reveal endpoints)
   - Limit password view attempts

6. **Data Validation**
   - Validate all user inputs (club names, game info, amounts)
   - Sanitize data before storing
   - Validate wallet addresses format
   - Check numeric values (amounts, FIDs) are valid

---

## 🧪 Testing Strategy

1. **Local Development (Each Step)**
   - Test with `npm run dev`
   - Use Warpcast Mini-App Preview with ngrok
   - Test authentication flow
   - Test each feature as you build it

2. **Access Control Testing**
   - Test whitelist/blacklist logic
   - Test club membership verification
   - Test password access restrictions
   - Test owner/admin permissions

3. **Password Security Testing**
   - Test password encryption/decryption
   - Test password expiration logic
   - Test access restrictions (non-members can't view)
   - Test one-time view tracking (if implemented)

4. **Integration Testing**
   - Test Supabase operations (CRUD for all tables)
   - Test Neynar API calls (user lookup, etc.)
   - Test end-to-end flows (create club → create game → share password → record results)

5. **Production Testing**
   - Deploy to Vercel
   - Test in production environment
   - Test with real Farcaster accounts
   - Monitor for errors and performance issues
   - Test payout tracking workflow

---

## 📚 Key Files to Create (Build Incrementally)

### Core Files (Step 1-2)
- `poker/src/lib/neynar.ts` - Neynar client (reference existing, but create new)
- `poker/src/lib/supabase.ts` - Supabase client and database functions
- `poker/src/lib/constants.ts` - App constants
- `poker/src/lib/types.ts` - TypeScript types
- `poker/src/lib/crypto.ts` - Password encryption/decryption utilities

### API Routes (Build as needed per step)
- `poker/src/app/api/siwn/route.ts` - SIWN authentication
- `poker/src/app/api/users/route.ts` - User operations
- `poker/src/app/api/clubs/route.ts` - Club CRUD operations
- `poker/src/app/api/clubs/[id]/route.ts` - Individual club operations
- `poker/src/app/api/clubs/[id]/members/route.ts` - Club membership
- `poker/src/app/api/clubs/[id]/access-list/route.ts` - Whitelist/blacklist
- `poker/src/app/api/games/route.ts` - Game CRUD operations
- `poker/src/app/api/games/[id]/route.ts` - Individual game operations
- `poker/src/app/api/games/[id]/password/route.ts` - Password retrieval
- `poker/src/app/api/games/[id]/results/route.ts` - Game results
- `poker/src/app/api/payouts/route.ts` - Payout operations
- `poker/src/app/api/players/[fid]/stats/route.ts` - Player statistics
- `poker/src/app/api/leaderboard/route.ts` - Leaderboard

### Components (Build incrementally)
- `poker/src/components/App.tsx` - Main app container with tabs
- `poker/src/components/ui/tabs/HomeTab.tsx` - Dashboard
- `poker/src/components/ui/tabs/ClubsTab.tsx` - Club management
- `poker/src/components/ui/tabs/GamesTab.tsx` - Game management
- `poker/src/components/ui/tabs/HistoryTab.tsx` - Game history
- `poker/src/components/ui/tabs/ProfileTab.tsx` - User profile
- `poker/src/components/clubs/ClubCard.tsx` - Club display
- `poker/src/components/clubs/ClubForm.tsx` - Club creation/edit
- `poker/src/components/games/GameCard.tsx` - Game display
- `poker/src/components/games/GameForm.tsx` - Game creation/edit
- `poker/src/components/games/PasswordDisplay.tsx` - Password reveal

---

## ⚠️ Critical Rules

1. **ZERO IMPACT ON EXISTING CODE**
   - Never modify files outside `poker/` folder
   - Never change existing `package.json`, `tsconfig.json`, or any root-level files
   - Keep all poker app code completely isolated

2. **Independent Setup**
   - Use NEW Supabase project (not existing one)
   - Create NEW Vercel project
   - Set up NEW environment variables
   - Can reuse Neynar API key if available

3. **Code Reuse vs. Copying**
   - Reference existing code patterns (SIWN, Supabase setup, etc.)
   - Adapt patterns to poker app needs
   - Don't copy-paste code directly - understand and implement fresh

4. **Git Strategy**
   - Option 1: New repository for poker app
   - Option 2: New branch in existing repo (if user prefers)
   - Keep commits separate from existing app

---

## 🎯 Success Criteria (MVP Complete When)

The ClubGG poker management app MVP is complete when:

1. ✅ Users can sign in with Farcaster (SIWN)
2. ✅ Users can create poker clubs
3. ✅ Club access control works (whitelist/blacklist/open/invite-only)
4. ✅ Users can create game entries with ClubGG info and passwords
5. ✅ Game passwords are stored securely and shared only with club members
6. ✅ Passwords expire after game starts
7. ✅ Game results can be recorded (players, positions, payouts)
8. ✅ Payouts can be tracked (pending, completed, etc.)
9. ✅ Wallet addresses are linked to user profiles
10. ✅ Game history is viewable with filters
11. ✅ Player statistics are calculated and displayed
12. ✅ Leaderboard shows top players
13. ✅ App is deployed to Vercel and accessible
14. ✅ No existing code (Catwalk/Routine) is modified

---

## 📞 Resources

- **Neynar Docs:** https://docs.neynar.com/
- **Farcaster Docs:** https://docs.farcaster.xyz/
- **Next.js Docs:** https://nextjs.org/docs
- **Supabase Docs:** https://supabase.com/docs
- **Vercel Docs:** https://vercel.com/docs
- **ClubGG:** https://www.clubgg.net/ (poker platform - games are played here)
- **Farcaster Wallets:** https://docs.farcaster.xyz/reference/wallets (for payout integration)

---

## 🚨 Important Notes

1. **Incremental Development:** Build in small, complete steps. Each step should be working and testable before moving to the next.

2. **Test Each Step:** After completing each step, test it thoroughly before proceeding. Don't build multiple features at once.

3. **ClubGG Integration:** This app manages ClubGG games but does NOT implement poker gameplay. Games are played on ClubGG platform. This app only manages:
   - Club membership and access
   - Game passwords and information
   - Payout tracking and requests
   - Game history and statistics

4. **Password Security:** 
   - Store passwords encrypted in the database
   - Only share with approved club members
   - Implement expiration logic
   - Consider one-time view tracking

5. **Access Control:** 
   - Always verify user permissions (club membership, ownership, etc.)
   - Check whitelist/blacklist before allowing actions
   - Validate FID ownership via SIWN

6. **Payouts:** 
   - Payouts are tracked but NOT automatically executed
   - Users must manually send payments via Farcaster wallets
   - Track payout status (pending → completed)
   - Store wallet addresses for recipients

7. **Ask Questions:** If unclear about requirements, ask the user before implementing

8. **Document:** Keep code well-commented and maintainable

9. **Error Handling:** Always handle errors gracefully with user-friendly messages

10. **Security First:** Validate all inputs, authenticate all requests, use RLS policies in Supabase

---

## 🎬 Getting Started

**Ready to start? Begin with Step 1: Project Foundation.**

1. Create the `poker/` folder at workspace root
2. Initialize Next.js 15 project with TypeScript
3. Set up basic authentication
4. Test that users can sign in

**Then proceed step-by-step through each numbered step above.**


