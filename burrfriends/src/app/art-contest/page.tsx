import { Suspense } from "react";
import { Metadata } from "next";
import ArtContestClient from "./ArtContestClient";
import { APP_URL } from "~/lib/constants";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "TO SPINFINITY AND BEYOND ART CONTEST | BETR WITH BURR",
  description: "Submit your art. $4000+ prize pool. Top 14 win.",
  openGraph: {
    title: "TO SPINFINITY AND BEYOND ART CONTEST",
    description: "Quote the cast by midnight EST Feb 27. Top 14 win. 1:1 square preferred.",
    images: [`${APP_URL}/artcontest.png`],
  },
};

export default function Page() {
  return (
    <Suspense fallback={<div className="p-4" style={{ color: "var(--text-0)" }}>Loading…</div>}>
      <ArtContestClient />
    </Suspense>
  );
}
