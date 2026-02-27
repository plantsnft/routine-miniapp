import { Suspense } from 'react';
import { Metadata } from 'next';
import StealNoStealClient from '../steal-no-steal/StealNoStealClient';
import { APP_URL } from '~/lib/constants';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'HEADS UP Steal or No Steal | BETR WITH BURR',
  description: '2-player heads-up. Convince the other person NOT to steal — YOU WIN.',
  openGraph: {
    title: 'HEADS UP Steal or No Steal',
    description: '2-player heads-up. Convince the other person NOT to steal — YOU WIN.',
    images: [`${APP_URL}/stealornosteal.png`],
  },
};

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen p-8" style={{ background: 'var(--bg-0)' }}><p style={{ color: 'var(--text-1)' }}>Loading...</p></div>}>
      <StealNoStealClient variant="heads_up" />
    </Suspense>
  );
}
