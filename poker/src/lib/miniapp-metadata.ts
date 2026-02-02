/**
 * Generate Farcaster mini app embed metadata for Open Graph tags
 * This is used in the HTML head to make the embed tool recognize the mini app
 */

export function getMiniAppEmbedMetadata(baseUrl: string) {
  return {
    version: '1',
    imageUrl: 'https://imgur.com/qqNbLzq', // Use the icon from manifest
    button: {
      title: 'Open Mini App',
      action: {
        type: 'launch_frame',
        name: 'Giveaway Games',
        url: baseUrl,
        splashImageUrl: 'https://imgur.com/qqNbLzq',
        splashBackgroundColor: '#111111',
      },
    },
  };
}


