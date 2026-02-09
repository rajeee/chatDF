// Implements: spec/frontend/right_panel/schema_modal/plan.md
//
// Modal overlay showing dataset schema details.
// Editable table name, read-only dimensions, column list, refresh button.
// Tabbed view: "Schema" (column table) and "Statistics" (visual profiling dashboard).
// Closes via X button, Escape key, or backdrop click.

import { useState, useEffect, useRef, useCallback } from "react";
import { useUiStore } from "@/stores/uiStore";
import { useDatasetStore, type ColumnProfile } from "@/stores/datasetStore";
import { apiGet, apiPost, apiPatch } from "@/api/client";
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

/** Compact number formatter for stat values (e.g. 1234 -> "1,234", 12.345 -> "12.35"). */
function formatStat(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return "\u2014";
  if (Number.isInteger(value)) return formatNumber(value);
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** Determines if a column type is numeric based on its raw parquet type string. */
function isNumericType(type: string): boolean {
  return (
    ["Int32", "Int64", "Float32", "Float64", "UInt32", "UInt64"].includes(type) ||
    type.startsWith("Int") ||
    type.startsWith("UInt") ||
    type.startsWith("Float")
  );
}

/** Determines if a column type is string-like based on its raw parquet type string. */
function isStringType(type: string): boolean {
  return type === "Utf8" || type === "String";
}

/** A thin horizontal stat bar used in the Statistics tab. */
function StatBar({
  value,
  max,
  color,
  label,
}: {
  value: number;
  max: number;
  color: string;
  label: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-xs" data-testid={`stat-bar-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <span className="w-16 opacity-60 shrink-0">{label}</span>
      <div
        className="flex-1 h-2 rounded-full overflow-hidden"
        style={{ backgroundColor: "var(--color-border)" }}
      >
        <div
          className="h-full rounded-full transition-all"
          data-testid={`stat-bar-fill-${label.toLowerCase().replace(/\s+/g, "-")}`}
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-12 text-right tabular-nums opacity-70">
        {typeof value === "number" && !isNaN(value)
          ? value.toLocaleString()
          : "\u2014"}
      </span>
    </div>
  );
}

/** Renders the visual statistics dashboard for a single column. */
function ColumnStatCard({
  col,
  profile,
  rowCount,
}: {
  col: Column;
  profile: ColumnProfile;
  rowCount: number;
}) {
  const numeric = isNumericType(col.type);
  const stringy = isStringType(col.type);
  const completePct = rowCount > 0 ? ((rowCount - profile.null_count) / rowCount) * 100 : 100;
  const uniquePct = rowCount > 0 ? (profile.unique_count / rowCount) * 100 : 0;

  return (
    <div
      data-testid={`stat-card-${col.name}`}
      className="rounded-lg border p-3 space-y-2"
      style={{ borderColor: "var(--color-border)" }}
    >
      {/* Header: name + type badge */}
      <div className="flex items-center gap-2">
        <TypeIcon type={col.type} />
        <span className="font-medium text-sm">{col.name}</span>
        <span
          className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full opacity-60"
          style={{ backgroundColor: "var(--color-border)" }}
        >
          {mapType(col.type)}
        </span>
      </div>

      {/* Completeness / Null bar */}
      <StatBar
        value={completePct}
        max={100}
        color="var(--color-success)"
        label="Complete"
      />
      <StatBar
        value={profile.null_percent}
        max={100}
        color="var(--color-error)"
        label="Nulls"
      />

      {/* Uniqueness bar */}
      <StatBar
        value={uniquePct}
        max={100}
        color="var(--color-accent)"
        label="Unique"
      />

      {/* Numeric stats: min / mean / max with range indicator */}
      {numeric && profile.min != null && profile.max != null && (
        <div className="space-y-1 pt-1 border-t" style={{ borderColor: "var(--color-border)" }}>
          <div className="flex justify-between text-xs opacity-60">
            <span>Min: <span className="tabular-nums">{formatStat(profile.min)}</span></span>
            {profile.mean != null && (
              <span>Mean: <span className="tabular-nums">{formatStat(profile.mean)}</span></span>
            )}
            <span>Max: <span className="tabular-nums">{formatStat(profile.max)}</span></span>
          </div>
          {/* Range bar showing where mean sits between min and max */}
          {profile.mean != null && profile.max !== profile.min && (
            <div
              className="relative h-2 rounded-full overflow-hidden"
              style={{ backgroundColor: "var(--color-border)" }}
              data-testid={`stat-range-bar-${col.name}`}
            >
              <div
                className="absolute h-full rounded-full"
                style={{
                  width: "100%",
                  backgroundColor: "var(--color-accent)",
                  opacity: 0.25,
                }}
              />
              <div
                className="absolute top-0 h-full w-1 rounded-full"
                data-testid={`stat-mean-marker-${col.name}`}
                style={{
                  left: `${Math.min(100, Math.max(0, ((profile.mean! - profile.min!) / (profile.max! - profile.min!)) * 100))}%`,
                  backgroundColor: "var(--color-accent)",
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* String stats: min_length / max_length */}
      {stringy && profile.min_length != null && profile.max_length != null && (
        <div className="space-y-0.5 pt-1 border-t" style={{ borderColor: "var(--color-border)" }}>
          <div className="flex justify-between text-xs opacity-60">
            <span>Min length: <span className="tabular-nums">{formatStat(profile.min_length)}</span></span>
            <span>Max length: <span className="tabular-nums">{formatStat(profile.max_length)}</span></span>
          </div>
        </div>
      )}

      {/* Summary row */}
      <div className="flex justify-between text-[10px] opacity-50 pt-1">
        <span>{formatNumber(profile.unique_count)} unique</span>
        <span>{formatNumber(profile.null_count)} nulls ({profile.null_percent}%)</span>
      </div>
    </div>
  );
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
  const profileDataset = useDatasetStore((s) => s.profileDataset);
  const columnProfiles = useDatasetStore((s) =>
    schemaModalDatasetId ? s.columnProfiles[schemaModalDatasetId] : undefined
  );
  const isProfiling = useDatasetStore((s) =>
    schemaModalDatasetId ? s.isProfiling[schemaModalDatasetId] ?? false : false
  );
  const conversationId = useChatStore((s) => s.activeConversationId);

  const [editedName, setEditedName] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"schema" | "stats" | "descriptions">("schema");
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const [descLoading, setDescLoading] = useState(false);
  const [savingCol, setSavingCol] = useState<string | null>(null);
  const [savedCol, setSavedCol] = useState<string | null>(null);
  const [editedDescs, setEditedDescs] = useState<Record<string, string>>({});
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null);
  const [columnDetail, setColumnDetail] = useState<Record<string, any> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [columnDetailCache, setColumnDetailCache] = useState<Record<string, any>>({});
  const nameInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const descFetchedRef = useRef(false);

  useFocusTrap(modalRef, !!schemaModalDatasetId);

  // Sync editedName and reset search/tab when dataset changes.
  useEffect(() => {
    if (dataset) {
      setEditedName(dataset.name);
    }
    setSearchTerm("");
    setActiveTab("schema");
    setDescriptions({});
    setEditedDescs({});
    descFetchedRef.current = false;
  }, [dataset]);

  // Auto-trigger profiling when switching to Statistics tab (if not already profiled).
  useEffect(() => {
    if (activeTab === "stats" && !columnProfiles && !isProfiling && conversationId && dataset) {
      profileDataset(conversationId, dataset.id);
    }
  }, [activeTab, columnProfiles, isProfiling, conversationId, dataset, profileDataset]);

  // Fetch column descriptions when switching to Descriptions tab.
  useEffect(() => {
    if (activeTab === "descriptions" && conversationId && dataset && !descFetchedRef.current) {
      descFetchedRef.current = true;
      setDescLoading(true);
      apiGet<{ descriptions: Record<string, string> }>(
        `/conversations/${conversationId}/datasets/${dataset.id}/column-descriptions`
      )
        .then((res) => {
          setDescriptions(res.descriptions || {});
          setEditedDescs(res.descriptions || {});
        })
        .catch(() => {
          // Silently fail; descriptions will just be empty
        })
        .finally(() => {
          setDescLoading(false);
        });
    }
  }, [activeTab, conversationId, dataset]);

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
  const filteredColumns = searchTerm
    ? columns.filter(col => col.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : columns;

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

  async function handleProfile() {
    if (!conversationId || !dataset) return;
    await profileDataset(conversationId, dataset.id);
  }

  async function handleColumnClick(col: Column) {
    if (selectedColumn === col.name) {
      // Toggle off
      setSelectedColumn(null);
      setColumnDetail(null);
      return;
    }
    setSelectedColumn(col.name);

    // Check cache first
    if (columnDetailCache[col.name]) {
      setColumnDetail(columnDetailCache[col.name]);
      return;
    }

    // Fetch from API
    if (!conversationId || !dataset) return;
    setDetailLoading(true);
    setColumnDetail(null);
    try {
      const result = await apiPost<{ stats: Record<string, any> }>(
        `/conversations/${conversationId}/datasets/${dataset.id}/profile-column`,
        { column_name: col.name, column_type: col.type }
      );
      setColumnDetail(result.stats);
      setColumnDetailCache((prev) => ({ ...prev, [col.name]: result.stats }));
    } catch {
      setColumnDetail({ _error: "Failed to load column details" });
    } finally {
      setDetailLoading(false);
    }
  }

  // Build a lookup map from column name to its profile for efficient access
  const profileMap = new Map<string, ColumnProfile>();
  if (columnProfiles) {
    for (const p of columnProfiles) {
      profileMap.set(p.name, p);
    }
  }

  async function handleDescriptionSave(colName: string) {
    if (!conversationId || !dataset) return;
    const newValue = editedDescs[colName] ?? "";
    // Skip save if unchanged
    if (newValue === (descriptions[colName] ?? "")) return;

    setSavingCol(colName);
    const merged = { ...descriptions, ...editedDescs };
    // Remove empty descriptions
    const cleaned: Record<string, string> = {};
    for (const [k, v] of Object.entries(merged)) {
      if (v.trim()) cleaned[k] = v;
    }

    try {
      await apiPatch(
        `/conversations/${conversationId}/datasets/${dataset.id}/column-descriptions`,
        { descriptions: cleaned }
      );
      setDescriptions(cleaned);
      setSavedCol(colName);
      setTimeout(() => setSavedCol(null), 1500);
    } catch {
      // Silently fail for now
    } finally {
      setSavingCol(null);
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

          {/* Tab switcher */}
          <div className="flex mb-4 border-b" style={{ borderColor: "var(--color-border)" }} data-testid="schema-tab-bar">
            <button
              data-testid="schema-tab-schema"
              className={`px-3 py-1.5 text-sm font-medium transition-all duration-150 border-b-2 ${
                activeTab === "schema"
                  ? "border-current opacity-100"
                  : "border-transparent opacity-50 hover:opacity-70"
              }`}
              onClick={() => setActiveTab("schema")}
            >
              Schema
            </button>
            <button
              data-testid="schema-tab-stats"
              className={`px-3 py-1.5 text-sm font-medium transition-all duration-150 border-b-2 ${
                activeTab === "stats"
                  ? "border-current opacity-100"
                  : "border-transparent opacity-50 hover:opacity-70"
              }`}
              onClick={() => setActiveTab("stats")}
            >
              Statistics
            </button>
            <button
              data-testid="schema-tab-descriptions"
              className={`px-3 py-1.5 text-sm font-medium transition-all duration-150 border-b-2 ${
                activeTab === "descriptions"
                  ? "border-current opacity-100"
                  : "border-transparent opacity-50 hover:opacity-70"
              }`}
              onClick={() => setActiveTab("descriptions")}
            >
              Descriptions
            </button>
          </div>

          {/* ===== Schema Tab ===== */}
          {activeTab === "schema" && (
            <>
              {/* Column list */}
              <div className="mb-4">
                {/* Column search */}
                {columns.length > 5 && (
                  <div className="mb-2 relative">
                    <input
                      type="text"
                      placeholder="Filter columns..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      data-testid="schema-column-search"
                      className="w-full rounded border px-2 py-1 pl-7 text-sm"
                      style={{
                        backgroundColor: "var(--color-surface)",
                        borderColor: "var(--color-border)",
                        color: "var(--color-text)",
                      }}
                    />
                    <svg
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-40"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    {searchTerm && (
                      <button
                        onClick={() => setSearchTerm("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded opacity-40 hover:opacity-70 transition-opacity"
                        aria-label="Clear search"
                      >
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    )}
                  </div>
                )}
                <div
                  data-testid="schema-column-table-container"
                  className="max-h-[300px] overflow-y-auto rounded border"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10" style={{ backgroundColor: "var(--color-surface)" }}>
                      <tr className="border-b" style={{ borderColor: "var(--color-border)" }}>
                        <th className="text-left py-1 font-medium">
                          Name
                          {searchTerm && (
                            <span className="ml-1 font-normal opacity-50" data-testid="schema-column-count">
                              ({filteredColumns.length}/{columns.length})
                            </span>
                          )}
                        </th>
                        <th className="text-left py-1 font-medium">Type</th>
                        {columnProfiles && (
                          <>
                            <th className="text-right py-1 font-medium px-1">Unique</th>
                            <th className="text-right py-1 font-medium px-1">Null %</th>
                            <th className="text-right py-1 font-medium px-1">Min/Max</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredColumns.map((col, idx) => {
                        const profile = profileMap.get(col.name);
                        const isNumeric = isNumericType(col.type);
                        const isString = isStringType(col.type);
                        return (
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
                            {columnProfiles && profile && (
                              <>
                                <td className="text-right py-1 px-1 opacity-70 tabular-nums">
                                  {formatNumber(profile.unique_count)}
                                </td>
                                <td className="text-right py-1 px-1 opacity-70 tabular-nums">
                                  {profile.null_percent}%
                                </td>
                                <td className="text-right py-1 px-1 opacity-70 tabular-nums text-xs">
                                  {isNumeric && profile.min != null && profile.max != null
                                    ? `${profile.min} .. ${profile.max}`
                                    : isString && profile.min_length != null && profile.max_length != null
                                      ? `len ${profile.min_length}..${profile.max_length}`
                                      : "\u2014"}
                                </td>
                              </>
                            )}
                            {columnProfiles && !profile && (
                              <>
                                <td className="py-1 px-1">{"\u2014"}</td>
                                <td className="py-1 px-1">{"\u2014"}</td>
                                <td className="py-1 px-1">{"\u2014"}</td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {filteredColumns.length === 0 && searchTerm && (
                  <div className="text-center py-4 text-sm opacity-50">
                    No columns match &quot;{searchTerm}&quot;
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 flex-wrap">
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
                <button
                  onClick={handleProfile}
                  disabled={isProfiling}
                  className="rounded px-3 py-1 text-sm font-medium disabled:opacity-50 border hover:brightness-110 active:scale-95 transition-all duration-150"
                  style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
                >
                  {isProfiling ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Profiling...
                    </span>
                  ) : (
                    "Profile Columns"
                  )}
                </button>
                {refreshError && (
                  <p className="mt-1 text-sm text-red-500 w-full">{refreshError}</p>
                )}
              </div>
            </>
          )}

          {/* ===== Statistics Tab ===== */}
          {activeTab === "stats" && (
            <div data-testid="stats-tab-content">
              {isProfiling && (
                <div className="flex items-center justify-center py-8 gap-2 text-sm opacity-60" data-testid="stats-loading">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Profiling columns...
                </div>
              )}
              {!isProfiling && !columnProfiles && (
                <div className="text-center py-8" data-testid="stats-empty">
                  <p className="text-sm opacity-50 mb-3">No statistics available</p>
                  <button
                    onClick={handleProfile}
                    data-testid="stats-profile-btn"
                    className="rounded px-3 py-1 text-sm font-medium bg-accent text-white hover:brightness-110 active:scale-95 transition-all duration-150"
                  >
                    Profile Columns
                  </button>
                </div>
              )}
              {!isProfiling && columnProfiles && (
                <div className="space-y-3 max-h-[400px] overflow-y-auto" data-testid="stats-card-list">
                  {columns.map((col) => {
                    const profile = profileMap.get(col.name);
                    if (!profile) return null;
                    return (
                      <ColumnStatCard
                        key={col.name}
                        col={col}
                        profile={profile}
                        rowCount={dataset.row_count}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ===== Descriptions Tab ===== */}
          {activeTab === "descriptions" && (
            <div data-testid="descriptions-tab-content">
              {descLoading && (
                <div className="flex items-center justify-center py-8 gap-2 text-sm opacity-60" data-testid="descriptions-loading">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Loading descriptions...
                </div>
              )}
              {!descLoading && (
                <div className="space-y-3 max-h-[400px] overflow-y-auto" data-testid="descriptions-list">
                  {columns.map((col) => (
                    <div
                      key={col.name}
                      data-testid={`desc-item-${col.name}`}
                      className="rounded-lg border p-3"
                      style={{ borderColor: "var(--color-border)" }}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <TypeIcon type={col.type} />
                        <span className="font-medium text-sm">{col.name}</span>
                        <span
                          className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full opacity-60"
                          style={{ backgroundColor: "var(--color-border)" }}
                        >
                          {mapType(col.type)}
                        </span>
                        {savingCol === col.name && (
                          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-50" data-testid={`desc-saving-${col.name}`} />
                        )}
                        {savedCol === col.name && (
                          <svg
                            data-testid={`desc-saved-${col.name}`}
                            className="w-4 h-4 shrink-0"
                            style={{ color: "var(--color-success)" }}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                      <textarea
                        data-testid={`desc-input-${col.name}`}
                        className="w-full rounded border px-2 py-1 text-sm resize-none"
                        style={{
                          backgroundColor: "var(--color-surface)",
                          borderColor: "var(--color-border)",
                          color: "var(--color-text)",
                          minHeight: "2rem",
                        }}
                        rows={1}
                        placeholder="Add a description..."
                        value={editedDescs[col.name] ?? ""}
                        onChange={(e) => {
                          setEditedDescs((prev) => ({
                            ...prev,
                            [col.name]: e.target.value,
                          }));
                        }}
                        onBlur={() => handleDescriptionSave(col.name)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            (e.target as HTMLTextAreaElement).blur();
                          }
                        }}
                        maxLength={500}
                      />
                    </div>
                  ))}
                  {columns.length === 0 && (
                    <div className="text-center py-4 text-sm opacity-50">
                      No columns available
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
