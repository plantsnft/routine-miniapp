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
  fetchStreak: (userId: number) => Promise<void>;
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
   */
  const fetchStreak = useCallback(async (userId: number) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/checkin?fid=${userId}`);
      const data = await res.json();

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
    } catch (err) {
      console.error("[useCheckin] Error fetching streak:", err);
      setError("Failed to fetch streak");
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

      const data = await res.json();

      if (res.ok && data.ok) {
        const newStreak = data.streak ?? (status.streak ?? 0) + 1;
        setStatus({
          checkedIn: true,
          streak: newStreak,
          lastCheckIn: new Date().toISOString(),
          timeUntilNext: calculateTimeUntilNextCheckIn(),
        });
        return { success: true, streak: newStreak };
      } else if (res.status === 409) {
        // Already checked in today
        await fetchStreak(userId);
        setStatus((prev) => ({ ...prev, checkedIn: true }));
        setError(
          data?.error ||
            "You've already checked in today! Come back at 9 AM Pacific time tomorrow."
        );
        return { success: false };
      } else {
        setError(data?.detail || data?.error || "Unknown error");
        return { success: false };
      }
    } catch (err: any) {
      console.error("[useCheckin] Check-in error:", err);
      setError(err?.message || "Network error");
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

