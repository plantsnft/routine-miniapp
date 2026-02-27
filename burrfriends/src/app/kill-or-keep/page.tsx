import { Suspense } from 'react';
import { Metadata } from 'next';
import KillOrKeepClient from './KillOrKeepClient';
import { APP_URL } from '~/lib/constants';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'KILL OR KEEP | BETR WITH BURR',
  description: 'Keep or kill one player per turn. Only alive BETR players. Game ends when 10 or fewer remain and everyone has had a turn.',
  openGraph: {
    title: 'KILL OR KEEP',
    description: 'Keep or kill one player per turn. Order from Take from the Pile (least first).',
    images: [`${APP_URL}/keeporkill.png`],
  },
};

export default function Page() {
  return (
    <Suspense fallback={<div className="p-4" style={{ color: 'var(--text-0)' }}>Loading…</div>}>
      <KillOrKeepClient />
    </Suspense>
  );
}
