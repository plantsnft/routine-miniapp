'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { GIVEAWAY_GAMES_CLUB_SLUG } from '~/lib/constants';

export default function ClubsPage() {
  const router = useRouter();
  
  useEffect(() => {
    // MVP-only: Redirect directly to Giveaway Games
    router.replace(`/clubs/${GIVEAWAY_GAMES_CLUB_SLUG}/games`);
  }, [router]);

  return (
    <main className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        <p className="text-gray-600">Redirecting to Giveaway Games...</p>
      </div>
    </main>
  );
}
