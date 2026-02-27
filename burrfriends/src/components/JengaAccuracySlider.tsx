'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface JengaAccuracySliderProps {
  onComplete: (accuracy: number) => void; // 0-100
  onCancel?: () => void;
  label: string; // "Remove block" or "Place block"
  speed?: number; // Slider speed multiplier (default 1.0)
  sweetSpotSize?: number; // Percentage of slider that's "sweet spot" (default 20%)
}

/**
 * Accuracy slider component (Madden-style kicker mechanic).
 * Slider moves back and forth; user presses when it's in the green "sweet spot".
 */
export default function JengaAccuracySlider({
  onComplete,
  onCancel,
  label,
  speed = 1.0,
  sweetSpotSize = 20,
}: JengaAccuracySliderProps) {
  const [position, setPosition] = useState(50); // 0-100
  const [direction, setDirection] = useState<1 | -1>(1);
  const [captured, setCaptured] = useState<number | null>(null);
  const [flashColor, setFlashColor] = useState<string | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  // Calculate accuracy zones
  const greenZoneStart = 50 - sweetSpotSize / 2;
  const greenZoneEnd = 50 + sweetSpotSize / 2;
  const yellowZoneSize = 40; // 40% on each side of green
  const yellowZoneStart = greenZoneStart - yellowZoneSize;
  const yellowZoneEnd = greenZoneEnd + yellowZoneSize;

  // Calculate accuracy from position
  const calculateAccuracy = useCallback((pos: number): number => {
    const center = 50;
    const distanceFromCenter = Math.abs(pos - center);

    // Green zone (center 20%): 100 - (distance from center * 2)
    if (pos >= greenZoneStart && pos <= greenZoneEnd) {
      const dist = distanceFromCenter - (sweetSpotSize / 2);
      return Math.max(80, 100 - dist * 2);
    }

    // Yellow zone (40% on each side): 60 - (distance from green edge * 1.5)
    if (pos >= yellowZoneStart && pos < greenZoneStart) {
      const dist = greenZoneStart - pos;
      return Math.max(20, 60 - dist * 1.5);
    }
    if (pos > greenZoneEnd && pos <= yellowZoneEnd) {
      const dist = pos - greenZoneEnd;
      return Math.max(20, 60 - dist * 1.5);
    }

    // Red zone (edges): 20 - (distance from yellow edge * 0.5)
    if (pos < yellowZoneStart) {
      const dist = yellowZoneStart - pos;
      return Math.max(0, 20 - dist * 0.5);
    }
    if (pos > yellowZoneEnd) {
      const dist = pos - yellowZoneEnd;
      return Math.max(0, 20 - dist * 0.5);
    }

    return 0;
  }, [sweetSpotSize, greenZoneStart, greenZoneEnd, yellowZoneStart, yellowZoneEnd]);

  // Animation loop
  useEffect(() => {
    if (captured !== null) return; // Stop animation when captured

    const animate = () => {
      const now = Date.now();
      const elapsed = (now - startTimeRef.current) / 1000; // seconds
      
      // Sine wave: position oscillates between 0 and 100
      // Speed: ~2.5 seconds per full cycle (adjustable via speed prop)
      const cycleTime = 2.5 / speed;
      const normalized = (elapsed % cycleTime) / cycleTime;
      const sine = Math.sin(normalized * Math.PI * 2);
      const newPos = 50 + sine * 50; // 0-100 range
      
      setPosition(newPos);
      
      // Determine direction for visual feedback
      const prevPos = position;
      if (newPos > prevPos) setDirection(1);
      else if (newPos < prevPos) setDirection(-1);
      
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [captured, speed, position]);

  // Capture accuracy on key press or click
  const handleCapture = useCallback(() => {
    if (captured !== null) return; // Already captured
    
    const acc = calculateAccuracy(position);
    setCaptured(acc);
    
    // Visual feedback: flash color based on accuracy
    if (acc >= 90) setFlashColor('green');
    else if (acc >= 50) setFlashColor('yellow');
    else setFlashColor('red');
    
    // Call onComplete after brief flash
    setTimeout(() => {
      onComplete(acc);
    }, 300);
  }, [captured, position, calculateAccuracy, onComplete]);

  // Keyboard and click handlers
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onCancel) {
        onCancel();
        return;
      }
      handleCapture();
    };

    const handleClick = () => {
      handleCapture();
    };

    window.addEventListener('keydown', handleKeyPress);
    window.addEventListener('click', handleClick, { once: true });
    window.addEventListener('touchstart', handleClick, { once: true });

    return () => {
      window.removeEventListener('keydown', handleKeyPress);
      window.removeEventListener('click', handleClick);
      window.removeEventListener('touchstart', handleClick);
    };
  }, [handleCapture, onCancel]);

  // Timeout: auto-capture with poor accuracy after 5 seconds
  useEffect(() => {
    if (captured !== null) return;
    
    const timeout = setTimeout(() => {
      if (captured === null) {
        const acc = 20; // Poor accuracy
        setCaptured(acc);
        setFlashColor('red');
        setTimeout(() => {
          onComplete(acc);
        }, 300);
      }
    }, 5000);

    return () => clearTimeout(timeout);
  }, [captured, onComplete]);

  const getZoneColor = (pos: number): string => {
    if (pos >= greenZoneStart && pos <= greenZoneEnd) return '#10b981'; // green-500
    if (pos >= yellowZoneStart && pos <= yellowZoneEnd) return '#eab308'; // yellow-500
    return '#ef4444'; // red-500
  };

  const currentZoneColor = getZoneColor(position);
  const flashBg = flashColor === 'green' ? 'bg-green-500' : flashColor === 'yellow' ? 'bg-yellow-500' : flashColor === 'red' ? 'bg-red-500' : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className={`bg-white rounded-lg shadow-xl p-6 w-full max-w-md ${flashBg} transition-colors duration-300`}>
        <h3 className="text-xl font-semibold text-center mb-4 text-gray-900">{label}</h3>
        
        {/* Slider bar */}
        <div className="relative h-16 bg-gray-200 rounded-lg overflow-hidden mb-4">
          {/* Zone colors */}
          <div className="absolute inset-0 flex">
            {/* Red left */}
            <div className="bg-red-500" style={{ width: `${yellowZoneStart}%` }} />
            {/* Yellow left */}
            <div className="bg-yellow-500" style={{ width: `${greenZoneStart - yellowZoneStart}%` }} />
            {/* Green center */}
            <div className="bg-green-500" style={{ width: `${greenZoneEnd - greenZoneStart}%` }} />
            {/* Yellow right */}
            <div className="bg-yellow-500" style={{ width: `${yellowZoneEnd - greenZoneEnd}%` }} />
            {/* Red right */}
            <div className="bg-red-500" style={{ width: `${100 - yellowZoneEnd}%` }} />
          </div>
          
          {/* Current position indicator */}
          <div
            className="absolute top-0 bottom-0 w-1 bg-gray-900 shadow-lg transition-all duration-75"
            style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
          >
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full -mt-1 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-gray-900" />
          </div>
        </div>

        {/* Hint text */}
        <p className="text-center text-sm text-gray-600 mb-2">
          Press any key or click when the slider is in the <span className="font-semibold text-green-600">green zone</span>
        </p>
        
        {captured !== null && (
          <p className="text-center text-lg font-bold mt-2">
            {captured >= 90 ? 'Perfect!' : captured >= 50 ? 'Good!' : 'Poor!'} ({Math.round(captured)}%)
          </p>
        )}

        {onCancel && (
          <button
            onClick={onCancel}
            className="mt-4 w-full px-4 py-2 bg-gray-300 hover:bg-gray-400 rounded text-gray-800 font-medium transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
