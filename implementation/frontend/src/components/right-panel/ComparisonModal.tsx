// Dataset Comparison Modal
//
// Shows two datasets side-by-side, highlighting shared and unique columns.
// Opens when comparisonDatasetIds is set in uiStore.
// Closes via X button, Escape key, or backdrop click.

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useUiStore } from "@/stores/uiStore";
import { useDatasetStore } from "@/stores/datasetStore";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { mapType, parseColumns } from "@/utils/schemaUtils";

function formatNumber(n: number): string {
  return new Intl.NumberFormat().format(n);
}

export function ComparisonModal() {
  const comparisonDatasetIds = useUiStore((s) => s.comparisonDatasetIds);
  const closeComparisonModal = useUiStore((s) => s.closeComparisonModal);
  const datasets = useDatasetStore((s) => s.datasets);

  const readyDatasets = useMemo(
    () => datasets.filter((d) => d.status === "ready"),
    [datasets]
  );

  // Internal selected IDs, synced when modal opens
  const [leftId, setLeftId] = useState<string | null>(null);
  const [rightId, setRightId] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);

  useFocusTrap(modalRef, !!comparisonDatasetIds);

  // Sync selected IDs when modal opens
  useEffect(() => {
    if (comparisonDatasetIds && comparisonDatasetIds.length >= 2) {
      setLeftId(comparisonDatasetIds[0]);
      setRightId(comparisonDatasetIds[1]);
    }
  }, [comparisonDatasetIds]);

  // Close on Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeComparisonModal();
      }
    },
    [closeComparisonModal]
  );

  useEffect(() => {
    if (comparisonDatasetIds) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [comparisonDatasetIds, handleKeyDown]);

  if (!comparisonDatasetIds) {
    return null;
  }

  const leftDataset = datasets.find((d) => d.id === leftId);
  const rightDataset = datasets.find((d) => d.id === rightId);

  const leftColumns = leftDataset ? parseColumns(leftDataset.schema_json) : [];
  const rightColumns = rightDataset ? parseColumns(rightDataset.schema_json) : [];

  const leftNames = new Set(leftColumns.map((c) => c.name));
  const rightNames = new Set(rightColumns.map((c) => c.name));

  const sharedCount = leftColumns.filter((c) => rightNames.has(c.name)).length;
  const uniqueLeftCount = leftColumns.filter((c) => !rightNames.has(c.name)).length;
  const uniqueRightCount = rightColumns.filter((c) => !leftNames.has(c.name)).length;

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) {
      closeComparisonModal();
    }
  }

  return (
    <div
      data-testid="comparison-modal"
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="comparison-modal-title"
    >
      {/* Backdrop */}
      <div
        data-testid="comparison-modal-backdrop"
        className="fixed inset-0 bg-black/50 flex items-center justify-center modal-backdrop-enter"
        onClick={handleBackdropClick}
      >
        {/* Modal content */}
        <div
          ref={modalRef}
          data-testid="comparison-modal-content"
          className="rounded-lg shadow-xl p-6 w-full max-w-[700px] max-h-[80vh] overflow-y-auto modal-scale-enter"
          style={{ backgroundColor: "var(--color-surface)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h2
              id="comparison-modal-title"
              className="text-lg font-semibold"
              style={{ color: "var(--color-text)" }}
            >
              Compare Datasets
            </h2>
            <button
              onClick={closeComparisonModal}
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

          {/* Side-by-side columns */}
          <div className="grid grid-cols-2 gap-4">
            {/* Left dataset */}
            <div>
              <select
                data-testid="comparison-left-select"
                value={leftId ?? ""}
                onChange={(e) => setLeftId(e.target.value)}
                className="w-full rounded border px-2 py-1 text-sm mb-2"
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
              {leftDataset && (
                <>
                  <div
                    className="text-xs mb-2"
                    style={{ color: "var(--color-text-muted)" }}
                    data-testid="comparison-left-dimensions"
                  >
                    {formatNumber(leftDataset.row_count)} rows x{" "}
                    {formatNumber(leftDataset.column_count)} cols
                  </div>
                  <div
                    className="rounded border overflow-y-auto max-h-[300px]"
                    style={{ borderColor: "var(--color-border)" }}
                    data-testid="comparison-left-columns"
                  >
                    {leftColumns.map((col, idx) => {
                      const isShared = rightNames.has(col.name);
                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-between px-2 py-1 text-sm border-b last:border-b-0"
                          style={{
                            borderColor: "var(--color-border)",
                            borderLeft: isShared
                              ? "none"
                              : "3px solid var(--color-accent)",
                            paddingLeft: isShared ? "0.5rem" : "calc(0.5rem - 3px)",
                          }}
                          data-comparison={isShared ? "shared" : "unique-left"}
                        >
                          <span style={{ color: "var(--color-text)" }}>
                            {col.name}
                          </span>
                          <span
                            className="text-xs px-1.5 py-0.5 rounded"
                            style={{
                              backgroundColor: "var(--color-bg)",
                              color: "var(--color-text-muted)",
                            }}
                          >
                            {mapType(col.type)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Right dataset */}
            <div>
              <select
                data-testid="comparison-right-select"
                value={rightId ?? ""}
                onChange={(e) => setRightId(e.target.value)}
                className="w-full rounded border px-2 py-1 text-sm mb-2"
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
              {rightDataset && (
                <>
                  <div
                    className="text-xs mb-2"
                    style={{ color: "var(--color-text-muted)" }}
                    data-testid="comparison-right-dimensions"
                  >
                    {formatNumber(rightDataset.row_count)} rows x{" "}
                    {formatNumber(rightDataset.column_count)} cols
                  </div>
                  <div
                    className="rounded border overflow-y-auto max-h-[300px]"
                    style={{ borderColor: "var(--color-border)" }}
                    data-testid="comparison-right-columns"
                  >
                    {rightColumns.map((col, idx) => {
                      const isShared = leftNames.has(col.name);
                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-between px-2 py-1 text-sm border-b last:border-b-0"
                          style={{
                            borderColor: "var(--color-border)",
                            borderLeft: isShared
                              ? "none"
                              : "3px solid #22c55e",
                            paddingLeft: isShared ? "0.5rem" : "calc(0.5rem - 3px)",
                          }}
                          data-comparison={isShared ? "shared" : "unique-right"}
                        >
                          <span style={{ color: "var(--color-text)" }}>
                            {col.name}
                          </span>
                          <span
                            className="text-xs px-1.5 py-0.5 rounded"
                            style={{
                              backgroundColor: "var(--color-bg)",
                              color: "var(--color-text-muted)",
                            }}
                          >
                            {mapType(col.type)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Summary */}
          {leftDataset && rightDataset && (
            <div
              className="mt-4 text-sm text-center"
              style={{ color: "var(--color-text-muted)" }}
              data-testid="comparison-summary"
            >
              {sharedCount} shared column{sharedCount !== 1 ? "s" : ""},{" "}
              {uniqueLeftCount} unique to {leftDataset.name},{" "}
              {uniqueRightCount} unique to {rightDataset.name}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
