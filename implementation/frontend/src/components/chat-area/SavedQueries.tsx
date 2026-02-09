import { useEffect, useCallback, useState, useMemo, useRef } from "react";
import { useSavedQueryStore, type SavedQuery, type SavedQueryResultData } from "@/stores/savedQueryStore";
import { useUiStore } from "@/stores/uiStore";
import type { SqlExecution } from "@/stores/chatStore";

/** Max rows shown in the inline preview table. */
const INLINE_PREVIEW_ROWS = 5;

/** Format execution time for display: <1000ms as "Xms", >=1000ms as "X.Xs". */
function formatExecTime(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Compact inline table preview for bookmarked query results. */
function InlineResultPreview({ resultData, queryId }: { resultData: SavedQueryResultData; queryId: string }) {
  const [copiedCsv, setCopiedCsv] = useState(false);
  const previewRows = resultData.rows.slice(0, INLINE_PREVIEW_ROWS);
  const hasMore = resultData.rows.length > INLINE_PREVIEW_ROWS;

  const handleCopyCsv = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const header = resultData.columns.join(",");
    const rows = resultData.rows.map((row) =>
      row.map((cell) => {
        const val = String(cell ?? "");
        return val.includes(",") || val.includes('"') || val.includes("\n")
          ? `"${val.replace(/"/g, '""')}"`
          : val;
      }).join(",")
    ).join("\n");
    await navigator.clipboard.writeText(`${header}\n${rows}`);
    setCopiedCsv(true);
    setTimeout(() => setCopiedCsv(false), 1500);
  }, [resultData]);

  return (
    <div
      data-testid={`inline-preview-${queryId}`}
      className="mt-1 rounded border overflow-hidden"
      style={{ borderColor: "var(--color-border)" }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr style={{ backgroundColor: "var(--color-bg-secondary, var(--color-bg-subtle, rgba(0,0,0,0.03)))" }}>
              {resultData.columns.map((col, i) => (
                <th
                  key={i}
                  className="px-2 py-1 text-left font-medium whitespace-nowrap border-b"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, ri) => (
              <tr key={ri} className="hover:bg-black/[0.02] dark:hover:bg-white/[0.03]">
                {resultData.columns.map((_, ci) => (
                  <td
                    key={ci}
                    className="px-2 py-0.5 whitespace-nowrap border-b"
                    style={{ borderColor: "var(--color-border)", maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis" }}
                  >
                    {row[ci] == null ? <span className="opacity-30">null</span> : String(row[ci])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div
        className="flex items-center justify-between px-2 py-1 text-[9px] opacity-60"
        style={{ backgroundColor: "var(--color-bg-secondary, var(--color-bg-subtle, rgba(0,0,0,0.03)))" }}
      >
        <span>
          {hasMore
            ? `Showing ${INLINE_PREVIEW_ROWS} of ${resultData.total_rows.toLocaleString()} rows`
            : `${resultData.rows.length} row${resultData.rows.length !== 1 ? "s" : ""}`}
        </span>
        <button
          data-testid={`copy-csv-${queryId}`}
          className="hover:opacity-100 opacity-60 transition-opacity"
          onClick={handleCopyCsv}
        >
          {copiedCsv ? "Copied!" : "Copy as CSV"}
        </button>
      </div>
    </div>
  );
}

/** Folder move dropdown for a single query item. */
function FolderDropdown({ queryId, currentFolder, folders }: { queryId: string; currentFolder: string; folders: string[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const moveToFolder = useSavedQueryStore((s) => s.moveToFolder);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleMove = useCallback(async (folder: string) => {
    setOpen(false);
    if (folder !== currentFolder) {
      await moveToFolder(queryId, folder);
    }
  }, [queryId, currentFolder, moveToFolder]);

  return (
    <div ref={ref} className="relative">
      <button
        data-testid={`folder-dropdown-${queryId}`}
        className="opacity-0 group-hover:opacity-60 hover:!opacity-100 p-0.5 rounded transition-opacity"
        style={{ color: "var(--color-text-muted)" }}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        aria-label="Move to folder"
        title="Move to folder"
      >
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      </button>
      {open && (
        <div
          data-testid={`folder-menu-${queryId}`}
          className="absolute right-0 top-full mt-0.5 z-50 w-36 rounded border shadow-lg overflow-hidden"
          style={{
            backgroundColor: "var(--color-surface, var(--color-bg))",
            borderColor: "var(--color-border)",
          }}
        >
          <button
            className="w-full text-left px-2 py-1 text-[10px] transition-colors hover:bg-black/5 dark:hover:bg-white/5"
            style={{
              color: currentFolder === "" ? "var(--color-accent)" : "var(--color-text)",
              fontWeight: currentFolder === "" ? 600 : 400,
            }}
            onClick={() => handleMove("")}
          >
            Uncategorized
          </button>
          {folders.map((f) => (
            <button
              key={f}
              className="w-full text-left px-2 py-1 text-[10px] transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              style={{
                color: currentFolder === f ? "var(--color-accent)" : "var(--color-text)",
                fontWeight: currentFolder === f ? 600 : 400,
              }}
              onClick={() => handleMove(f)}
            >
              {f}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface SavedQueriesProps {
  onRunQuery?: (query: string) => void;
}

/** Single saved query item row. */
function SavedQueryItem({
  q,
  copiedId,
  previewId,
  folders,
  onCopy,
  onTogglePreview,
  onRunQuery,
}: {
  q: SavedQuery;
  copiedId: string | null;
  previewId: string | null;
  folders: string[];
  onCopy: (query: string, id: string) => void;
  onTogglePreview: (id: string, e: React.MouseEvent) => void;
  onRunQuery?: (query: string) => void;
}) {
  const deleteQuery = useSavedQueryStore((s) => s.deleteQuery);
  const togglePin = useSavedQueryStore((s) => s.togglePin);

  const handleViewResults = useCallback((query: string, resultData: { columns: string[]; rows: unknown[][]; total_rows: number }) => {
    const execution: SqlExecution = {
      query,
      columns: resultData.columns,
      rows: resultData.rows,
      total_rows: resultData.total_rows,
      error: null,
      execution_time_ms: null,
    };
    const { openSqlModal, openSqlResultModal } = useUiStore.getState();
    openSqlModal([execution]);
    openSqlResultModal(0);
  }, []);

  return (
    <div key={q.id}>
      <div
        data-testid={`saved-query-${q.id}`}
        className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors group${q.is_pinned ? " bg-blue-50/50 dark:bg-blue-900/10" : ""}`}
        style={{ color: "var(--color-text)" }}
        onClick={() => onCopy(q.query, q.id)}
      >
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">
            {q.name}
            {q.result_data && (
              <span
                className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-normal"
                style={{
                  backgroundColor: "var(--color-accent)",
                  color: "#fff",
                  opacity: 0.8,
                }}
              >
                {q.result_data.total_rows} rows
              </span>
            )}
            {q.execution_time_ms != null && (
              <span
                data-testid={`exec-time-${q.id}`}
                className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-normal"
                style={{
                  backgroundColor: "var(--color-bg-secondary, rgba(0,0,0,0.06))",
                  color: "var(--color-text-secondary, var(--color-text))",
                  opacity: 0.7,
                }}
              >
                {formatExecTime(q.execution_time_ms)}
              </span>
            )}
          </div>
          <div className="font-mono opacity-50 truncate text-[10px]">{q.query}</div>
        </div>
        <span className="text-[10px] opacity-40 shrink-0">
          {copiedId === q.id ? "Copied!" : ""}
        </span>
        {q.result_data && (
          <button
            data-testid={`preview-toggle-${q.id}`}
            className={`p-0.5 rounded transition-opacity ${previewId === q.id ? "opacity-100" : "opacity-0 group-hover:opacity-60 hover:!opacity-100"}`}
            style={{ color: "var(--color-accent)" }}
            onClick={(e) => onTogglePreview(q.id, e)}
            aria-label={`${previewId === q.id ? "Hide" : "Preview"} results for ${q.name}`}
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {previewId === q.id ? (
                <>
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </>
              ) : (
                <>
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </>
              )}
            </svg>
          </button>
        )}
        {q.result_data && (
          <button
            data-testid={`view-results-${q.id}`}
            className="opacity-0 group-hover:opacity-60 hover:!opacity-100 p-0.5 rounded transition-opacity"
            style={{ color: "var(--color-accent)" }}
            onClick={(e) => { e.stopPropagation(); handleViewResults(q.query, q.result_data!); }}
            aria-label={`View full results for ${q.name}`}
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18" />
              <path d="M9 3v18" />
            </svg>
          </button>
        )}
        <button
          data-testid={`pin-saved-query-${q.id}`}
          className={`p-0.5 rounded transition-opacity ${q.is_pinned ? "opacity-100" : "opacity-0 group-hover:opacity-60 hover:!opacity-100"}`}
          style={{ color: q.is_pinned ? "var(--color-accent)" : "var(--color-text-muted)" }}
          onClick={(e) => { e.stopPropagation(); togglePin(q.id); }}
          aria-label={q.is_pinned ? `Unpin ${q.name}` : `Pin ${q.name}`}
          title={q.is_pinned ? "Unpin query" : "Pin query"}
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill={q.is_pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 4.5L19.5 9l-3 3 1.5 7.5L12 13.5 5.5 20l2-7.5-3.5-3L9 4.5 12 2l3 2.5z" />
          </svg>
        </button>
        <FolderDropdown queryId={q.id} currentFolder={q.folder} folders={folders} />
        {onRunQuery && (
          <button
            data-testid={`run-saved-query-${q.id}`}
            className="opacity-0 group-hover:opacity-60 hover:!opacity-100 p-0.5 rounded transition-opacity"
            style={{ color: "var(--color-accent)" }}
            onClick={(e) => { e.stopPropagation(); onRunQuery(q.query); }}
            aria-label={`Run saved query ${q.name}`}
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </button>
        )}
        <button
          data-testid={`delete-saved-query-${q.id}`}
          className="opacity-0 group-hover:opacity-60 hover:!opacity-100 p-0.5 rounded transition-opacity"
          style={{ color: "var(--color-error)" }}
          onClick={(e) => { e.stopPropagation(); deleteQuery(q.id); }}
          aria-label={`Delete saved query ${q.name}`}
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
        </button>
      </div>
      {/* Inline result preview */}
      {previewId === q.id && q.result_data && (
        <InlineResultPreview resultData={q.result_data} queryId={q.id} />
      )}
    </div>
  );
}

export function SavedQueries({ onRunQuery }: SavedQueriesProps) {
  const { queries, isLoading, fetchQueries } = useSavedQueryStore();
  const getFolders = useSavedQueryStore((s) => s.getFolders);
  const [expanded, setExpanded] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchQueries();
  }, [fetchQueries]);

  const handleCopy = useCallback(async (query: string, id: string) => {
    await navigator.clipboard.writeText(query);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }, []);

  const togglePreview = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPreviewId((prev) => (prev === id ? null : id));
  }, []);

  const toggleFolder = useCallback((folder: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) {
        next.delete(folder);
      } else {
        next.add(folder);
      }
      return next;
    });
  }, []);

  // Group queries by folder
  const folders = useMemo(() => getFolders(), [getFolders, queries]);
  const grouped = useMemo(() => {
    const groups: { label: string; folder: string; queries: SavedQuery[] }[] = [];
    const byFolder = new Map<string, SavedQuery[]>();

    for (const q of queries) {
      const key = q.folder || "";
      if (!byFolder.has(key)) byFolder.set(key, []);
      byFolder.get(key)!.push(q);
    }

    // Named folders first (sorted), then uncategorized
    for (const f of folders) {
      const fQueries = byFolder.get(f);
      if (fQueries && fQueries.length > 0) {
        groups.push({ label: f, folder: f, queries: fQueries });
      }
    }

    // Uncategorized (empty folder) last
    const uncategorized = byFolder.get("");
    if (uncategorized && uncategorized.length > 0) {
      groups.push({ label: "Uncategorized", folder: "", queries: uncategorized });
    }

    return groups;
  }, [queries, folders]);

  const hasMultipleFolders = grouped.length > 1;

  if (queries.length === 0 && !isLoading) return null;

  return (
    <div
      data-testid="saved-queries"
      className="border-t"
      style={{ borderColor: "var(--color-border)" }}
    >
      <button
        data-testid="saved-queries-toggle"
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium hover:opacity-80 transition-opacity"
        style={{ color: "var(--color-text)" }}
        onClick={() => setExpanded(!expanded)}
      >
        <svg
          className={`w-3 h-3 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        Saved Queries ({queries.length})
      </button>
      {expanded && (
        <div className="px-3 pb-2 space-y-1">
          {hasMultipleFolders ? (
            // Grouped by folder
            grouped.map((group) => {
              const isCollapsed = collapsedFolders.has(group.folder);
              return (
                <div key={group.folder} data-testid={`saved-query-folder-${group.folder || "uncategorized"}`}>
                  {/* Folder header */}
                  <button
                    data-testid={`folder-header-${group.folder || "uncategorized"}`}
                    className="w-full flex items-center gap-1.5 px-1 py-1 text-[10px] font-semibold uppercase tracking-wide hover:opacity-80 transition-opacity"
                    style={{ color: "var(--color-text-muted)" }}
                    onClick={() => toggleFolder(group.folder)}
                  >
                    <svg
                      className={`w-2.5 h-2.5 transition-transform duration-150 ${isCollapsed ? "" : "rotate-90"}`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                    {group.label}
                    <span className="font-normal opacity-60">({group.queries.length})</span>
                  </button>
                  {/* Folder content */}
                  {!isCollapsed && (
                    <div className="ml-1 space-y-0.5">
                      {group.queries.map((q) => (
                        <SavedQueryItem
                          key={q.id}
                          q={q}
                          copiedId={copiedId}
                          previewId={previewId}
                          folders={folders}
                          onCopy={handleCopy}
                          onTogglePreview={togglePreview}
                          onRunQuery={onRunQuery}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            // Flat list (single folder or no folders)
            queries.map((q) => (
              <SavedQueryItem
                key={q.id}
                q={q}
                copiedId={copiedId}
                previewId={previewId}
                folders={folders}
                onCopy={handleCopy}
                onTogglePreview={togglePreview}
                onRunQuery={onRunQuery}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
