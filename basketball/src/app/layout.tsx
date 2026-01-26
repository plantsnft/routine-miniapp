import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { APP_NAME, APP_DESCRIPTION } from "~/lib/constants";
import { MiniAppInitializer } from "~/components/MiniAppInitializer";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_DESCRIPTION,
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
        <div className="min-h-screen bg-[var(--bg-0)] text-[var(--text-0)]">
          {children}
        </div>
      </body>
    </html>
  );
}
