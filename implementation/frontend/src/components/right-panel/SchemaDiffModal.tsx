// Schema Diff Modal
//
// Side-by-side column comparison of two datasets' schemas.
// Highlights columns unique to each side and type mismatches for shared columns.
// Closes via X button, Escape key, or backdrop click.

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useUiStore } from "@/stores/uiStore";
import { useDatasetStore } from "@/stores/datasetStore";
import { useFocusTrap } from "@/hooks/useFocusTrap";

/** Map parquet type strings to user-friendly display labels. */
export function mapType(rawType: string): string {
  switch (rawType) {
    case "String":
    case "Utf8":
      return "Text";
    case "Int32":
    case "Int64":
      return "Integer";
    case "Float32":
    case "Float64":
      return "Decimal";
    case "Date":
    case "DateTime":
      return "Date";
    case "Boolean":
      return "Boolean";
    default:
      return rawType;
  }
}

export interface Column {
  name: string;
  type: string;
}

export function parseColumns(schemaJson: string): Column[] {
  try {
    const parsed = JSON.parse(schemaJson);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (parsed && Array.isArray(parsed.columns)) {
      return parsed.columns;
    }
    return [];
  } catch {
    return [];
  }
}

export type DiffStatus = "matched" | "type-mismatch" | "left-only" | "right-only";

export interface DiffRow {
  name: string;
  leftType: string | null;
  rightType: string | null;
  status: DiffStatus;
}

/** Compute a unified diff view of two column lists. */
export function computeSchemaDiff(
  leftColumns: Column[],
  rightColumns: Column[]
): DiffRow[] {
  const rightMap = new Map<string, string>();
  for (const col of rightColumns) {
    rightMap.set(col.name, col.type);
  }

  const leftNames = new Set<string>();
  const rows: DiffRow[] = [];

  // Process left columns in order
  for (const col of leftColumns) {
    leftNames.add(col.name);
    const rightType = rightMap.get(col.name);
    if (rightType === undefined) {
      rows.push({ name: col.name, leftType: col.type, rightType: null, status: "left-only" });
    } else if (col.type !== rightType) {
      rows.push({ name: col.name, leftType: col.type, rightType, status: "type-mismatch" });
    } else {
      rows.push({ name: col.name, leftType: col.type, rightType, status: "matched" });
    }
  }

  // Process right-only columns
  for (const col of rightColumns) {
    if (!leftNames.has(col.name)) {
      rows.push({ name: col.name, leftType: null, rightType: col.type, status: "right-only" });
    }
  }

  return rows;
}

