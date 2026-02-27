/**
 * Opens the Farcaster profile for a user in the Farcaster app (when in miniapp) or Warpcast in a new tab.
 * Use for clickable names/PFPs across games (Poker, BUDDY UP, THE MOLE, JENGA, etc.).
 */

export function openFarcasterProfile(fid: number, username: string | null): void {
  if (typeof window === "undefined") return;

  import("@farcaster/miniapp-sdk")
    .then(({ sdk }) => {
      if (sdk?.actions?.viewProfile) {
        sdk.actions.viewProfile({ fid }).catch(() => {
          const url = username
            ? `https://warpcast.com/${username}`
            : `https://warpcast.com/~/profile/${fid}`;
          window.open(url, "_blank", "noopener,noreferrer");
        });
      } else {
        const url = username
          ? `https://warpcast.com/${username}`
          : `https://warpcast.com/~/profile/${fid}`;
        window.open(url, "_blank", "noopener,noreferrer");
      }
    })
    .catch(() => {
      const url = username
        ? `https://warpcast.com/${username}`
        : `https://warpcast.com/~/profile/${fid}`;
      window.open(url, "_blank", "noopener,noreferrer");
    });
}
