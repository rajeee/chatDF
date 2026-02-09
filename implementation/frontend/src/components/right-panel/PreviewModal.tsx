// PreviewModal: shows configurable sample rows from a dataset in a data grid.
// Triggered via the Preview button on DatasetCard.
// Uses the existing DataGrid component for rendering the table.
// Supports configurable sample size (10/25/50/100), random sampling, and refresh.

import { useState, useEffect, useRef, useCallback } from "react";
import { useUiStore } from "@/stores/uiStore";
import { useDatasetStore } from "@/stores/datasetStore";
import { useChatStore } from "@/stores/chatStore";
import { previewDataset, type PreviewResponse } from "@/api/client";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { DataGrid } from "@/components/chat-area/DataGrid";

function formatNumber(n: number): string {
  return new Intl.NumberFormat().format(n);
}

export function PreviewModal() {
  const previewModalDatasetId = useUiStore((s) => s.previewModalDatasetId);
  const closePreviewModal = useUiStore((s) => s.closePreviewModal);
  const dataset = useDatasetStore((s) =>
    s.datasets.find((d) => d.id === previewModalDatasetId)
  );
  const conversationId = useChatStore((s) => s.activeConversationId);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PreviewResponse | null>(null);
  const [sampleSize, setSampleSize] = useState(10);
  const [randomSample, setRandomSample] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useFocusTrap(modalRef, !!previewModalDatasetId);

  // Fetch preview data when modal opens (initial load only)
  useEffect(() => {
    if (!previewModalDatasetId || !conversationId) {
      setData(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    previewDataset(conversationId, previewModalDatasetId, {
      sampleSize,
      random: randomSample,
    })
      .then((result) => {
        if (!cancelled) {
          setData(result);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load preview");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewModalDatasetId, conversationId]);

  // Refresh handler: re-fetches with current sample size and random settings
  const handleRefresh = useCallback(() => {
    if (!previewModalDatasetId || !conversationId) return;
    setLoading(true);
    setError(null);
    previewDataset(conversationId, previewModalDatasetId, {
      sampleSize,
      random: randomSample,
    })
      .then(setData)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load preview")
      )
      .finally(() => setLoading(false));
  }, [previewModalDatasetId, conversationId, sampleSize, randomSample]);

  // Close on Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closePreviewModal();
      }
    },
    [closePreviewModal]
  );

  useEffect(() => {
    if (previewModalDatasetId) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [previewModalDatasetId, handleKeyDown]);

  if (!previewModalDatasetId || !dataset) {
    return null;
  }

  // Convert array-of-arrays rows to array-of-objects for DataGrid
  const columns = data?.columns ?? [];
  const rows: Record<string, unknown>[] = (data?.rows ?? []).map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  });

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) {
      closePreviewModal();
    }
  }

  return (
    <div
      data-testid="preview-modal"
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-modal-title"
    >
      {/* Backdrop */}
      <div
        data-testid="preview-modal-backdrop"
        className="fixed inset-0 bg-black/50 flex items-center justify-center modal-backdrop-enter"
        onClick={handleBackdropClick}
      >
        {/* Modal content */}
        <div
          ref={modalRef}
          data-testid="preview-modal-content"
          className="rounded-lg shadow-xl p-6 w-full max-w-[800px] max-h-[80vh] overflow-y-auto modal-scale-enter"
          style={{ backgroundColor: "var(--color-surface)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 id="preview-modal-title" className="text-lg font-semibold">
                {dataset.name}
              </h2>
              <p className="text-sm opacity-60">
                {formatNumber(data?.total_rows ?? dataset.row_count)} total rows
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* Sample size selector */}
              <div className="flex items-center gap-1.5">
                <label className="text-xs opacity-60" htmlFor="sample-size">
                  Rows:
                </label>
                <select
                  id="sample-size"
                  data-testid="preview-sample-size"
                  className="text-xs rounded border px-1.5 py-0.5"
                  style={{
                    borderColor: "var(--color-border)",
                    backgroundColor: "var(--color-bg)",
                    color: "var(--color-text)",
                  }}
                  value={sampleSize}
                  onChange={(e) => setSampleSize(Number(e.target.value))}
                >
                  {[10, 25, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>

              {/* Random sample toggle */}
              <label
                className="flex items-center gap-1 text-xs cursor-pointer"
                data-testid="preview-random-toggle"
              >
                <input
                  type="checkbox"
                  checked={randomSample}
                  onChange={(e) => setRandomSample(e.target.checked)}
                  className="rounded"
                />
                <span className="opacity-60">Random</span>
              </label>

              {/* Refresh button */}
              <button
                data-testid="preview-refresh"
                className="flex items-center gap-1 text-xs px-2 py-0.5 rounded border hover:opacity-70 transition-opacity"
                style={{
                  borderColor: "var(--color-border)",
                  color: "var(--color-text)",
                }}
                onClick={handleRefresh}
                disabled={loading}
              >
                <svg
                  className={`w-3 h-3 ${loading ? "animate-spin" : ""}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M1 4v6h6M23 20v-6h-6" />
                  <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
                </svg>
                Refresh
              </button>

              {/* Close button */}
              <button
                onClick={closePreviewModal}
                aria-label="Close"
                title="Close"
                data-testid="preview-modal-close"
                className="p-1 rounded hover:opacity-70 active:scale-90 transition-all duration-150"
              >
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Loading state */}
          {loading && (
            <div
              className="flex items-center justify-center py-12"
              data-testid="preview-loading"
            >
              <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent" />
              <span className="ml-2 text-sm opacity-60">
                Loading preview...
              </span>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="py-8 text-center" data-testid="preview-error">
              <p className="text-sm text-red-500">{error}</p>
            </div>
          )}

          {/* Data grid */}
          {data && !loading && !error && (
            <DataGrid columns={columns} rows={rows} totalRows={rows.length} />
          )}
        </div>
      </div>
    </div>
  );
}
