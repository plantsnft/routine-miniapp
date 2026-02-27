import { Suspense } from 'react';
import { Metadata } from 'next';
import SuperbowlPropsClient from './SuperbowlPropsClient';
import { APP_URL } from '~/lib/constants';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'SUPERBOWL PROPS | BETR WITH BURR',
  description: '25 Props + Tiebreaker. Pick the outcomes and win!',
  openGraph: {
    title: 'SUPERBOWL PROPS',
    description: 'Join SUPERBOWL PROPS on BETR WITH BURR!',
    images: [`${APP_URL}/superbowlprops.png`],
  },
};

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen p-4" style={{ background: 'var(--bg-0)' }}><p style={{ color: 'var(--text-2)' }}>Loading...</p></div>}>
      <SuperbowlPropsClient />
    </Suspense>
  );
}
