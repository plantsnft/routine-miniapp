import { Suspense } from "react";
import { Metadata } from "next";
import SundayHighStakesClient from "./SundayHighStakesClient";
import { APP_URL } from "~/lib/constants";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "SUNDAY HIGH STAKES ARE BETR | BETR WITH BURR",
  description: "Submit your cast. Get the password and play on Club GG.",
  openGraph: {
    title: "SUNDAY HIGH STAKES ARE BETR",
    description: "Submit your cast with art. Get the password and link to play on Club GG.",
    images: [`${APP_URL}/sundayhighstakes.png`],
  },
};

export default function Page() {
  return (
    <Suspense fallback={<div className="p-4" style={{ color: "var(--text-0)" }}>Loading…</div>}>
      <SundayHighStakesClient />
    </Suspense>
  );
}
