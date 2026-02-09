// Implements: spec/frontend/chat_area/sql_panel/plan.md
//
// SQL Modal: displays SQL executions in a centered modal dialog.
// Each query is shown with syntax highlighting (CodeMirror) and an optional
// "View Output" button that opens a nested result modal.
// Both modals are draggable (via header) and resizable (via corner handle).
// Result modal supports sortable columns and CSV download.

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useUiStore } from "@/stores/uiStore";
import { useCodeMirror } from "@/hooks/useCodeMirror";
import { useSavedQueryStore } from "@/stores/savedQueryStore";
import { useDraggable } from "@/hooks/useDraggable";
import { useResizable } from "@/hooks/useResizable";
import { useSortedRows } from "@/hooks/useSortedRows";
import { cellValue } from "@/utils/tableUtils";
import { downloadCsv, exportCsv } from "@/utils/csvExport";
import { downloadExcel } from "@/utils/excelExport";
import { downloadJson } from "@/utils/jsonExport";
import { detectChartTypes } from "@/utils/chartDetection";
import { ChartVisualization } from "./ChartVisualization";
import { explainSql } from "@/api/client";
import { useChatStore } from "@/stores/chatStore";
import { useDatasetStore } from "@/stores/datasetStore";
import type { SqlExecution } from "@/stores/chatStore";

// ---------------------------------------------------------------------------
// ResizeHandle — corner grip widget
// ---------------------------------------------------------------------------

function ResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize hover:opacity-70 transition-opacity duration-150"
      style={{ zIndex: 10 }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" className="opacity-30">
        <circle cx="8" cy="12" r="1.2" fill="currentColor" />
        <circle cx="12" cy="12" r="1.2" fill="currentColor" />
        <circle cx="12" cy="8" r="1.2" fill="currentColor" />
        <circle cx="4" cy="12" r="1.2" fill="currentColor" />
        <circle cx="8" cy="8" r="1.2" fill="currentColor" />
        <circle cx="12" cy="4" r="1.2" fill="currentColor" />
      </svg>
    </div>
  );
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
// SQLQueryBlock — one card per SQL execution
// ---------------------------------------------------------------------------

