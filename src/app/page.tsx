import { Metadata } from "next";
import App from "./app";
import { APP_NAME, APP_DESCRIPTION, APP_URL } from "~/lib/constants";
import { getMiniAppEmbedMetadata } from "~/lib/utils";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const ogImageUrl = `${APP_URL}/api/opengraph-image`;
  
  return {
    title: APP_NAME ?? "Catwalk",
    description: APP_DESCRIPTION,
    openGraph: {
      title: APP_NAME,
      description: APP_DESCRIPTION,
      images: [ogImageUrl],
    },
    other: {
      // Use fc:miniapp for new Mini Apps (not fc:frame which is legacy)
      "fc:miniapp": JSON.stringify(getMiniAppEmbedMetadata(ogImageUrl, APP_URL)),
    },
  };
}

export default function Home() {
  return (
    <>
      <App />
    </>
  );
}
