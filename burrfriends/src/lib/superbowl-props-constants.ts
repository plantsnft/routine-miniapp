/**
 * Phase 26: BETR SUPERBOWL: PROPS constants
 * 25 hardcoded prop bets for Super Bowl (Seahawks vs Patriots)
 */

export const SUPERBOWL_PROPS = [
  { q: "Length of National Anthem (in seconds)", a: "Over 120", b: "Under 120" },
  { q: "Coin toss result", a: "Heads", b: "Tails" },
  { q: "Game winner", a: "Seahawks", b: "Patriots" },
  { q: "Game total", a: "Over 45.5", b: "Under 45.5" },
  { q: "First offensive play of the game", a: "Rushing attempt", b: "Passing attempt" },
  { q: "Will there be a scoreless quarter", a: "Yes", b: "No" },
  { q: "Team to score first", a: "Seahawks", b: "Patriots" },
  { q: "First team to call a timeout", a: "Seahawks", b: "Patriots" },
  { q: "First accepted penalty will be against", a: "Seahawks", b: "Patriots" },
  { q: "Will there be overtime?", a: "Yes", b: "No" },
  { q: "Will a team score 3 consecutive times (not incl PATs)", a: "Yes", b: "No" },
  { q: "Sam Darnold passing yards", a: "Over 230.5", b: "Under 230.5" },
  { q: "Drake Maye passing yards", a: "Over 220.5", b: "Under 220.5" },
  { q: "Total receiving yards - Jaxon Smith-Njigba", a: "Over 93.5", b: "Under 93.5" },
  { q: "Total receiving yards - Stephon Diggs", a: "Over 43.5", b: "Under 43.5" },
  { q: "Total rushing yards - Kenneth Walker III", a: "Over 42.5", b: "Under 42.5" },
  { q: "Team with the longest successful field goal", a: "Seahawks", b: "Patriots" },
  { q: "Length of longest touchdown (in yards)", a: "Over 36.5", b: "Under 36.5" },
  { q: "Team with longest touchdown", a: "Seahawks", b: "Patriots" },
  { q: "Total game score", a: "Odd", b: "Even" },
  { q: "Highest scoring half", a: "First", b: "Second" },
  { q: "Total number of touchdowns in the game", a: "Over 5.5", b: "Under 5.5" },
  { q: "Will there be a missed PAT (1 or 2 pt attempt)", a: "Yes", b: "No" },
  { q: "Color of Gatorade bath", a: "Orange/Water/Clear", b: "Any other color" },
  { q: "Position of Superbowl MVP", a: "Quarterback", b: "Any other position" },
] as const;

// Default deadline: Feb 9, 2026 3:30 PM PT = 11:30 PM UTC
export const SUPERBOWL_PROPS_DEFAULT_DEADLINE = new Date('2026-02-09T23:30:00.000Z');

// Number of props
export const SUPERBOWL_PROPS_COUNT = 25;
