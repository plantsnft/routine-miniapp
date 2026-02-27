'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { getIsAdminCached } from '~/lib/adminStatusCache';
import { RegisterForBetrGamesModal } from '~/components/RegisterForBetrGamesModal';
import { BetrGamesRegistrationsListModal } from '~/components/BetrGamesRegistrationsListModal';

export interface RegisterForBetrGamesBarProps {
  /** Called after successful registration so parent can refetch status (e.g. games page) */
  onRegistrationSuccess?: () => void;
  /** Optional countdown string for line under button: "Registration closes Xd Xh Xm" or "Registration open" (per 10.3.1/10.3.3) */
  registrationCountdown?: string;
  /** When true, show "Registration closed" and hide Register button */
  registrationClosed?: boolean;
}

export function RegisterForBetrGamesBar({
  onRegistrationSuccess,
  registrationCountdown,
  registrationClosed = false,
}: RegisterForBetrGamesBarProps = {}) {
  const { token, status: authStatus } = useAuth();
  const [registered, setRegistered] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalError, setModalError] = useState(false);
  const [modalAlreadyRegistered, setModalAlreadyRegistered] = useState(false);
  const [modalApproved, setModalApproved] = useState(false);
  const [modalErrorReason, setModalErrorReason] = useState<'generic' | 'registration_closed' | undefined>(undefined);
  const [isAdmin, setIsAdmin] = useState(false);
  const [listModalOpen, setListModalOpen] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (authStatus !== 'authed' || !token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch('/api/betr-games/register/status', { method: 'GET' }, token);
        const data = await res.json();
        if (cancelled || !mounted.current) return;
        if (res.ok && data?.ok) {
          setRegistered(data?.data?.registered === true);
        } else {
          setRegistered(false);
        }
      } catch {
        if (!cancelled && mounted.current) setRegistered(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authStatus, token]);

  useEffect(() => {
    if (authStatus !== 'authed' || !token) return;
    let cancelled = false;
    (async () => {
      try {
        if (cancelled || !mounted.current) return;
        const admin = await getIsAdminCached(token);
        if (cancelled || !mounted.current) return;
        setIsAdmin(admin);
      } catch {
        if (!cancelled && mounted.current) setIsAdmin(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authStatus, token]);

  if (authStatus !== 'authed' || !token) return null;

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    setModalError(false);
    setModalAlreadyRegistered(false);
    setModalApproved(false);
    setModalErrorReason(undefined);
    try {
      const res = await authedFetch('/api/betr-games/register', { method: 'POST' }, token);
      const data = await res.json().catch(() => null);
      // Phase 22.9: Handle 403 registration_closed
      if (res.status === 403 && data?.data?.reason === 'registration_closed') {
        if (!mounted.current) return;
        setModalError(false);
        setModalErrorReason('registration_closed');
        setModalOpen(true);
        return;
      }
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? 'Failed to register');
      if (!mounted.current) return;
      setRegistered(true);
      setModalError(false);
      setModalErrorReason(undefined);
      setModalAlreadyRegistered(Boolean(data?.data?.alreadyRegistered));
      setModalApproved(Boolean(data?.data?.approved));
      setModalOpen(true);
      onRegistrationSuccess?.();
    } catch {
      if (mounted.current) {
        setModalError(true);
        setModalErrorReason(undefined);
        setModalOpen(true);
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  };

  return (
    <>
      <div
        style={{
          width: '100%',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: isAdmin ? 'space-between' : 'center',
          backgroundColor: 'var(--bg-1)',
          borderBottom: '1px solid var(--stroke-fire)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          {registered === true ? (
            <span
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--text-1)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              Registered <span style={{ color: 'var(--fire-1)' }}>✓</span>
            </span>
          ) : registrationClosed ? (
            <>
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-1)' }}>Registration closed</span>
              <span style={{ fontSize: '0.875rem', color: 'var(--fire-1)' }}>Games in progress</span>
            </>
          ) : (
            <>
              <button
                onClick={handleClick}
                disabled={loading || registered === null}
                className="btn-primary"
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  fontWeight: 600,
                  minHeight: '36px',
                }}
              >
                {loading ? 'Registering…' : 'Register for BETR GAMES'}
              </button>
              {registrationCountdown !== undefined && (
                <span
                  style={{
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    color: 'var(--fire-1)',
                    textShadow: '0 0 8px rgba(20, 184, 166, 0.8)',
                  }}
                >
                  {(registrationCountdown && registrationCountdown !== 'closed') ? `Registration closes ${registrationCountdown}` : 'Registration open'}
                </span>
              )}
            </>
          )}
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setListModalOpen(true)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--fire-1)',
              padding: '4px 8px',
            }}
          >
            View list
          </button>
        )}
      </div>

      <BetrGamesRegistrationsListModal
        isOpen={listModalOpen}
        onClose={() => setListModalOpen(false)}
        token={token}
      />

      <RegisterForBetrGamesModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        alreadyRegistered={modalAlreadyRegistered}
        approved={modalApproved}
        error={modalError}
        errorReason={modalErrorReason}
      />
    </>
  );
}
