'use client';

import { useState, useEffect } from 'react';

type JengaTimerProps = {
  timeRemaining: number | null;
  isMyTurn: boolean;
  currentPlayer: {
    fid: number;
    username: string | null;
    display_name: string | null;
    pfp_url: string | null;
  } | undefined;
  /** V2 handoff: next player must touch to start. When true, show "Touch to start (Xs)" if handoffSecondsRemaining provided. */
  inHandoff?: boolean;
  /** Seconds left in 10s handoff (0–10). Only meaningful when inHandoff and last_placement_at exists. */
  handoffSecondsRemaining?: number | null;
};

export default function JengaTimer({ timeRemaining, isMyTurn, currentPlayer, inHandoff, handoffSecondsRemaining }: JengaTimerProps) {
  const [displayTime, setDisplayTime] = useState<string>('');

  useEffect(() => {
    if (timeRemaining === null) {
      setDisplayTime('');
      return;
    }

    const updateDisplay = () => {
      const minutes = Math.floor(timeRemaining / 60);
      const seconds = timeRemaining % 60;
      setDisplayTime(`${minutes}m ${seconds}s`);
    };

    updateDisplay();
    const interval = setInterval(() => {
      setDisplayTime((prev) => {
        // Parse current time and decrement
        const parts = prev.split(' ');
        const mins = parseInt(parts[0]) || 0;
        const secs = parseInt(parts[1]?.replace('s', '') || '0', 10);
        const total = mins * 60 + secs - 1;
        if (total <= 0) return '0m 0s';
        const newMins = Math.floor(total / 60);
        const newSecs = total % 60;
        return `${newMins}m ${newSecs}s`;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timeRemaining]);

  // V2 handoff: show "Touch to start (Xs)" or "Touch to start" when inHandoff and no active turn timer
  if (timeRemaining === null) {
    if (inHandoff) {
      const secs = handoffSecondsRemaining != null ? Math.max(0, Math.floor(handoffSecondsRemaining)) : null;
      return (
        <div className="text-center p-4 border rounded border-amber-400 bg-amber-50">
          <div className="text-amber-800 font-medium">
            {secs != null ? `Touch to start (${secs}s)` : 'Touch to start'}
          </div>
        </div>
      );
    }
    return (
      <div className="text-center p-4 border rounded">
        <div className="text-gray-500">No active turn</div>
      </div>
    );
  }

  // Color coding: red (<30s), amber (<1min), green (normal)
  const isUrgent = timeRemaining < 30;
  const isWarning = timeRemaining < 60;

  return (
    <div className={`text-center p-6 border-2 rounded-lg ${isUrgent ? 'border-red-500 bg-red-50' : isWarning ? 'border-amber-500 bg-amber-50' : 'border-green-500 bg-green-50'}`}>
      <div className="text-2xl font-bold mb-2">
        {isMyTurn ? 'Your Turn!' : 'Time Remaining'}
      </div>
      <div className={`text-4xl font-mono font-bold ${isUrgent ? 'text-red-600' : isWarning ? 'text-amber-600' : 'text-green-600'}`}>
        {displayTime || `${Math.floor(timeRemaining / 60)}m ${timeRemaining % 60}s`}
      </div>
      {currentPlayer && !isMyTurn && (
        <div className="mt-2 text-sm text-gray-600">
          {currentPlayer.display_name || currentPlayer.username || `FID ${currentPlayer.fid}`}&apos;s turn
        </div>
      )}
    </div>
  );
}
