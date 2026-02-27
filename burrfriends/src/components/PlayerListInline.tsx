'use client';

import { openFarcasterProfile } from '~/lib/openFarcasterProfile';

const DEFAULT_PFP = 'https://i.imgur.com/1Q9ZQ9u.png';

export type PlayerListItem = {
  fid: number;
  username?: string | null;
  display_name?: string | null;
  pfp_url?: string | null;
};

type PlayerListInlineProps = {
  /** List of players to show (PFP + name, clickable to Farcaster profile) */
  players: PlayerListItem[];
  /** Fallback image when pfp_url is missing or fails */
  defaultPfp?: string;
  /** Size: sm = 24px avatar, md = 32px */
  size?: 'sm' | 'md';
  /** Optional class for the container */
  className?: string;
};

export function PlayerListInline({ players, defaultPfp = DEFAULT_PFP, size = 'sm', className = '' }: PlayerListInlineProps) {
  if (!players.length) return null;

  const avatarSize = size === 'md' ? 32 : 24;
  const textSize = size === 'md' ? 'text-sm' : 'text-xs';

  return (
    <div className={`flex flex-wrap gap-2 items-center ${className}`.trim()}>
      {players.map((player) => {
        const fid = Number(player.fid);
        const username = player.username ?? null;
        const displayName = player.display_name ?? player.username ?? `FID ${fid}`;
        const pfpUrl = player.pfp_url || defaultPfp;

        return (
          <button
            key={`${fid}-${username ?? 'n'}`}
            type="button"
            onClick={() => openFarcasterProfile(fid, username)}
            className="flex items-center gap-1.5 rounded-full hover:opacity-80 transition-opacity border-0 cursor-pointer p-0.5 bg-transparent"
            style={{ color: 'var(--text-0)' }}
          >
            <img
              src={pfpUrl}
              alt={displayName}
              className="rounded-full object-cover flex-shrink-0"
              style={{ width: avatarSize, height: avatarSize, objectFit: 'cover' }}
              onError={(e) => {
                const el = e.target as HTMLImageElement;
                el.src = defaultPfp;
                el.onerror = () => { el.style.display = 'none'; };
              }}
            />
            <span className={textSize} style={{ color: 'var(--text-1)' }}>
              {displayName}
            </span>
          </button>
        );
      })}
    </div>
  );
}
