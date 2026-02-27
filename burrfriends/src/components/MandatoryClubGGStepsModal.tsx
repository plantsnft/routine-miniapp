'use client';

/**
 * Shared modal: MANDATORY NEXT STEP (same copy as poker post-registration).
 * Used by poker game page and Sunday High Stakes (Phase 42) after submit success.
 */

export interface MandatoryClubGGStepsModalProps {
  gameTitle: string;
  password: string;
  clubggUrl: string;
  onClose: () => void;
  onCopy?: () => void;
}

export function MandatoryClubGGStepsModal({
  gameTitle,
  password,
  clubggUrl,
  onClose,
  onCopy,
}: MandatoryClubGGStepsModalProps) {
  const handleCopy = () => {
    navigator.clipboard.writeText(password);
    onCopy?.();
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="hl-card max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
          MANDATORY NEXT STEP:
        </h3>
        <ol className="list-decimal list-inside space-y-2 text-sm mb-4" style={{ color: 'var(--text-primary)' }}>
          <li className="flex flex-wrap items-center gap-2">
            <span>COPY PASSWORD HERE:</span>
            <span className="font-mono" style={{ color: 'var(--text-muted)' }}>{password}</span>
            <button
              type="button"
              onClick={handleCopy}
              className="btn-secondary text-xs py-1 px-2"
            >
              Copy
            </button>
          </li>
          <li>
            <span>Click </span>
            <a
              href={clubggUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
              style={{ color: 'var(--fire-1)' }}
            >
              here
            </a>
            <span> to bring up Club GG app/website</span>
          </li>
          <li>Find game called <strong>{gameTitle}</strong></li>
          <li>Insert the password above to join</li>
        </ol>
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
          Please note: if you will no longer be playing in the poker game please unregister from BOTH the Club GG app and {gameTitle}.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="btn-primary"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
