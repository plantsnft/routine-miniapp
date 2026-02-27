/**
 * Generate Farcaster mini app embed metadata for Open Graph tags
 * This is used in the HTML head to make the embed tool recognize the mini app
 */

export function getMiniAppEmbedMetadata(baseUrl: string) {
  return {
    version: '1',
    imageUrl: `${baseUrl}/icon.png`, // Use the icon from manifest
    button: {
      title: 'Open Mini App',
      action: {
        type: 'launch_frame',
        name: 'Poker Lobby',
        url: baseUrl,
        splashImageUrl: `${baseUrl}/icon.png`,
        splashBackgroundColor: '#111111',
      },
    },
  };
}


