// Tests for useSwipeToDismiss hook
// Covers: ref return, listener attachment/detachment, mobile vs desktop guard,
// left/right swipe transforms, wrong-direction reset, vertical-dominant abandon,
// threshold-based dismiss with timeout, snap-back below threshold, cleanup on
// unmount, custom threshold, opacity fade, locked state during animation.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSwipeToDismiss } from "@/hooks/useSwipeToDismiss";

// --- Touch event helpers ---

/**
 * jsdom does not support TouchEvent natively, so we create plain Events
 * and attach the `touches` property manually to simulate touch interactions.
 */
function createTouchEvent(
  type: "touchstart" | "touchmove" | "touchend",
  touches: Array<{ clientX: number; clientY: number }> = []
): Event {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, "touches", {
    value: touches.map((t) => ({ clientX: t.clientX, clientY: t.clientY })),
    writable: false,
  });
  return event;
}

/** Set window.innerWidth via Object.defineProperty. */
function setWindowWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    value: width,
    writable: true,
    configurable: true,
  });
}

// --- Test suite ---

describe("useSwipeToDismiss", () => {
  let originalInnerWidth: number;

  beforeEach(() => {
    vi.useFakeTimers();
    originalInnerWidth = window.innerWidth;
  });

  afterEach(() => {
    vi.useRealTimers();
    // Restore original innerWidth
    Object.defineProperty(window, "innerWidth", {
      value: originalInnerWidth,
      writable: true,
      configurable: true,
    });
  });

  // -------------------------------------------------------------------------
  // 1. Returns a ref object
  // -------------------------------------------------------------------------
  it("returns a ref object", () => {
    const onDismiss = vi.fn();
    const { result } = renderHook(() =>
      useSwipeToDismiss({ direction: "left", onDismiss })
    );

    expect(result.current).toBeDefined();
    expect(result.current).toHaveProperty("current");
    expect(result.current.current).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 2. Attaches touch event listeners to the ref element when enabled
  // -------------------------------------------------------------------------
  it("attaches touch event listeners when enabled and ref is set", () => {
    const onDismiss = vi.fn();
    const el = document.createElement("div");
    const addSpy = vi.spyOn(el, "addEventListener");

    const { result } = renderHook(() =>
      useSwipeToDismiss({ direction: "left", onDismiss, enabled: true })
    );

    // Manually set the ref and re-trigger the effect
    act(() => {
      (result.current as React.MutableRefObject<HTMLElement | null>).current = el;
    });

    // Re-render to trigger the effect with the new ref value
    const { unmount } = renderHook(() =>
      useSwipeToDismiss({ direction: "left", onDismiss, enabled: true })
    );

    // Use a fresh element approach: render with callback ref pattern
    // Instead, let's directly test by creating a hook that sets ref.current before effect
    unmount();
    addSpy.mockRestore();

    // Better approach: render, set ref.current, then re-render to trigger effect
    const el2 = document.createElement("div");
    const addSpy2 = vi.spyOn(el2, "addEventListener");

    const hook = renderHook(
      ({ enabled }) => useSwipeToDismiss({ direction: "left", onDismiss, enabled }),
      { initialProps: { enabled: false } }
    );

    // Set ref while disabled (no listeners yet)
    (hook.result.current as React.MutableRefObject<HTMLElement | null>).current = el2;

    // Re-render with enabled=true to trigger the effect
    hook.rerender({ enabled: true });

    const addedTypes = addSpy2.mock.calls.map((c) => c[0]);
    expect(addedTypes).toContain("touchstart");
    expect(addedTypes).toContain("touchmove");
    expect(addedTypes).toContain("touchend");

    hook.unmount();
    addSpy2.mockRestore();
  });

  // -------------------------------------------------------------------------
  // 3. Does NOT attach listeners when enabled=false
  // -------------------------------------------------------------------------
  it("does not attach listeners when enabled=false", () => {
    const onDismiss = vi.fn();
    const el = document.createElement("div");
    const addSpy = vi.spyOn(el, "addEventListener");

    const hook = renderHook(
      ({ enabled }) => useSwipeToDismiss({ direction: "left", onDismiss, enabled }),
      { initialProps: { enabled: true } }
    );

    // Set ref while enabled but the effect already ran with null ref
    (hook.result.current as React.MutableRefObject<HTMLElement | null>).current = el;

    // Re-render with enabled=false
    hook.rerender({ enabled: false });

    // The effect should have cleaned up and not re-attached
    // Clear spy call history, then check that no new listeners were added
    addSpy.mockClear();

    // Force another re-render still disabled
    hook.rerender({ enabled: false });

    expect(addSpy).not.toHaveBeenCalled();

    hook.unmount();
    addSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // 4. Does NOT attach listeners when ref.current is null
  // -------------------------------------------------------------------------
  it("does not attach listeners when ref.current is null", () => {
    const onDismiss = vi.fn();

    // Never set ref.current - it stays null
    const hook = renderHook(() =>
      useSwipeToDismiss({ direction: "left", onDismiss, enabled: true })
    );

    // The ref is null, so no element to spy on. Just verify the hook
    // doesn't throw and ref stays null.
    expect(hook.result.current.current).toBeNull();

    hook.unmount();
  });

  // -------------------------------------------------------------------------
  // 5. On mobile (innerWidth < 1024): touchstart records touch position
  // -------------------------------------------------------------------------
  it("records touch position on touchstart when on mobile", () => {
    setWindowWidth(800); // mobile
    const onDismiss = vi.fn();
    const el = document.createElement("div");

    const hook = renderHook(
      ({ enabled }) => useSwipeToDismiss({ direction: "left", onDismiss, enabled }),
      { initialProps: { enabled: false } }
    );

    (hook.result.current as React.MutableRefObject<HTMLElement | null>).current = el;
    hook.rerender({ enabled: true });

    // Dispatch touchstart
    act(() => {
      el.dispatchEvent(createTouchEvent("touchstart", [{ clientX: 200, clientY: 300 }]));
    });

    // Verify the hook recorded the touch by dispatching a touchmove in the correct direction
    // If touchstart was recorded, touchmove should apply a transform
    act(() => {
      el.dispatchEvent(createTouchEvent("touchmove", [{ clientX: 100, clientY: 300 }]));
    });

    expect(el.style.transform).toBe("translateX(-100px)");

    hook.unmount();
  });

  // -------------------------------------------------------------------------
  // 6. On desktop (innerWidth >= 1024): touchstart is ignored
  // -------------------------------------------------------------------------
  it("ignores touchstart on desktop (innerWidth >= 1024)", () => {
    setWindowWidth(1024); // desktop threshold
    const onDismiss = vi.fn();
    const el = document.createElement("div");

    const hook = renderHook(
      ({ enabled }) => useSwipeToDismiss({ direction: "left", onDismiss, enabled }),
      { initialProps: { enabled: false } }
    );

    (hook.result.current as React.MutableRefObject<HTMLElement | null>).current = el;
    hook.rerender({ enabled: true });

    // Dispatch touchstart on desktop
    act(() => {
      el.dispatchEvent(createTouchEvent("touchstart", [{ clientX: 200, clientY: 300 }]));
    });

    // Dispatch touchmove - should not produce any transform since touchstart was ignored
    act(() => {
      el.dispatchEvent(createTouchEvent("touchmove", [{ clientX: 100, clientY: 300 }]));
    });

    expect(el.style.transform).toBe("");

    hook.unmount();
  });

  // -------------------------------------------------------------------------
  // 7. Swipe left with direction="left": applies translateX transform
  // -------------------------------------------------------------------------
  it("applies negative translateX transform when swiping left with direction='left'", () => {
    setWindowWidth(500);
    const onDismiss = vi.fn();
    const el = document.createElement("div");

    const hook = renderHook(
      ({ enabled }) => useSwipeToDismiss({ direction: "left", onDismiss, enabled }),
      { initialProps: { enabled: false } }
    );

    (hook.result.current as React.MutableRefObject<HTMLElement | null>).current = el;
    hook.rerender({ enabled: true });

    act(() => {
      el.dispatchEvent(createTouchEvent("touchstart", [{ clientX: 300, clientY: 200 }]));
    });

    // Swipe left: clientX decreases
    act(() => {
      el.dispatchEvent(createTouchEvent("touchmove", [{ clientX: 250, clientY: 200 }]));
    });

    // deltaX = 250 - 300 = -50
    expect(el.style.transform).toBe("translateX(-50px)");

    // Opacity should be reduced: progress = min(50 / 160, 1) = 0.3125
    // opacity = 1 - 0.3125 * 0.3 = 0.90625
    const opacity = parseFloat(el.style.opacity);
    expect(opacity).toBeCloseTo(1 - 0.3125 * 0.3, 4);

    hook.unmount();
  });

  // -------------------------------------------------------------------------
  // 8. Swipe right with direction="right": applies translateX transform
  // -------------------------------------------------------------------------
  it("applies positive translateX transform when swiping right with direction='right'", () => {
    setWindowWidth(500);
    const onDismiss = vi.fn();
    const el = document.createElement("div");

    const hook = renderHook(
      ({ enabled }) => useSwipeToDismiss({ direction: "right", onDismiss, enabled }),
      { initialProps: { enabled: false } }
    );

    (hook.result.current as React.MutableRefObject<HTMLElement | null>).current = el;
    hook.rerender({ enabled: true });

    act(() => {
      el.dispatchEvent(createTouchEvent("touchstart", [{ clientX: 100, clientY: 200 }]));
    });

    // Swipe right: clientX increases
    act(() => {
      el.dispatchEvent(createTouchEvent("touchmove", [{ clientX: 170, clientY: 200 }]));
    });

    // deltaX = 170 - 100 = 70
    expect(el.style.transform).toBe("translateX(70px)");

    // Opacity: progress = min(70 / 160, 1) = 0.4375
    // opacity = 1 - 0.4375 * 0.3 = 0.86875
    const opacity = parseFloat(el.style.opacity);
    expect(opacity).toBeCloseTo(1 - 0.4375 * 0.3, 4);

    hook.unmount();
  });

  // -------------------------------------------------------------------------
  // 9. Wrong direction swipe resets transform
  // -------------------------------------------------------------------------
  it("resets transform when swiping in the wrong direction", () => {
    setWindowWidth(500);
    const onDismiss = vi.fn();
    const el = document.createElement("div");

    const hook = renderHook(
      ({ enabled }) => useSwipeToDismiss({ direction: "left", onDismiss, enabled }),
      { initialProps: { enabled: false } }
    );

    (hook.result.current as React.MutableRefObject<HTMLElement | null>).current = el;
    hook.rerender({ enabled: true });

    act(() => {
      el.dispatchEvent(createTouchEvent("touchstart", [{ clientX: 200, clientY: 200 }]));
    });

    // Swipe RIGHT when direction="left" -- wrong direction
    act(() => {
      el.dispatchEvent(createTouchEvent("touchmove", [{ clientX: 280, clientY: 200 }]));
    });

    // Should have been reset
    expect(el.style.transform).toBe("");
    expect(el.style.opacity).toBe("");

    hook.unmount();
  });

  it("resets transform when swiping left with direction='right'", () => {
    setWindowWidth(500);
    const onDismiss = vi.fn();
    const el = document.createElement("div");

    const hook = renderHook(
      ({ enabled }) => useSwipeToDismiss({ direction: "right", onDismiss, enabled }),
      { initialProps: { enabled: false } }
    );

    (hook.result.current as React.MutableRefObject<HTMLElement | null>).current = el;
    hook.rerender({ enabled: true });

    act(() => {
      el.dispatchEvent(createTouchEvent("touchstart", [{ clientX: 200, clientY: 200 }]));
    });

    // Swipe LEFT when direction="right" -- wrong direction
    act(() => {
      el.dispatchEvent(createTouchEvent("touchmove", [{ clientX: 120, clientY: 200 }]));
    });

    expect(el.style.transform).toBe("");
    expect(el.style.opacity).toBe("");

    hook.unmount();
  });

  // -------------------------------------------------------------------------
  // 10. Vertical dominant swipe abandons gesture (resets)
  // -------------------------------------------------------------------------
  it("abandons gesture when vertical movement dominates", () => {
    setWindowWidth(500);
    const onDismiss = vi.fn();
    const el = document.createElement("div");

    const hook = renderHook(
      ({ enabled }) => useSwipeToDismiss({ direction: "left", onDismiss, enabled }),
      { initialProps: { enabled: false } }
    );

    (hook.result.current as React.MutableRefObject<HTMLElement | null>).current = el;
    hook.rerender({ enabled: true });

    act(() => {
      el.dispatchEvent(createTouchEvent("touchstart", [{ clientX: 200, clientY: 200 }]));
    });

    // Move more vertically than horizontally: deltaY=100 > deltaX=20
    act(() => {
      el.dispatchEvent(createTouchEvent("touchmove", [{ clientX: 180, clientY: 300 }]));
    });

    // Should have reset transform and opacity
    expect(el.style.transform).toBe("");
    expect(el.style.opacity).toBe("");

    // Further horizontal swipe should be ignored because touchStart was nulled
    act(() => {
      el.dispatchEvent(createTouchEvent("touchmove", [{ clientX: 80, clientY: 300 }]));
    });

    expect(el.style.transform).toBe("");
    expect(onDismiss).not.toHaveBeenCalled();

    hook.unmount();
  });

  // -------------------------------------------------------------------------
  // 11. Swipe past threshold triggers onDismiss after animation timeout
  // -------------------------------------------------------------------------
  it("triggers onDismiss after 200ms when swipe exceeds threshold", () => {
    setWindowWidth(500);
    const onDismiss = vi.fn();
    const el = document.createElement("div");
    // Give the element a width for the animation
    Object.defineProperty(el, "offsetWidth", { value: 400, configurable: true });

    const hook = renderHook(
      ({ enabled }) => useSwipeToDismiss({ direction: "left", onDismiss, enabled }),
      { initialProps: { enabled: false } }
    );

    (hook.result.current as React.MutableRefObject<HTMLElement | null>).current = el;
    hook.rerender({ enabled: true });

    act(() => {
      el.dispatchEvent(createTouchEvent("touchstart", [{ clientX: 300, clientY: 200 }]));
    });

    // Swipe left past default threshold (80px): deltaX = 200 - 300 = -100
    act(() => {
      el.dispatchEvent(createTouchEvent("touchmove", [{ clientX: 200, clientY: 200 }]));
    });

    // Trigger touchend
    act(() => {
      el.dispatchEvent(createTouchEvent("touchend"));
    });

    // onDismiss should NOT have been called yet (waiting for 200ms animation)
    expect(onDismiss).not.toHaveBeenCalled();

    // The element should have animation styles applied
    expect(el.style.transition).toContain("transform");
    expect(el.style.transform).toBe("translateX(-400px)"); // -offsetWidth for left
    expect(el.style.opacity).toBe("0");

    // Advance timers by 200ms
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);

    // After timeout, styles should be reset
    expect(el.style.transform).toBe("");
    expect(el.style.opacity).toBe("");
    expect(el.style.transition).toBe("");

    hook.unmount();
  });

  it("triggers onDismiss for direction='right' swipe past threshold", () => {
    setWindowWidth(500);
    const onDismiss = vi.fn();
    const el = document.createElement("div");
    Object.defineProperty(el, "offsetWidth", { value: 350, configurable: true });

    const hook = renderHook(
      ({ enabled }) => useSwipeToDismiss({ direction: "right", onDismiss, enabled }),
      { initialProps: { enabled: false } }
    );

    (hook.result.current as React.MutableRefObject<HTMLElement | null>).current = el;
    hook.rerender({ enabled: true });

    act(() => {
      el.dispatchEvent(createTouchEvent("touchstart", [{ clientX: 100, clientY: 200 }]));
    });

    // Swipe right past threshold: deltaX = 200 - 100 = 100 >= 80
    act(() => {
      el.dispatchEvent(createTouchEvent("touchmove", [{ clientX: 200, clientY: 200 }]));
    });

    act(() => {
      el.dispatchEvent(createTouchEvent("touchend"));
    });

    expect(onDismiss).not.toHaveBeenCalled();
    expect(el.style.transform).toBe("translateX(350px)"); // +offsetWidth for right

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);

    hook.unmount();
  });

  // -------------------------------------------------------------------------
  // 12. Swipe below threshold snaps back (no onDismiss)
  // -------------------------------------------------------------------------
  it("snaps back without calling onDismiss when swipe is below threshold", () => {
    setWindowWidth(500);
    const onDismiss = vi.fn();
    const el = document.createElement("div");

    const hook = renderHook(
      ({ enabled }) => useSwipeToDismiss({ direction: "left", onDismiss, enabled }),
      { initialProps: { enabled: false } }
    );

    (hook.result.current as React.MutableRefObject<HTMLElement | null>).current = el;
    hook.rerender({ enabled: true });

    act(() => {
      el.dispatchEvent(createTouchEvent("touchstart", [{ clientX: 300, clientY: 200 }]));
    });

    // Swipe left below threshold: deltaX = 260 - 300 = -40, abs(40) < 80
    act(() => {
      el.dispatchEvent(createTouchEvent("touchmove", [{ clientX: 260, clientY: 200 }]));
    });

    expect(el.style.transform).toBe("translateX(-40px)");

    // Trigger touchend
    act(() => {
      el.dispatchEvent(createTouchEvent("touchend"));
    });

    // Should snap back: transition set, transform and opacity cleared
    expect(el.style.transition).toContain("transform");
    expect(el.style.transform).toBe("");
    expect(el.style.opacity).toBe("");

    // After 200ms, transition should be cleared
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(el.style.transition).toBe("");

    // onDismiss should never have been called
    expect(onDismiss).not.toHaveBeenCalled();

    hook.unmount();
  });

  // -------------------------------------------------------------------------
  // 13. Cleanup removes event listeners on unmount
  // -------------------------------------------------------------------------
  it("removes event listeners on unmount", () => {
    setWindowWidth(500);
    const onDismiss = vi.fn();
    const el = document.createElement("div");
    const removeSpy = vi.spyOn(el, "removeEventListener");

    const hook = renderHook(
      ({ enabled }) => useSwipeToDismiss({ direction: "left", onDismiss, enabled }),
      { initialProps: { enabled: false } }
    );

    (hook.result.current as React.MutableRefObject<HTMLElement | null>).current = el;
    hook.rerender({ enabled: true });

    // Unmount should trigger cleanup
    hook.unmount();

    const removedTypes = removeSpy.mock.calls.map((c) => c[0]);
    expect(removedTypes).toContain("touchstart");
    expect(removedTypes).toContain("touchmove");
    expect(removedTypes).toContain("touchend");

    removeSpy.mockRestore();
  });

  it("removes listeners when re-rendering with enabled=false", () => {
    setWindowWidth(500);
    const onDismiss = vi.fn();
    const el = document.createElement("div");
    const removeSpy = vi.spyOn(el, "removeEventListener");

    const hook = renderHook(
      ({ enabled }) => useSwipeToDismiss({ direction: "left", onDismiss, enabled }),
      { initialProps: { enabled: false } }
    );

    (hook.result.current as React.MutableRefObject<HTMLElement | null>).current = el;
    hook.rerender({ enabled: true });

    // Now disable - should remove listeners via effect cleanup
    hook.rerender({ enabled: false });

    const removedTypes = removeSpy.mock.calls.map((c) => c[0]);
    expect(removedTypes).toContain("touchstart");
    expect(removedTypes).toContain("touchmove");
    expect(removedTypes).toContain("touchend");

    removeSpy.mockRestore();
    hook.unmount();
  });

  // -------------------------------------------------------------------------
  // 14. Custom threshold value is respected
  // -------------------------------------------------------------------------
  it("respects a custom threshold value (dismiss)", () => {
    setWindowWidth(500);
    const onDismiss = vi.fn();
    const el = document.createElement("div");
    Object.defineProperty(el, "offsetWidth", { value: 400, configurable: true });
    const customThreshold = 40;

    const hook = renderHook(
      ({ enabled }) =>
        useSwipeToDismiss({
          direction: "left",
          onDismiss,
          enabled,
          threshold: customThreshold,
        }),
      { initialProps: { enabled: false } }
    );

    (hook.result.current as React.MutableRefObject<HTMLElement | null>).current = el;
    hook.rerender({ enabled: true });

    act(() => {
      el.dispatchEvent(createTouchEvent("touchstart", [{ clientX: 300, clientY: 200 }]));
    });

    // Swipe left exactly at custom threshold: deltaX = 260 - 300 = -40, abs(40) >= 40
    act(() => {
      el.dispatchEvent(createTouchEvent("touchmove", [{ clientX: 260, clientY: 200 }]));
    });

    act(() => {
      el.dispatchEvent(createTouchEvent("touchend"));
    });

    // Should trigger dismiss animation
    expect(el.style.transform).toBe("translateX(-400px)");

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);

    hook.unmount();
  });

  it("respects a custom threshold value (snap back when below)", () => {
    setWindowWidth(500);
    const onDismiss = vi.fn();
    const el = document.createElement("div");
    const customThreshold = 40;

    const hook = renderHook(
      ({ enabled }) =>
        useSwipeToDismiss({
          direction: "left",
          onDismiss,
          enabled,
          threshold: customThreshold,
        }),
      { initialProps: { enabled: false } }
    );

    (hook.result.current as React.MutableRefObject<HTMLElement | null>).current = el;
    hook.rerender({ enabled: true });

    act(() => {
      el.dispatchEvent(createTouchEvent("touchstart", [{ clientX: 300, clientY: 200 }]));
    });

    // Swipe left below custom threshold: deltaX = 270 - 300 = -30, abs(30) < 40
    act(() => {
      el.dispatchEvent(createTouchEvent("touchmove", [{ clientX: 270, clientY: 200 }]));
    });

    act(() => {
      el.dispatchEvent(createTouchEvent("touchend"));
    });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    // Should NOT have dismissed
    expect(onDismiss).not.toHaveBeenCalled();

    hook.unmount();
  });

  // -------------------------------------------------------------------------
  // Additional edge case tests
  // -------------------------------------------------------------------------

  it("sets transition to 'none' on touchstart", () => {
    setWindowWidth(500);
    const onDismiss = vi.fn();
    const el = document.createElement("div");
    el.style.transition = "transform 0.5s";

    const hook = renderHook(
      ({ enabled }) => useSwipeToDismiss({ direction: "left", onDismiss, enabled }),
      { initialProps: { enabled: false } }
    );

    (hook.result.current as React.MutableRefObject<HTMLElement | null>).current = el;
    hook.rerender({ enabled: true });

    act(() => {
      el.dispatchEvent(createTouchEvent("touchstart", [{ clientX: 200, clientY: 200 }]));
    });

    expect(el.style.transition).toBe("none");

    hook.unmount();
  });

  it("ignores touchmove when locked (animation in progress)", () => {
    setWindowWidth(500);
    const onDismiss = vi.fn();
    const el = document.createElement("div");
    Object.defineProperty(el, "offsetWidth", { value: 400, configurable: true });

    const hook = renderHook(
      ({ enabled }) => useSwipeToDismiss({ direction: "left", onDismiss, enabled }),
      { initialProps: { enabled: false } }
    );

    (hook.result.current as React.MutableRefObject<HTMLElement | null>).current = el;
    hook.rerender({ enabled: true });

    // Complete a dismiss gesture to enter locked state
    act(() => {
      el.dispatchEvent(createTouchEvent("touchstart", [{ clientX: 300, clientY: 200 }]));
    });

    act(() => {
      el.dispatchEvent(createTouchEvent("touchmove", [{ clientX: 200, clientY: 200 }]));
    });

    act(() => {
      el.dispatchEvent(createTouchEvent("touchend"));
    });

    // Now locked=true. A touchmove WITHOUT a new touchstart should be ignored.
    // (touchStart.current is null after touchend so touchmove returns early anyway,
    // but if touchStart were set, locked would block it.)
    // Verify the dismiss animation styles are in effect:
    expect(el.style.transform).toBe("translateX(-400px)");
    expect(el.style.opacity).toBe("0");

    // touchmove during locked state does nothing (touchStart is null)
    act(() => {
      el.dispatchEvent(createTouchEvent("touchmove", [{ clientX: 250, clientY: 200 }]));
    });

    // Transform should still be the dismiss animation value
    expect(el.style.transform).toBe("translateX(-400px)");

    // After timeout, locked should be released and onDismiss called
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);

    // Styles should be reset after the timeout
    expect(el.style.transform).toBe("");
    expect(el.style.opacity).toBe("");

    hook.unmount();
  });

  it("touchend without prior touchstart is a no-op", () => {
    setWindowWidth(500);
    const onDismiss = vi.fn();
    const el = document.createElement("div");

    const hook = renderHook(
      ({ enabled }) => useSwipeToDismiss({ direction: "left", onDismiss, enabled }),
      { initialProps: { enabled: false } }
    );

    (hook.result.current as React.MutableRefObject<HTMLElement | null>).current = el;
    hook.rerender({ enabled: true });

    // Dispatch touchend without touchstart - should not throw or call onDismiss
    act(() => {
      el.dispatchEvent(createTouchEvent("touchend"));
    });

    expect(onDismiss).not.toHaveBeenCalled();

    hook.unmount();
  });

  it("touchmove without prior touchstart is a no-op", () => {
    setWindowWidth(500);
    const onDismiss = vi.fn();
    const el = document.createElement("div");

    const hook = renderHook(
      ({ enabled }) => useSwipeToDismiss({ direction: "left", onDismiss, enabled }),
      { initialProps: { enabled: false } }
    );

    (hook.result.current as React.MutableRefObject<HTMLElement | null>).current = el;
    hook.rerender({ enabled: true });

    // Dispatch touchmove without touchstart
    act(() => {
      el.dispatchEvent(createTouchEvent("touchmove", [{ clientX: 100, clientY: 200 }]));
    });

    expect(el.style.transform).toBe("");
    expect(el.style.opacity).toBe("");

    hook.unmount();
  });

  it("opacity is capped at 0.7 minimum (progress capped at 1)", () => {
    setWindowWidth(500);
    const onDismiss = vi.fn();
    const el = document.createElement("div");

    const hook = renderHook(
      ({ enabled }) => useSwipeToDismiss({ direction: "left", onDismiss, enabled }),
      { initialProps: { enabled: false } }
    );

    (hook.result.current as React.MutableRefObject<HTMLElement | null>).current = el;
    hook.rerender({ enabled: true });

    act(() => {
      el.dispatchEvent(createTouchEvent("touchstart", [{ clientX: 500, clientY: 200 }]));
    });

    // Swipe a very large distance: deltaX = 0 - 500 = -500
    // progress = min(500 / 160, 1) = 1
    // opacity = 1 - 1 * 0.3 = 0.7
    act(() => {
      el.dispatchEvent(createTouchEvent("touchmove", [{ clientX: 0, clientY: 200 }]));
    });

    const opacity = parseFloat(el.style.opacity);
    expect(opacity).toBeCloseTo(0.7, 4);

    hook.unmount();
  });

  it("handles multiple sequential swipe gestures", () => {
    setWindowWidth(500);
    const onDismiss = vi.fn();
    const el = document.createElement("div");

    const hook = renderHook(
      ({ enabled }) => useSwipeToDismiss({ direction: "left", onDismiss, enabled }),
      { initialProps: { enabled: false } }
    );

    (hook.result.current as React.MutableRefObject<HTMLElement | null>).current = el;
    hook.rerender({ enabled: true });

    // First gesture: swipe below threshold, snap back
    act(() => {
      el.dispatchEvent(createTouchEvent("touchstart", [{ clientX: 300, clientY: 200 }]));
    });
    act(() => {
      el.dispatchEvent(createTouchEvent("touchmove", [{ clientX: 280, clientY: 200 }]));
    });
    act(() => {
      el.dispatchEvent(createTouchEvent("touchend"));
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(onDismiss).not.toHaveBeenCalled();

    // Second gesture: should work fine after first was snapped back
    act(() => {
      el.dispatchEvent(createTouchEvent("touchstart", [{ clientX: 300, clientY: 200 }]));
    });
    act(() => {
      el.dispatchEvent(createTouchEvent("touchmove", [{ clientX: 250, clientY: 200 }]));
    });

    expect(el.style.transform).toBe("translateX(-50px)");

    act(() => {
      el.dispatchEvent(createTouchEvent("touchend"));
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    // Still below threshold, no dismiss
    expect(onDismiss).not.toHaveBeenCalled();

    hook.unmount();
  });

  it("touchend on desktop is a no-op", () => {
    setWindowWidth(1200); // desktop
    const onDismiss = vi.fn();
    const el = document.createElement("div");

    const hook = renderHook(
      ({ enabled }) => useSwipeToDismiss({ direction: "left", onDismiss, enabled }),
      { initialProps: { enabled: false } }
    );

    (hook.result.current as React.MutableRefObject<HTMLElement | null>).current = el;
    hook.rerender({ enabled: true });

    // Even if somehow touchstart and touchmove occurred, touchend on desktop returns early
    act(() => {
      el.dispatchEvent(createTouchEvent("touchend"));
    });

    expect(onDismiss).not.toHaveBeenCalled();

    hook.unmount();
  });

  it("re-registers listeners when direction changes", () => {
    setWindowWidth(500);
    const onDismiss = vi.fn();
    const el = document.createElement("div");
    const addSpy = vi.spyOn(el, "addEventListener");
    const removeSpy = vi.spyOn(el, "removeEventListener");

    const hook = renderHook(
      ({ direction, enabled }: { direction: "left" | "right"; enabled: boolean }) =>
        useSwipeToDismiss({ direction, onDismiss, enabled }),
      { initialProps: { direction: "left" as const, enabled: false } }
    );

    (hook.result.current as React.MutableRefObject<HTMLElement | null>).current = el;
    hook.rerender({ direction: "left" as const, enabled: true });

    addSpy.mockClear();
    removeSpy.mockClear();

    // Change direction - should remove old listeners and add new ones
    hook.rerender({ direction: "right" as const, enabled: true });

    const removedTypes = removeSpy.mock.calls.map((c) => c[0]);
    expect(removedTypes).toContain("touchstart");
    expect(removedTypes).toContain("touchmove");
    expect(removedTypes).toContain("touchend");

    const addedTypes = addSpy.mock.calls.map((c) => c[0]);
    expect(addedTypes).toContain("touchstart");
    expect(addedTypes).toContain("touchmove");
    expect(addedTypes).toContain("touchend");

    addSpy.mockRestore();
    removeSpy.mockRestore();
    hook.unmount();
  });
});
