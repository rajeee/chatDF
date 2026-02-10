// Implements: spec/frontend/right_panel/dataset_card/plan.md
//
// Card component for a single dataset entry.
// Three states: loading (progress bar), ready (name + dims), error (retry).

import { memo, useState } from "react";
import type { Dataset } from "@/stores/datasetStore";
import { useDatasetStore } from "@/stores/datasetStore";
import { useChatStore } from "@/stores/chatStore";
import { useUiStore } from "@/stores/uiStore";
import { LoadingETA } from "./LoadingETA";

interface DatasetCardProps {
  dataset: Dataset;
  index?: number;
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

export function getFormat(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const lastSegment = pathname.split("/").pop() ?? "";
    const dotIndex = lastSegment.lastIndexOf(".");
    if (dotIndex === -1 || dotIndex === lastSegment.length - 1) return "Unknown";
    const ext = lastSegment.slice(dotIndex + 1).toLowerCase();
    if (!ext) return "Unknown";
    // Capitalize first letter
    return ext.charAt(0).toUpperCase() + ext.slice(1);
  } catch {
    return "Unknown";
  }
}

export function getColumnTypeSummary(schemaJson: string): string {
  try {
    const schema = JSON.parse(schemaJson);
    if (!schema || typeof schema !== "object") return "";
    const entries = Object.values(schema) as string[];
    if (entries.length === 0) return "";
    // Count occurrences of each type
    const counts: Record<string, number> = {};
    for (const type of entries) {
      counts[type] = (counts[type] ?? 0) + 1;
    }
    // Sort by count descending, then alphabetically
    const sorted = Object.entries(counts).sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    );
    return sorted.map(([type, count]) => `${count} ${type}`).join(", ");
  } catch {
    return "";
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function DatasetCardComponent({ dataset, index = 0 }: DatasetCardProps) {
  const removeDataset = useDatasetStore((s) => s.removeDataset);
  const openSchemaModal = useUiStore((s) => s.openSchemaModal);
  const openPreviewModal = useUiStore((s) => s.openPreviewModal);
  const conversationId = useChatStore((s) => s.activeConversationId);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [copied, setCopied] = useState(false);

  function handleRemove(e: React.MouseEvent) {
    e.stopPropagation();

    if (dataset.status === "error") {
      // Error datasets: remove with exit animation, no confirmation.
      setIsExiting(true);
      setTimeout(() => removeDataset(dataset.id), 250);
      return;
    }

    // Loaded datasets: confirm before removing.
    const confirmed = window.confirm(
      "Remove this dataset? The LLM will no longer have access to it."
    );
    if (confirmed) {
      setIsExiting(true);
      setTimeout(() => removeDataset(dataset.id), 250);
    }
  }

  function handleRetry(e: React.MouseEvent) {
    e.stopPropagation();
    // Show loading state immediately
    setIsRetrying(true);
    // retryDataset re-POSTs the URL. For now, call refreshSchema
    // which sets the loading state.
    useDatasetStore.getState().refreshSchema(dataset.id);
    // Reset retrying state after a brief moment (the status will change to loading)
    setTimeout(() => setIsRetrying(false), 300);
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
        `group relative rounded border p-3 w-full transition-all duration-150 ${isExiting ? "dataset-card-exit" : "dataset-card-enter"}`,
        isReady ? "cursor-pointer hover:shadow-md hover:border-accent/50" : "cursor-default",
        isError ? "border-l-4 border-red-500" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        backgroundColor: "var(--color-surface)",
        borderColor: isError ? undefined : "var(--color-border)",
        "--stagger-index": index,
      } as React.CSSProperties}
      onClick={handleCardClick}
    >
      {/* Loading state */}
      {isLoading && (
        <div className="animate-fade-in">
          <div className="text-sm truncate">{getHostname(dataset.url)}</div>
          <div
            data-testid="dataset-progress-bar"
            className="mt-2 h-1.5 w-full rounded-full overflow-hidden"
            style={{ backgroundColor: "var(--color-bg)" }}
          >
            <div
              className="h-full w-2/5 rounded-full animate-progress-slide"
              style={{ backgroundColor: "var(--color-accent)" }}
            />
          </div>
          <LoadingETA datasetId={dataset.id} />
        </div>
      )}

      {/* Ready state */}
      {isReady && (
        <div className="animate-fade-in">
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-sm truncate">
              {dataset.name}
            </span>
            <span className="relative group/stats">
              <span className="text-xs opacity-60 whitespace-nowrap">
                {formatNumber(dataset.row_count)} rows x {formatNumber(dataset.column_count)} cols
                {dataset.file_size_bytes ? ` · ${formatFileSize(dataset.file_size_bytes)}` : ""}
              </span>
              <span
                data-testid="dataset-stats-tooltip"
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1.5 text-[10px] rounded whitespace-nowrap opacity-0 group-hover/stats:opacity-100 transition-opacity duration-150 pointer-events-none z-50"
                style={{
                  background: "var(--color-surface)",
                  color: "var(--color-text)",
                  border: "1px solid var(--color-border)",
                  boxShadow: "0 2px 8px var(--color-shadow)",
                }}
              >
                <span className="block">Format: {getFormat(dataset.url)}</span>
                {dataset.file_size_bytes ? (
                  <span className="block">Size: {formatFileSize(dataset.file_size_bytes)}</span>
                ) : null}
                {getColumnTypeSummary(dataset.schema_json) && (
                  <span className="block">Columns: {getColumnTypeSummary(dataset.schema_json)}</span>
                )}
              </span>
            </span>
          </div>
          <span className="text-xs opacity-40 truncate block" title={dataset.url}>
            {getHostname(dataset.url)}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              openPreviewModal(dataset.id);
            }}
            aria-label="Preview dataset"
            title="Preview sample rows"
            data-testid="preview-button"
            className="touch-action-btn absolute top-1 right-[3.25rem] p-1 rounded opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all duration-150 active:scale-90"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(dataset.url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            aria-label={copied ? "URL copied" : "Copy dataset URL"}
            title="Copy dataset URL"
            data-testid="copy-url-button"
            className={`touch-action-btn absolute top-1 right-7 p-1 rounded transition-all duration-150 active:scale-90 ${
              copied ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            }`}
            style={{ color: copied ? "var(--color-success)" : undefined }}
          >
            {copied ? (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            )}
          </button>
          <button
            onClick={handleRemove}
            aria-label="Remove dataset"
            title="Remove dataset"
            className="touch-action-btn absolute top-1 right-1 p-1 rounded opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-red-500 active:scale-90 transition-all duration-150"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </button>
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="animate-fade-in">
          <div className="text-sm text-red-500 line-clamp-2">
            {dataset.error_message}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={handleRetry}
              aria-label="Retry"
              disabled={isRetrying}
              data-testid="retry-button"
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border hover:bg-accent/10 active:scale-95 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRetrying && (
                <svg
                  className="w-3 h-3 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 12a9 9 0 11-6.219-8.56" strokeOpacity="0.5" />
                </svg>
              )}
              Retry
            </button>
          </div>
          <button
            onClick={handleRemove}
            aria-label="Remove dataset"
            title="Remove dataset"
            className="absolute top-1 right-1 p-1 rounded hover:text-red-500 active:scale-90 transition-all duration-150"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

// Export memoized version to prevent unnecessary re-renders when sibling datasets update
export const DatasetCard = memo(DatasetCardComponent);
