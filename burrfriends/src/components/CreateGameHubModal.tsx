'use client';

import { useState } from 'react';
import Link from 'next/link';

interface CreateGameHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  clubSlug?: string;
  onSelectGame?: (gameId: string) => void;  // Phase 18.5: Callback when BETR game selected
}

const GAME_TYPES = [
  {
    id: 'poker',
    name: 'Poker Game',
    description: 'Traditional poker game with buy-in',
    href: (slug: string) => `/clubs/${slug}/games/new`,
    color: 'var(--fire-1)',
  },
  {
    id: 'betr-guesser',
    name: 'BETR GUESSER',
    description: 'Guess the BETR price',
    modal: 'betr-guesser',
    color: '#10b981',
  },
  {
    id: 'buddy-up',
    name: 'BUDDY UP',
    description: 'Team-based voting game',
    modal: 'buddy-up',
    color: '#8b5cf6',
  },
  {
    id: 'the-mole',
    name: 'THE MOLE',
    description: 'Find the mole among players',
    modal: 'the-mole',
    color: '#ef4444',
  },
  {
    id: 'steal-no-steal',
    name: 'STEAL OR NO STEAL',
    description: '2-player negotiation game',
    modal: 'steal-no-steal',
    color: '#06b6d4',
  },
  {
    id: 'heads-up-steal-no-steal',
    name: 'HEADS UP Steal or No Steal',
    description: '2-player, always YOU WIN. Admin picks players, no signup.',
    modal: 'heads-up-steal-no-steal',
    color: 'var(--fire-1)',
  },
  {
    id: 'remix-betr',
    name: 'FRAMEDL BETR',
    description: 'Play Framedl, submit your result',
    modal: 'remix-betr',
    color: '#f59e0b',
  },
  {
    id: 'weekend-game',
    name: 'WEEKEND GAME',
    description: 'REMIX 3D Tunnel Racer, single round',
    modal: 'weekend-game',
    color: '#a855f7',
  },
  {
    id: 'bullied',
    name: 'BULLIED',
    description: '3 go in, 1 or none advance',
    modal: 'bullied',
    color: '#dc2626',
  },
  {
    id: 'in-or-out',
    name: 'IN OR OUT',
    description: 'Quit for $10M share or Stay',
    modal: 'in-or-out',
    color: '#f97316',
  },
  {
    id: 'take-from-the-pile',
    name: 'TAKE FROM THE PILE',
    description: 'Take from the pile. Your turn, your amount.',
    modal: 'take-from-the-pile',
    color: 'var(--fire-1)',
  },
  {
    id: 'kill-or-keep',
    name: 'KILL OR KEEP',
    description: 'Keep or kill one per turn. Final 10 survive.',
    modal: 'kill-or-keep',
    color: '#dc2626',
  },
  {
    id: 'superbowl-squares',
    name: 'BETR SUPERBOWL SQUARES',
    description: 'Super Bowl squares with tiered staking',
    modal: 'superbowl-squares',
    color: '#00ffc8',
  },
  {
    id: 'superbowl-props',
    name: 'BETR SUPERBOWL: PROPS',
    description: '25 prop bets + tiebreaker. Top 5 win!',
    modal: 'superbowl-props',
    color: '#eab308',
  },
  {
    id: 'art-contest',
    name: 'TO SPINFINITY AND BEYOND ART CONTEST',
    description: 'Submit your art. Top 14 win. $4000+ prize pool.',
    modal: 'art-contest',
    color: 'var(--fire-1)',
  },
  {
    id: 'sunday-high-stakes',
    name: 'SUNDAY HIGH STAKES ARE BETR',
    description: 'Submit your cast. Get the password and play on Club GG.',
    modal: 'sunday-high-stakes',
    color: 'var(--fire-1)',
  },
  {
    id: 'nl-holdem',
    name: 'NL HOLDEM',
    description: 'In-app No-Limit Hold\'em Sit & Go',
    modal: 'nl-holdem',
    color: '#0ea5e9',
  },
  {
    id: 'ncaa-hoops',
    name: 'NCAA HOOPS',
    description: 'March Madness bracket. Pick winners, 1–2–4–8–16–32–64 pts.',
    modal: 'ncaa-hoops',
    color: '#0d9488',
  },
  // JENGA is hidden per Phase 15.0
];

export function CreateGameHubModal({ isOpen, onClose, clubSlug = 'burrfriends', onSelectGame }: CreateGameHubModalProps) {
  const [selectedGame, setSelectedGame] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGameSelect = (gameId: string) => {
    setSelectedGame(gameId);
    // Phase 18.5: Call callback to open game-specific create modal
    onSelectGame?.(gameId);
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-1)',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '500px',
          width: '100%',
          maxHeight: '80vh',
          overflow: 'auto',
          border: '1px solid var(--stroke)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ color: 'var(--text-0)', margin: 0, fontSize: '1.25rem' }}>Create New Game</h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-1)',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            ×
          </button>
        </div>

        <p style={{ color: 'var(--text-1)', marginBottom: '20px', fontSize: '0.875rem' }}>
          Select a game type to create:
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {GAME_TYPES.map((game) => (
            <div key={game.id}>
              {game.href ? (
                <Link
                  href={game.href(clubSlug)}
                  style={{
                    display: 'block',
                    padding: '16px',
                    background: 'var(--bg-2)',
                    borderRadius: '8px',
                    border: `2px solid ${game.color}40`,
                    textDecoration: 'none',
                    transition: 'all 0.2s',
                  }}
                  onClick={onClose}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        background: game.color,
                      }}
                    />
                    <div>
                      <div style={{ color: 'var(--text-0)', fontWeight: 600 }}>{game.name}</div>
                      <div style={{ color: 'var(--text-1)', fontSize: '0.75rem' }}>{game.description}</div>
                    </div>
                  </div>
                </Link>
              ) : (
                <button
                  onClick={() => handleGameSelect(game.id)}
                  style={{
                    width: '100%',
                    padding: '16px',
                    background: 'var(--bg-2)',
                    borderRadius: '8px',
                    border: `2px solid ${game.color}40`,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        background: game.color,
                      }}
                    />
                    <div>
                      <div style={{ color: 'var(--text-0)', fontWeight: 600 }}>{game.name}</div>
                      <div style={{ color: 'var(--text-1)', fontSize: '0.75rem' }}>{game.description}</div>
                    </div>
                  </div>
                </button>
              )}
            </div>
          ))}
        </div>

        <p style={{ color: 'var(--text-2)', marginTop: '20px', fontSize: '0.75rem', textAlign: 'center' }}>
          BETR GAMES can also be created from their respective pages
        </p>
      </div>
    </div>
  );
}
