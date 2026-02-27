import { Suspense } from 'react';
import { Metadata } from 'next';
import BetrGuesserClient from './BetrGuesserClient';
import { APP_URL } from '~/lib/constants';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'BETR GUESSER | BETR WITH BURR',
  description: 'Guess a number 1-100. Highest unique guess wins!',
  openGraph: {
    title: 'BETR GUESSER',
    description: 'Join BETR GUESSER on BETR WITH BURR!',
    images: [`${APP_URL}/guesser.png`],
  },
};

export default function Page() {
  return (
    <Suspense fallback={<div className="p-4" style={{ color: 'var(--text-0)' }}>Loading…</div>}>
      <BetrGuesserClient />
    </Suspense>
  );
}
