import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Farcaster Poker",
  description: "Hellfire & Burrfriends ClubGG manager",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
