"use client";

import { useEffect, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";

export default function DailyCheckin() {
  const [fid, setFid] = useState<number | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [checkedIn, setCheckedIn] = useState(false);
  const [streak, setStreak] = useState(3);
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">(
    "idle"
  );
  const [errorMessage, setErrorMessage] = useState("");

  // 1) first try: maybe the host already gave us ?hash=...&signature=...&fid=...
  useEffect(() => {
    const loadUser = async () => {
      try {
        const qs =
          typeof window !== "undefined" ? window.location.search : "";
        const res = await fetch("/api/siwn" + qs);
        const data = await res.json();

        if (data?.ok && data?.fid) {
          setFid(Number(data.fid));
          setErrorMessage("");
        } else {
          setFid(null);
          if (data?.error) {
            setErrorMessage(data.error);
          }
        }
      } catch (_e) {
        setFid(null);
      } finally {
        setLoadingUser(false);
      }
    };

    loadUser();
  }, []);

  // 2) explicit sign-in — this time we POST the result to our API
  const handleSignIn = async () => {
    try {
      const nonce = Math.random().toString(36).slice(2);

      // ask Warpcast/Base to SIWN
      const siwnResult = await sdk.actions.signIn({
        nonce,
        acceptAuthAddress: true,
      });
      // siwnResult should have hash, signature, maybe fid

      const res = await fetch("/api/siwn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(siwnResult),
      });

      const data = await res.json();

      if (data?.ok && data?.fid) {
        setFid(Number(data.fid));
        setErrorMessage("");
      } else {
        setErrorMessage(
          data?.error || "Signed in but could not resolve FID from server."
        );
      }
    } catch (err: any) {
      setErrorMessage(
        err?.message || "Sign-in failed. Try from Warpcast mini app preview."
      );
    }
  };

  const handleCheckIn = async () => {
    if (checkedIn || status === "saving") return;

    if (!fid) {
      setStatus("error");
      setErrorMessage(
        "No Farcaster user found. Tap ‘Sign in with Farcaster’ first."
      );
      return;
    }

    setStatus("saving");
    setErrorMessage("");

    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fid }),
      });

      const data = await res.json();

      if (res.ok && data.ok) {
        setCheckedIn(true);
        setStreak((s) => s + 1);
        setStatus("done");
      } else {
        setStatus("error");
        setErrorMessage(data?.detail || data?.error || "Unknown error");
      }
    } catch (err: any) {
      setStatus("error");
      setErrorMessage(err?.message || "Network error");
    }
  };

  return (
    <div
      style={{
        marginTop: 24,
        background: "#f4f0ff",
        border: "1px solid rgba(139,92,246,0.25)",
        borderRadius: 16,
        padding: 20,
      }}
    >
      <h2 style={{ margin: 0, marginBottom: 6, color: "#3b0764" }}>
        🐾 Catwalk Daily Check-in
      </h2>
      <p style={{ margin: 0, marginBottom: 14, color: "#6b21a8" }}>
        Check in once per day to keep your streak and earn $CATWALK later.
      </p>

      {/* show sign-in button if we still don't know who this is */}
      {!fid ? (
        <button
          onClick={handleSignIn}
          style={{
            background: "#0f172a",
            color: "#fff",
            border: "none",
            borderRadius: 9999,
            padding: "10px 18px",
            cursor: "pointer",
            fontWeight: 600,
            marginBottom: 10,
          }}
        >
          Sign in with Farcaster
        </button>
      ) : null}

      {/* main check-in button */}
      <button
        onClick={handleCheckIn}
        disabled={checkedIn || status === "saving"}
        style={{
          background: checkedIn || status === "saving" ? "#d4d4d8" : "#8b5cf6",
          color: checkedIn ? "#4b5563" : "#fff",
          border: "none",
          borderRadius: 9999,
          padding: "10px 18px",
          cursor: checkedIn ? "not-allowed" : "pointer",
          fontWeight: 600,
          marginLeft: 8,
        }}
      >
        {status === "saving"
          ? "Saving..."
          : checkedIn
          ? "✅ Checked in for today"
          : "Check in for today"}
      </button>

      {status === "done" && (
        <p style={{ marginTop: 12, color: "#15803d" }}>Saved ✅</p>
      )}
      {(status === "error" || errorMessage) && (
        <p style={{ marginTop: 12, color: "#b91c1c" }}>
          {errorMessage || "Couldn’t save to Supabase ❌"}
        </p>
      )}

      <p style={{ marginTop: 12, fontSize: 12, color: "#6b21a8" }}>
        Current FID: {fid ? fid : "none (not signed in)"}
      </p>
    </div>
  );
}
