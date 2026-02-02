import { redirect } from 'next/navigation';
import { GIVEAWAY_GAMES_CLUB_SLUG } from '~/lib/constants';

export default function Home() {
  // MVP-only: Redirect directly to Giveaway Games
  redirect(`/clubs/${GIVEAWAY_GAMES_CLUB_SLUG}/games`);
}