export function SchemaDiffModal() {
  const schemaDiffDatasetIds = useUiStore((s) => s.schemaDiffDatasetIds);
  const closeSchemaDiffModal = useUiStore((s) => s.closeSchemaDiffModal);
  const datasets = useDatasetStore((s) => s.datasets);

  const readyDatasets = useMemo(
    () => datasets.filter((d) => d.status === "ready"),
    [datasets]
  );

  const [leftId, setLeftId] = useState<string | null>(null);
  const [rightId, setRightId] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);

  useFocusTrap(modalRef, !!schemaDiffDatasetIds);

  // Sync selected IDs when modal opens
  useEffect(() => {
    if (schemaDiffDatasetIds && schemaDiffDatasetIds.length >= 2) {
      setLeftId(schemaDiffDatasetIds[0]);
      setRightId(schemaDiffDatasetIds[1]);
    }
  }, [schemaDiffDatasetIds]);

  // Close on Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeSchemaDiffModal();
      }
    },
    [closeSchemaDiffModal]
  );

  useEffect(() => {
    if (schemaDiffDatasetIds) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [schemaDiffDatasetIds, handleKeyDown]);

  if (!schemaDiffDatasetIds) {
    return null;
  }

  const leftDataset = datasets.find((d) => d.id === leftId);
  const rightDataset = datasets.find((d) => d.id === rightId);

  const leftColumns = leftDataset ? parseColumns(leftDataset.schema_json) : [];
  const rightColumns = rightDataset ? parseColumns(rightDataset.schema_json) : [];

  const diffRows = computeSchemaDiff(leftColumns, rightColumns);

  const matchedCount = diffRows.filter((r) => r.status === "matched").length;
  const mismatchCount = diffRows.filter((r) => r.status === "type-mismatch").length;
  const leftOnlyCount = diffRows.filter((r) => r.status === "left-only").length;
  const rightOnlyCount = diffRows.filter((r) => r.status === "right-only").length;

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) {
      closeSchemaDiffModal();
    }
  }

  return (
    <div
      data-testid="schema-diff-modal"
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="schema-diff-modal-title"
    >
      {/* Backdrop */}
      <div
        data-testid="schema-diff-backdrop"
        className="fixed inset-0 bg-black/50 flex items-center justify-center modal-backdrop-enter"
        onClick={handleBackdropClick}
      >
        {/* Modal content */}
        <div
          ref={modalRef}
          data-testid="schema-diff-content"
          className="rounded-lg shadow-xl p-6 w-full max-w-[750px] max-h-[80vh] overflow-y-auto modal-scale-enter"
          style={{ backgroundColor: "var(--color-surface)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h2
              id="schema-diff-modal-title"
              className="text-lg font-semibold"
              style={{ color: "var(--color-text)" }}
            >
              Schema Diff
            </h2>
            <button
              onClick={closeSchemaDiffModal}
              data-testid="schema-diff-close"
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

          {/* Dataset selectors */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label
                className="block text-xs opacity-60 mb-1"
                style={{ color: "var(--color-text)" }}
              >
                Left Dataset
              </label>
              <select
                data-testid="schema-diff-left-select"
                value={leftId ?? ""}
                onChange={(e) => setLeftId(e.target.value)}
                className="w-full rounded border px-2 py-1 text-sm"
                style={{
                  backgroundColor: "var(--color-surface)",
                  borderColor: "var(--color-border)",
                  color: "var(--color-text)",
                }}
              >
                {readyDatasets.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                className="block text-xs opacity-60 mb-1"
                style={{ color: "var(--color-text)" }}
              >
                Right Dataset
              </label>
              <select
                data-testid="schema-diff-right-select"
                value={rightId ?? ""}
                onChange={(e) => setRightId(e.target.value)}
                className="w-full rounded border px-2 py-1 text-sm"
                style={{
                  backgroundColor: "var(--color-surface)",
                  borderColor: "var(--color-border)",
                  color: "var(--color-text)",
                }}
              >
                {readyDatasets.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Legend */}
          <div
            className="flex flex-wrap gap-3 mb-3 text-xs"
            data-testid="schema-diff-legend"
            style={{ color: "var(--color-text-muted)" }}
          >
            <span className="flex items-center gap-1">
              <span
                className="inline-block w-3 h-3 rounded-sm"
                style={{ backgroundColor: "var(--color-border)" }}
              />
              Matched
            </span>
            <span className="flex items-center gap-1">
              <span
                className="inline-block w-3 h-3 rounded-sm"
                style={{ backgroundColor: "#f59e0b" }}
              />
              Type Mismatch
            </span>
            <span className="flex items-center gap-1">
              <span
                className="inline-block w-3 h-3 rounded-sm"
                style={{ backgroundColor: "#ef4444" }}
              />
              Left Only
            </span>
            <span className="flex items-center gap-1">
              <span
                className="inline-block w-3 h-3 rounded-sm"
                style={{ backgroundColor: "#22c55e" }}
              />
              Right Only
            </span>
          </div>

          {/* Diff table */}
          {leftDataset && rightDataset && (
            <div
              className="rounded border overflow-y-auto max-h-[400px]"
              style={{ borderColor: "var(--color-border)" }}
              data-testid="schema-diff-table"
            >
              <table className="w-full text-sm">
                <thead
                  className="sticky top-0 z-10"
                  style={{ backgroundColor: "var(--color-surface)" }}
                >
                  <tr
                    className="border-b"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <th
                      className="text-left py-1.5 px-2 font-medium"
                      style={{ color: "var(--color-text)" }}
                    >
                      Column
                    </th>
                    <th
                      className="text-left py-1.5 px-2 font-medium"
                      style={{ color: "var(--color-text)" }}
                    >
                      {leftDataset.name}
                    </th>
                    <th
                      className="text-left py-1.5 px-2 font-medium"
                      style={{ color: "var(--color-text)" }}
                    >
                      {rightDataset.name}
                    </th>
                    <th
                      className="text-center py-1.5 px-2 font-medium w-10"
                      style={{ color: "var(--color-text)" }}
                    >
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {diffRows.map((row, idx) => {
                    let rowBg = "transparent";
                    let statusIcon: React.ReactNode = null;

                    switch (row.status) {
                      case "matched":
                        statusIcon = (
                          <svg
                            className="w-4 h-4"
                            style={{ color: "var(--color-success, #22c55e)" }}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-label="Matched"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        );
                        break;
                      case "type-mismatch":
                        rowBg = "rgba(245, 158, 11, 0.1)";
                        statusIcon = (
                          <svg
                            className="w-4 h-4"
                            style={{ color: "#f59e0b" }}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-label="Type mismatch"
                            data-testid={`type-mismatch-${row.name}`}
                          >
                            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                          </svg>
                        );
                        break;
                      case "left-only":
                        rowBg = "rgba(239, 68, 68, 0.08)";
                        statusIcon = (
                          <span
                            className="text-xs font-medium px-1.5 py-0.5 rounded"
                            style={{ color: "#ef4444", backgroundColor: "rgba(239, 68, 68, 0.1)" }}
                          >
                            L
                          </span>
                        );
                        break;
                      case "right-only":
                        rowBg = "rgba(34, 197, 94, 0.08)";
                        statusIcon = (
                          <span
                            className="text-xs font-medium px-1.5 py-0.5 rounded"
                            style={{ color: "#22c55e", backgroundColor: "rgba(34, 197, 94, 0.1)" }}
                          >
                            R
                          </span>
                        );
                        break;
                    }

                    return (
                      <tr
                        key={idx}
                        data-testid={`diff-row-${row.name}`}
                        data-diff-status={row.status}
                        className="border-b last:border-b-0"
                        style={{
                          borderColor: "var(--color-border)",
                          backgroundColor: rowBg,
                        }}
                      >
                        <td
                          className="py-1.5 px-2 font-medium"
                          style={{ color: "var(--color-text)" }}
                        >
                          {row.name}
                        </td>
                        <td
                          className="py-1.5 px-2"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          {row.leftType ? (
                            <span
                              className="text-xs px-1.5 py-0.5 rounded"
                              style={{
                                backgroundColor: "var(--color-bg)",
                              }}
                            >
                              {mapType(row.leftType)}
                            </span>
                          ) : (
                            <span className="opacity-30">&mdash;</span>
                          )}
                        </td>
                        <td
                          className="py-1.5 px-2"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          {row.rightType ? (
                            <span
                              className="text-xs px-1.5 py-0.5 rounded"
                              style={{
                                backgroundColor: "var(--color-bg)",
                              }}
                            >
                              {mapType(row.rightType)}
                            </span>
                          ) : (
                            <span className="opacity-30">&mdash;</span>
                          )}
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          {statusIcon}
                        </td>
                      </tr>
                    );
                  })}
                  {diffRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="py-8 text-center text-sm opacity-50"
                      >
                        No columns to compare
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Summary */}
          {leftDataset && rightDataset && diffRows.length > 0 && (
            <div
              className="mt-4 flex flex-wrap gap-3 justify-center text-xs"
              style={{ color: "var(--color-text-muted)" }}
              data-testid="schema-diff-summary"
            >
              <span data-testid="diff-matched-count">
                {matchedCount} matched
              </span>
              <span>&middot;</span>
              <span data-testid="diff-mismatch-count">
                {mismatchCount} type mismatch{mismatchCount !== 1 ? "es" : ""}
              </span>
              <span>&middot;</span>
              <span data-testid="diff-left-only-count">
                {leftOnlyCount} left only
              </span>
              <span>&middot;</span>
              <span data-testid="diff-right-only-count">
                {rightOnlyCount} right only
              </span>
            </div>
          )}

          {/* Prompt when datasets aren't both selected */}
          {(!leftDataset || !rightDataset) && (
            <div className="py-8 text-center text-sm opacity-50">
              Select two datasets to compare their schemas
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
