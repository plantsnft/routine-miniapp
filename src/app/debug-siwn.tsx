"use client";

import { useState } from "react";

export default function DebugSiwn() {
  const [msg, setMsg] = useState("");

  const handleClick = async () => {
    try {
      const res = await fetch("/api/siwn");
      const data = await res.json();
      setMsg(JSON.stringify(data, null, 2));
    } catch (_e) {
      setMsg("Error calling /api/siwn");
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginBottom: 8 }}>Debug: Test SIWN API</h2>
      <button
        onClick={handleClick}
        style={{
          padding: "10px 16px",
          borderRadius: 8,
          border: "1px solid #ccc",
          background: "#fff",
          cursor: "pointer",
        }}
      >
        Sign in with Neynar (Test)
      </button>

      {msg ? (
        <pre
          style={{
            marginTop: 12,
            background: "#f4f4f5",
            padding: 12,
            borderRadius: 8,
            fontSize: 12,
            whiteSpace: "pre-wrap",
          }}
        >
          {msg}
        </pre>
      ) : null}
    </div>
  );
}
