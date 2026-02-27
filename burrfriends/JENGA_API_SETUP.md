# JENGA API Setup Checklist

Use this to verify the JENGA API is correctly set up. If JENGA doesn’t work, run through these steps.

---

## Quick copy-paste tests (burrfriends.vercel.app)

**1. Go to the burrfriends folder (so you're in the right place):**
```bash
cd c:\miniapps\routine\burrfriends
```

**2. Health check** (curl works from any folder; run from here or any terminal):
```bash
curl -s "https://burrfriends.vercel.app/api/jenga/health"
```

**3. Active games:**
```bash
curl -s "https://burrfriends.vercel.app/api/jenga/games/active"
```

---

## 1. Database: run the migration

The `poker.jenga_games` table (and related tables) must exist in the **`poker`** schema.

1. Open **Supabase Dashboard** → your project → **SQL Editor**
2. Run the migration **`supabase_migration_jenga.sql`** (in `c:\miniapps\routine\burrfriends\` — copy its contents into the SQL Editor)
3. Confirm it creates:
   - `poker.jenga_games`
   - `poker.jenga_signups`
   - `poker.jenga_moves`
   - `poker.jenga_settlements`

The `poker` schema must be exposed in the Supabase PostgREST API (it usually is if BUDDY UP / BETR GUESSER work).

---

## 2. Environment (Vercel / local)

**What you have (from your Vercel screenshot):**

| Variable | Used for JENGA? |
|----------|------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ Yes – Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Other features (JENGA uses service role) |
| `SUPABASE_SERVICE_ROLE` | ✅ Yes – service role key (bypasses RLS, required for `pokerDb`) |
| `NEYNAR_API_KEY` | Other features (Neynar) |

**For JENGA you need:** `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE`. The app also checks `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as fallbacks; if you only have the `NEXT_PUBLIC_` and `SUPABASE_SERVICE_ROLE` names above, that’s enough.

---

## 3. Health check: `GET /api/jenga/health`

**Purpose:** Check that Supabase env is set and `poker.jenga_games` is readable.

**Request (copy-paste):**  
*(If you want to be in the project folder first: `cd c:\miniapps\routine\burrfriends`)*
```bash
curl -s "https://burrfriends.vercel.app/api/jenga/health"
```

**Success (200):**
```json
{
  "ok": true,
  "data": {
    "database": "ok",
    "table": "jenga_games",
    "canRead": true,
    "sampleCount": 0
  }
}
```

**Failure (500):**  
`ok: false` and an `error` message, for example:
- `"Supabase not configured..."` → in Vercel set `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE` (you already have these if BUDDY UP works)
- `"poker.jenga_games may not exist..."` → run `supabase_migration_jenga.sql` in the `poker` schema

---

## 4. Active games: `GET /api/jenga/games/active`

**Purpose:** Public endpoint for active JENGA games (signup + in_progress). No auth.

**Request (copy-paste):**  
*(If you want to be in the project folder first: `cd c:\miniapps\routine\burrfriends`)*
```bash
curl -s "https://burrfriends.vercel.app/api/jenga/games/active"
```

**Success (200):**
```json
{
  "ok": true,
  "data": [
    { "id": "...", "title": "JENGA", "status": "signup", "prize_amount": 10, ... }
  ]
}
```

If `data` is `[]`, there are no active games; that’s expected when none have been created.

---

## 5. Frontend: correct URL

The frontend must call **`/api/jenga/games/active`**, not `/api/jenga/active`.

- **JENGA page:** `src/app/jenga/page.tsx`  
- **Clubs games page:** `src/app/clubs/[slug]/games/page.tsx` (loadGames + CreateJengaGameModal `onGameCreated`)

Both should use:
```ts
fetch('/api/jenga/games/active')
```

If the deployed app still uses `/api/jenga/active`, that route was removed and will 404. Deploy the version that uses `/api/jenga/games/active`.

---

## Quick debug order

1. **`GET /api/jenga/health`**  
   - If it fails → fix Supabase env and/or run `supabase_migration_jenga.sql`.  
   - If it succeeds → DB and env are fine.

2. **`GET /api/jenga/games/active`**  
   - If it returns `{ ok: true, data: [] }` → API is fine; create a game via the admin UI.  
   - If it 500s → check Vercel (or server) logs for the `[jenga/games/active GET]` error.

3. **App still broken**  
   - Confirm the deployed frontend uses `/api/jenga/games/active` (see step 5).  
   - In the browser, check the Network tab for the request to `/api/jenga/games/active` and the response (status + body).
