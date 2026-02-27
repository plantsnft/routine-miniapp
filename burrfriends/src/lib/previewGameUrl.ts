/**
 * Phase 29.2: URL for preview game by table and id.
 * Phase 17.7: Optional title — HEADS UP games use /heads-up-steal-no-steal.
 */
export function getPreviewGameUrl(table: string, id: string, title?: string): string {
  switch (table) {
    case "burrfriends_games":
      return `/games/${id}`;
    case "betr_guesser_games":
      return `/betr-guesser?gameId=${id}`;
    case "buddy_up_games":
      return `/buddy-up?gameId=${id}`;
    case "jenga_games":
      return `/jenga?gameId=${id}`;
    case "mole_games":
      return `/the-mole?gameId=${id}`;
    case "steal_no_steal_games":
      return title === "HEADS UP Steal or No Steal"
        ? `/heads-up-steal-no-steal?gameId=${id}`
        : `/steal-no-steal?gameId=${id}`;
    case "remix_betr_rounds":
      return `/remix-betr?roundId=${id}`;
    case "weekend_game_rounds":
      return `/weekend-game?roundId=${id}`;
    case "bullied_games":
      return `/bullied?gameId=${id}`;
    case "in_or_out_games":
      return `/in-or-out?gameId=${id}`;
    case "take_from_the_pile_games":
      return `/take-from-the-pile?gameId=${id}`;
    case "kill_or_keep_games":
      return `/kill-or-keep?gameId=${id}`;
    case "art_contest":
      return `/art-contest?contestId=${id}`;
    case "sunday_high_stakes":
      return `/sunday-high-stakes?contestId=${id}`;
    case "nl_holdem_games":
      return `/nl-holdem?gameId=${id}`;
    case "ncaa_hoops_contests":
      return `/ncaa-hoops?contestId=${id}`;
    default:
      return "/clubs/burrfriends/games";
  }
}
