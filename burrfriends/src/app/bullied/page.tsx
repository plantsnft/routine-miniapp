import { Suspense } from 'react';
import { Metadata } from 'next';
import BulliedClient from './BulliedClient';
import { APP_URL } from '~/lib/constants';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'BULLIED | BETR WITH BURR',
  description: 'Play BULLIED on BETR WITH BURR - 3 go in, 1 or none advance!',
  openGraph: {
    title: 'BULLIED',
    description: '3 go in, 1 or none advance. All must agree or everyone is eliminated.',
    images: [`${APP_URL}/betrgames.png`],
  },
};

export default function Page() {
  return (
    <Suspense fallback={<div className="p-4" style={{ color: 'var(--text-0)' }}>Loading…</div>}>
      <BulliedClient />
    </Suspense>
  );
}
