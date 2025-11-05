/**
 * Custom hook for managing check-in functionality.
 * Handles fetching streak data and performing check-ins.
 */

import { useState, useCallback } from "react";
import type { CheckinStatus } from "~/lib/types";
import { calculateTimeUntilNextCheckIn } from "~/lib/dateUtils";

interface UseCheckinResult {
  status: CheckinStatus;
  loading: boolean;
  saving: boolean;
  error: string | null;
  fetchStreak: (userId: number, showErrors?: boolean) => Promise<void>;
  performCheckIn: (userId: number) => Promise<{ success: boolean; streak?: number }>;
  clearError: () => void;
}

/**
 * Hook for managing check-in state and operations.
 */
export function useCheckin(): UseCheckinResult {
  const [status, setStatus] = useState<CheckinStatus>({
    checkedIn: false,
    streak: null,
    lastCheckIn: null,
    timeUntilNext: null,
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch user's current streak and check-in status.
   * @param userId - Farcaster user ID
   * @param showErrors - Whether to show errors to the user (default: false for background fetches)
   */
  const fetchStreak = useCallback(async (userId: number, showErrors: boolean = false) => {
    try {
      setLoading(true);
      setError(null);
      
      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const res = await fetch(`/api/checkin?fid=${userId}`, {
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!res.ok) {
        // Try to get error message from response
        let errorMessage = `HTTP error! status: ${res.status}`;
        try {
          const contentType = res.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const errorData = await res.json();
            errorMessage = errorData?.error || errorData?.message || errorMessage;
          } else {
            const text = await res.text();
            if (text) errorMessage = text.substring(0, 200);
          }
        } catch (e) {
          // If we can't parse the error, use the status message
        }
        throw new Error(errorMessage);
      }
      
      // Check content type before parsing JSON
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        throw new Error(`Expected JSON but got ${contentType || 'unknown type'}. Response: ${text.substring(0, 100)}`);
      }
      
      let data;
      try {
        data = await res.json();
      } catch (jsonError: any) {
        console.error("[useCheckin] JSON parse error:", jsonError);
        throw new Error("Failed to parse response from server");
      }

      if (data?.ok) {
        const hasCheckedInToday = data.hasCheckedInToday || false;
        setStatus({
          checkedIn: hasCheckedInToday,
          streak: data.streak || 0,
          lastCheckIn: data.last_checkin || null,
          timeUntilNext: hasCheckedInToday ? calculateTimeUntilNextCheckIn() : null,
        });
      } else {
        setError(data?.error || "Failed to fetch streak");
      }
    } catch (err: any) {
      console.error("[useCheckin] Error fetching streak:", err);
      
      // Don't show error if it's an abort (timeout) - just log it
      // Also don't show errors for background fetches (initial load) - only show for user-initiated actions
      if (err.name !== 'AbortError' && showErrors) {
        let errorMessage = "Failed to fetch streak";
        if (err?.message) {
          // Only show user-friendly error messages
          if (err.message.includes("parse") || err.message.includes("JSON")) {
            errorMessage = "Server response error. Please try again.";
          } else if (err.message.length < 100) {
            errorMessage = err.message;
          }
        }
        setError(errorMessage);
      } else if (err.name !== 'AbortError') {
        // For background fetches, just log the error but don't show it to user
        console.warn("[useCheckin] Background fetch error (not shown to user):", err.message);
      }
      
      // Set default state on error to prevent app from hanging
      setStatus({
        checkedIn: false,
        streak: 0,
        lastCheckIn: null,
        timeUntilNext: null,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Perform a check-in for the user.
   */
  const performCheckIn = useCallback(async (userId: number) => {
    try {
      setSaving(true);
      setError(null);

      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fid: userId }),
      });

      // Check content type before parsing JSON
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        throw new Error(`Expected JSON but got ${contentType || 'unknown type'}. Response: ${text.substring(0, 100)}`);
      }

      let data;
      try {
        data = await res.json();
      } catch (jsonError: any) {
        console.error("[useCheckin] JSON parse error in performCheckIn:", jsonError);
        throw new Error("Failed to parse response from server");
      }

      // Clear any previous errors on successful check-in
      if (res.ok && data.ok) {
        setError(null); // Clear error on success
        const newStreak = data.streak ?? (status.streak ?? 0) + 1;
        setStatus({
          checkedIn: true,
          streak: newStreak,
          lastCheckIn: new Date().toISOString(),
          timeUntilNext: calculateTimeUntilNextCheckIn(),
        });
        return { success: true, streak: newStreak };
      } else if (res.status === 409) {
        // Already checked in today - refresh streak to show current state
        // Don't show errors for this refresh
        await fetchStreak(userId, false);
        setStatus((prev) => ({ ...prev, checkedIn: true }));
        // Don't show error for already checked in - this is expected behavior
        // The UI will show the checked-in state from fetchStreak
        return { success: false };
      } else {
        // For other errors, verify if the check-in actually succeeded
        // Sometimes the response might be malformed but the check-in succeeded
        console.warn("[useCheckin] Non-200 response, verifying check-in status:", res.status, data);
        
        // Try to verify if check-in actually succeeded by fetching current status
        try {
          const verifyRes = await fetch(`/api/checkin?fid=${userId}`);
          if (verifyRes.ok) {
            const verifyData = await verifyRes.json();
            if (verifyData.hasCheckedInToday) {
              // Check-in actually succeeded, just refresh the UI
              console.log("[useCheckin] Check-in verified successful despite error response");
              await fetchStreak(userId, false);
              setStatus((prev) => ({ ...prev, checkedIn: true }));
              setError(null);
              return { success: true };
            }
          }
        } catch (verifyError) {
          console.error("[useCheckin] Error verifying check-in:", verifyError);
        }
        
        // If verification failed or shows not checked in, show the error
        const errorMessage = data?.detail || data?.error || "Unknown error occurred";
        setError(errorMessage);
        return { success: false };
      }
    } catch (err: any) {
      console.error("[useCheckin] Check-in error:", err);
      
      // Even if there was an error, verify if the check-in actually succeeded
      // Sometimes network errors or parsing errors occur after the server processes the request
      try {
        console.log("[useCheckin] Verifying check-in status after error...");
        const verifyRes = await fetch(`/api/checkin?fid=${userId}`);
        if (verifyRes.ok) {
          const verifyData = await verifyRes.json();
          if (verifyData.hasCheckedInToday) {
            // Check-in actually succeeded despite the error
            console.log("[useCheckin] Check-in verified successful despite error");
            await fetchStreak(userId, false);
            setStatus((prev) => ({ ...prev, checkedIn: true }));
            setError(null);
            return { success: true };
          }
        }
      } catch (verifyError) {
        console.error("[useCheckin] Error verifying check-in after error:", verifyError);
      }
      
      // Handle specific error types
      let errorMessage = "Network error";
      if (err?.message) {
        errorMessage = err.message;
      } else if (err?.name === "AbortError") {
        errorMessage = "Request timed out. Please try again.";
      } else if (err?.name === "TypeError" && err?.message?.includes("fetch")) {
        errorMessage = "Network connection failed. Please check your internet.";
      }
      
      setError(errorMessage);
      return { success: false };
    } finally {
      setSaving(false);
    }
  }, [status.streak, fetchStreak]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    status,
    loading,
    saving,
    error,
    fetchStreak,
    performCheckIn,
    clearError,
  };
}

