import { Metadata } from "next";
import WeekendGameClient from "./WeekendGameClient";
import { APP_URL } from "~/lib/constants";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "WEEKEND GAME - REMIX 3D Tunnel Racer | BETR WITH BURR",
  description: "Play 3D Tunnel Racer on Remix and compete on the leaderboard!",
  openGraph: {
    title: "WEEKEND GAME - REMIX 3D Tunnel Racer",
    description: "Play 3D Tunnel Racer on Remix. Submit your score and compete!",
    images: [`${APP_URL}/remix.png`],
  },
};

export default function Page() {
  return <WeekendGameClient />;
}
