'use client';

interface RegisterForBetrGamesModalProps {
  isOpen: boolean;
  onClose: () => void;
  alreadyRegistered?: boolean;
  approved?: boolean;
  error?: boolean;
  errorReason?: 'generic' | 'insufficient_stake' | 'registration_closed';
  stakedAmount?: string;
}

export function RegisterForBetrGamesModal({
  isOpen,
  onClose,
  alreadyRegistered = false,
  approved = false,
  error = false,
  errorReason,
  stakedAmount,
}: RegisterForBetrGamesModalProps) {
  if (!isOpen) return null;

  const isInsufficientStake = errorReason === 'insufficient_stake';
  const isRegistrationClosed = errorReason === 'registration_closed';

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        className="hl-card"
        style={{
          maxWidth: '90%',
          width: '400px',
          padding: '24px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-0)' }}>
            {isRegistrationClosed
              ? 'Registration Closed'
              : isInsufficientStake
                ? 'Registration requires 50M BETR staked.'
                : error
                  ? 'Registration failed.'
                  : approved
                    ? 'Registration successful '
                    : 'Registration Received'}
            {!error && !isInsufficientStake && !isRegistrationClosed && approved && <span style={{ color: 'var(--fire-1)' }}>✓</span>}
          </h2>
          <button
            onClick={onClose}
            className="text-2xl leading-none"
            style={{ color: 'var(--text-1)' }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {isRegistrationClosed ? (
          <p style={{ color: 'var(--text-1)', marginBottom: '20px' }}>
            Registration is closed for BETR GAMES.
          </p>
        ) : isInsufficientStake ? (
          <p style={{ color: 'var(--text-1)', marginBottom: '20px' }}>
            {stakedAmount != null && stakedAmount !== ''
              ? `You have ${stakedAmount} BETR staked. At least 50 million BETR staked is required to register.`
              : 'You need at least 50 million BETR staked to register for BETR GAMES.'}
          </p>
        ) : error ? (
          <p style={{ color: 'var(--text-1)', marginBottom: '20px' }}>
            Something went wrong. Please try again.
          </p>
        ) : (
          <>
            {/* Phase 22.2: Only show glowing welcome when approved */}
            {approved ? (
              <>
                <div
                  style={{
                    padding: '12px 16px',
                    marginBottom: '16px',
                    background: 'rgba(20, 184, 166, 0.12)',
                    border: '1px solid rgba(20, 184, 166, 0.4)',
                    borderRadius: '8px',
                    boxShadow: '0 0 20px rgba(20, 184, 166, 0.3), 0 0 40px rgba(20, 184, 166, 0.15)',
                    animation: 'pulseGlow 2s ease-in-out infinite',
                  }}
                >
                  <span
                    style={{
                      color: 'var(--text-0)',
                      fontWeight: 600,
                      fontSize: '15px',
                      animation: 'welcomeTextPulse 2s ease-in-out infinite',
                    }}
                  >
                    Welcome to BETR GAMES WITH BURR
                  </span>
                </div>
                <p style={{ color: 'var(--fire-1)', marginBottom: '16px', fontWeight: 600 }}>
                  You&apos;re approved and ready to play!
                </p>
              </>
            ) : (
              <p style={{ color: '#f59e0b', marginBottom: '16px' }}>
                Pending admin approval. You&apos;ll be notified when approved.
              </p>
            )}
            
            <p style={{ color: 'var(--text-1)', marginBottom: alreadyRegistered ? '8px' : '20px' }}>
              Add the mini app for notifications.
            </p>
            {alreadyRegistered && (
              <p style={{ color: 'var(--text-2)', fontSize: '0.9em', marginBottom: '20px' }}>
                You&apos;re already on the list.
              </p>
            )}
          </>
        )}

        <button onClick={onClose} className="btn-primary" style={{ width: '100%' }}>
          Close
        </button>
      </div>
    </div>
  );
}
