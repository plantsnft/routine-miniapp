import { Suspense } from 'react';
import { Metadata } from 'next';
import SuperbowlSquaresClient from './SuperbowlSquaresClient';
import { APP_URL } from '~/lib/constants';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'SUPERBOWL SQUARES | BETR WITH BURR',
  description: '10x10 grid game. Claim squares based on staking tier. Win when score digits match!',
  openGraph: {
    title: 'SUPERBOWL SQUARES',
    description: 'Join SUPERBOWL SQUARES on BETR WITH BURR!',
    images: [`${APP_URL}/superbowlsquares.png`],
  },
};

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', color: 'var(--fire-2)' }}>Loading…</div>}>
      <SuperbowlSquaresClient />
    </Suspense>
  );
}
