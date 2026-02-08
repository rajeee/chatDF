// Implements: spec/frontend/chat_area/sql_panel/plan.md
//
// SQL Modal: displays SQL executions in a centered modal dialog.
// Each query is shown with syntax highlighting (CodeMirror) and an optional
// "View Output" button that opens a nested result modal.
// Both modals are draggable (via header) and resizable (via corner handle).
// Result modal supports sortable columns and CSV download.

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useUiStore } from "@/stores/uiStore";
import { useCodeMirror } from "@/hooks/useCodeMirror";
import type { SqlExecution } from "@/stores/chatStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SortKey {
  colIdx: number;
  dir: "asc" | "desc";
}

// ---------------------------------------------------------------------------
// useDraggable — drag a modal by its header
// ---------------------------------------------------------------------------

function useDraggable() {
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

// ---------------------------------------------------------------------------
// useResizable — resize a modal from the bottom-right corner
// ---------------------------------------------------------------------------

function useResizable(
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

// ---------------------------------------------------------------------------
// ResizeHandle — corner grip widget
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// cellValue / cellValueRaw — extract cell values from row data
// ---------------------------------------------------------------------------

function cellValueRaw(row: unknown, colIdx: number, columns: string[]): unknown {
  if (Array.isArray(row)) return row[colIdx];
  if (row && typeof row === "object") return (row as Record<string, unknown>)[columns[colIdx]];
  return null;
}

function cellValue(row: unknown, colIdx: number, columns: string[]): string {
  const v = cellValueRaw(row, colIdx, columns);
  return v != null ? String(v) : "null";
}

// ---------------------------------------------------------------------------
// compareValues — null-safe, numeric-aware comparator
// ---------------------------------------------------------------------------

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

// ---------------------------------------------------------------------------
// useSortedRows — multi-key column sorting
// ---------------------------------------------------------------------------

function useSortedRows(rows: unknown[], columns: string[]) {
  const [sortKeys, setSortKeys] = useState<SortKey[]>([]);

  const toggleSort = useCallback((colIdx: number) => {
    setSortKeys((prev) => {
      const existingIdx = prev.findIndex((k) => k.colIdx === colIdx);
      if (existingIdx === 0) {
        // Already first key — toggle direction
        const toggled = { ...prev[0], dir: prev[0].dir === "asc" ? "desc" as const : "asc" as const };
        return [toggled, ...prev.slice(1)];
      }
      if (existingIdx > 0) {
        // Elsewhere in keys — move to front
        const key = prev[existingIdx];
        return [key, ...prev.slice(0, existingIdx), ...prev.slice(existingIdx + 1)];
      }
      // New key — add to front as asc
      return [{ colIdx, dir: "asc" as const }, ...prev];
    });
  }, []);

  const clearSort = useCallback(() => setSortKeys([]), []);

  const sortedRows = useMemo(() => {
    if (sortKeys.length === 0) return rows;
    return [...rows].sort((a, b) => {
      for (const key of sortKeys) {
        const cmp = compareValues(
          cellValueRaw(a, key.colIdx, columns),
          cellValueRaw(b, key.colIdx, columns),
        );
        if (cmp !== 0) return key.dir === "asc" ? cmp : -cmp;
      }
      return 0;
    });
  }, [rows, columns, sortKeys]);

  return { sortKeys, sortedRows, toggleSort, clearSort };
}

// ---------------------------------------------------------------------------
// SortIndicator — arrow + rank badge
// ---------------------------------------------------------------------------

function SortIndicator({ dir, rank }: { dir: "asc" | "desc"; rank: number }) {
  return (
    <span className="inline-flex items-baseline ml-1 text-[10px]">
      {dir === "asc" ? "▲" : "▼"}
      {rank > 1 && <sup className="text-[8px] ml-[1px]">{rank}</sup>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// downloadCsv — export rows as CSV
// ---------------------------------------------------------------------------

function downloadCsv(columns: string[], rows: unknown[], filename: string) {
  function escape(val: unknown): string {
    if (val == null) return "";
    const s = String(val);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  const header = columns.map(escape).join(",");
  const body = rows.map((row) =>
    columns.map((_, i) => escape(cellValueRaw(row, i, columns))).join(","),
  ).join("\n");
  const csv = header + "\n" + body;

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// SQLQueryBlock — one card per SQL execution
// ---------------------------------------------------------------------------

function SQLQueryBlock({
  execution,
  index,
  onViewOutput,
  onShowError,
}: {
  execution: SqlExecution;
  index: number;
  onViewOutput: (index: number) => void;
  onShowError: (index: number) => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const isDark = document.documentElement.classList.contains("dark");

  useCodeMirror(editorRef, execution.query, isDark);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(execution.query);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [execution.query]);

  const hasOutput = execution.columns != null && execution.columns.length > 0;

  return (
    <div
      className="rounded-lg border"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-bg)",
      }}
    >
      {/* Query header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b"
        style={{ borderColor: "var(--color-border)" }}
      >
        <span className="text-xs font-medium opacity-70">Query {index + 1}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="text-xs px-2 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      {/* CodeMirror editor */}
      <div ref={editorRef} className="max-h-[200px] overflow-y-auto" />

      {/* Error / View Output footer */}
      {(execution.error || hasOutput) && (
        <div
          className="flex items-center gap-2 px-3 py-2 border-t"
          style={{ borderColor: "var(--color-border)" }}
        >
          {execution.error && (
            <button
              type="button"
              onClick={() => onShowError(index)}
              className="text-xs px-2 py-1 rounded border hover:opacity-80 transition-opacity"
              style={{
                borderColor: "var(--color-error)",
                color: "var(--color-error)",
              }}
            >
              Show Error
            </button>
          )}
          {hasOutput && (
            <button
              type="button"
              onClick={() => onViewOutput(index)}
              className="text-xs px-2 py-1 rounded border hover:opacity-80 transition-opacity"
              style={{
                borderColor: "var(--color-accent)",
                color: "var(--color-accent)",
              }}
            >
              View Output ({execution.total_rows ?? execution.rows?.length ?? 0} rows)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SQLErrorModal — modal showing error text (z-70)
// ---------------------------------------------------------------------------

function SQLErrorModal({
  error,
  queryIndex,
  onClose,
}: {
  error: string;
  queryIndex: number;
  onClose: () => void;
}) {
  const { pos, onMouseDown, justDragged } = useDraggable();
  const { size, onResizeMouseDown, justResized } = useResizable(300, 150);

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget && !justDragged.current && !justResized.current) {
      onClose();
    }
  }

  return (
    <div className="fixed inset-0" style={{ zIndex: 70 }}>
      <div
        className="fixed inset-0 bg-black/30 flex items-center justify-center"
        onClick={handleBackdropClick}
      >
        <div
          className="relative rounded-lg shadow-xl flex flex-col"
          style={{
            backgroundColor: "var(--color-surface)",
            ...(pos ? { position: "fixed", left: pos.x, top: pos.y } : {}),
            width: size ? size.w : "40rem",
            height: size ? size.h : "auto",
            maxWidth: "90vw",
            maxHeight: "80vh",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag header */}
          <div
            onMouseDown={onMouseDown}
            className="flex items-center justify-between px-4 py-3 border-b cursor-move select-none"
            style={{ borderColor: "var(--color-border)" }}
          >
            <h3 className="text-sm font-semibold" style={{ color: "var(--color-error)" }}>
              Query {queryIndex + 1} Error
            </h3>
            <button
              onClick={onClose}
              aria-label="Close error"
              className="p-1 rounded hover:opacity-70 text-lg"
            >
              &#x2715;
            </button>
          </div>

          {/* Error content */}
          <div className="flex-1 overflow-auto px-4 py-3">
            <pre
              className="text-xs whitespace-pre-wrap break-words"
              style={{ color: "var(--color-error)" }}
            >
              {error}
            </pre>
          </div>

          <ResizeHandle onMouseDown={onResizeMouseDown} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SQLResultModal — nested modal showing query results as a table
// ---------------------------------------------------------------------------

function SQLResultModal({
  execution,
  index,
  onClose,
  initialWidth,
}: {
  execution: SqlExecution;
  index: number;
  onClose: () => void;
  initialWidth?: number;
}) {
  const columns = execution.columns ?? [];
  const rows = execution.rows ?? [];
  const totalRows = execution.total_rows ?? rows.length;
  const isTruncated = totalRows > rows.length;

  const { pos, setPos, onMouseDown, justDragged } = useDraggable();
  const { size, onResizeMouseDown, justResized } = useResizable(400, 200, setPos);
  const { sortKeys, sortedRows, toggleSort, clearSort } = useSortedRows(rows, columns);

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget && !justDragged.current && !justResized.current) {
      onClose();
    }
  }

  return (
    <div className="fixed inset-0" style={{ zIndex: 60 }}>
      <div
        className="fixed inset-0 bg-black/30 flex items-center justify-center"
        onClick={handleBackdropClick}
      >
        <div
          className="relative rounded-lg shadow-xl flex flex-col"
          style={{
            backgroundColor: "var(--color-surface)",
            ...(pos ? { position: "fixed", left: pos.x, top: pos.y } : {}),
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
            <h3 className="text-sm font-semibold">
              Query {index + 1} Results — {totalRows.toLocaleString()} rows
            </h3>
            <div className="flex items-center gap-2">
              {sortKeys.length > 0 && (
                <button
                  onClick={clearSort}
                  className="text-xs px-2 py-0.5 rounded hover:opacity-70 transition-opacity"
                  style={{ color: "var(--color-accent)" }}
                >
                  Clear Sort
                </button>
              )}
              <button
                onClick={() => downloadCsv(columns, sortedRows, `query_${index + 1}.csv`)}
                className="text-xs px-2 py-0.5 rounded hover:opacity-70 transition-opacity"
                style={{ color: "var(--color-accent)" }}
              >
                Download CSV
              </button>
              <button
                onClick={onClose}
                aria-label="Close results"
                className="p-1 rounded hover:opacity-70 text-lg"
              >
                &#x2715;
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto px-4 py-3">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  {columns.map((col, i) => {
                    const keyIdx = sortKeys.findIndex((k) => k.colIdx === i);
                    return (
                      <th
                        key={i}
                        onClick={() => toggleSort(i)}
                        className="text-left px-2 py-1 font-medium border-b whitespace-nowrap sticky top-0 cursor-pointer select-none hover:opacity-70"
                        style={{
                          borderColor: "var(--color-border)",
                          backgroundColor: "var(--color-bg)",
                        }}
                      >
                        {col}
                        {keyIdx >= 0 && (
                          <SortIndicator dir={sortKeys[keyIdx].dir} rank={keyIdx + 1} />
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row, rowIdx) => (
                  <tr key={rowIdx}>
                    {columns.map((_col, colIdx) => (
                      <td
                        key={colIdx}
                        className="px-2 py-1 border-b whitespace-nowrap"
                        style={{ borderColor: "var(--color-border)" }}
                      >
                        {cellValue(row, colIdx, columns)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          {isTruncated && (
            <div
              className="px-4 py-2 text-xs opacity-60 border-t"
              style={{ borderColor: "var(--color-border)" }}
            >
              Showing {rows.length} of {totalRows.toLocaleString()} total rows
            </div>
          )}

          {/* Resize handle */}
          <ResizeHandle onMouseDown={onResizeMouseDown} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SQLModal — main modal showing all SQL executions
// ---------------------------------------------------------------------------

export function SQLModal() {
  const sqlModalOpen = useUiStore((s) => s.sqlModalOpen);
  const executions = useUiStore((s) => s.activeSqlExecutions);
  const sqlResultModalIndex = useUiStore((s) => s.sqlResultModalIndex);
  const closeSqlModal = useUiStore((s) => s.closeSqlModal);
  const openSqlResultModal = useUiStore((s) => s.openSqlResultModal);
  const closeSqlResultModal = useUiStore((s) => s.closeSqlResultModal);

  const { pos, setPos, onMouseDown, justDragged } = useDraggable();
  const { size, onResizeMouseDown, justResized } = useResizable(400, 200, setPos);

  // Local state for error modal
  const [errorModalIndex, setErrorModalIndex] = useState<number | null>(null);

  // Measure the chat area to use as initial width
  const [chatAreaWidth, setChatAreaWidth] = useState<number | null>(null);
  useEffect(() => {
    if (!sqlModalOpen) return;
    const el = document.querySelector('[data-testid="chat-area"]');
    if (el) {
      setChatAreaWidth(el.getBoundingClientRect().width);
    }
  }, [sqlModalOpen]);

  // Reset error modal when SQL modal closes
  useEffect(() => {
    if (!sqlModalOpen) {
      setErrorModalIndex(null);
    }
  }, [sqlModalOpen]);

  // Escape key: close innermost modal first (error → result → sql)
  useEffect(() => {
    if (!sqlModalOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (errorModalIndex != null) {
          setErrorModalIndex(null);
        } else {
          const state = useUiStore.getState();
          if (state.sqlResultModalIndex != null) {
            closeSqlResultModal();
          } else {
            closeSqlModal();
          }
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [sqlModalOpen, errorModalIndex, closeSqlModal, closeSqlResultModal]);

  if (!sqlModalOpen || executions.length === 0) {
    return null;
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget && !justDragged.current && !justResized.current) {
      closeSqlModal();
    }
  }

  const resultExecution =
    sqlResultModalIndex != null ? executions[sqlResultModalIndex] : null;

  // Initial width: match chat area, fallback to 56rem (max-w-4xl)
  const initialWidth = chatAreaWidth ? Math.min(chatAreaWidth, window.innerWidth * 0.95) : undefined;

  return (
    <>
      <div data-testid="sql-modal" className="fixed inset-0 z-50">
        <div
          data-testid="sql-modal-backdrop"
          className="fixed inset-0 bg-black/30 flex items-center justify-center"
          onClick={handleBackdropClick}
        >
          <div
            className="relative rounded-lg shadow-xl flex flex-col"
            style={{
              backgroundColor: "var(--color-surface)",
              ...(pos ? { position: "fixed", left: pos.x, top: pos.y } : {}),
              width: size ? size.w : (initialWidth ?? "56rem"),
              height: size ? size.h : "85vh",
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
              <h2 className="text-base font-semibold">
                SQL Queries ({executions.length})
              </h2>
              <button
                onClick={closeSqlModal}
                aria-label="Close SQL modal"
                className="p-1 rounded hover:opacity-70 text-lg"
              >
                &#x2715;
              </button>
            </div>

            {/* Query list */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {executions.map((ex, i) => (
                <SQLQueryBlock
                  key={i}
                  execution={ex}
                  index={i}
                  onViewOutput={openSqlResultModal}
                  onShowError={setErrorModalIndex}
                />
              ))}
            </div>

            {/* Resize handle */}
            <ResizeHandle onMouseDown={onResizeMouseDown} />
          </div>
        </div>
      </div>

      {/* Nested result modal */}
      {resultExecution != null && sqlResultModalIndex != null && (
        <SQLResultModal
          execution={resultExecution}
          index={sqlResultModalIndex}
          onClose={closeSqlResultModal}
          initialWidth={initialWidth}
        />
      )}

      {/* Error modal */}
      {errorModalIndex != null && executions[errorModalIndex]?.error && (
        <SQLErrorModal
          error={executions[errorModalIndex].error!}
          queryIndex={errorModalIndex}
          onClose={() => setErrorModalIndex(null)}
        />
      )}
    </>
  );
}
