import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDraggable } from "@/hooks/useDraggable";

describe("useDraggable", () => {
  it("should initialize with null position", () => {
    const { result } = renderHook(() => useDraggable());
    expect(result.current.pos).toBeNull();
  });

  it("should update position on drag", () => {
    const { result } = renderHook(() => useDraggable());

    // Create mock element structure
    const mockParent = document.createElement("div");
    mockParent.getBoundingClientRect = vi.fn(() => ({
      left: 100,
      top: 100,
      width: 200,
      height: 200,
      right: 300,
      bottom: 300,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    }));

    const mockHeader = document.createElement("div");
    Object.defineProperty(mockHeader, "parentElement", {
      value: mockParent,
      writable: false,
    });

    // Simulate mousedown
    const mouseDownEvent = {
      button: 0,
      clientX: 150,
      clientY: 150,
      target: mockHeader,
      currentTarget: mockHeader,
      preventDefault: vi.fn(),
    } as unknown as React.MouseEvent;

    act(() => {
      result.current.onMouseDown(mouseDownEvent);
    });

    // Simulate mousemove
    act(() => {
      const mouseMoveEvent = new MouseEvent("mousemove", {
        clientX: 200,
        clientY: 200,
      });
      document.dispatchEvent(mouseMoveEvent);
    });

    expect(result.current.pos).toEqual({ x: 150, y: 150 });

    // Simulate mouseup
    act(() => {
      const mouseUpEvent = new MouseEvent("mouseup");
      document.dispatchEvent(mouseUpEvent);
    });

    expect(result.current.justDragged.current).toBe(true);
  });

  it("should not drag when right mouse button is used", () => {
    const { result } = renderHook(() => useDraggable());

    const mockParent = document.createElement("div");
    const mockHeader = document.createElement("div");
    Object.defineProperty(mockHeader, "parentElement", {
      value: mockParent,
      writable: false,
    });

    const mouseDownEvent = {
      button: 2, // Right button
      clientX: 150,
      clientY: 150,
      target: mockHeader,
      currentTarget: mockHeader,
      preventDefault: vi.fn(),
    } as unknown as React.MouseEvent;

    act(() => {
      result.current.onMouseDown(mouseDownEvent);
    });

    // Position should remain null
    expect(result.current.pos).toBeNull();
  });
});
