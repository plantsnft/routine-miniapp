/**
 * authedFetch - Helper for making authenticated API requests
 * 
 * Automatically injects Authorization: Bearer <token> header
 * from the auth context.
 * 
 * Handles 401 Unauthorized by throwing a typed AuthExpiredError
 * so UI can distinguish auth expiry from other errors.
 * 
 * Usage:
 * const { token } = useAuth();
 * try {
 *   const response = await authedFetch('/api/games', { method: 'GET' }, token);
 * } catch (err) {
 *   if (err instanceof AuthExpiredError) {
 *     // Handle session expiry
 *   }
 * }
 */

export class AuthExpiredError extends Error {
  code = 'AUTH_EXPIRED' as const;
  
  constructor(message: string = 'Session expired. Please refresh and try again.') {
    super(message);
    this.name = 'AuthExpiredError';
  }
}

export async function authedFetch(
  url: string,
  options: RequestInit = {},
  token: string | null
): Promise<Response> {
  if (!token) {
    throw new Error('No auth token available. User must be authenticated.');
  }

  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Handle 401 Unauthorized - session expired
  if (response.status === 401) {
    throw new AuthExpiredError('Session expired. Please refresh this mini-app and try again.');
  }

  return response;
}

