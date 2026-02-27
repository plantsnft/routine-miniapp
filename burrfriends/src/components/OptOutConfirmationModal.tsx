'use client';

interface OptOutConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
}

export function OptOutConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  isLoading,
}: OptOutConfirmationModalProps) {
  if (!isOpen) return null;

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
            Opt Out of BETR GAMES
          </h2>
          <button
            onClick={onClose}
            className="text-2xl leading-none"
            style={{ color: 'var(--text-1)' }}
            aria-label="Close"
            disabled={isLoading}
          >
            ×
          </button>
        </div>

        <p style={{ color: 'var(--text-1)', marginBottom: '24px' }}>
          You are about to opt out of BETR GAMES and will not be re-added. Are you sure?
        </p>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            onClick={onClose} 
            className="btn-primary" 
            style={{ 
              flex: 1, 
              background: 'var(--bg-2)', 
              border: '1px solid var(--stroke)',
              color: 'var(--text-0)',
            }}
            disabled={isLoading}
          >
            No
          </button>
          <button 
            onClick={onConfirm} 
            style={{ 
              flex: 1,
              padding: '12px 24px',
              borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.2)',
              border: '1px solid #ef4444',
              color: '#ef4444',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              opacity: isLoading ? 0.6 : 1,
            }}
            disabled={isLoading}
          >
            {isLoading ? 'Opting out...' : 'Yes'}
          </button>
        </div>
      </div>
    </div>
  );
}
