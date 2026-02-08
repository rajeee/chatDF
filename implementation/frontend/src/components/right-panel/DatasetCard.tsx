// Implements: spec/frontend/right_panel/dataset_card/plan.md
//
// Card component for a single dataset entry.
// Three states: loading (progress bar), ready (name + dims), error (retry).

import { memo } from "react";
import type { Dataset } from "@/stores/datasetStore";
import { useDatasetStore } from "@/stores/datasetStore";
import { useUiStore } from "@/stores/uiStore";

interface DatasetCardProps {
  dataset: Dataset;
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat().format(n);
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function DatasetCardComponent({ dataset }: DatasetCardProps) {
  const removeDataset = useDatasetStore((s) => s.removeDataset);
  const openSchemaModal = useUiStore((s) => s.openSchemaModal);

  function handleRemove(e: React.MouseEvent) {
    e.stopPropagation();

    if (dataset.status === "error") {
      // Error datasets: remove immediately, no confirmation.
      removeDataset(dataset.id);
      return;
    }

    // Loaded datasets: confirm before removing.
    const confirmed = window.confirm(
      "Remove this dataset? The LLM will no longer have access to it."
    );
    if (confirmed) {
      removeDataset(dataset.id);
    }
  }

  function handleRetry(e: React.MouseEvent) {
    e.stopPropagation();
    // retryDataset re-POSTs the URL. For now, call refreshSchema
    // which sets the loading state.
    useDatasetStore.getState().refreshSchema(dataset.id);
  }

  function handleCardClick() {
    if (dataset.status === "ready") {
      openSchemaModal(dataset.id);
    }
  }

  const isLoading = dataset.status === "loading";
  const isReady = dataset.status === "ready";
  const isError = dataset.status === "error";

  return (
    <div
      data-testid="dataset-card"
      className={[
        "group relative rounded border p-3 w-full",
        isReady ? "cursor-pointer hover:opacity-90" : "cursor-default",
        isError ? "border-l-4 border-red-500" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        backgroundColor: "var(--color-surface)",
        borderColor: isError ? undefined : "var(--color-border)",
      }}
      onClick={handleCardClick}
    >
      {/* Loading state */}
      {isLoading && (
        <>
          <div className="text-sm truncate">{getHostname(dataset.url)}</div>
          <div
            data-testid="dataset-progress-bar"
            className="mt-2 h-1.5 w-full rounded-full overflow-hidden"
            style={{ backgroundColor: "var(--color-bg)" }}
          >
            <div
              className="h-full w-1/2 rounded-full animate-pulse"
              style={{ backgroundColor: "var(--color-accent)" }}
            />
          </div>
        </>
      )}

      {/* Ready state */}
      {isReady && (
        <>
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-sm truncate">
              {dataset.name}
            </span>
            <span className="text-xs opacity-60 whitespace-nowrap">
              {formatNumber(dataset.row_count)} rows x {formatNumber(dataset.column_count)} cols
            </span>
          </div>
          <button
            onClick={handleRemove}
            aria-label="Remove dataset"
            className="absolute top-1 right-1 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity text-xs"
          >
            X
          </button>
        </>
      )}

      {/* Error state */}
      {isError && (
        <>
          <div className="text-sm text-red-500 line-clamp-2">
            {dataset.error_message}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={handleRetry}
              aria-label="Retry"
              className="text-xs px-2 py-0.5 rounded border"
            >
              Retry
            </button>
          </div>
          <button
            onClick={handleRemove}
            aria-label="Remove dataset"
            className="absolute top-1 right-1 p-1 rounded text-xs"
          >
            X
          </button>
        </>
      )}
    </div>
  );
}

// Export memoized version to prevent unnecessary re-renders when sibling datasets update
export const DatasetCard = memo(DatasetCardComponent);
