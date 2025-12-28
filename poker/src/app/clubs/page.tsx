'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ClubsPage() {
  const router = useRouter();
  
  useEffect(() => {
    // MVP-only: Redirect directly to Hellfire games
    router.replace('/clubs/hellfire/games');
  }, [router]);

  return (
    <main className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        <p className="text-gray-600">Redirecting to Hellfire Club...</p>
      </div>
    </main>
  );
}
