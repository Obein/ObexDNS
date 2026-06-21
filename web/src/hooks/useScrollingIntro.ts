import React, { useState, useEffect, useRef } from "react";

/**
 * Parameter interface for the useScrollingIntro hook.
 */
export interface UseScrollingIntroParams {
  /** The number of unique items in the base scroll list (before tripling). */
  itemCount: number;
}

/**
 * Return type interface for the useScrollingIntro hook.
 */
export interface UseScrollingIntroResult {
  /** A ref to be attached to the scrollable container element. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** The index of the currently focused item (0 to itemCount - 1). */
  activeIdx: number;
  /** State value indicating if the auto-scrolling is paused. */
  isPaused: boolean;
  /** Setter function to pause or resume auto-scrolling. */
  setIsPaused: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * A custom hook to manage auto-scrolling, touch-free scrolling resets,
 * and mouse wheel-snapping behavior for a scrolling intro list.
 *
 * @param {UseScrollingIntroParams} params The parameters specifying the base list item count.
 * @returns {UseScrollingIntroResult} An object containing state and refs for container scrolling.
 */
export const useScrollingIntro = ({ itemCount }: UseScrollingIntroParams): UseScrollingIntroResult => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const isAnimatingRef = useRef<boolean>(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent): void => {
      if (e.deltaY === 0) return;
      e.preventDefault();

      if (isAnimatingRef.current) return;

      const bubbles = Array.from(container.children) as HTMLElement[];
      if (bubbles.length === 0) return;

      const rect = container.getBoundingClientRect();
      const hotZone = rect.top + rect.height / 3;

      let closestIdx = 0;
      let minDistance = Infinity;
      for (let i = 0; i < bubbles.length; i++) {
        const bubbleRect = bubbles[i].getBoundingClientRect();
        const distance = Math.abs(bubbleRect.top - hotZone);
        if (distance < minDistance) {
          minDistance = distance;
          closestIdx = i;
        }
      }

      const direction = e.deltaY > 0 ? 1 : -1;
      let targetIdx = closestIdx + direction;

      if (targetIdx < 0) targetIdx = 0;
      if (targetIdx >= bubbles.length) targetIdx = bubbles.length - 1;

      const targetElement = bubbles[targetIdx];
      const targetScrollTop = targetElement.offsetTop - rect.height / 3;

      isAnimatingRef.current = true;

      const start = container.scrollTop;
      const change = targetScrollTop - start;
      const startTime = performance.now();
      const duration = 400; // ms

      const animate = (currentTime: number): void => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Ease in out quad
        const ease = progress < 0.5
          ? 2 * progress * progress
          : -1 + (4 - 2 * progress) * progress;

        container.scrollTop = start + change * ease;

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          // Animation finished: perform loop boundary check
          if (bubbles.length >= itemCount * 3) {
            const y0 = bubbles[0].offsetTop;
            const yN = bubbles[itemCount].offsetTop;
            const loopHeight = yN - y0;
            if (loopHeight > 0) {
              if (container.scrollTop >= loopHeight * 2) {
                container.scrollTop -= loopHeight;
              } else if (container.scrollTop < loopHeight) {
                container.scrollTop += loopHeight;
              }
            }
          }
          isAnimatingRef.current = false;
        }
      };

      requestAnimationFrame(animate);
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
    };
  }, [itemCount]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let requestId: number;
    const scrollSpeed = 0.6;
    const scroll = (): void => {
      const bubbles = Array.from(container.children) as HTMLElement[];
      if (bubbles.length >= itemCount * 3) {
        const y0 = bubbles[0].offsetTop;
        const yN = bubbles[itemCount].offsetTop;
        const loopHeight = yN - y0;

        if (loopHeight > 0) {
          if (!isPaused) {
            container.scrollTop += scrollSpeed;
          }

          if (!isAnimatingRef.current) {
            if (container.scrollTop >= loopHeight * 2) {
              container.scrollTop -= loopHeight;
            } else if (container.scrollTop < loopHeight) {
              container.scrollTop += loopHeight;
            }
          }
        }
      }

      const rect = container.getBoundingClientRect();
      const hotZone = rect.top + rect.height / 3;
      const bubblesForFocus = Array.from(container.children);
      let foundIdx = -1;
      for (let i = 0; i < bubblesForFocus.length; i++) {
        const bubbleRect = bubblesForFocus[i].getBoundingClientRect();
        if (bubbleRect.top <= hotZone && bubbleRect.bottom >= hotZone) {
          foundIdx = i % itemCount;
          break;
        }
      }
      setActiveIdx(foundIdx);
      requestId = requestAnimationFrame(scroll);
    };
    requestId = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(requestId);
  }, [isPaused, itemCount]);

  return {
    containerRef,
    activeIdx,
    isPaused,
    setIsPaused,
  };
};
