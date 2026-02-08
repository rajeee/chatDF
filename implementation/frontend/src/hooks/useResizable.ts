import { useState, useRef, useEffect, useCallback } from "react";

/**
 * Hook for making modals resizable from the bottom-right corner.
 * Returns size state and mouse down handler for the resize handle.
 */
export function useResizable(
  minW: number,
  minH: number,
  setPos?: (pos: { x: number; y: number }) => void,
) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const resizing = useRef(false);
  const justResized = useRef(false);
  const startData = useRef({ mouseX: 0, mouseY: 0, w: 0, h: 0 });

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    resizing.current = true;
    const modal = e.currentTarget.parentElement as HTMLElement;
    const rect = modal.getBoundingClientRect();
    startData.current = { mouseX: e.clientX, mouseY: e.clientY, w: rect.width, h: rect.height };
    // Pin top-left so flex-center doesn't reposition on size change
    if (setPos) {
      setPos({ x: rect.left, y: rect.top });
    }
    e.preventDefault();
    e.stopPropagation();
  }, [setPos]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!resizing.current) return;
      const dx = e.clientX - startData.current.mouseX;
      const dy = e.clientY - startData.current.mouseY;
      setSize({
        w: Math.max(minW, startData.current.w + dx),
        h: Math.max(minH, startData.current.h + dy),
      });
    };
    const onMouseUp = () => {
      if (resizing.current) {
        resizing.current = false;
        justResized.current = true;
        requestAnimationFrame(() => { justResized.current = false; });
      }
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [minW, minH]);

  return { size, onResizeMouseDown, justResized };
}
