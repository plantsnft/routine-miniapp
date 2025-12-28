import { redirect } from 'next/navigation';

export default function Home() {
  // MVP-only: Redirect directly to Hellfire games
  redirect('/clubs/hellfire/games');
}
