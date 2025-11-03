import { Metadata } from "next";
import App from "./app";
import { APP_NAME, APP_DESCRIPTION, APP_OG_IMAGE_URL } from "~/lib/constants";
import { getMiniAppEmbedMetadata } from "~/lib/utils";
import DailyCheckin from "./daily-checkin";
import DebugSiwn from "./debug-siwn";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: APP_NAME ?? "Routine",
    description: APP_DESCRIPTION,
    openGraph: {
      title: APP_NAME,
      description: APP_DESCRIPTION,
      images: [APP_OG_IMAGE_URL],
    },
    other: {
      "fc:frame": JSON.stringify(getMiniAppEmbedMetadata()),
      "fc:miniapp": JSON.stringify(getMiniAppEmbedMetadata()),
    },
  };
}

export default function Home() {
  return (
    <>
      <App />
      <DailyCheckin />
      <DebugSiwn />
    </>
  );
}
