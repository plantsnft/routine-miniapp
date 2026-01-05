/**
 * Helper to wrap Neynar SDK calls and fetch requests to Neynar API.
 * Returns structured results instead of throwing for known errors.
 */

export type NeynarResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string; raw?: unknown };

/**
 * Extract error code from HTTP status code
 */
function getErrorCode(status: number): string {
  if (status === 402) return "NEYNAR_CREDITS_EXCEEDED";
  if (status === 401 || status === 403) return "NEYNAR_AUTH";
  if (status === 429) return "NEYNAR_RATE_LIMIT";
  return "NEYNAR_ERROR";
}

/**
 * Wrap a Neynar SDK call or async function that may throw.
 * Catches errors and converts to structured result.
 */
export async function wrapNeynarCall<T>(
  fn: () => Promise<T>,
  routeName: string
): Promise<NeynarResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (error: any) {
    // Try to extract status code from error
    let status = 500;
    let message = error?.message || "Unknown error";
    let raw = error;

    // Check if error has status property (axios/fetch errors)
    if (error?.status) {
      status = error.status;
    } else if (error?.response?.status) {
      status = error.response.status;
    } else if (error?.statusCode) {
      status = error.statusCode;
    }

    // Try to extract message from error response
    if (error?.response?.data) {
      const responseData = error.response.data;
      if (typeof responseData === "string") {
        try {
          const parsed = JSON.parse(responseData);
          message = parsed.message || parsed.error || message;
        } catch {
          message = responseData;
        }
      } else if (responseData?.message) {
        message = responseData.message;
      } else if (responseData?.error) {
        message = responseData.error;
      }
    }

    const code = getErrorCode(status);

    // Log the error
    console.error(`[Neynar Error] route=${routeName} status=${status} code=${code}`);

    return {
      ok: false,
      status,
      code,
      message,
      raw,
    };
  }
}

/**
 * Wrap a fetch call to Neynar API.
 * Handles non-OK responses and converts to structured result.
 */
export async function wrapNeynarFetch<T>(
  url: string,
  options: RequestInit,
  routeName: string
): Promise<NeynarResult<T>> {
  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      const status = response.status;
      const code = getErrorCode(status);
      
      let message = `HTTP ${status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        message = errorData.message || errorData.error || message;
      } catch {
        // If JSON parse fails, try text
        try {
          const errorText = await response.text();
          if (errorText) message = errorText.substring(0, 200);
        } catch {
          // Ignore
        }
      }

      // Log the error
      console.error(`[Neynar Error] route=${routeName} status=${status} code=${code}`);

      return {
        ok: false,
        status,
        code,
        message,
      };
    }

    const data = await response.json() as T;
    return { ok: true, data };
  } catch (error: any) {
    const status = 500;
    const code = getErrorCode(status);
    const message = error?.message || "Network error";

    // Log the error
    console.error(`[Neynar Error] route=${routeName} status=${status} code=${code}`);

    return {
      ok: false,
      status,
      code,
      message,
      raw: error,
    };
  }
}

