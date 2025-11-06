"use client";

import { useEffect, useRef, useState } from "react";

interface VideoPlayerProps {
  videoUrl: string;
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  playsInline?: boolean;
}

/**
 * Video player component that autoplays when scrolled into view.
 * Supports HLS (.m3u8) streams and regular video URLs.
 */
export function VideoPlayer({
  videoUrl,
  autoplay = true,
  loop = true,
  muted = true,
  playsInline = true,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsInstanceRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;

    // Check if HLS and browser doesn't support native HLS
    const isHLS = videoUrl.includes('.m3u8');

    // Load hls.js for browsers that don't support native HLS (Chrome, Firefox, etc.)
    if (isHLS && typeof window !== 'undefined') {
      // Check if native HLS is supported
      const canPlayHLS = video.canPlayType('application/vnd.apple.mpegurl');
      
      if (!canPlayHLS || canPlayHLS === '') {
        // Browser doesn't support native HLS - load hls.js from CDN
        console.log("[VideoPlayer] Native HLS not supported, loading hls.js...");
        
        // Dynamically load hls.js from CDN
        const loadHlsJs = async () => {
          try {
            // Check if hls.js is already loaded
            if ((window as any).Hls) {
              const Hls = (window as any).Hls;
              if (Hls.isSupported()) {
                hlsInstanceRef.current = new Hls({
                  enableWorker: true,
                  lowLatencyMode: false,
                });
                
                hlsInstanceRef.current.loadSource(videoUrl);
                hlsInstanceRef.current.attachMedia(video);
                
                hlsInstanceRef.current.on(Hls.Events.MANIFEST_PARSED, () => {
                  console.log("[VideoPlayer] HLS manifest parsed, ready to play");
                  if (autoplay) {
                    video.play().catch((error) => {
                      console.error("[VideoPlayer] Autoplay failed:", error);
                    });
                  }
                });
                
                hlsInstanceRef.current.on(Hls.Events.ERROR, (event: any, data: any) => {
                  if (data.fatal) {
                    console.error("[VideoPlayer] HLS fatal error:", data);
                    setHasError(true);
                  }
                });
              } else {
                console.error("[VideoPlayer] HLS.js not supported");
                setHasError(true);
              }
            } else {
              // Load hls.js from CDN
              const script = document.createElement('script');
              script.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest/dist/hls.min.js';
              script.async = true;
              
              script.onload = () => {
                const Hls = (window as any).Hls;
                if (Hls && Hls.isSupported()) {
                  hlsInstanceRef.current = new Hls({
                    enableWorker: true,
                    lowLatencyMode: false,
                  });
                  
                  hlsInstanceRef.current.loadSource(videoUrl);
                  hlsInstanceRef.current.attachMedia(video);
                  
                  hlsInstanceRef.current.on(Hls.Events.MANIFEST_PARSED, () => {
                    console.log("[VideoPlayer] HLS manifest parsed, ready to play");
                    if (autoplay) {
                      video.play().catch((error) => {
                        console.error("[VideoPlayer] Autoplay failed:", error);
                      });
                    }
                  });
                  
                  hlsInstanceRef.current.on(Hls.Events.ERROR, (event: any, data: any) => {
                    if (data.fatal) {
                      console.error("[VideoPlayer] HLS fatal error:", data);
                      setHasError(true);
                    }
                  });
                } else {
                  console.error("[VideoPlayer] HLS.js not supported after loading");
                  setHasError(true);
                }
              };
              
              script.onerror = () => {
                console.error("[VideoPlayer] Failed to load hls.js from CDN");
                setHasError(true);
              };
              
              document.head.appendChild(script);
            }
          } catch (error) {
            console.error("[VideoPlayer] Error setting up hls.js:", error);
            setHasError(true);
          }
        };
        
        loadHlsJs();
      } else {
        // Native HLS is supported (Safari, newer Chrome/Edge)
        console.log("[VideoPlayer] Native HLS supported");
      }
    }

    // Intersection Observer to detect when video enters viewport
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && autoplay) {
            // Video is in view - play it
            video.play().catch((error) => {
              console.error("[VideoPlayer] Autoplay failed:", error);
              // Autoplay might be blocked, but we'll try anyway
            });
            setIsPlaying(true);
          } else {
            // Video is out of view - pause it
            video.pause();
            setIsPlaying(false);
          }
        });
      },
      {
        threshold: 0.5, // Trigger when 50% of video is visible
        rootMargin: "0px",
      }
    );

    observer.observe(container);

    // Cleanup
    return () => {
      observer.disconnect();
      if (hlsInstanceRef.current) {
        hlsInstanceRef.current.destroy();
        hlsInstanceRef.current = null;
      }
    };
  }, [autoplay, videoUrl]);

  // Handle video errors
  const handleError = () => {
    console.error("[VideoPlayer] Video failed to load:", videoUrl);
    setHasError(true);
  };

  // Handle video load
  const handleLoadedData = () => {
    setHasError(false);
  };

  // Handle play/pause
  const handlePlay = () => {
    setIsPlaying(true);
  };

  const handlePause = () => {
    setIsPlaying(false);
  };

  // Handle click to toggle play/pause
  const handleClick = () => {
    const video = videoRef.current;
    if (!video) return;
    
    if (video.paused) {
      video.play().catch((error) => {
        console.error("[VideoPlayer] Play failed:", error);
      });
    } else {
      video.pause();
    }
  };

  // Check if video URL is HLS (.m3u8)
  const isHLS = videoUrl.includes('.m3u8');
  
  // Check if native HLS is supported (for Safari, newer Chrome/Edge)
  // If not, hls.js will be used instead
  // NOTE: Hooks must be called before any conditional returns
  const [useNativeHLS, setUseNativeHLS] = useState<boolean | null>(null);
  
  useEffect(() => {
    if (videoRef.current && isHLS) {
      const canPlayHLS = videoRef.current.canPlayType('application/vnd.apple.mpegurl');
      setUseNativeHLS(!!canPlayHLS && canPlayHLS !== '');
    } else if (!isHLS) {
      setUseNativeHLS(true); // Regular video files use native playback
    }
  }, [isHLS]);

  if (hasError) {
    return (
      <div
        style={{
          width: "100%",
          aspectRatio: "1",
          background: "#1a1a1a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderBottom: "1px solid rgba(193, 180, 0, 0.2)",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎥</div>
          <p style={{ color: "#c1b400", fontSize: 14, fontWeight: 600, margin: 0 }}>
            Video unavailable
          </p>
          <p style={{ color: "#ffffff", fontSize: 12, opacity: 0.7, margin: "4px 0 0 0" }}>
            <a
              href={videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#c1b400", textDecoration: "none" }}
            >
              View on Warpcast →
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      style={{
        width: "100%",
        aspectRatio: "1",
        background: "#000000",
        position: "relative",
        overflow: "hidden",
        cursor: "pointer",
      }}
    >
      <video
        ref={videoRef}
        autoPlay={autoplay}
        loop={loop}
        muted={muted}
        playsInline={playsInline}
        onError={handleError}
        onLoadedData={handleLoadedData}
        onPlay={handlePlay}
        onPause={handlePause}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
        }}
        controls={false} // Disable native controls for cleaner look
        src={useNativeHLS && !isHLS ? videoUrl : undefined} // Only set src for regular videos (not HLS)
      >
        {useNativeHLS && isHLS ? (
          // Native HLS stream - use application/vnd.apple.mpegurl MIME type
          <source src={videoUrl} type="application/vnd.apple.mpegurl" />
        ) : useNativeHLS && !isHLS ? (
          // Regular video - let browser detect MIME type (or use src attribute above)
          <source src={videoUrl} />
        ) : null}
        Your browser does not support the video tag.
      </video>
      
      {/* Play indicator - only shows briefly when paused */}
      {!isPlaying && !hasError && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
            opacity: isPlaying ? 0 : 0.5,
            transition: "opacity 0.5s",
          }}
        >
          <div style={{ fontSize: 48, color: "#c1b400" }}>▶</div>
        </div>
      )}
    </div>
  );
}

