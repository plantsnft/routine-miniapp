import { Metadata } from 'next';
import RemixBetrClient from './RemixBetrClient';
import { APP_URL } from '~/lib/constants';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'FRAMEDL BETR | BETR WITH BURR',
  description: 'Play FRAMEDL and compete on the leaderboard!',
  openGraph: {
    title: 'FRAMEDL BETR',
    description: 'Join FRAMEDL BETR on BETR WITH BURR!',
    images: [`${APP_URL}/FRAMEDL.png`],
  },
};

export default function Page() {
  return <RemixBetrClient />;
}
