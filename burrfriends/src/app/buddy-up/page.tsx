import { Suspense } from 'react';
import { Metadata } from 'next';
import BuddyUpV2Client from './BuddyUpV2Client';
import { APP_URL } from '~/lib/constants';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'BUDDY UP | BETR WITH BURR',
  description: 'Play BUDDY UP on BETR WITH BURR - team up and survive!',
  openGraph: {
    title: 'BUDDY UP',
    description: 'Join BUDDY UP on BETR WITH BURR!',
    images: [`${APP_URL}/betrgames.png`],
  },
};

export default function Page() {
  return (
    <Suspense fallback={<div className="p-4" style={{ color: 'var(--text-0)' }}>Loading…</div>}>
      <BuddyUpV2Client />
    </Suspense>
  );
}
