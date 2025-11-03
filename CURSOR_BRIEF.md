ChatGPT said:

Got it. Here’s a clean, detailed handoff for Cursor so it can pick up immediately.

Project Handoff: “Routine” Farcaster Mini-App (Daily Check-In)
0) Goal (what “done” looks like)

A Farcaster Mini App named Routine that lets any Farcaster user check in once per day, persists a streak counter per user, and shows simple success/error UI in Catwalk-style colors.

Runs on Vercel (production URL), uses Supabase for persistence, and Neynar (Starter plan) for Farcaster auth (SIWN) + API access.

Users can open it in Warpcast Mini-App Preview (and eventually publish) and sign in automatically via SIWN, then tap Check in → writes/updates a row in Supabase.

1) Current State (what works / what doesn’t)
Working

Local dev (npm run dev) renders the app at http://localhost:3000.

Daily check-in API: POST /api/checkin writes to Supabase.

Table schema created (see §3.2). Unique index on fid is in place.

API stores/updates last_checkin + streak.

UI: src/app/daily-checkin.tsx renders check-in button, shows status messages, and currently attempts to pull FID from SIWN.

Deployed to Vercel: Project is live at a URL like:

https://routine-smoky.vercel.app/ ← (current deployed preview/production URL in Vercel)

Verified during debugging

ngrok tunnel worked and Warpcast Preview could load local app.

Test cURL calls to /api/checkin succeeded and rows showed up in Supabase.

Not Fully Working (main blocker)

SIWN (Sign-in With Neynar) via /api/siwn on Vercel: pressing Sign in with Farcaster in Warpcast Preview often yields:

“Got hash/signature but no fid — check host config” (preview tool)

Or “Neynar error in SIWN POST” from our backend

Or “No SIWN params found in URL” if host didn’t attach params.

Root cause (most likely): missing/incorrect server env secrets on Vercel (notably SEED_PHRASE and SUPABASE_SERVICE_ROLE) and/or mismatch in NEXT_PUBLIC_BASE_URL vs actual deployed URL.

2) Stack / Tools

Next.js 15 app (App Router) with TypeScript.

Neynar (Starter plan) — APIs for Farcaster auth (SIWN) & user data.

Supabase — Postgres DB for check-ins.

Vercel — hosting + environment variables.

Warpcast Mini-App Preview — manual testing in Farcaster host.

ngrok — used to test dev server with Warpcast preview.

Repo

GitHub: https://github.com/plantsnft/routine-miniapp

Default branch: master

Local project path

C:\miniapps\routine

3) Data & Endpoints
3.1 Endpoints in this app

GET /api/siwn
Expects SIWN params from host (query). Validates with Neynar. Returns { ok, fid, username } or { ok: false, error }.

POST /api/siwn
Accepts { hash, signature, messageBytes } (Payload from host). Validates with Neynar. Returns { ok, fid, username } on success.

POST /api/checkin
Body: { fid: number }
Behavior: creates/updates row in Supabase public.checkins (see 3.2).

GET /api/users?fids=318447
Helper for fetching Neynar user (used in debugging/validation).

3.2 Supabase schema

Executed in SQL Editor (already applied):

create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  fid bigint not null,
  last_checkin timestamptz,
  streak integer not null default 1,
  inserted_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index checkins_fid_unique on public.checkins (fid);

-- (optional, if not already present)
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at on public.checkins;

create trigger set_updated_at
before update on public.checkins
for each row
execute procedure public.set_updated_at();

4) Files of interest (paths)

src/app/page.tsx → loads <App /> and <DebugSiwn />

src/app/daily-checkin.tsx → the check-in UI (shows sign-in button if not signed)

src/app/api/siwn/route.ts → SIWN handler (GET and POST expected)

src/app/api/checkin/route.ts → persists to Supabase

src/lib/neynar.ts → Neynar client util (if present)

src/lib/constants.ts, src/lib/utils.ts → helpers

tailwind.config.ts → updated to use ES module (fixed earlier)

5) Environment Variables (local + Vercel)

Do NOT commit secrets. Cursor should ensure these exist in both .env.local and Vercel Project → Settings → Environment Variables.

Required (present or to be added)

NEYNAR_API_KEY = (user provided)

NEYNAR_CLIENT_ID = (user provided)

NEXT_PUBLIC_FARCASTER_NETWORK = mainnet

NEXT_PUBLIC_BASE_URL = your Vercel URL (e.g. https://routine-smoky.vercel.app)

NEXT_PUBLIC_SUPABASE_URL = Supabase project URL

NEXT_PUBLIC_SUPABASE_ANON_KEY = Supabase anon public key

SUPABASE_SERVICE_ROLE = Supabase Service Role key (server-only)

SEED_PHRASE = Signer seed phrase (server-only; 12 words, space-separated)

SPONSOR_SIGNER = true

The user pasted keys in prior messages; Cursor should pull them from the user securely (or have the user paste into Vercel UI). Do not print them in logs or commit them.

6) What Cursor Should Do Next (priority order)
A) Fix SIWN on Vercel (primary blocker)

