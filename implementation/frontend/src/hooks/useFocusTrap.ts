// Focus trap hook for modal dialogs.
// Keeps Tab/Shift+Tab cycling within a container element (WCAG 2.1 Level A).

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, isActive: boolean) {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    // Save the element that had focus before the trap activated
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    const container = containerRef.current;

    function getFocusableElements(): HTMLElement[] {
      return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;

      const focusable = getFocusableElements();
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        // Shift+Tab: if at first element, wrap to last
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab: if at last element, wrap to first
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    container.addEventListener("keydown", handleKeyDown);

    // Focus the first focusable element inside the container
    const focusable = getFocusableElements();
    if (focusable.length > 0 && !container.contains(document.activeElement)) {
      focusable[0].focus();
    }

    return () => {
      container.removeEventListener("keydown", handleKeyDown);
      // Restore focus to the element that had focus before the trap
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === "function") {
        previousFocusRef.current.focus();
      }
    };
  }, [isActive, containerRef]);
}
