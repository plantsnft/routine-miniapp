import { redirect } from 'next/navigation';
import { BURRFRIENDS_CLUB_SLUG } from '~/lib/constants';

export default function Home() {
  // Redirect directly to Burrfriends games
  redirect(`/clubs/${BURRFRIENDS_CLUB_SLUG}/games`);
}