Verify env vars exist on Vercel (Settings → Environment Variables):

Make sure the three server-only are present:
SUPABASE_SERVICE_ROLE, SEED_PHRASE, SPONSOR_SIGNER=true.

Ensure NEXT_PUBLIC_BASE_URL matches the actual deployed URL.

Redeploy on Vercel after saving env changes.

In Warpcast Mini-App Preview: paste your Vercel URL, click Sign in with Farcaster.

Expect /api/siwn to return { ok: true, fid: <user fid> }.

If you still see “Got hash/signature but no fid”, add server logs to /api/siwn (see B.2 below).

B) Harden /api/siwn (both GET & POST)

Ensure it supports both:

GET: read hash, signature, messageBytes, fid from query string (Warpcast preview often sends via query on reload).

POST: parse JSON body { hash, signature, messageBytes }.

Add defensive logging (short-term):

Log whether req.query or req.body had those fields.

Log Neynar responses (status + top-level fields), but avoid printing secrets.

Validate with Neynar using Neynar Node SDK or HTTPS:

Pass NEYNAR_API_KEY and NEYNAR_CLIENT_ID.

Ensure your signer can be created/used — this is where SEED_PHRASE and SPONSOR_SIGNER=true matter for the starter template.

C) Make the UI automatically use FID

In daily-checkin.tsx, the existing effect calls /api/siwn without params (/api/siwn + current window.location.search).

After fixing SIWN, fid should populate and the Sign in button should hide.

On Check in, it should POST to /api/checkin with { fid }.

D) Supabase RLS (optional, next pass)

For now, no RLS is fine. Later, enable RLS and add a simple service-role insert/update policy if needed.

7) Testing Notes
Local

Start dev: npm run dev

Hit health: GET http://localhost:3000/api/siwn should return { ok:false, error: "No SIWN params found in URL." } (expected when not in host).

Manual check-in (bypassing SIWN):

curl -X POST http://localhost:3000/api/checkin ^
  -H "Content-Type: application/json" ^
  -d "{\"fid\": 318447}"


Should update/create in Supabase and return { ok: true }.

Remote (Vercel)

Visit https://YOUR-URL/api/siwn → expect { ok:false, error: "No SIWN params..." } until Warpcast sends params.

Use Warpcast Mini-App Preview:

Paste https://YOUR-URL/ and click Preview.

Tap Sign in with Farcaster inside the app.

Expect redirect/reload with SIWN params; /api/siwn resolves your FID; UI shows “Current FID: 318447”.

8) Common Errors Seen (and fixes)

“Neynar error in SIWN POST.”
→ Usually missing SEED_PHRASE and/or SPONSOR_SIGNER=true in env. Add both; redeploy.

“Got hash/signature but no fid — check host config.”
→ Host sent params, but /api/siwn didn’t resolve user. Check:

Did we read query vs body correctly?

Is Neynar API key/client id valid on Vercel?

Is NEXT_PUBLIC_BASE_URL correct? (Some flows validate origin.)

“No SIWN params found in URL.”
→ Expected when running outside Warpcast (or before sign-in). In Preview, after tapping Sign in, host should reload with params.

Supabase 409 duplicate constraint
→ Means row already exists; update instead of insert is correct behavior (already implemented).

9) Styling / UX TODO (after SIWN is green)

Tweak daily-checkin.tsx to gracefully show:

✅ Saved when success

❌ Clear error copy when failure

Apply Catwalk color theme (already partially present: purple shades).

Optional: show streak from DB (requires /api/checkin GET or GET /api/streak?fid=...).

10) Quick Command Reference
:: open project
cd C:\miniapps\routine

:: run locally
npm run dev

:: open env
notepad .env.local

:: git push
git add .
git commit -m "update"
git push

11) Secrets Handling (important)

Do not commit keys/seed to GitHub. Keep them only in:

Local .env.local (ignored by git)

Vercel → Project → Settings → Environment Variables

Treat SEED_PHRASE and SUPABASE_SERVICE_ROLE as server-only.

If Cursor needs anything else (e.g., the exact /api/siwn implementation we used last, or to add structured logging), have it open src/app/api/siwn/route.ts, ensure both GET & POST paths validate with Neynar, and confirm the three critical envs (SEED_PHRASE, SPONSOR_SIGNER, SUPABASE_SERVICE_ROLE) exist on Vercel. That should clear the SIWN roadblock and let the check-in flow work end-to-end.