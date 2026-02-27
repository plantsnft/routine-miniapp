import { Suspense } from "react";
import { Metadata } from "next";
import NcaaHoopsClient from "./NcaaHoopsClient";
import { APP_URL } from "~/lib/constants";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "NCAA HOOPS | BETR WITH BURR",
  description: "March Madness bracket. Pick winners. 1–2–4–8–16–32–64 pts. Tiebreaker: championship.",
  openGraph: {
    title: "NCAA HOOPS",
    description: "March Madness bracket. Pick winners. 1–2–4–8–16–32–64 pts.",
    images: [`${APP_URL}/artcontest.png`],
  },
};

export default function Page() {
  return (
    <Suspense fallback={<div className="p-4" style={{ color: "var(--text-0)" }}>Loading…</div>}>
      <NcaaHoopsClient />
    </Suspense>
  );
}
