import { Metadata } from "next";
import App from "./app";
import { APP_NAME, APP_DESCRIPTION } from "~/lib/constants";
import { getMiniAppEmbedMetadata } from "~/lib/utils";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  try {
    // Get base URL - use environment variable or fallback
    // The actual domain will be determined at runtime from the request
    const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://catwalk-smoky.vercel.app';
    const ogImageUrl = `${baseUrl}/api/opengraph-image`;
    
    let fcMiniapp: string | undefined;
    try {
      fcMiniapp = JSON.stringify(getMiniAppEmbedMetadata(ogImageUrl, baseUrl));
    } catch (error) {
      console.error('[generateMetadata] Error generating fc:miniapp:', error);
      // Continue without fc:miniapp if it fails
    }
    
    return {
      title: APP_NAME ?? "Catwalk",
      description: APP_DESCRIPTION,
      openGraph: {
        title: APP_NAME,
        description: APP_DESCRIPTION,
        images: [ogImageUrl],
      },
      ...(fcMiniapp && {
        other: {
          "fc:miniapp": fcMiniapp,
        },
      }),
    };
  } catch (error) {
    console.error('[generateMetadata] Error:', error);
    // Return minimal metadata if generation fails
    return {
      title: APP_NAME ?? "Catwalk",
      description: APP_DESCRIPTION || "Catwalk Mini App",
    };
  }
}

export default function Home() {
  return (
    <>
      <App />
    </>
  );
}
