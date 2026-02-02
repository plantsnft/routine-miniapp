'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { SmokeSystem } from './effects/smokeParticles';
import { useScrollVelocity } from './effects/useScrollVelocity';

interface HellfireTitleProps {
  text?: string;
  className?: string;
}

/**
 * Premium animated fire title with smoke particles
 * Features: ember gradient text, subtle flicker, heat shimmer, continuous smoke emission, scroll-reactive wind
 */
export function HellfireTitle({ text = 'Giveaway Games', className = '' }: HellfireTitleProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const smokeSystemRef = useRef<SmokeSystem | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(Date.now());
  const [reducedMotion, setReducedMotion] = useState(false);
  const scrollVelocity = useScrollVelocity();
  const [randomSeed] = useState(() => Math.random() * 1000); // Seed for flicker variation
  const mousePositionRef = useRef<{ x: number; y: number } | null>(null);
  const clickPositionRef = useRef<{ x: number; y: number; timestamp: number } | null>(null);

  // Check for reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setReducedMotion(e.matches);
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Initialize smoke system
  useEffect(() => {
    if (reducedMotion) {
      smokeSystemRef.current = null;
      return;
    }

    smokeSystemRef.current = new SmokeSystem({
      spawnRate: 20, // Increased smoke: particles per second (was 16)
      maxParticles: 250, // Increased to accommodate more particles
      baseVelocityY: -15,
      baseVelocityX: 0.5,
      baseSize: 20,
      baseOpacity: 0.25, // Tune: smoke opacity (subtle = 0.2-0.3)
    });

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      smokeSystemRef.current = null;
    };
  }, [reducedMotion]);

  // Track mouse position for cursor-following smoke
  useEffect(() => {
    if (reducedMotion) return;

    const handleMouseMove = (e: MouseEvent) => {
      mousePositionRef.current = {
        x: e.clientX + window.scrollX,
        y: e.clientY + window.scrollY,
      };
    };

    const handleMouseLeave = () => {
      mousePositionRef.current = null;
    };

    const handleClick = (e: MouseEvent) => {
      // Only create smoke if clicking on a non-interactive element (not a link, button, etc.)
      const target = e.target as HTMLElement;
      const isInteractive = target.closest('a, button, [role="button"], [role="link"], input, select, textarea');
      
      if (!isInteractive) {
        clickPositionRef.current = {
          x: e.clientX + window.scrollX,
          y: e.clientY + window.scrollY,
          timestamp: Date.now(),
        };
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('click', handleClick, true); // Use capture phase to catch all clicks

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('click', handleClick, true);
    };
  }, [reducedMotion]);

  // Animation loop for smoke particles
  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    const smokeSystem = smokeSystemRef.current;
    if (!canvas || !smokeSystem || reducedMotion) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const now = Date.now();
    const deltaTime = now - lastTimeRef.current;
    lastTimeRef.current = now;

    // Get container bounds for spawn points
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const containerTop = rect.top + window.scrollY;
    const containerLeft = rect.left + window.scrollX;
    const containerWidth = rect.width;

    // Spawn points: evenly distributed across the text for more realistic smoke
    const spawnPoints = [
      { x: containerLeft + containerWidth * 0.1, y: containerTop - 5, weight: 1.0 },  // Left edge
      { x: containerLeft + containerWidth * 0.25, y: containerTop - 5, weight: 1.0 }, // Left quarter
      { x: containerLeft + containerWidth * 0.4, y: containerTop - 5, weight: 1.0 },  // Center-left
      { x: containerLeft + containerWidth * 0.55, y: containerTop - 5, weight: 1.0 }, // Middle
      { x: containerLeft + containerWidth * 0.7, y: containerTop - 5, weight: 1.0 },  // Center-right
      { x: containerLeft + containerWidth * 0.85, y: containerTop - 5, weight: 1.0 }, // Right edge
    ];

    // Update smoke system with title spawn points
    smokeSystem.update(deltaTime, spawnPoints);

    // Spawn particles at mouse position (cursor-following smoke)
    if (mousePositionRef.current && smokeSystem.getParticleCount() < 240) {
      const mouse = mousePositionRef.current;
      // Spawn particles continuously when mouse is moving (subtle trail) - 25% less impactful
      if (Math.random() < 0.09) { // Reduced from 12% to 9% (25% less: 0.12 * 0.75 = 0.09)
        smokeSystem.spawnParticleAt(mouse.x, mouse.y, {
          vx: (Math.random() - 0.5) * 2.25, // Reduced horizontal drift (25% less)
          vy: -6 - Math.random() * 3, // Reduced upward velocity (25% less: -8 * 0.75 = -6)
        });
      }
    }

    // Spawn particles at click position (burst effect)
    if (clickPositionRef.current && smokeSystem.getParticleCount() < 240) {
      const click = clickPositionRef.current;
      const timeSinceClick = Date.now() - click.timestamp;
      
      // Only spawn for clicks within last 100ms (single burst)
      if (timeSinceClick < 100) {
        // Create a small burst of particles at click location
        for (let i = 0; i < 8; i++) {
          smokeSystem.spawnParticleAt(
            click.x + (Math.random() - 0.5) * 20,
            click.y + (Math.random() - 0.5) * 20,
            {
              vx: (Math.random() - 0.5) * 10, // Wider spread
              vy: -15 - Math.random() * 10, // Stronger upward velocity
            }
          );
        }
        clickPositionRef.current = null; // Clear after spawning
      } else {
        clickPositionRef.current = null; // Clear old clicks
      }
    }

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw particles
    const particles = smokeSystem.getParticles();
    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    for (const p of particles) {
      // Convert from page coords to canvas coords (canvas is fixed, so use scroll position)
      const canvasX = p.x - window.scrollX;
      const canvasY = p.y - window.scrollY;

      // Check bounds (canvas is full viewport)
      if (canvasX < -100 || canvasX > window.innerWidth + 100 || canvasY < -100 || canvasY > window.innerHeight + 100) {
        continue; // Skip off-screen particles
      }

      // Draw soft smoke particle (radial gradient)
      const gradient = ctx.createRadialGradient(canvasX, canvasY, 0, canvasX, canvasY, p.size);
      gradient.addColorStop(0, `rgba(140, 140, 140, ${p.opacity * 0.6})`);
      gradient.addColorStop(0.4, `rgba(100, 100, 100, ${p.opacity * 0.4})`);
      gradient.addColorStop(1, `rgba(60, 60, 60, 0)`);

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(canvasX, canvasY, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    animationFrameRef.current = requestAnimationFrame(animate);
  }, [reducedMotion]);

  // Start animation loop
  useEffect(() => {
    if (reducedMotion) return;

    const canvas = canvasRef.current;
    if (!canvas || !smokeSystemRef.current) return;

    // Set canvas size with devicePixelRatio for crisp rendering (full viewport)
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
    }

    lastTimeRef.current = Date.now();
    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [animate, reducedMotion]);

  // Handle visibility changes (pause when tab hidden)
  useEffect(() => {
    if (reducedMotion) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      } else {
        if (!animationFrameRef.current && smokeSystemRef.current) {
          lastTimeRef.current = Date.now();
          animationFrameRef.current = requestAnimationFrame(animate);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [animate, reducedMotion]);

  // Update canvas size on resize
  useEffect(() => {
    if (reducedMotion) return;

    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [reducedMotion]);

  return (
    <>
      {/* Smoke canvas overlay - full viewport coverage for smoke drift */}
      {!reducedMotion && (
        <canvas
          ref={canvasRef}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            pointerEvents: 'none',
            zIndex: 1,
          }}
          aria-hidden="true"
        />
      )}
      <div
        ref={containerRef}
        className={`hellfire-title ${className}`}
        style={{ 
          position: 'relative', 
          display: 'inline-block',
          minHeight: '48px',
          width: '100%',
          maxWidth: '100%',
        }}
      >

      {/* Professional newspaper-style header text */}
      <h1
        className="hellfire-title-text"
        style={{
          position: 'relative',
          zIndex: 2,
          fontSize: 'clamp(1.35rem, 4.32vw, 2.16rem)', // Reduced by 10%: 1.5*0.9=1.35, 4.8*0.9=4.32, 2.4*0.9=2.16
          fontFamily: 'Georgia, "Times New Roman", Times, serif', // Classic serif font like NYT
          fontWeight: 700,
          letterSpacing: '0.03em', // Even tighter letter spacing to fit more text
          textTransform: 'uppercase', // Uppercase like newspaper headers
          margin: 0,
          color: '#8B0000', // Deep red, more professional than bright red
          whiteSpace: 'nowrap',
          lineHeight: '1.2',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {text}
      </h1>

      </div>
    </>
  );
}

