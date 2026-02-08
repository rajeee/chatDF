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
import { useFocusTrap } from "@/hooks/useFocusTrap";

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

/** Renders a small inline SVG icon based on the mapped column type. */
function TypeIcon({ type }: { type: string }) {
  const mapped = mapType(type);
  switch (mapped) {
    case "Text":
      return (
        <svg className="w-3.5 h-3.5 inline-block mr-1.5 opacity-50 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="4 7 4 4 20 4 20 7" />
          <line x1="9.5" y1="20" x2="14.5" y2="20" />
          <line x1="12" y1="4" x2="12" y2="20" />
        </svg>
      );
    case "Integer":
      return (
        <svg className="w-3.5 h-3.5 inline-block mr-1.5 opacity-50 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="4" y1="9" x2="20" y2="9" />
          <line x1="4" y1="15" x2="20" y2="15" />
          <line x1="10" y1="3" x2="8" y2="21" />
          <line x1="16" y1="3" x2="14" y2="21" />
        </svg>
      );
    case "Decimal":
      return (
        <svg className="w-3.5 h-3.5 inline-block mr-1.5 opacity-50 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="4" y1="9" x2="20" y2="9" />
          <line x1="4" y1="15" x2="20" y2="15" />
          <line x1="10" y1="3" x2="8" y2="21" />
          <line x1="16" y1="3" x2="14" y2="21" />
          <circle cx="19" cy="19" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      );
    case "Date":
      return (
        <svg className="w-3.5 h-3.5 inline-block mr-1.5 opacity-50 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      );
    case "Boolean":
      return (
        <svg className="w-3.5 h-3.5 inline-block mr-1.5 opacity-50 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="1" y="5" width="22" height="14" rx="7" ry="7" />
          <circle cx="16" cy="12" r="3" />
        </svg>
      );
    default:
      return (
        <svg className="w-3.5 h-3.5 inline-block mr-1.5 opacity-50 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      );
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
    // Handle wrapped format: {"columns": [...]}
    if (parsed && Array.isArray(parsed.columns)) {
      return parsed.columns;
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
  const modalRef = useRef<HTMLDivElement>(null);

  useFocusTrap(modalRef, !!schemaModalDatasetId);

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
        schema: { columns: Column[] } | null;
      }>(`/conversations/${conversationId}/datasets/${dataset!.id}/refresh`);

      updateDataset(dataset!.id, {
        row_count: result.row_count,
        column_count: result.column_count,
        schema_json: JSON.stringify(result.schema?.columns ?? []),
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
      role="dialog"
      aria-modal="true"
      aria-labelledby="schema-modal-title"
    >
      {/* Backdrop */}
      <div
        data-testid="schema-modal-backdrop"
        className="fixed inset-0 bg-black/50 flex items-center justify-center modal-backdrop-enter"
        onClick={handleBackdropClick}
      >
        {/* Modal content */}
        <div
          ref={modalRef}
          data-testid="schema-modal-content"
          className="rounded-lg shadow-xl p-6 w-full max-w-[500px] max-h-[80vh] overflow-y-auto modal-scale-enter"
          style={{ backgroundColor: "var(--color-surface)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header: close button */}
          <div className="flex items-center justify-between mb-4">
            <h2 id="schema-modal-title" className="text-lg font-semibold">Dataset Schema</h2>
            <button
              onClick={closeSchemaModal}
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
            <div
              data-testid="schema-column-table-container"
              className="max-h-[300px] overflow-y-auto rounded border"
              style={{ borderColor: "var(--color-border)" }}
            >
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10" style={{ backgroundColor: "var(--color-surface)" }}>
                  <tr className="border-b" style={{ borderColor: "var(--color-border)" }}>
                    <th className="text-left py-1 font-medium">Name</th>
                    <th className="text-left py-1 font-medium">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {columns.map((col, idx) => (
                    <tr
                      key={idx}
                      className={`hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors ${idx % 2 === 0 ? "" : "bg-black/[0.02] dark:bg-white/[0.02]"}`}
                    >
                      <td className="py-1">{col.name}</td>
                      <td className="py-1 opacity-70">
                        <span className="inline-flex items-center">
                          <TypeIcon type={col.type} />
                          {mapType(col.type)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
