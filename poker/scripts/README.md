# Poker Seed Scripts

Seed scripts for code-only creation/updates of clubs and members in the `poker.*` schema.

## Setup

1. Install dependencies (includes `tsx` for running TypeScript directly):
   ```bash
   npm install
   ```

2. Ensure environment variables are set:
   - `SUPABASE_URL` OR `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE` OR `SUPABASE_SERVICE_ROLE_KEY`
   - `NEYNAR_API_KEY` (optional, for username resolution in member seeding)

   **Windows CMD (set variables before running):**
   ```cmd
   set SUPABASE_URL=https://your-project.supabase.co
   set SUPABASE_SERVICE_ROLE=your-service-role-key
   npm run seed:clubs
   npm run seed:members
   ```

   **Windows PowerShell:**
   ```powershell
   $env:SUPABASE_URL="https://your-project.supabase.co"
   $env:SUPABASE_SERVICE_ROLE="your-service-role-key"
   npm run seed:clubs

'
   npm run seed:members
   ```

   **Linux/Mac/bash:**
   ```bash
   export SUPABASE_URL=https://your-project.supabase.co
   export SUPABASE_SERVICE_ROLE=your-service-role-key
   npm run seed:clubs
   npm run seed:members
   ```

   **Using .env file (recommended):**
   Create a `.env.local` file in the project root (ensure it's in `.gitignore`):
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE=your-service-role-key
   NEYNAR_API_KEY=your-neynar-key
   ```
   Then run scripts normally (they'll read from `.env.local` if using `dotenv` or Next.js).

3. Edit `seed-data.json` with your clubs and members data.

## Seed Data Format

Edit `scripts/seed-data.json`:

```json
{
  "clubs": [
    {
      "slug": "hellfire",
      "name": "Hellfire Club",
      "description": "Tormental's poker club",
      "owner_fid": 318447
    }
  ],
  "members": {
    "hellfire": [318447, "username1", "username2"],
  }
}
```

- **clubs**: Array of club objects (slug, name, description, owner_fid)
- **members**: Object mapping club slugs to arrays of member identifiers
  - Member identifiers can be:
    - FIDs (numbers): `[318447, 123456]`
    - Usernames (strings): `["username1", "username2"]`
    - Mixed: `[318447, "username1"]`

## Usage

### Seed Clubs

```bash
npm run seed:clubs
```

Creates or updates clubs from `seed-data.json`. Idempotent (safe to run multiple times).

### Seed Members

```bash
npm run seed:members
```

Adds members to clubs from `seed-data.json`. Idempotent (safe to run multiple times).

- Resolves usernames to FIDs via Neynar (non-blocking, fails gracefully)
- Automatically sets owner role for club owners
- Sets other members to 'member' role with 'active' status

## Idempotency

Both scripts are idempotent:
- Clubs: Uses upsert on `slug` (unique constraint)
- Members: Uses upsert on `club_id + fid` (unique constraint)

Safe to run multiple times - will update existing records instead of creating duplicates.

## Safety

- **Only touches `poker.*` schema** - no impact on Catwalk/public schema
- **Uses service role** - requires `SUPABASE_SERVICE_ROLE` env var
- **Validates input** - fails fast on missing required fields
- **Non-blocking Neynar** - username resolution failures don't stop the script

