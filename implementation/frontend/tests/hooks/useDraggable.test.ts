// Tests for useDraggable hook
// Covers: initial state, right-click guard, button-click guard, left-click starts drag,
// mousemove during drag, mousemove without drag, mouseup ends drag + justDragged,
// full drag sequence, manual setPos, cleanup on unmount.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDraggable } from "@/hooks/useDraggable";

// --- Mock helpers ---

/** Build a fake React.MouseEvent with the fields useDraggable reads. */
function makeMockMouseEvent(overrides: {
  button?: number;
  clientX?: number;
  clientY?: number;
  targetClosest?: HTMLElement | null;
  parentRect?: DOMRect;
}): React.MouseEvent {
  const {
    button = 0,
    clientX = 0,
    clientY = 0,
    targetClosest = null,
    parentRect = new DOMRect(0, 0, 400, 300),
  } = overrides;

  const target = {
    closest: vi.fn().mockReturnValue(targetClosest),
  } as unknown as HTMLElement;

  const parentElement = {
    getBoundingClientRect: vi.fn().mockReturnValue(parentRect),
  } as unknown as HTMLElement;

  const currentTarget = {
    parentElement,
  } as unknown as HTMLElement;

  return {
    button,
    clientX,
    clientY,
    target,
    currentTarget,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as React.MouseEvent;
}

let rafSpy: ReturnType<typeof vi.spyOn>;

// --- Test suite ---

describe("useDraggable", () => {
  beforeEach(() => {
    rafSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb) => {
        cb(0);
        return 0;
      });
  });

  afterEach(() => {
    rafSpy.mockRestore();
  });

  // 1. Initial pos is null
  it("returns null position initially", () => {
    const { result } = renderHook(() => useDraggable());

    expect(result.current.pos).toBeNull();
  });

  // 2. Right-click does not start drag
  it("does not start drag on right-click (button !== 0)", () => {
    const { result } = renderHook(() => useDraggable());
    const event = makeMockMouseEvent({ button: 2 });

    act(() => {
      result.current.onMouseDown(event);
    });

    // preventDefault should NOT have been called since handler returns early
    expect(event.preventDefault).not.toHaveBeenCalled();

    // Moving the mouse should not update position
    act(() => {
      document.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 100, clientY: 200 })
      );
    });

    expect(result.current.pos).toBeNull();
  });

  // 3. Click on a button element does not start drag
  it("does not start drag when target is inside a button", () => {
    const { result } = renderHook(() => useDraggable());
    const buttonEl = document.createElement("button");
    const event = makeMockMouseEvent({ button: 0, targetClosest: buttonEl });

    act(() => {
      result.current.onMouseDown(event);
    });

    expect(event.preventDefault).not.toHaveBeenCalled();

    // Moving the mouse should not update position
    act(() => {
      document.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 100, clientY: 200 })
      );
    });

    expect(result.current.pos).toBeNull();
  });

  // 4. Left-click starts drag
  it("starts drag on left-click and calls preventDefault", () => {
    const { result } = renderHook(() => useDraggable());
    const parentRect = new DOMRect(50, 60, 400, 300);
    const event = makeMockMouseEvent({
      button: 0,
      clientX: 100,
      clientY: 120,
      parentRect,
    });

    act(() => {
      result.current.onMouseDown(event);
    });

    expect(event.preventDefault).toHaveBeenCalled();

    // Verify drag is active by moving the mouse
    act(() => {
      document.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 200, clientY: 250 })
      );
    });

    // offset = { x: 100 - 50, y: 120 - 60 } = { x: 50, y: 60 }
    // pos = { x: 200 - 50, y: 250 - 60 } = { x: 150, y: 190 }
    expect(result.current.pos).toEqual({ x: 150, y: 190 });
  });

  // 5. mousemove during drag updates position correctly
  it("updates position on mousemove during drag", () => {
    const { result } = renderHook(() => useDraggable());
    const parentRect = new DOMRect(10, 20, 400, 300);
    const event = makeMockMouseEvent({
      button: 0,
      clientX: 30,
      clientY: 40,
      parentRect,
    });

    act(() => {
      result.current.onMouseDown(event);
    });

    // offset = { x: 30 - 10, y: 40 - 20 } = { x: 20, y: 20 }
    // First move
    act(() => {
      document.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 120, clientY: 220 })
      );
    });
    expect(result.current.pos).toEqual({ x: 100, y: 200 });

    // Second move
    act(() => {
      document.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 320, clientY: 420 })
      );
    });
    expect(result.current.pos).toEqual({ x: 300, y: 400 });
  });

  // 6. mousemove when not dragging does nothing
  it("does not update position on mousemove when not dragging", () => {
    const { result } = renderHook(() => useDraggable());

    act(() => {
      document.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 500, clientY: 600 })
      );
    });

    expect(result.current.pos).toBeNull();
  });

  // 7. mouseup ends drag and sets justDragged briefly
  it("ends drag on mouseup and sets justDragged briefly", () => {
    const { result } = renderHook(() => useDraggable());
    const parentRect = new DOMRect(0, 0, 400, 300);
    const event = makeMockMouseEvent({
      button: 0,
      clientX: 10,
      clientY: 10,
      parentRect,
    });

    act(() => {
      result.current.onMouseDown(event);
    });

    // Move to set a position
    act(() => {
      document.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 100, clientY: 100 })
      );
    });
    expect(result.current.pos).toEqual({ x: 90, y: 90 });

    // Mouse up should stop the drag
    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
    });

    // requestAnimationFrame is mocked to run synchronously,
    // so justDragged should have been set true and then reset to false
    expect(result.current.justDragged.current).toBe(false);

    // Further mouse moves should not change position
    act(() => {
      document.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 999, clientY: 999 })
      );
    });
    expect(result.current.pos).toEqual({ x: 90, y: 90 });
  });

  // 8. Full drag sequence: mousedown -> mousemove -> mouseup
  it("full drag sequence produces correct final position", () => {
    const { result } = renderHook(() => useDraggable());
    const parentRect = new DOMRect(100, 100, 500, 400);
    const event = makeMockMouseEvent({
      button: 0,
      clientX: 150,
      clientY: 130,
      parentRect,
    });

    // Start drag
    act(() => {
      result.current.onMouseDown(event);
    });

    // offset = { x: 150 - 100, y: 130 - 100 } = { x: 50, y: 30 }

    // Move several times
    act(() => {
      document.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 200, clientY: 200 })
      );
    });
    expect(result.current.pos).toEqual({ x: 150, y: 170 });

    act(() => {
      document.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 350, clientY: 330 })
      );
    });
    expect(result.current.pos).toEqual({ x: 300, y: 300 });

    // End drag
    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
    });

    // Position should remain at the last mousemove value
    expect(result.current.pos).toEqual({ x: 300, y: 300 });
  });

  // 9. setPos can manually update position
  it("allows manual position updates via setPos", () => {
    const { result } = renderHook(() => useDraggable());

    expect(result.current.pos).toBeNull();

    act(() => {
      result.current.setPos({ x: 42, y: 84 });
    });

    expect(result.current.pos).toEqual({ x: 42, y: 84 });
  });

  // 10. Cleanup removes event listeners on unmount
  it("removes document event listeners on unmount", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");

    const { unmount } = renderHook(() => useDraggable());

    // Should have registered mousemove and mouseup listeners
    const addedTypes = addSpy.mock.calls.map((c) => c[0]);
    expect(addedTypes).toContain("mousemove");
    expect(addedTypes).toContain("mouseup");

    unmount();

    // Should have removed mousemove and mouseup listeners
    const removedTypes = removeSpy.mock.calls.map((c) => c[0]);
    expect(removedTypes).toContain("mousemove");
    expect(removedTypes).toContain("mouseup");

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
