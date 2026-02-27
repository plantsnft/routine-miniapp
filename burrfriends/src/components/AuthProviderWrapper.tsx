'use client';

/**
 * Client-side wrapper for AuthProvider
 * Needed because layout.tsx is a server component
 */

import { AuthProvider } from './AuthProvider';

export function AuthProviderWrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

