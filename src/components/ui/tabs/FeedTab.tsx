"use client";

import { useState, useEffect } from "react";

interface Cast {
  hash: string;
  text: string;
  author: {
    fid: number;
    username: string;
    displayName: string;
    pfp?: string;
  };
  timestamp: string;
  images: string[];
  likes: number;
  recasts: number;
  replies: number;
  url: string;
}

export function FeedTab() {
  const [casts, setCasts] = useState<Cast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchFeed = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/channel-feed");
        const data = await res.json();
        
        if (data.error) {
          setError(data.error);
        } else {
          setCasts(data.casts || []);
        }
      } catch (err) {
        console.error("Error fetching feed:", err);
        setError("Failed to load feed");
      } finally {
        setLoading(false);
      }
    };

    fetchFeed();
  }, []);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div
        style={{
          backgroundImage: "url(/wallpaper.png)",
          backgroundRepeat: "repeat",
          backgroundSize: "10%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
          color: "#ffffff",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              border: "3px solid #c1b400",
              borderTop: "3px solid transparent",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              margin: "0 auto 16px",
            }}
          />
          <p style={{ color: "#c1b400", fontSize: 14 }}>Loading feed...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          backgroundImage: "url(/wallpaper.png)",
          backgroundRepeat: "repeat",
          backgroundSize: "10%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
          padding: "20px",
        }}
      >
        <div
          style={{
            textAlign: "center",
            background: "#000000",
            border: "2px solid #c1b400",
            borderRadius: 12,
            padding: "24px",
          }}
        >
          <p style={{ color: "#c1b400", fontSize: 16, marginBottom: 12 }}>
            Unable to load feed
          </p>
          <p style={{ color: "#ffffff", fontSize: 14, opacity: 0.7 }}>
            {error}
          </p>
        </div>
      </div>
    );
  }

  if (casts.length === 0) {
    return (
      <div
        style={{
          backgroundImage: "url(/wallpaper.png)",
          backgroundRepeat: "repeat",
          backgroundSize: "10%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
          padding: "20px",
        }}
      >
        <div
          style={{
            textAlign: "center",
            background: "#000000",
            border: "2px solid #c1b400",
            borderRadius: 12,
            padding: "24px",
          }}
        >
          <p style={{ color: "#c1b400", fontSize: 16 }}>
            No casts found
          </p>
          <p style={{ color: "#ffffff", fontSize: 14, opacity: 0.7, marginTop: 8 }}>
            Check back later for new posts
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        backgroundImage: "url(/wallpaper.png)",
        backgroundRepeat: "repeat",
        backgroundSize: "auto",
        minHeight: "100vh",
        maxWidth: "600px",
        margin: "0 auto",
        padding: "0 16px 100px",
      }}
    >
      {/* Feed Header */}
      <div
        style={{
          padding: "20px 0",
          borderBottom: "2px solid #c1b400",
          marginBottom: 16,
        }}
      >
        <h2
          style={{
            color: "#c1b400",
            fontSize: 24,
            fontWeight: 700,
            margin: 0,
            textAlign: "center",
          }}
        >
          /Catwalk Feed
        </h2>
      </div>

      {/* Feed Posts */}
      {casts.map((cast) => (
        <div
          key={cast.hash}
          style={{
            background: "#000000",
            border: "2px solid #c1b400",
            borderRadius: 12,
            marginBottom: 24,
            overflow: "hidden",
          }}
        >
          {/* Post Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "12px 16px",
              borderBottom: "1px solid rgba(193, 180, 0, 0.2)",
            }}
          >
            {/* Profile Picture */}
            {cast.author.pfp ? (
              <img
                src={cast.author.pfp}
                alt={cast.author.displayName}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  marginRight: 12,
                  border: "2px solid #c1b400",
                }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  marginRight: 12,
                  background: "#c1b400",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#000000",
                  fontWeight: 700,
                  fontSize: 16,
                }}
              >
                {cast.author.displayName.charAt(0).toUpperCase()}
              </div>
            )}

            {/* Username and Time */}
            <div style={{ flex: 1 }}>
              <a
                href={cast.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "#c1b400",
                  textDecoration: "none",
                  fontWeight: 600,
                  fontSize: 14,
                  display: "block",
                }}
              >
                {cast.author.displayName}
              </a>
              <p
                style={{
                  color: "#ffffff",
                  fontSize: 12,
                  opacity: 0.6,
                  margin: 0,
                }}
              >
                @{cast.author.username} · {formatTime(cast.timestamp)}
              </p>
            </div>
          </div>

          {/* Post Images */}
          {cast.images.length > 0 && (
            <div
              style={{
                width: "100%",
                aspectRatio: "1",
                background: "#000000",
                position: "relative",
              }}
            >
              <img
                src={cast.images[0]}
                alt="Cast image"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
          )}

          {/* Post Content */}
          <div style={{ padding: "16px" }}>
            {/* Text Content */}
            {cast.text && (
              <p
                style={{
                  color: "#ffffff",
                  fontSize: 14,
                  lineHeight: 1.6,
                  margin: "0 0 12px 0",
                  whiteSpace: "pre-wrap",
                }}
              >
                {cast.text}
              </p>
            )}

            {/* Engagement Stats */}
            <div
              style={{
                display: "flex",
                gap: 16,
                paddingTop: 12,
                borderTop: "1px solid rgba(193, 180, 0, 0.2)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "#c1b400", fontSize: 16 }}>❤️</span>
                <span style={{ color: "#ffffff", fontSize: 14 }}>
                  {cast.likes}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "#c1b400", fontSize: 16 }}>🔁</span>
                <span style={{ color: "#ffffff", fontSize: 14 }}>
                  {cast.recasts}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "#c1b400", fontSize: 16 }}>💬</span>
                <span style={{ color: "#ffffff", fontSize: 14 }}>
                  {cast.replies}
                </span>
              </div>
              <a
                href={cast.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  marginLeft: "auto",
                  color: "#c1b400",
                  fontSize: 14,
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                View on Warpcast →
              </a>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

