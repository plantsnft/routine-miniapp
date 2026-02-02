# Run Database Migration

## Copy-Paste This Command:

```bash
cd c:\miniapps\routine\poker && tsx scripts/migrate-to-giveaway-games.ts
```

## Or if you're already in the poker folder:

```bash
tsx scripts/migrate-to-giveaway-games.ts
```

## What This Does:

- Updates the club slug from `"hellfire"` to `"giveaway-games"`
- Updates the club name to `"Giveaway Games"`
- Updates the club description
- **Preserves all existing games** (they reference by UUID, not slug)

## Expected Output:

```
Starting migration to Giveaway Games...

1. Looking for existing "hellfire" club...
   ✓ Found club: Hellfire Club (ID: ...)
   Current slug: hellfire

2. Checking for linked games...
   Found X game(s) linked to this club (showing first 10)
   Games will remain linked after migration (they reference by UUID, not slug)

3. Updating club information...
   ✓ Updated club:
     Slug: hellfire → giveaway-games
     Name: Hellfire Club → Giveaway Games
     Description: ... → Run games on ClubGG and give away tokens or art

4. Verifying update...
   ✓ Verification successful!
   Club ID: ... (unchanged)
   Owner FID: ... (unchanged)

✅ Migration complete!
   Club: Giveaway Games
   Slug: giveaway-games
   All X game(s) remain linked to this club
```

## Troubleshooting:

- **If it says "No existing 'hellfire' club found"**: The club may already be migrated or doesn't exist. Check your database.
- **If it says "Club already exists"**: Migration may have already been run. Verify in your database.
- **If tsx command not found**: Install it with `npm install -g tsx` or use `npx tsx` instead.