function SQLQueryBlock({
  execution,
  index,
  onViewOutput,
  onViewChart,
  onShowError,
}: {
  execution: SqlExecution;
  index: number;
  onViewOutput: (index: number) => void;
  onViewChart: (index: number) => void;
  onShowError: (index: number) => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const isDark = document.documentElement.classList.contains("dark");

  const conversationId = useChatStore((s) => s.activeConversationId);
  const datasets = useDatasetStore((s) => s.datasets);

  useCodeMirror(editorRef, execution.query, isDark);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(execution.query);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [execution.query]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      // Generate a default name from the first ~50 chars of the query
      const defaultName = execution.query.replace(/\s+/g, ' ').trim().slice(0, 50);
      // Include result data if available (columns, rows, total_rows)
      const resultData =
        execution.columns && execution.rows
          ? {
              columns: execution.columns,
              rows: execution.rows,
              total_rows: execution.total_rows ?? execution.rows.length,
            }
          : undefined;
      await useSavedQueryStore.getState().saveQuery(defaultName, execution.query, resultData, execution.execution_time_ms);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  }, [execution.query, execution.columns, execution.rows, execution.total_rows, execution.execution_time_ms]);

  const handleExplain = useCallback(async () => {
    if (!conversationId || explaining) return;
    setExplaining(true);
    try {
      // Build schema context from loaded datasets
      const schemaJson = JSON.stringify(
        Object.fromEntries(
          Array.from(datasets.values()).map(ds => [
            ds.name,
            ds.schema?.map(c => ({ name: c.name, type: c.type })) ?? []
          ])
        )
      );
      const result = await explainSql(conversationId, execution.query, schemaJson);
      setExplanation(result.explanation);
    } catch {
      setExplanation("Failed to generate explanation.");
    } finally {
      setExplaining(false);
    }
  }, [conversationId, execution.query, explaining, datasets]);

  const hasOutput = execution.columns != null && execution.columns.length > 0;
  const hasChartData = useMemo(
    () => hasOutput && detectChartTypes(execution.columns ?? [], execution.rows ?? []).length > 0,
    [hasOutput, execution.columns, execution.rows],
  );

  // Format execution time for display
  const formatExecutionTime = (ms: number | null | undefined): string => {
    if (ms == null) return "";
    if (ms < 1) return `${ms.toFixed(2)}ms`;
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

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
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium opacity-70">Query {index + 1}</span>
          {execution.execution_time_ms != null && (
            <span className="text-xs opacity-50">
              ({formatExecutionTime(execution.execution_time_ms)})
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleExplain}
            disabled={explaining || !conversationId}
            data-testid={`explain-sql-btn-${index}`}
            className="text-xs px-2 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {explaining ? "Explaining..." : explanation ? "Re-explain" : "Explain"}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || saved}
            data-testid={`save-query-btn-${index}`}
            className="text-xs px-2 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {saved ? "Saved!" : saving ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="text-xs px-2 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      {/* CodeMirror editor */}
      <div ref={editorRef} className="max-h-[200px] overflow-y-auto" />

      {/* SQL explanation */}
      {explanation && (
        <div
          data-testid={`sql-explanation-${index}`}
          className="px-3 py-2 text-xs border-t"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "color-mix(in srgb, var(--color-accent) 5%, var(--color-bg))",
            color: "var(--color-text)",
          }}
        >
          <div className="flex items-center gap-1.5 mb-1 opacity-60 font-medium">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Explanation
          </div>
          <p className="leading-relaxed">{explanation}</p>
        </div>
      )}

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
          {hasChartData && (
            <button
              type="button"
              onClick={() => onViewChart(index)}
              className="text-xs px-2 py-1 rounded border hover:opacity-80 transition-opacity"
              style={{
                borderColor: "#34d399",
                color: "#34d399",
              }}
              data-testid={`visualize-btn-${index}`}
            >
              Visualize
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
    <div className="fixed inset-0" style={{ zIndex: 70 }} role="dialog" aria-modal="true" aria-labelledby={`sql-error-title-${queryIndex}`}>
      <div
        className="fixed inset-0 bg-black/30 flex items-center justify-center modal-backdrop-enter"
        onClick={handleBackdropClick}
      >
        <div
          className="relative rounded-lg shadow-xl flex flex-col modal-scale-enter"
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
            <h3 id={`sql-error-title-${queryIndex}`} className="text-sm font-semibold" style={{ color: "var(--color-error)" }}>
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
  initialViewMode = "table",
}: {
  execution: SqlExecution;
  index: number;
  onClose: () => void;
  initialWidth?: number;
  initialViewMode?: "table" | "chart";
}) {
  const columns = execution.columns ?? [];
  const rows = execution.rows ?? [];
  const totalRows = execution.total_rows ?? rows.length;
  const isTruncated = totalRows > rows.length;

  const [viewMode, setViewMode] = useState<"table" | "chart">(initialViewMode);
  const hasCharts = useMemo(
    () => detectChartTypes(columns, rows).length > 0,
    [columns, rows],
  );

  const { pos, setPos, onMouseDown, justDragged } = useDraggable();
  const { size, onResizeMouseDown, justResized } = useResizable(400, 200, setPos);
  const { sortKeys, sortedRows, toggleSort, clearSort } = useSortedRows(rows, columns);

  // Virtualization
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: sortedRows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 28, // Estimated row height in pixels
    overscan: 10, // Render 10 extra rows above/below viewport
  });

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget && !justDragged.current && !justResized.current) {
      onClose();
    }
  }

  return (
    <div className="fixed inset-0" style={{ zIndex: 60 }} role="dialog" aria-modal="true" aria-labelledby={`sql-result-title-${index}`}>
      <div
        className="fixed inset-0 bg-black/30 flex items-center justify-center modal-backdrop-enter"
        onClick={handleBackdropClick}
      >
        <div
          className="relative rounded-lg shadow-xl flex flex-col modal-scale-enter"
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
            <div className="flex items-center gap-3">
              <h3 id={`sql-result-title-${index}`} className="text-sm font-semibold">
                Query {index + 1} Results — {totalRows.toLocaleString()} rows
              </h3>
              {/* Table / Chart toggle */}
              {hasCharts && (
                <div
                  className="flex rounded-md border overflow-hidden"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <button
                    type="button"
                    onClick={() => setViewMode("table")}
                    className="text-xs px-2.5 py-1 transition-colors"
                    style={{
                      backgroundColor: viewMode === "table" ? "var(--color-accent)" : "transparent",
                      color: viewMode === "table" ? "#fff" : "var(--color-text-secondary)",
                    }}
                    data-testid="view-table-btn"
                  >
                    Table
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("chart")}
                    className="text-xs px-2.5 py-1 transition-colors"
                    style={{
                      backgroundColor: viewMode === "chart" ? "var(--color-accent)" : "transparent",
                      color: viewMode === "chart" ? "#fff" : "var(--color-text-secondary)",
                    }}
                    data-testid="view-chart-btn"
                  >
                    Chart
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {viewMode === "table" && sortKeys.length > 0 && (
                <button
                  onClick={clearSort}
                  className="text-xs px-2 py-0.5 rounded hover:opacity-70 transition-opacity"
                  style={{ color: "var(--color-accent)" }}
                >
                  Clear Sort
                </button>
              )}
              {viewMode === "table" && (
                <button
                  onClick={() => downloadCsv(columns, sortedRows, `query_${index + 1}.csv`)}
                  className="text-xs px-2 py-0.5 rounded hover:opacity-70 transition-opacity"
                  style={{ color: "var(--color-accent)" }}
                >
                  Download CSV
                </button>
              )}
              {viewMode === "table" && (
                <button
                  onClick={() => exportCsv(columns, sortedRows, `query_${index + 1}`)}
                  className="text-xs px-2 py-0.5 rounded hover:opacity-70 transition-opacity"
                  style={{ color: "var(--color-accent)" }}
                  data-testid="export-csv-btn"
                >
                  Export CSV
                </button>
              )}
              {viewMode === "table" && (
                <button
                  onClick={() => downloadExcel(columns, sortedRows, `query_${index + 1}`)}
                  className="text-xs px-2 py-0.5 rounded hover:opacity-70 transition-opacity"
                  style={{ color: "var(--color-accent)" }}
                  data-testid="export-xlsx-btn"
                >
                  Export XLSX
                </button>
              )}
              {viewMode === "table" && (
                <button
                  onClick={() => downloadJson(columns, sortedRows, `query_${index + 1}.json`)}
                  className="text-xs px-2 py-0.5 rounded hover:opacity-70 transition-opacity"
                  style={{ color: "var(--color-accent)" }}
                  data-testid="download-json-btn"
                >
                  Download JSON
                </button>
              )}
              <button
                onClick={onClose}
                aria-label="Close results"
                className="p-1 rounded hover:opacity-70 text-lg"
              >
                &#x2715;
              </button>
            </div>
          </div>

          {/* Chart view */}
          {viewMode === "chart" && hasCharts && (
            <div className="flex-1 min-h-0">
              <ChartVisualization columns={columns} rows={rows} />
            </div>
          )}

          {/* Table view with virtualization */}
          {viewMode === "table" && (
          <div ref={tableContainerRef} className="flex-1 overflow-auto px-4 py-3">
            {/* Header - sticky at top */}
            <div className="sticky top-0 z-10" style={{ backgroundColor: "var(--color-bg)" }}>
              <div className="flex border-b" style={{ borderColor: "var(--color-border)" }}>
                {columns.map((col, i) => {
                  const keyIdx = sortKeys.findIndex((k) => k.colIdx === i);
                  return (
                    <div
                      key={i}
                      onClick={() => toggleSort(i)}
                      className="flex-1 text-left px-2 py-1 font-medium whitespace-nowrap cursor-pointer select-none hover:opacity-70 text-xs"
                      style={{ minWidth: "100px" }}
                    >
                      {col}
                      {keyIdx >= 0 && (
                        <SortIndicator dir={sortKeys[keyIdx].dir} rank={keyIdx + 1} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Virtualized rows */}
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = sortedRows[virtualRow.index];
                return (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={rowVirtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div className="flex border-b text-xs transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]" style={{ borderColor: "var(--color-border)" }}>
                      {columns.map((_col, colIdx) => (
                        <div
                          key={colIdx}
                          className="flex-1 px-2 py-1 whitespace-nowrap"
                          style={{ minWidth: "100px" }}
                        >
                          {cellValue(row, colIdx, columns)}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          )}

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
  // Chart/table view mode from store (allows external control, e.g. Visualize button in chat)
  const resultViewMode = useUiStore((s) => s.sqlResultViewMode);

  const handleViewChart = useCallback((index: number) => {
    useUiStore.setState({ sqlResultViewMode: "chart" });
    openSqlResultModal(index);
  }, [openSqlResultModal]);

  const handleViewOutput = useCallback((index: number) => {
    useUiStore.setState({ sqlResultViewMode: "table" });
    openSqlResultModal(index);
  }, [openSqlResultModal]);

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
      <div data-testid="sql-modal" className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="sql-modal-title">
        <div
          data-testid="sql-modal-backdrop"
          className="fixed inset-0 bg-black/30 flex items-center justify-center modal-backdrop-enter"
          onClick={handleBackdropClick}
        >
          <div
            className="relative rounded-lg shadow-xl flex flex-col modal-scale-enter"
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
              <h2 id="sql-modal-title" className="text-base font-semibold">
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
                  onViewOutput={handleViewOutput}
                  onViewChart={handleViewChart}
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
          initialViewMode={resultViewMode}
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
