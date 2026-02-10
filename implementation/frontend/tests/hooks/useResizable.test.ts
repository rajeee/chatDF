// Tests for useResizable hook
// Covers: initial state, right-click guard, left-click starts resize + calls setPos,
// mousemove during resize, min width constraint, min height constraint, mouseup ends
// resize + justResized, mousemove without resize, full resize sequence, cleanup on unmount.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useResizable } from "@/hooks/useResizable";

// --- Mock helpers ---

/** Build a fake React.MouseEvent with the fields useResizable reads. */
function makeMockMouseEvent(overrides: {
  button?: number;
  clientX?: number;
  clientY?: number;
  parentRect?: DOMRect;
}): React.MouseEvent {
  const {
    button = 0,
    clientX = 0,
    clientY = 0,
    parentRect = new DOMRect(50, 50, 400, 300),
  } = overrides;

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
    target: currentTarget,
    currentTarget,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as React.MouseEvent;
}

let rafSpy: ReturnType<typeof vi.spyOn>;

// --- Test suite ---

describe("useResizable", () => {
  const MIN_W = 200;
  const MIN_H = 150;

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

  // 1. Initial size is null
  it("returns null size initially", () => {
    const { result } = renderHook(() => useResizable(MIN_W, MIN_H));

    expect(result.current.size).toBeNull();
  });

  // 2. Right-click does nothing
  it("does not start resize on right-click (button !== 0)", () => {
    const { result } = renderHook(() => useResizable(MIN_W, MIN_H));
    const event = makeMockMouseEvent({ button: 2 });

    act(() => {
      result.current.onResizeMouseDown(event);
    });

    // preventDefault should NOT have been called
    expect(event.preventDefault).not.toHaveBeenCalled();

    // Moving the mouse should not update size
    act(() => {
      document.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 500, clientY: 500 })
      );
    });

    expect(result.current.size).toBeNull();
  });

  // 3. Left-click starts resize and calls setPos
  it("starts resize on left-click and calls setPos with rect position", () => {
    const mockSetPos = vi.fn();
    const parentRect = new DOMRect(80, 90, 400, 300);
    const { result } = renderHook(() =>
      useResizable(MIN_W, MIN_H, mockSetPos)
    );
    const event = makeMockMouseEvent({
      button: 0,
      clientX: 200,
      clientY: 250,
      parentRect,
    });

    act(() => {
      result.current.onResizeMouseDown(event);
    });

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(mockSetPos).toHaveBeenCalledWith({ x: 80, y: 90 });

    // Verify resize is active by moving mouse
    act(() => {
      document.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 300, clientY: 350 })
      );
    });

    // dx = 300 - 200 = 100, dy = 350 - 250 = 100
    // w = max(200, 400 + 100) = 500, h = max(150, 300 + 100) = 400
    expect(result.current.size).toEqual({ w: 500, h: 400 });
  });

  // 4. mousemove during resize updates size
  it("updates size on mousemove during resize", () => {
    const parentRect = new DOMRect(0, 0, 400, 300);
    const { result } = renderHook(() => useResizable(MIN_W, MIN_H));
    const event = makeMockMouseEvent({
      button: 0,
      clientX: 400,
      clientY: 300,
      parentRect,
    });

    act(() => {
      result.current.onResizeMouseDown(event);
    });

    // Move right and down
    act(() => {
      document.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 500, clientY: 400 })
      );
    });

    // dx = 500 - 400 = 100, dy = 400 - 300 = 100
    // w = max(200, 400 + 100) = 500, h = max(150, 300 + 100) = 400
    expect(result.current.size).toEqual({ w: 500, h: 400 });

    // Move further
    act(() => {
      document.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 600, clientY: 500 })
      );
    });

    // dx = 600 - 400 = 200, dy = 500 - 300 = 200
    // w = max(200, 400 + 200) = 600, h = max(150, 300 + 200) = 500
    expect(result.current.size).toEqual({ w: 600, h: 500 });
  });

  // 5. Size respects minimum width constraint
  it("clamps size to minimum width when dragging left", () => {
    const parentRect = new DOMRect(0, 0, 400, 300);
    const { result } = renderHook(() => useResizable(MIN_W, MIN_H));
    const event = makeMockMouseEvent({
      button: 0,
      clientX: 400,
      clientY: 300,
      parentRect,
    });

    act(() => {
      result.current.onResizeMouseDown(event);
    });

    // Move far to the left: dx = 50 - 400 = -350
    act(() => {
      document.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 50, clientY: 300 })
      );
    });

    // w = max(200, 400 + (-350)) = max(200, 50) = 200
    // h = max(150, 300 + 0) = 300
    expect(result.current.size).toEqual({ w: MIN_W, h: 300 });
  });

  // 6. Size respects minimum height constraint
  it("clamps size to minimum height when dragging upward", () => {
    const parentRect = new DOMRect(0, 0, 400, 300);
    const { result } = renderHook(() => useResizable(MIN_W, MIN_H));
    const event = makeMockMouseEvent({
      button: 0,
      clientX: 400,
      clientY: 300,
      parentRect,
    });

    act(() => {
      result.current.onResizeMouseDown(event);
    });

    // Move far up: dy = 20 - 300 = -280
    act(() => {
      document.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 400, clientY: 20 })
      );
    });

    // w = max(200, 400 + 0) = 400
    // h = max(150, 300 + (-280)) = max(150, 20) = 150
    expect(result.current.size).toEqual({ w: 400, h: MIN_H });
  });

  // 7. mouseup ends resize and sets justResized briefly
  it("ends resize on mouseup and sets justResized briefly", () => {
    const parentRect = new DOMRect(0, 0, 400, 300);
    const { result } = renderHook(() => useResizable(MIN_W, MIN_H));
    const event = makeMockMouseEvent({
      button: 0,
      clientX: 400,
      clientY: 300,
      parentRect,
    });

    act(() => {
      result.current.onResizeMouseDown(event);
    });

    // Move to set a size
    act(() => {
      document.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 500, clientY: 400 })
      );
    });
    expect(result.current.size).toEqual({ w: 500, h: 400 });

    // Mouse up should stop resizing
    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
    });

    // requestAnimationFrame is mocked to run synchronously,
    // so justResized is set true and then reset to false
    expect(result.current.justResized.current).toBe(false);

    // Further mouse moves should not change size
    act(() => {
      document.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 999, clientY: 999 })
      );
    });
    expect(result.current.size).toEqual({ w: 500, h: 400 });
  });

  // 8. mousemove when not resizing does nothing
  it("does not update size on mousemove when not resizing", () => {
    const { result } = renderHook(() => useResizable(MIN_W, MIN_H));

    act(() => {
      document.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 800, clientY: 600 })
      );
    });

    expect(result.current.size).toBeNull();
  });

  // 9. Full resize sequence gives correct dimensions
  it("full resize sequence produces correct final size", () => {
    const mockSetPos = vi.fn();
    const parentRect = new DOMRect(50, 60, 600, 400);
    const { result } = renderHook(() =>
      useResizable(MIN_W, MIN_H, mockSetPos)
    );
    const event = makeMockMouseEvent({
      button: 0,
      clientX: 650,
      clientY: 460,
      parentRect,
    });

    // Start resize
    act(() => {
      result.current.onResizeMouseDown(event);
    });

    expect(mockSetPos).toHaveBeenCalledWith({ x: 50, y: 60 });

    // startData = { mouseX: 650, mouseY: 460, w: 600, h: 400 }

    // Move #1
    act(() => {
      document.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 700, clientY: 500 })
      );
    });
    // dx = 700 - 650 = 50, dy = 500 - 460 = 40
    // w = max(200, 600 + 50) = 650, h = max(150, 400 + 40) = 440
    expect(result.current.size).toEqual({ w: 650, h: 440 });

    // Move #2
    act(() => {
      document.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 750, clientY: 560 })
      );
    });
    // dx = 750 - 650 = 100, dy = 560 - 460 = 100
    // w = max(200, 600 + 100) = 700, h = max(150, 400 + 100) = 500
    expect(result.current.size).toEqual({ w: 700, h: 500 });

    // End resize
    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
    });

    // Size should remain at last value
    expect(result.current.size).toEqual({ w: 700, h: 500 });
  });

  // 10. Cleanup removes event listeners on unmount
  it("removes document event listeners on unmount", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");

    const { unmount } = renderHook(() => useResizable(MIN_W, MIN_H));

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
