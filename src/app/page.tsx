import { Metadata } from "next";
import App from "./app";
import { APP_NAME, APP_DESCRIPTION } from "~/lib/constants";
import { getMiniAppEmbedMetadata } from "~/lib/utils";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  // Get base URL - use environment variable or fallback to working domain
  // The actual domain will be determined at runtime from the request
  const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://routine-plants-projects-156afffe.vercel.app';
  const ogImageUrl = `${baseUrl}/api/opengraph-image`;
  
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
      "fc:miniapp": JSON.stringify(getMiniAppEmbedMetadata(ogImageUrl, baseUrl)),
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
