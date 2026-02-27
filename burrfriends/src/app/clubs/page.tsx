'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { HELLFIRE_CLUB_SLUG, HELLFIRE_CLUB_NAME } from '~/lib/constants';

export default function ClubsPage() {
  const router = useRouter();
  
  useEffect(() => {
    // MVP-only: Redirect directly to SIAs Poker Room games
    router.replace(`/clubs/${HELLFIRE_CLUB_SLUG}/games`);
  }, [router]);

  return (
    <main className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        <p className="text-gray-600">Redirecting to {HELLFIRE_CLUB_NAME}...</p>
      </div>
    </main>
  );
}
