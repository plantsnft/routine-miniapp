import { Metadata } from "next";
import WeekendGameClient from "./WeekendGameClient";
import { APP_URL } from "~/lib/constants";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Escape Velocity | BETR WITH BURR",
  description: "Play Escape Velocity and compete on the leaderboard!",
  openGraph: {
    title: "Escape Velocity",
    description: "Play Escape Velocity. Submit your score and compete!",
    images: [`${APP_URL}/remix.png`],
  },
};

export default function Page() {
  return <WeekendGameClient />;
}
