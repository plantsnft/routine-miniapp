import { Suspense } from 'react';
import { Metadata } from 'next';
import NlHoldemClient from './NlHoldemClient';
import { APP_URL } from '~/lib/constants';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'NL HOLDEM | BETR WITH BURR',
  description: 'In-app No-Limit Hold\'em Sit & Go. Sign up, play, and chat.',
  openGraph: {
    title: 'NL HOLDEM',
    description: 'In-app No-Limit Hold\'em Sit & Go.',
    images: [`${APP_URL}/nlholdem.png`],
  },
};

export default function Page() {
  return (
    <Suspense fallback={<div className="p-4" style={{ color: 'var(--text-0)' }}>Loading…</div>}>
      <NlHoldemClient />
    </Suspense>
  );
}
