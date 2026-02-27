'use client';

import { useAuth } from '~/components/AuthProvider';
import { PlayerStats } from '~/components/PlayerStats';
import Link from 'next/link';

export default function StatsPage() {
  const { fid, status: authStatus } = useAuth();

  if (authStatus === 'loading') {
    return (
      <main className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}>
        <div className="max-w-4xl mx-auto">
          <p style={{ color: 'var(--text-muted)' }}>Signing in...</p>
        </div>
      </main>
    );
  }

  if (authStatus === 'error' || !fid) {
    return (
      <main className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}>
        <div className="max-w-4xl mx-auto">
          <p className="mb-4" style={{ color: 'var(--fire-2)' }}>
            Authentication required. Please sign in to view your statistics.
          </p>
          <Link href="/" className="mt-4 inline-block" style={{ color: 'var(--fire-1)' }}>
            ← Back to Home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}>
      <div className="max-w-4xl mx-auto">
        <Link href="/" className="mb-4 inline-block" style={{ color: 'var(--fire-1)' }}>
          ← Back to Home
        </Link>

        <h1 className="text-3xl font-bold mb-6" style={{ color: 'var(--text-0)', fontWeight: 700 }}>
          My Statistics
        </h1>

        <PlayerStats />
      </div>
    </main>
  );
}
