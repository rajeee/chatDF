// Reusable hook for swipe-to-dismiss gesture on mobile panel overlays.
// Tracks touch movement and applies translateX + opacity transforms,
// dismissing if the swipe exceeds the threshold, snapping back otherwise.

import { useRef, useEffect } from "react";

interface UseSwipeToDismissOptions {
  /** Direction to swipe to dismiss */
  direction: "left" | "right";
  /** Called when swipe completes past threshold */
  onDismiss: () => void;
  /** Whether the swipe gesture is enabled */
  enabled?: boolean;
  /** Minimum swipe distance in px to trigger dismiss (default: 80) */
  threshold?: number;
}

export function useSwipeToDismiss({
  direction,
  onDismiss,
  enabled = true,
  threshold = 80,
}: UseSwipeToDismissOptions) {
  const ref = useRef<HTMLElement | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const currentTranslate = useRef(0);
  const locked = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    const isMobile = () => window.innerWidth < 1024;

    const handleTouchStart = (e: TouchEvent) => {
      if (!isMobile()) return;
      const touch = e.touches[0];
      touchStart.current = { x: touch.clientX, y: touch.clientY };
      currentTranslate.current = 0;
      locked.current = false;
      el.style.transition = "none";
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchStart.current || !isMobile() || locked.current) return;
      const touch = e.touches[0];
      const deltaX = touch.clientX - touchStart.current.x;
      const deltaY = touch.clientY - touchStart.current.y;

      // If vertical scroll is dominant, abandon gesture
      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        touchStart.current = null;
        el.style.transform = "";
        el.style.opacity = "";
        return;
      }

      // Only allow swipe in the dismiss direction
      const isCorrectDirection =
        direction === "left" ? deltaX < 0 : deltaX > 0;
      if (!isCorrectDirection) {
        currentTranslate.current = 0;
        el.style.transform = "";
        el.style.opacity = "";
        return;
      }

      currentTranslate.current = deltaX;
      el.style.transform = `translateX(${deltaX}px)`;

      // Fade slightly as the user drags further
      const progress = Math.min(Math.abs(deltaX) / (threshold * 2), 1);
      el.style.opacity = String(1 - progress * 0.3);
    };

    const handleTouchEnd = () => {
      if (!touchStart.current || !isMobile()) return;

      const shouldDismiss = Math.abs(currentTranslate.current) >= threshold;

      if (shouldDismiss) {
        // Prevent further gestures while animating out
        locked.current = true;
        const fullTranslate =
          direction === "left" ? -el.offsetWidth : el.offsetWidth;
        el.style.transition =
          "transform 0.2s ease-out, opacity 0.2s ease-out";
        el.style.transform = `translateX(${fullTranslate}px)`;
        el.style.opacity = "0";

        setTimeout(() => {
          el.style.transform = "";
          el.style.opacity = "";
          el.style.transition = "";
          locked.current = false;
          onDismiss();
        }, 200);
      } else {
        // Snap back
        el.style.transition =
          "transform 0.2s ease-out, opacity 0.2s ease-out";
        el.style.transform = "";
        el.style.opacity = "";

        setTimeout(() => {
          el.style.transition = "";
        }, 200);
      }

      touchStart.current = null;
      currentTranslate.current = 0;
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: true });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [direction, onDismiss, enabled, threshold]);

  return ref;
}
