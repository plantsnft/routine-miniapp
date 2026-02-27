import { Suspense } from 'react';
import { Metadata } from 'next';
import InOrOutClient from './InOrOutClient';
import { APP_URL } from '~/lib/constants';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'IN OR OUT | BETR WITH BURR',
  description: 'Quit for your share of $10M BETR or Stay. Only alive BETR players.',
  openGraph: {
    title: 'IN OR OUT',
    description: 'Quit for your share of $10M BETR or Stay. One game at a time.',
    images: [`${APP_URL}/betrgames.png`],
  },
};

export default function Page() {
  return (
    <Suspense fallback={<div className="p-4" style={{ color: 'var(--text-0)' }}>Loading…</div>}>
      <InOrOutClient />
    </Suspense>
  );
}
