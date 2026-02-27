import { Suspense } from 'react';
import { Metadata } from 'next';
import TheMoleClient from './TheMoleClient';
import { APP_URL } from '~/lib/constants';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'THE MOLE | BETR WITH BURR',
  description: 'Find the mole before they sabotage your group!',
  openGraph: {
    title: 'THE MOLE',
    description: 'Join THE MOLE on BETR WITH BURR!',
    images: [`${APP_URL}/betrgames.png`],
  },
};

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', color: 'var(--fire-2)' }}>Loading…</div>}>
      <TheMoleClient />
    </Suspense>
  );
}
