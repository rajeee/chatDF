// Direct chart visualization modal — opened by Visualize button in chat messages.
// Shows only the chart (no SQL queries list), with table/chart toggle.

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useUiStore } from "@/stores/uiStore";
import { useDraggable } from "@/hooks/useDraggable";
import { useResizable } from "@/hooks/useResizable";
import { detectChartTypes } from "@/utils/chartDetection";
import { ChartVisualization } from "./ChartVisualization";

function ResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
      style={{ zIndex: 10 }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" className="opacity-40">
        <path d="M14 14L8 14L14 8Z" fill="currentColor" />
        <path d="M14 14L11 14L14 11Z" fill="currentColor" />
      </svg>
    </div>
  );
}

export function ChartModal() {
  const execution = useUiStore((s) => s.chartModalExecution);
  const closeChartModal = useUiStore((s) => s.closeChartModal);

  const { pos, setPos, onMouseDown, justDragged } = useDraggable();
  const { size, onResizeMouseDown, justResized } = useResizable(400, 200, setPos);

  const columns = execution?.columns ?? [];
  const rows = execution?.rows ?? [];
  const hasCharts = useMemo(
    () => columns.length > 0 && rows.length > 0 && detectChartTypes(columns, rows).length > 0,
    [columns, rows],
  );

  // Measure chat area for initial width
  const [chatAreaWidth, setChatAreaWidth] = useState<number | null>(null);
  useEffect(() => {
    if (!execution) return;
    const el = document.querySelector('[data-testid="chat-area"]');
    if (el) {
      setChatAreaWidth(el.getBoundingClientRect().width);
    }
  }, [execution]);

  // Escape key closes modal
  useEffect(() => {
    if (!execution) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeChartModal();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [execution, closeChartModal]);

  if (!execution || !hasCharts) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !justDragged.current && !justResized.current) {
      closeChartModal();
    }
  };

  const initialWidth = chatAreaWidth ? Math.min(chatAreaWidth, window.innerWidth * 0.95) : undefined;

  return (
    <div
      data-testid="chart-modal"
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chart-modal-title"
    >
      <div
        data-testid="chart-modal-backdrop"
        className="fixed inset-0 bg-black/30 flex items-center justify-center modal-backdrop-enter"
        onClick={handleBackdropClick}
      >
        <div
          className="relative rounded-lg shadow-xl flex flex-col modal-scale-enter"
          style={{
            backgroundColor: "var(--color-surface)",
            ...(pos ? { position: "fixed" as const, left: pos.x, top: pos.y } : {}),
            width: size ? size.w : (initialWidth ?? "56rem"),
            height: size ? size.h : "70vh",
            maxWidth: "95vw",
            maxHeight: "95vh",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag header */}
          <div
            onMouseDown={onMouseDown}
            className="flex items-center justify-between px-4 py-3 border-b cursor-move select-none"
            style={{ borderColor: "var(--color-border)" }}
          >
            <h2 id="chart-modal-title" className="text-sm font-semibold">
              Chart Visualization
            </h2>
            <button
              onClick={closeChartModal}
              aria-label="Close chart"
              className="p-1 rounded hover:opacity-70 text-lg"
            >
              &#x2715;
            </button>
          </div>

          {/* Chart content */}
          <div className="flex-1 min-h-0">
            <ChartVisualization columns={columns} rows={rows} />
          </div>

          <ResizeHandle onMouseDown={onResizeMouseDown} />
        </div>
      </div>
    </div>
  );
}
