# JENGA V2 – Deploy checklist

## Before deploying this code

**1. Run the migration (required)**

Run `supabase_migration_jenga_v2_phase1.sql` in your Supabase SQL Editor (on the `poker` database). It adds:

- `last_placement_at` to `poker.jenga_games`

Without this column, the following will error:

- `POST /api/jenga/games/[id]/move` (writes `last_placement_at`)
- `~/lib/jenga-on-read-timeout` (selects `last_placement_at`)
- `POST /api/jenga/games/[id]/touch` (reads `last_placement_at`)

## What this deploy includes

- **Create** – All new games use **V2** (`initializeTowerV2`). V1 is no longer used.
- **Touch route** – `POST /api/jenga/games/[id]/touch` for the 10s handoff (“Touch to start”).
- **jenga-on-read-timeout** – 10s handoff auto-advance, V2 replace-on-timeout, 1‑minute warning. Used by `GET /api/jenga/games/[id]` and `GET /api/jenga/games/[id]/state`.
- **[id] and state** – `processGameTimeout` from `~/lib/jenga-on-read-timeout`; responses include `last_placement_at` / `lastPlacementAt` for the handoff countdown.
- **Move route** – V2 only. Expects `{ remove: { level, row, block } }`. Legacy V1 games are rejected with 400.

Do **not** deploy without running the migration first. Otherwise the move route will 500 when writing `last_placement_at`.
