'use client';

import { useEffect } from 'react';
import { PaymentButton } from './PaymentButton';
import type { Game } from '~/lib/types';

interface PaymentButtonWrapperProps {
  game: Game;
  playerFid: number;
  onSuccess: (txHash: string, password: string | null) => void;
  onError: (error: string) => void;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
}

// Wrapper component to auto-trigger payment when game is set
export function PaymentButtonWrapper({ 
  game, 
  playerFid, 
  onSuccess, 
  onError,
  buttonRef 
}: PaymentButtonWrapperProps) {
  useEffect(() => {
    // Auto-trigger payment when component mounts (after a small delay to ensure button is rendered)
    const timer = setTimeout(() => {
      if (buttonRef.current) {
        buttonRef.current.click();
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [buttonRef]);

  return (
    <div style={{ position: 'absolute', left: '-9999px', opacity: 0, pointerEvents: 'none' }}>
      <PaymentButton
        game={game}
        playerFid={playerFid}
        onSuccess={onSuccess}
        onError={onError}
        buttonRef={buttonRef}
      />
    </div>
  );
}






