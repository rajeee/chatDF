// Implements: spec/frontend/right_panel/schema_modal/plan.md
//
// Modal overlay showing dataset schema details.
// Editable table name, read-only dimensions, column list, refresh button.
// Closes via X button, Escape key, or backdrop click.

import { useState, useEffect, useRef, useCallback } from "react";
import { useUiStore } from "@/stores/uiStore";
import { useDatasetStore } from "@/stores/datasetStore";
import { apiPost, apiPatch } from "@/api/client";
import { useChatStore } from "@/stores/chatStore";

/** Map parquet type strings to user-friendly display labels. */
function mapType(rawType: string): string {
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

function formatNumber(n: number): string {
  return new Intl.NumberFormat().format(n);
}

interface Column {
  name: string;
  type: string;
}

function parseColumns(schemaJson: string): Column[] {
  try {
    const parsed = JSON.parse(schemaJson);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch {
    return [];
  }
}

export function SchemaModal() {
  const schemaModalDatasetId = useUiStore((s) => s.schemaModalDatasetId);
  const closeSchemaModal = useUiStore((s) => s.closeSchemaModal);
  const dataset = useDatasetStore((s) =>
    s.datasets.find((d) => d.id === schemaModalDatasetId)
  );
  const renameDataset = useDatasetStore((s) => s.renameDataset);
  const updateDataset = useDatasetStore((s) => s.updateDataset);
  const conversationId = useChatStore((s) => s.activeConversationId);

  const [editedName, setEditedName] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Sync editedName when dataset changes.
  useEffect(() => {
    if (dataset) {
      setEditedName(dataset.name);
    }
  }, [dataset]);

  // Focus the table name input on open.
  useEffect(() => {
    if (schemaModalDatasetId && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [schemaModalDatasetId]);

  // Close on Escape key.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeSchemaModal();
      }
    },
    [closeSchemaModal]
  );

  useEffect(() => {
    if (schemaModalDatasetId) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [schemaModalDatasetId, handleKeyDown]);

  if (!schemaModalDatasetId || !dataset) {
    return null;
  }

  const columns = parseColumns(dataset.schema_json);

  function handleNameSave() {
    if (editedName !== dataset!.name && editedName.trim() !== "") {
      renameDataset(dataset!.id, editedName.trim());
      // Fire API call (best-effort, store already updated).
      if (conversationId) {
        apiPatch(`/conversations/${conversationId}/datasets/${dataset!.id}`, {
          tableName: editedName.trim(),
        }).catch(() => {
          // Silently fail for V1; store state is source of truth.
        });
      }
    }
  }

  function handleNameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleNameSave();
      (e.target as HTMLInputElement).blur();
    }
  }

  async function handleRefresh() {
    if (!conversationId) return;

    setIsRefreshing(true);
    setRefreshError(null);

    try {
      const result = await apiPost<{
        row_count: number;
        column_count: number;
        columns: Column[];
      }>(`/conversations/${conversationId}/datasets/${dataset!.id}/refresh`);

      updateDataset(dataset!.id, {
        row_count: result.row_count,
        column_count: result.column_count,
        schema_json: JSON.stringify(result.columns),
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to refresh schema";
      setRefreshError(message);
    } finally {
      setIsRefreshing(false);
    }
  }

  function handleBackdropClick(e: React.MouseEvent) {
    // Only close if the click target is the backdrop itself.
    if (e.target === e.currentTarget) {
      closeSchemaModal();
    }
  }

  return (
    <div
      data-testid="schema-modal"
      className="fixed inset-0 z-50"
    >
      {/* Backdrop */}
      <div
        data-testid="schema-modal-backdrop"
        className="fixed inset-0 bg-black/50 flex items-center justify-center"
        onClick={handleBackdropClick}
      >
        {/* Modal content */}
        <div
          data-testid="schema-modal-content"
          className="rounded-lg shadow-xl p-6 w-full max-w-[500px] max-h-[80vh] overflow-y-auto"
          style={{ backgroundColor: "var(--color-surface)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header: close button */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Dataset Schema</h2>
            <button
              onClick={closeSchemaModal}
              aria-label="Close"
              className="p-1 rounded hover:opacity-70 active:scale-90 transition-all duration-150 text-lg"
            >
              X
            </button>
          </div>

          {/* Table name input */}
          <div className="mb-3">
            <label className="block text-xs opacity-60 mb-1">Table Name</label>
            <input
              ref={nameInputRef}
              type="text"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onBlur={handleNameSave}
              onKeyDown={handleNameKeyDown}
              className="w-full rounded border px-2 py-1 text-sm"
              style={{
                backgroundColor: "var(--color-surface)",
                borderColor: "var(--color-border)",
                color: "var(--color-text)",
              }}
            />
          </div>

          {/* Dimensions */}
          <div className="mb-4 text-sm opacity-70">
            {formatNumber(dataset.row_count)} rows x{" "}
            {formatNumber(dataset.column_count)} columns
          </div>

          {/* Column list */}
          <div className="mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--color-border)" }}>
                  <th className="text-left py-1 font-medium">Name</th>
                  <th className="text-left py-1 font-medium">Type</th>
                </tr>
              </thead>
              <tbody>
                {columns.map((col, idx) => (
                  <tr
                    key={idx}
                    className="border-b"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <td className="py-1">{col.name}</td>
                    <td className="py-1 opacity-70">{mapType(col.type)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Refresh Schema button */}
          <div>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="rounded px-3 py-1 text-sm font-medium disabled:opacity-50 bg-accent text-white hover:brightness-110 active:scale-95 transition-all duration-150"
            >
              {isRefreshing ? (
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Refreshing...
                </span>
              ) : (
                "Refresh Schema"
              )}
            </button>
            {refreshError && (
              <p className="mt-1 text-sm text-red-500">{refreshError}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
