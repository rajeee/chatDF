// Implements: spec/frontend/right_panel/dataset_input/plan.md
//
// URL text input with Add button for loading parquet datasets.
// Client-side validation (debounced 300ms), server-side validation on submit.

import { useState, useEffect, useCallback } from "react";
import { useDatasetStore } from "@/stores/datasetStore";
import { useChatStore } from "@/stores/chatStore";
import { apiPost } from "@/api/client";

const URL_REGEX = /^https?:\/\/[^/]+\.[^/]+/;

interface DatasetInputProps {
  conversationId: string;
  datasetCount: number;
}

export function DatasetInput({ conversationId, datasetCount }: DatasetInputProps) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const datasets = useDatasetStore((s) => s.datasets);
  const addDataset = useDatasetStore((s) => s.addDataset);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);

  const atLimit = datasetCount >= 5;

  // Validate a URL synchronously, returning an error string or null.
  const validate = useCallback(
    (value: string): string | null => {
      if (value.trim() === "") {
        return null;
      }
      if (!URL_REGEX.test(value)) {
        return "Invalid URL format";
      }
      if (datasets.some((d) => d.url === value)) {
        return "This dataset is already loaded";
      }
      return null;
    },
    [datasets]
  );

  // Debounced validation on url change.
  useEffect(() => {
    if (url.trim() === "") {
      setError(null);
      return;
    }

    const timer = setTimeout(() => {
      setError(validate(url));
    }, 300);

    return () => clearTimeout(timer);
  }, [url, validate]);

  // Clear error immediately on input change.
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setUrl(e.target.value);
    setError(null);
  }

  async function handleSubmit() {
    // Run validation synchronously (skip debounce).
    const validationError = validate(url);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (url.trim() === "" || isSubmitting) {
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
        { url }
      );

      // Add a loading-state dataset entry to the store.
      addDataset({
        id: response.dataset_id,
        url,
        name: "",
        row_count: 0,
        column_count: 0,
        schema_json: "{}",
        status: "loading",
        error_message: null,
      });

      setUrl("");
      setError(null);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to add dataset";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  }

  const addDisabled =
    atLimit || url.trim() === "" || isSubmitting || error !== null;

  return (
    <div data-testid="dataset-input">
      <div className="flex gap-2">
        <input
          type="text"
          value={url}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={atLimit ? "Maximum 5 datasets" : "Paste parquet URL..."}
          disabled={atLimit || isSubmitting}
          className="flex-1 rounded border px-2 py-1 text-sm disabled:opacity-50"
          style={{
            backgroundColor: "var(--color-surface)",
            borderColor: "var(--color-bg)",
            color: "var(--color-text)",
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={addDisabled}
          aria-label="Add"
          className="rounded px-3 py-1 text-sm font-medium disabled:opacity-50"
          style={{
            backgroundColor: "var(--color-primary)",
            color: "var(--color-primary-text, #fff)",
          }}
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
    </div>
  );
}
