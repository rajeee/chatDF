import { useState, useRef, useEffect, useCallback } from "react";

/**
 * Hook for making modals draggable by their header.
 * Returns position state and mouse down handler for the drag header.
 */
export function useDraggable() {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const justDragged = useRef(false);
  const offset = useRef({ x: 0, y: 0 });

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return;
    dragging.current = true;
    const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    offset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    e.preventDefault();
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setPos({ x: e.clientX - offset.current.x, y: e.clientY - offset.current.y });
    };
    const onMouseUp = () => {
      if (dragging.current) {
        dragging.current = false;
        justDragged.current = true;
        requestAnimationFrame(() => { justDragged.current = false; });
      }
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  return { pos, setPos, onMouseDown, justDragged };
}
