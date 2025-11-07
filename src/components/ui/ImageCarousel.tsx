"use client";

import { useState, useRef } from "react";
import { useHapticFeedback } from "~/hooks/useHapticFeedback";

interface ImageCarouselProps {
  images: string[];
  alt?: string;
}

/**
 * ImageCarousel component displays multiple images in a swipeable carousel.
 * Users can swipe left/right or use arrow buttons to navigate between images.
 */
export function ImageCarousel({ images, alt = "Image" }: ImageCarouselProps) {
  const { triggerHaptic } = useHapticFeedback();
  const [currentIndex, setCurrentIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  if (images.length === 0) return null;
  if (images.length === 1) {
    return (
      <div
        style={{
          width: "100%",
          aspectRatio: "1",
          background: "#000000",
          position: "relative",
        }}
      >
        <img
          src={images[0]}
          alt={alt}
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
    );
  }

  const goToPrevious = () => {
    triggerHaptic("light");
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const goToNext = () => {
    triggerHaptic("light");
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  const goToSlide = (index: number) => {
    triggerHaptic("light");
    setCurrentIndex(index);
  };

  // Touch handlers for swipe gestures
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    
    const distance = touchStartX.current - touchEndX.current;
    const minSwipeDistance = 50;

    if (distance > minSwipeDistance) {
      // Swipe left - go to next
      goToNext();
    } else if (distance < -minSwipeDistance) {
      // Swipe right - go to previous
      goToPrevious();
    }

    touchStartX.current = null;
    touchEndX.current = null;
  };

  return (
    <div
      style={{
        width: "100%",
        aspectRatio: "1",
        background: "#000000",
        position: "relative",
        overflow: "hidden",
        touchAction: "pan-y pinch-zoom",
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Images */}
      <div
        style={{
          display: "flex",
          width: `${images.length * 100}%`,
          height: "100%",
          transform: `translateX(-${currentIndex * (100 / images.length)}%)`,
          transition: "transform 0.3s ease-in-out",
        }}
      >
        {images.map((image, index) => (
          <div
            key={index}
            style={{
              width: `${100 / images.length}%`,
              height: "100%",
              flexShrink: 0,
            }}
          >
            <img
              src={image}
              alt={`${alt} ${index + 1}`}
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
        ))}
      </div>

      {/* Navigation Arrows */}
      {images.length > 1 && (
        <>
          <button
            onClick={goToPrevious}
            style={{
              position: "absolute",
              left: 8,
              top: "50%",
              transform: "translateY(-50%)",
              background: "rgba(0, 0, 0, 0.6)",
              border: "2px solid #c1b400",
              borderRadius: "50%",
              width: "32px",
              height: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "#c1b400",
              fontSize: "18px",
              fontWeight: 700,
              zIndex: 10,
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(0, 0, 0, 0.8)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(0, 0, 0, 0.6)";
            }}
          >
            ‹
          </button>
          <button
            onClick={goToNext}
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              background: "rgba(0, 0, 0, 0.6)",
              border: "2px solid #c1b400",
              borderRadius: "50%",
              width: "32px",
              height: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "#c1b400",
              fontSize: "18px",
              fontWeight: 700,
              zIndex: 10,
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(0, 0, 0, 0.8)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(0, 0, 0, 0.6)";
            }}
          >
            ›
          </button>
        </>
      )}

      {/* Dots Indicator */}
      {images.length > 1 && (
        <div
          style={{
            position: "absolute",
            bottom: 8,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: 6,
            zIndex: 10,
          }}
        >
          {images.map((_, index) => (
            <button
              key={index}
              onClick={() => goToSlide(index)}
              style={{
                width: currentIndex === index ? "24px" : "8px",
                height: "8px",
                borderRadius: "4px",
                background: currentIndex === index ? "#c1b400" : "rgba(255, 255, 255, 0.5)",
                border: "none",
                cursor: "pointer",
                transition: "all 0.3s",
                padding: 0,
              }}
              aria-label={`Go to image ${index + 1}`}
            />
          ))}
        </div>
      )}

      {/* Image Counter */}
      {images.length > 1 && (
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            background: "rgba(0, 0, 0, 0.6)",
            color: "#c1b400",
            padding: "4px 8px",
            borderRadius: "4px",
            fontSize: "11px",
            fontWeight: 700,
            zIndex: 10,
          }}
        >
          {currentIndex + 1} / {images.length}
        </div>
      )}
    </div>
  );
}

