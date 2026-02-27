import { Suspense } from 'react';
import { Metadata } from 'next';
import TakeFromThePileClient from './TakeFromThePileClient';
import { APP_URL } from '~/lib/constants';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'TAKE FROM THE PILE | BETR WITH BURR',
  description: 'Take as much as you want from the pile. Random turn order. 5M BETR. Only alive BETR players.',
  openGraph: {
    title: 'TAKE FROM THE PILE',
    description: 'Take from the pile. Your turn, your amount. 5M BETR.',
    images: [`${APP_URL}/takefrompile.png`],
  },
};

export default function Page() {
  return (
    <Suspense fallback={<div className="p-4" style={{ color: 'var(--text-0)' }}>Loading…</div>}>
      <TakeFromThePileClient />
    </Suspense>
  );
}
