import type { Metadata } from 'next';

import '~/app/globals.css';
import { Providers } from '~/app/providers';
import { APP_NAME, APP_DESCRIPTION } from '~/lib/constants';
import { ErrorBoundary } from '~/components/ErrorBoundary';

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_DESCRIPTION,
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  try {
    return (
      <html lang="en">
        <body>
          <ErrorBoundary>
            <Providers>
              {children}
            </Providers>
          </ErrorBoundary>
        </body>
      </html>
    );
  } catch (error) {
    console.error('[RootLayout] Error:', error);
    // Return minimal layout if there's an error
    return (
      <html lang="en">
        <body>
          <div style={{ padding: '20px', textAlign: 'center' }}>
            <h1>Error loading app</h1>
            <p>Please refresh the page or try again later.</p>
          </div>
        </body>
      </html>
    );
  }
}
