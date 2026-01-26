# UVA Basketball Players (1980-1986 Era)

This document lists University of Virginia basketball players from the 1980-1986 era (Ralph Sampson era) for use in player name generation.

## Unique Player List (1980-1986) - 25 Players

**Note**: This list contains unique names only (no duplicates across seasons). Each name will be used exactly once when assigning to the 20 players.

1. **Ralph Sampson** (C) - 7'4" center, 3-time National Player of the Year (1980-1983)
2. **Othell Wilson** (PG) - Point guard (1980-1984)
3. **Jeff Lamp** (SG) - Shooting guard (1980-1981)
4. **Lee Raker** (SF) - Small forward (1980-1981)
5. **Craig Robinson** (PF) - Power forward (1980-1981)
6. **Rick Carlisle** (PG) - Point guard, future NBA coach (1981-1984)
7. **Tim Mullen** (SG) - Shooting guard (1981-1984)
8. **Kenton Edelin** (SF) - Small forward (1981-1984)
9. **Jim Miller** (PF) - Power forward (1981-1984)
10. **Dan Merrifield** (C) - Center (1981-1982)
11. **Jim Halpin** (PG) - Point guard (1982-1983)
12. **Tom Sheehey** (SG) - Shooting guard (1982-1986)
13. **Olden Polynice** (C) - Center, future NBA player (1982-1986)
14. **Andrew Kennedy** (SF) - Small forward (1982-1986)
15. **Tom Calloway** (PF) - Power forward (1982-1986)
16. **Kenny Johnson** (PG) - Point guard (1983-1984)
17. **Anthony Teachey** (SG) - Shooting guard (1983-1984)
18. **Tom Sweger** (SF) - Small forward (1983-1984)
19. **Mark Mullen** (PF) - Power forward (1983-1984)
20. **John Crotty** (PG) - Point guard (1984-1988, freshman in 1984)
21. **Mel Kennedy** (SF) - Small forward (1984-1986)
22. **Terry Gates** (SG) - Shooting guard (1984-1985)
23. **Tommy Amaker** (PG) - Point guard (1984-1987, transfer)
24. **Steve Kratzer** (PF) - Power forward (1985-1986)
25. **John Johnson** (C) - Center (1985-1986)

## Implementation Notes

- **Total unique names**: 25 (more than needed for 20 players)
- **Usage**: Randomly select 20 names from this list, assign to players
- **No duplicates**: Each name used exactly once
- **Storage**: Store full names (e.g., "Ralph Sampson") in `players.name` field
- **Future drafts**: When new players are drafted, continue using remaining names from this list, or cycle through the list again if needed

## Key Players from This Era

- **Ralph Sampson** (1980-1983): Most famous player, 3-time National Player of the Year
- **Othell Wilson** (1980-1984): Key point guard during Sampson era
- **Olden Polynice** (1982-1986): Future NBA player
- **Rick Carlisle** (1981-1984): Future NBA coach

## Code Implementation

The initialization script will:
1. Define this array of 25 unique UVA player names
2. Shuffle the array randomly
3. Assign first 20 names to the 20 players (5 per team)
4. Store full names in `players.name` field
5. For future drafts, use remaining 5 names, then cycle if needed
