import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { MiniAppInitializer } from "~/components/MiniAppInitializer";
import { AuthProviderWrapper } from "~/components/AuthProviderWrapper";
import { AppGate } from "~/components/AppGate";
import AppFooter from "~/components/AppFooter";
import { AuthDebugOverlay } from "~/components/AuthDebugOverlay";
import { PreviewBanner } from "~/components/PreviewBanner";
import { ScrollingBanner } from "~/components/ScrollingBanner";
import { getMiniAppEmbedMetadata } from "~/lib/miniapp-metadata";
import { APP_URL } from "~/lib/constants";
// NOTE: Runtime checks are now done lazily in encryption functions, not at module load

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Giveaway Games",
  description: "Run games on ClubGG and give away tokens or art",
  openGraph: {
    title: "Giveaway Games",
    description: "Run games on ClubGG and give away tokens or art",
    images: ['https://imgur.com/qqNbLzq'],
  },
  other: {
    // Use fc:miniapp for Farcaster embed detection
    "fc:miniapp": JSON.stringify(getMiniAppEmbedMetadata(APP_URL)),
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.variable}>
        {/* MiniAppInitializer handles sdk.actions.ready() */}
        <MiniAppInitializer />
        <AuthProviderWrapper>
          <AppGate>
            <PreviewBanner />
            <ScrollingBanner />
            {/* App shell wrapper - consistent background, max-width, safe-area padding */}
            <div 
              className="flex flex-col min-h-screen bg-bg-0"
              style={{
                maxWidth: '100%',
                margin: '0 auto',
                paddingTop: 'env(safe-area-inset-top, 0)',
                paddingBottom: 'env(safe-area-inset-bottom, 0)',
                paddingLeft: 'env(safe-area-inset-left, 0)',
                paddingRight: 'env(safe-area-inset-right, 0)',
              }}
            >
              <main className="flex-1 w-full">
                {children}
              </main>
              <AppFooter />
              <AuthDebugOverlay />
            </div>
          </AppGate>
        </AuthProviderWrapper>
      </body>
    </html>
  );
}
