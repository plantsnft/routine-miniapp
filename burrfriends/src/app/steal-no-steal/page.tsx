import { Suspense } from 'react';
import { Metadata } from 'next';
import StealNoStealClient from './StealNoStealClient';
import { APP_URL } from '~/lib/constants';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'STEAL OR NO STEAL | BETR WITH BURR',
  description: 'Which briefcase will take you to the finals? Only 2 people know the real truth....',
  openGraph: {
    title: 'STEAL OR NO STEAL',
    description: 'Join STEAL OR NO STEAL on BETR WITH BURR!',
    images: [`${APP_URL}/stealornosteal.png`],
  },
};

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}><p style={{ color: 'var(--text-1)' }}>Loading...</p></div>}>
      <StealNoStealClient />
    </Suspense>
  );
}
