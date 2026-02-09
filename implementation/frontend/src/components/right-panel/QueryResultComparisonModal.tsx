// Query Result Comparison Modal
//
// Shows two SQL query results side-by-side with diff highlighting.
// Sources: current RunSqlPanel result, saved queries (with result_data), query history (labels only).
// Opens when queryResultComparisonOpen is true in uiStore.
// Closes via X button, Escape key, or backdrop click.

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useUiStore } from "@/stores/uiStore";
import { useSavedQueryStore } from "@/stores/savedQueryStore";
import { useQueryHistoryStore } from "@/stores/queryHistoryStore";
import { useFocusTrap } from "@/hooks/useFocusTrap";

interface ComparisonResult {
  query: string;
  columns: string[];
  rows: unknown[][];
  total_rows: number;
}

/** Maximum number of rows to display in each side's table. */
const MAX_DISPLAY_ROWS = 20;

function formatNumber(n: number): string {
  return new Intl.NumberFormat().format(n);
}

/** Truncate a SQL query string for display. */
function truncateSql(sql: string, maxLen = 120): string {
  const oneLine = sql.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxLen) return oneLine;
  return oneLine.slice(0, maxLen) + "...";
}

export function QueryResultComparisonModal() {
  const isOpen = useUiStore((s) => s.queryResultComparisonOpen);
  const currentResult = useUiStore((s) => s.comparisonCurrentResult);
  const closeModal = useUiStore((s) => s.closeQueryResultComparison);

  const savedQueries = useSavedQueryStore((s) => s.queries);
  const historyQueries = useQueryHistoryStore((s) => s.queries);

  // Source selection: "current", "saved:<id>", "history:<index>"
  const [leftSource, setLeftSource] = useState<string>("current");
  const [rightSource, setRightSource] = useState<string>("");

  const modalRef = useRef<HTMLDivElement>(null);

  useFocusTrap(modalRef, isOpen);

  // Reset selections when modal opens
  useEffect(() => {
    if (isOpen) {
      setLeftSource("current");
      // Default right side to first saved query with data, or empty
      const firstSavedWithData = savedQueries.find((q) => q.result_data);
      if (firstSavedWithData) {
        setRightSource(`saved:${firstSavedWithData.id}`);
      } else {
        setRightSource("");
      }
    }
  }, [isOpen, savedQueries]);

  // Close on Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeModal();
      }
    },
    [closeModal]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  // Build list of saved queries that have result data
  const savedWithData = useMemo(
    () => savedQueries.filter((q) => q.result_data),
    [savedQueries]
  );

  // Resolve a source key to a ComparisonResult
  const resolveSource = useCallback(
    (source: string): ComparisonResult | null => {
      if (source === "current" && currentResult) {
        return currentResult;
      }
      if (source.startsWith("saved:")) {
        const id = source.slice(6);
        const sq = savedQueries.find((q) => q.id === id);
        if (sq?.result_data) {
          return {
            query: sq.query,
            columns: sq.result_data.columns,
            rows: sq.result_data.rows,
            total_rows: sq.result_data.total_rows,
          };
        }
      }
      // History entries don't have result data
      return null;
    },
    [currentResult, savedQueries]
  );

  const leftResult = useMemo(() => resolveSource(leftSource), [leftSource, resolveSource]);
  const rightResult = useMemo(() => resolveSource(rightSource), [rightSource, resolveSource]);

  // Compute comparison summary
  const summary = useMemo(() => {
    if (!leftResult || !rightResult) return null;

    const leftCols = new Set(leftResult.columns);
    const rightCols = new Set(rightResult.columns);

    const matching = leftResult.columns.filter((c) => rightCols.has(c));
    const uniqueLeft = leftResult.columns.filter((c) => !rightCols.has(c));
    const uniqueRight = rightResult.columns.filter((c) => !leftCols.has(c));
    const rowDiff = leftResult.total_rows - rightResult.total_rows;

    return { matching, uniqueLeft, uniqueRight, rowDiff };
  }, [leftResult, rightResult]);

  // Build a set of matching column names for diff highlighting
  const matchingColSet = useMemo(() => {
    if (!summary) return new Set<string>();
    return new Set(summary.matching);
  }, [summary]);

  if (!isOpen) {
    return null;
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) {
      closeModal();
    }
  }

  /** Render dropdown options for source selection. */
  function renderSourceOptions() {
    return (
      <>
        {currentResult && <option value="current">Current Result</option>}
        {savedWithData.length > 0 && (
          <optgroup label="Saved Queries">
            {savedWithData.map((sq) => (
              <option key={sq.id} value={`saved:${sq.id}`}>
                {sq.name}
              </option>
            ))}
          </optgroup>
        )}
        {historyQueries.length > 0 && (
          <optgroup label="Query History (no data)">
            {historyQueries.map((hq, i) => (
              <option key={hq.id ?? i} value={`history:${i}`} disabled>
                {truncateSql(hq.query, 60)}
              </option>
            ))}
          </optgroup>
        )}
      </>
    );
  }

  /** Render a mini data table for a given result. */
  function renderResultTable(result: ComparisonResult, side: "left" | "right") {
    const displayRows = result.rows.slice(0, MAX_DISPLAY_ROWS);
    const otherResult = side === "left" ? rightResult : leftResult;
    const otherCols = otherResult ? new Set(otherResult.columns) : new Set<string>();

    // Build a map of matching column values for diff highlighting
    // For each matching column, map col index in this result -> col index in other result
    const colMapping: Map<number, number> = new Map();
    if (otherResult) {
      for (let i = 0; i < result.columns.length; i++) {
        const colName = result.columns[i];
        if (matchingColSet.has(colName)) {
          const otherIdx = otherResult.columns.indexOf(colName);
          if (otherIdx !== -1) {
            colMapping.set(i, otherIdx);
          }
        }
      }
    }

    return (
      <div
        className="overflow-auto rounded border"
        style={{ maxHeight: "16rem", borderColor: "var(--color-border)" }}
        data-testid={`comparison-result-table-${side}`}
      >
        <table
          className="w-full text-[10px]"
          style={{ color: "var(--color-text)" }}
        >
          <thead>
            <tr
              className="sticky top-0"
              style={{ backgroundColor: "var(--color-bg)" }}
            >
              {result.columns.map((col, i) => {
                const isUnique = !otherCols.has(col);
                return (
                  <th
                    key={i}
                    className="px-1.5 py-1 text-left font-medium whitespace-nowrap border-b"
                    style={{
                      borderColor: "var(--color-border)",
                      backgroundColor: isUnique
                        ? "rgba(234, 179, 8, 0.1)"
                        : undefined,
                    }}
                  >
                    {col}
                    {isUnique && (
                      <span
                        className="ml-1 text-[8px]"
                        style={{ color: "var(--color-text-muted)" }}
                        title="Unique to this side"
                      >
                        *
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, ri) => (
              <tr
                key={ri}
                className="hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
              >
                {row.map((cell, ci) => {
                  // Check if cell value differs from the other side
                  let isDiff = false;
                  if (otherResult && colMapping.has(ci)) {
                    const otherColIdx = colMapping.get(ci)!;
                    const otherRow = otherResult.rows[ri];
                    if (otherRow !== undefined) {
                      const otherVal = otherRow[otherColIdx];
                      isDiff = String(cell ?? "") !== String(otherVal ?? "");
                    } else {
                      // Row exists only on this side
                      isDiff = true;
                    }
                  }

                  return (
                    <td
                      key={ci}
                      className="px-1.5 py-0.5 whitespace-nowrap border-b"
                      style={{
                        borderColor: "var(--color-border)",
                        backgroundColor: isDiff
                          ? "rgba(239, 68, 68, 0.08)"
                          : undefined,
                      }}
                      data-diff={isDiff ? "true" : undefined}
                    >
                      {cell == null ? (
                        <span className="opacity-30 italic">null</span>
                      ) : (
                        String(cell)
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {result.rows.length > MAX_DISPLAY_ROWS && (
          <div
            className="text-center text-[10px] py-1"
            style={{ color: "var(--color-text-muted)" }}
          >
            Showing {MAX_DISPLAY_ROWS} of {formatNumber(result.rows.length)} rows
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid="query-result-comparison-modal"
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="query-result-comparison-modal-title"
    >
      {/* Backdrop */}
      <div
        data-testid="query-result-comparison-backdrop"
        className="fixed inset-0 bg-black/50 flex items-center justify-center modal-backdrop-enter"
        onClick={handleBackdropClick}
      >
        {/* Modal content */}
        <div
          ref={modalRef}
          data-testid="query-result-comparison-content"
          className="rounded-lg shadow-xl p-6 w-full max-w-[900px] max-h-[80vh] overflow-y-auto modal-scale-enter"
          style={{ backgroundColor: "var(--color-surface)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h2
              id="query-result-comparison-modal-title"
              className="text-lg font-semibold"
              style={{ color: "var(--color-text)" }}
            >
              Compare Query Results
            </h2>
            <button
              data-testid="query-result-comparison-close"
              onClick={closeModal}
              aria-label="Close"
              title="Close"
              className="p-1 rounded hover:opacity-70 active:scale-90 transition-all duration-150"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>

          {/* Side-by-side comparison */}
          <div className="grid grid-cols-2 gap-4">
            {/* Left side */}
            <div>
              <label
                className="block text-[10px] font-medium mb-1"
                style={{ color: "var(--color-text-muted)" }}
              >
                Left Source
              </label>
              <select
                data-testid="query-result-comparison-left-select"
                value={leftSource}
                onChange={(e) => setLeftSource(e.target.value)}
                className="w-full rounded border px-2 py-1 text-sm mb-2"
                style={{
                  backgroundColor: "var(--color-surface)",
                  borderColor: "var(--color-border)",
                  color: "var(--color-text)",
                }}
              >
                <option value="" disabled>
                  Select a source...
                </option>
                {renderSourceOptions()}
              </select>

              {leftResult && (
                <>
                  <div
                    className="text-[10px] mb-1 font-mono rounded px-2 py-1 overflow-hidden"
                    style={{
                      backgroundColor: "var(--color-bg)",
                      color: "var(--color-text-muted)",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                    }}
                    title={leftResult.query}
                    data-testid="query-result-comparison-left-sql"
                  >
                    {truncateSql(leftResult.query, 80)}
                  </div>
                  <div
                    className="text-xs mb-2"
                    style={{ color: "var(--color-text-muted)" }}
                    data-testid="query-result-comparison-left-stats"
                  >
                    {formatNumber(leftResult.total_rows)} rows, {leftResult.columns.length} columns
                  </div>
                  {renderResultTable(leftResult, "left")}
                </>
              )}

              {!leftResult && leftSource && (
                <div
                  className="text-xs py-4 text-center"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  No result data available for this source.
                </div>
              )}
            </div>

            {/* Right side */}
            <div>
              <label
                className="block text-[10px] font-medium mb-1"
                style={{ color: "var(--color-text-muted)" }}
              >
                Right Source
              </label>
              <select
                data-testid="query-result-comparison-right-select"
                value={rightSource}
                onChange={(e) => setRightSource(e.target.value)}
                className="w-full rounded border px-2 py-1 text-sm mb-2"
                style={{
                  backgroundColor: "var(--color-surface)",
                  borderColor: "var(--color-border)",
                  color: "var(--color-text)",
                }}
              >
                <option value="" disabled>
                  Select a source...
                </option>
                {renderSourceOptions()}
              </select>

              {rightResult && (
                <>
                  <div
                    className="text-[10px] mb-1 font-mono rounded px-2 py-1 overflow-hidden"
                    style={{
                      backgroundColor: "var(--color-bg)",
                      color: "var(--color-text-muted)",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                    }}
                    title={rightResult.query}
                    data-testid="query-result-comparison-right-sql"
                  >
                    {truncateSql(rightResult.query, 80)}
                  </div>
                  <div
                    className="text-xs mb-2"
                    style={{ color: "var(--color-text-muted)" }}
                    data-testid="query-result-comparison-right-stats"
                  >
                    {formatNumber(rightResult.total_rows)} rows, {rightResult.columns.length} columns
                  </div>
                  {renderResultTable(rightResult, "right")}
                </>
              )}

              {!rightResult && rightSource && (
                <div
                  className="text-xs py-4 text-center"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  No result data available for this source.
                </div>
              )}
            </div>
          </div>

          {/* Comparison summary */}
          {summary && (
            <div
              className="mt-4 rounded border p-3"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg)",
              }}
              data-testid="query-result-comparison-summary"
            >
              <div
                className="text-xs font-medium mb-2"
                style={{ color: "var(--color-text)" }}
              >
                Comparison Summary
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div
                    className="text-lg font-semibold"
                    style={{ color: "var(--color-accent)" }}
                    data-testid="summary-matching-count"
                  >
                    {summary.matching.length}
                  </div>
                  <div
                    className="text-[10px]"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Matching columns
                  </div>
                </div>
                <div>
                  <div
                    className="text-lg font-semibold"
                    style={{ color: "var(--color-text)" }}
                    data-testid="summary-unique-left-count"
                  >
                    {summary.uniqueLeft.length}
                  </div>
                  <div
                    className="text-[10px]"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Unique to left
                  </div>
                </div>
                <div>
                  <div
                    className="text-lg font-semibold"
                    style={{ color: "var(--color-text)" }}
                    data-testid="summary-unique-right-count"
                  >
                    {summary.uniqueRight.length}
                  </div>
                  <div
                    className="text-[10px]"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Unique to right
                  </div>
                </div>
              </div>
              {summary.rowDiff !== 0 && (
                <div
                  className="mt-2 text-xs text-center"
                  style={{ color: "var(--color-text-muted)" }}
                  data-testid="summary-row-diff"
                >
                  Row count difference: {summary.rowDiff > 0 ? "+" : ""}
                  {formatNumber(summary.rowDiff)} ({formatNumber(leftResult!.total_rows)} vs{" "}
                  {formatNumber(rightResult!.total_rows)})
                </div>
              )}
              {summary.matching.length > 0 && (
                <div
                  className="mt-2 text-[10px] text-center"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  Matching: {summary.matching.join(", ")}
                </div>
              )}
              {summary.uniqueLeft.length > 0 && (
                <div
                  className="mt-1 text-[10px] text-center"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  Unique to left: {summary.uniqueLeft.join(", ")}
                </div>
              )}
              {summary.uniqueRight.length > 0 && (
                <div
                  className="mt-1 text-[10px] text-center"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  Unique to right: {summary.uniqueRight.join(", ")}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
