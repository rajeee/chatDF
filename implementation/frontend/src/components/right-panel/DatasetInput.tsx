// Implements: spec/frontend/right_panel/dataset_input/plan.md
//
// "Preset Sources" button at top, then URL text input with Add button.
// Client-side validation (debounced 300ms), server-side validation on submit.

import { useState, useEffect, useCallback, useMemo } from "react";
import { useDatasetStore, filterDatasetsByConversation } from "@/stores/datasetStore";
import { useChatStore } from "@/stores/chatStore";
import { useUiStore } from "@/stores/uiStore";
import { useToastStore } from "@/stores/toastStore";
import { apiPost, TimeoutError } from "@/api/client";

const URL_REGEX = /^https?:\/\/[^/]+\.[^/]+/;

/** Patterns that suggest the URL points to a data source (no warning needed). */
const DATA_URL_PATTERNS = [
  /\.parquet(\.\w+)?$/i,
  /datasets?\//i,
  /\bdata\./i,
  /s3\.amazonaws\.com/i,
  /huggingface\.co/i,
  /storage\.googleapis\.com/i,
];

interface ValidationResult {
  error: string | null;
  warning: string | null;
}

interface DatasetInputProps {
  conversationId: string;
  datasetCount: number;
}

export function DatasetInput({ conversationId, datasetCount }: DatasetInputProps) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [validated, setValidated] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const allDatasets = useDatasetStore((s) => s.datasets);
  const datasets = useMemo(
    () => filterDatasetsByConversation(allDatasets, conversationId || null),
    [allDatasets, conversationId]
  );
  const addDataset = useDatasetStore((s) => s.addDataset);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const openPresetModal = useUiStore((s) => s.openPresetModal);
  const { success, error: showError } = useToastStore();

  const atLimit = datasetCount >= 50;

  // Validate a URL synchronously, returning error and/or warning.
  const validate = useCallback(
    (value: string): ValidationResult => {
      if (value.trim() === "") {
        return { error: null, warning: null };
      }
      if (!URL_REGEX.test(value)) {
        return { error: "Invalid URL format", warning: null };
      }
      if (datasets.some((d) => d.url === value)) {
        return { error: "This dataset is already loaded", warning: null };
      }
      // Check for data-URL patterns; warn if none match.
      const looksLikeData = DATA_URL_PATTERNS.some((re) => re.test(value));
      const warn = looksLikeData
        ? null
        : "This URL doesn't look like a Parquet dataset. ChatDF works best with Parquet files.";
      return { error: null, warning: warn };
    },
    [datasets]
  );

  // Debounced validation on url change.
  useEffect(() => {
    if (url.trim() === "") {
      setError(null);
      setWarning(null);
      setValidated(false);
      return;
    }

    const timer = setTimeout(() => {
      const result = validate(url);
      setError(result.error);
      setWarning(result.warning);
      setValidated(true);
    }, 300);

    return () => clearTimeout(timer);
  }, [url, validate]);

  // Clear error and warning immediately on input change.
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setUrl(e.target.value);
    setError(null);
    setWarning(null);
    setValidated(false);
  }

  async function submitUrl(urlToSubmit: string) {
    if (urlToSubmit.trim() === "" || isSubmitting) return;

    const result = validate(urlToSubmit);
    if (result.error) {
      setError(result.error);
      return;
    }

    setIsSubmitting(true);
    try {
      // Auto-create a conversation if none exists
      let convId = conversationId;
      if (!convId) {
        const newConv = await apiPost<{ id: string }>("/conversations");
        convId = newConv.id;
        setActiveConversation(convId);
      }

      const response = await apiPost<{ dataset_id: string; status: string }>(
        `/conversations/${convId}/datasets`,
        { url: urlToSubmit }
      );

      // Add a loading-state dataset entry to the store, unless
      // the WS dataset_loaded event already added it (race condition).
      const alreadyExists = useDatasetStore
        .getState()
        .datasets.some((d) => d.id === response.dataset_id);
      if (!alreadyExists) {
        addDataset({
          id: response.dataset_id,
          conversation_id: convId,
          url: urlToSubmit,
          name: "",
          row_count: 0,
          column_count: 0,
          schema_json: "{}",
          status: "loading",
          error_message: null,
        });
      }

      setUrl("");
      setError(null);
      setWarning(null);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 1000);
      success("Dataset added successfully");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to add dataset";
      setError(message);
      showError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit() {
    await submitUrl(url);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pastedText = e.clipboardData.getData("text").trim();
    if (
      pastedText &&
      URL_REGEX.test(pastedText) &&
      !datasets.some((d) => d.url === pastedText)
    ) {
      e.preventDefault();
      setUrl(pastedText);
      submitUrl(pastedText);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);

    const droppedUrl = (
      e.dataTransfer.getData("text/uri-list") ||
      e.dataTransfer.getData("text/plain")
    ).trim();

    if (droppedUrl && URL_REGEX.test(droppedUrl)) {
      setUrl(droppedUrl);
      submitUrl(droppedUrl);
    }
  }

  const addDisabled =
    atLimit || url.trim() === "" || isSubmitting || error !== null;

  return (
    <div
      data-testid="dataset-input"
      data-drop-zone="dataset-drop-zone"
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        position: "relative",
        borderRadius: "0.375rem",
        border: isDragOver ? "2px dashed var(--color-accent)" : "2px dashed transparent",
        padding: isDragOver ? "0.5rem" : "0.5rem",
        transition: "border-color 200ms ease",
      }}
    >
      {isDragOver && (
        <div
          data-testid="drop-overlay"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "color-mix(in srgb, var(--color-accent) 10%, transparent)",
            borderRadius: "0.375rem",
            zIndex: 10,
            pointerEvents: "none",
          }}
        >
          <span style={{ color: "var(--color-accent)", fontWeight: 600, fontSize: "0.875rem" }}>
            Drop URL here
          </span>
        </div>
      )}
      {/* Preset Sources button */}
      <button
        onClick={openPresetModal}
        disabled={atLimit}
        className="w-full rounded px-3 py-1.5 text-sm font-medium mb-3 disabled:opacity-50 bg-accent text-white hover:brightness-110 active:scale-98 transition-all duration-150"
      >
        Preset Sources
      </button>

      {/* Custom URL input */}
      <label className="text-xs font-medium opacity-70 mb-1 block">
        Custom Parquet URL
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={url}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={atLimit ? "Maximum 50 datasets" : "Paste parquet URL..."}
            disabled={atLimit || isSubmitting}
            className={`w-full rounded border px-2 py-1 text-sm disabled:opacity-50${showSuccess ? " success-pulse" : ""}`}
            style={{
              backgroundColor: "var(--color-surface)",
              borderColor: showSuccess
                ? "var(--color-success)"
                : error
                  ? "var(--color-error)"
                  : warning
                    ? "var(--color-warning)"
                    : validated && url.trim() && !error && !warning
                      ? "color-mix(in srgb, var(--color-success) 50%, transparent)"
                      : "var(--color-border)",
              color: "var(--color-text)",
              paddingRight: url && !atLimit && !isSubmitting ? "1.75rem" : undefined,
              transition: "border-color 300ms ease",
            }}
          />
          {url && !atLimit && !isSubmitting && (
            <button
              type="button"
              data-testid="clear-url-btn"
              aria-label="Clear URL"
              onClick={() => { setUrl(""); setError(null); setWarning(null); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100 transition-opacity duration-150"
              style={{ color: "var(--color-text)" }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
        {showSuccess && (
          <span data-testid="url-success-icon" className="flex items-center text-green-500 animate-fade-in">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
        )}
        <button
          onClick={handleSubmit}
          disabled={addDisabled}
          aria-label="Add"
          className="rounded px-3 py-1 text-sm font-medium disabled:opacity-50 bg-accent text-white hover:brightness-110 active:scale-95 transition-all duration-150"
        >
          {isSubmitting ? (
            <span
              data-testid="submit-spinner"
              className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            />
          ) : (
            "Add"
          )}
        </button>
      </div>
      {error && (
        <p className="mt-1 text-sm text-red-500" data-testid="dataset-input-error">
          {error}
        </p>
      )}
      {!error && warning && (
        <p className="mt-1 text-sm" style={{ color: "var(--color-warning)" }} data-testid="dataset-input-warning">
          {warning}
        </p>
      )}
    </div>
  );
}
