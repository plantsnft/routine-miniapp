# Basketball Sim - Implementation Readiness

## ✅ SoT Updates Complete

The Source of Truth document has been updated with:

1. ✅ **Schema name**: `basketball` (all tables in `basketball.*` schema)
2. ✅ **Initial team owners**:
   - Farcaster: catwalk, farville, plantsnft (FIDs to be fetched)
   - Email: cpjets07@yahoo.com
3. ✅ **Cutoff time**: Midnight Eastern Time
4. ✅ **Player names**: Historical UVA college basketball players
5. ✅ **Email auth**: Supabase Auth magic link (benefits documented)
6. ✅ **Prep boost storage**: Added `prep_boost_active` field to teams table
7. ✅ **Timezone handling**: All server-side calculations use Eastern Time
8. ✅ **End-to-end flow**: Documented in `END_TO_END_FLOW.md`

## 📋 Remaining Questions (Before Implementation)

### 1. Farcaster FID Resolution
**Question**: Should we hardcode FIDs for catwalk, farville, plantsnft, or fetch them dynamically?

**Recommendation**: Fetch dynamically using Neynar API or Farcaster names API at initialization time. This is more flexible if usernames change.

**Action**: Implementation will include FID fetching logic in initialization script.

### 2. UVA Player Names List ✅ ANSWERED
**Answer**: Use UVA players from 1980-1986 teams (Ralph Sampson era)

**Action**: Implementation will include a `UVA_PLAYER_NAMES_1980_1986` constant array with 25 unique players from that era (see `UVA_PLAYERS_1980_1986.md` for full list). Randomly select 20 names for initial players. No duplicate names - each name used exactly once.

**Key players from 1980-1986 era**: Ralph Sampson, Othell Wilson, Rick Carlisle, Olden Polynice, Tom Sheehey, Andrew Kennedy, etc.

### 3. Team Names ✅ ANSWERED
**Answer**: Use specific team names: "Houston", "Atlanta", "Vegas", "NYC"

**Action**: Implementation will create 4 teams with these exact names, assigned to profiles in order: Houston → first profile, Atlanta → second, Vegas → third, NYC → fourth.

### 4. Vercel Cron Schedule
**Question**: What exact time should the cron job run? (Midnight ET = 00:00 ET = 05:00 UTC)

**Recommendation**: Set cron to run at 05:00 UTC (midnight ET) daily.

**Action**: `vercel.json` will include cron schedule: `"0 5 * * *"` (UTC).

### 5. Email Auth Setup
**Question**: Do we need to configure Supabase email templates, or use defaults?

**Recommendation**: Use Supabase defaults for MVP. Can customize later if needed.

**Action**: Implementation will use Supabase Auth defaults.

## ✅ Plan Verification

### Isolation ✅
- All code in `basketball/` folder
- All tables in `basketball.*` schema
- Separate Vercel project
- No cross-app dependencies

### Database Schema ✅
- All tables defined with proper constraints
- RLS policies documented
- Foreign keys properly set up
- Prep boost flag added to teams table

### Authentication ✅
- Farcaster (Neynar SIWN) supported
- Email (Supabase Auth) supported
- Profiles table supports both auth types

### Game Logic ✅
- Season structure: 60 days (30 offdays, 30 gamenights)
- Schedule: Round-robin pattern
- Simulation: Complete formulas documented
- Stats: All tracked correctly

### Phased Implementation ✅
- 7 phases clearly defined
- Each phase builds on previous
- End-to-end flow verified

## 🚀 Ready to Implement?

**Status**: ✅ YES - Plan is complete and ready for implementation

**Next Steps**:
1. Start with Phase 1: Skeleton + Auth + DB
2. Follow phases in order
3. Test end-to-end after each phase
4. Use `END_TO_END_FLOW.md` for verification

## 📝 Implementation Notes

- All code must be in `basketball/` folder
- Use `basketballDb.ts` for all database operations
- All time calculations use Eastern Time
- Player names from UVA 1980-1986 player list (25 unique names, use 20 for initial players)
- Team names: "Houston", "Atlanta", "Vegas", "NYC" (assigned in order)
- FIDs fetched dynamically at initialization

---

**Last Updated**: Based on user answers on 2026-01-26
