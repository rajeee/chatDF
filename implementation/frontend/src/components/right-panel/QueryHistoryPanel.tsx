// QueryHistoryPanel — browsable list of past SQL queries in the right panel.
// Groups entries by date (Today, Yesterday, Older).
// Supports search/filter, status filter, expand to see full SQL, copy, and run again.

import { useState, useEffect, useCallback, useMemo } from "react";
import { useQueryHistoryStore, type QueryHistoryEntry } from "@/stores/queryHistoryStore";

interface QueryHistoryPanelProps {
  onRunAgain?: (sql: string) => void;
}

/** Group label for a timestamp relative to today. */
function dateGroup(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86_400_000;

  if (timestamp >= todayStart) return "Today";
  if (timestamp >= yesterdayStart) return "Yesterday";
  return "Older";
}

/** Format a timestamp as HH:MM. */
function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Format execution time for display. */
function formatDuration(ms: number | undefined): string {
  if (ms == null) return "";
  if (ms < 1) return `${ms.toFixed(2)}ms`;
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function QueryHistoryPanel({ onRunAgain }: QueryHistoryPanelProps) {
  const queries = useQueryHistoryStore((s) => s.queries);
  const isFetching = useQueryHistoryStore((s) => s.isFetching);
  const fetchHistory = useQueryHistoryStore((s) => s.fetchHistory);
  const clearHistory = useQueryHistoryStore((s) => s.clearHistory);

  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "error">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Fetch history on mount
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Filter queries
  const filtered = useMemo(() => {
    let result = queries;

    if (searchText.trim()) {
      const lower = searchText.toLowerCase();
      result = result.filter((q) => q.query.toLowerCase().includes(lower));
    }

    if (statusFilter !== "all") {
      result = result.filter((q) => q.status === statusFilter);
    }

    return result;
  }, [queries, searchText, statusFilter]);

  // Group filtered queries by date
  const grouped = useMemo(() => {
    const groups: { label: string; entries: QueryHistoryEntry[] }[] = [];
    const map = new Map<string, QueryHistoryEntry[]>();

    for (const entry of filtered) {
      const label = dateGroup(entry.timestamp);
      if (!map.has(label)) {
        map.set(label, []);
      }
      map.get(label)!.push(entry);
    }

    // Preserve order: Today, Yesterday, Older
    for (const label of ["Today", "Yesterday", "Older"]) {
      const entries = map.get(label);
      if (entries && entries.length > 0) {
        groups.push({ label, entries });
      }
    }

    return groups;
  }, [filtered]);

  const handleCopy = useCallback(async (entry: QueryHistoryEntry) => {
    try {
      await navigator.clipboard.writeText(entry.query);
      const entryKey = entry.id ?? `${entry.timestamp}`;
      setCopiedId(entryKey);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Silently fail
    }
  }, []);

  const handleClearAll = useCallback(() => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    clearHistory();
    setConfirmClear(false);
  }, [confirmClear, clearHistory]);

  const handleToggleExpand = useCallback((entry: QueryHistoryEntry) => {
    const entryKey = entry.id ?? `${entry.timestamp}`;
    setExpandedId((prev) => (prev === entryKey ? null : entryKey));
  }, []);

  const getEntryKey = (entry: QueryHistoryEntry): string =>
    entry.id ?? `${entry.timestamp}`;

  // Loading state
  if (isFetching && queries.length === 0) {
    return (
      <div data-testid="query-history-loading" className="flex flex-col items-center justify-center py-12 px-4">
        <svg
          className="w-6 h-6 animate-spin mb-3"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{ color: "var(--color-text-muted)" }}
        >
          <circle cx="12" cy="12" r="10" opacity="0.25" />
          <path d="M12 2a10 10 0 0 1 10 10" />
        </svg>
        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          Loading query history...
        </span>
      </div>
    );
  }

  return (
    <div data-testid="query-history-panel" className="flex flex-col gap-2">
      {/* Search and filter controls */}
      <div className="flex flex-col gap-1.5">
        <input
          data-testid="query-history-search"
          type="text"
          className="w-full rounded border px-2 py-1.5 text-xs focus:outline-none focus:ring-1"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-bg)",
            color: "var(--color-text)",
          }}
          placeholder="Search queries..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <div className="flex items-center gap-1.5">
          {(["all", "success", "error"] as const).map((status) => (
            <button
              key={status}
              data-testid={`query-history-filter-${status}`}
              className="px-2 py-0.5 text-[10px] rounded border font-medium transition-colors"
              style={{
                borderColor:
                  statusFilter === status
                    ? "var(--color-accent)"
                    : "var(--color-border)",
                backgroundColor:
                  statusFilter === status
                    ? "var(--color-accent)"
                    : "transparent",
                color:
                  statusFilter === status
                    ? "#fff"
                    : "var(--color-text)",
              }}
              onClick={() => setStatusFilter(status)}
            >
              {status === "all" ? "All" : status === "success" ? "Success" : "Error"}
            </button>
          ))}
          <div className="flex-1" />
          {queries.length > 0 && (
            <button
              data-testid="query-history-clear"
              className="px-2 py-0.5 text-[10px] rounded border font-medium transition-colors"
              style={{
                borderColor: confirmClear ? "var(--color-error)" : "var(--color-border)",
                backgroundColor: confirmClear ? "rgba(239, 68, 68, 0.1)" : "transparent",
                color: confirmClear ? "var(--color-error)" : "var(--color-text-muted)",
              }}
              onClick={handleClearAll}
            >
              {confirmClear ? "Confirm Clear" : "Clear All"}
            </button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {queries.length === 0 && (
        <div
          data-testid="query-history-empty"
          className="flex flex-col items-center justify-center py-12 px-4 text-center"
        >
          <svg
            className="w-12 h-12 mb-3 opacity-20"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <p className="text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>
            No query history
          </p>
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            Queries you run will appear here
          </p>
        </div>
      )}

      {/* No results after filtering */}
      {queries.length > 0 && filtered.length === 0 && (
        <div
          data-testid="query-history-no-results"
          className="flex flex-col items-center justify-center py-8 px-4 text-center"
        >
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            No queries match your filters
          </p>
        </div>
      )}

      {/* Grouped query list */}
      {grouped.map((group) => (
        <div key={group.label} data-testid={`query-history-group-${group.label.toLowerCase()}`}>
          <div
            className="text-[10px] font-semibold uppercase tracking-wide px-1 py-1"
            style={{ color: "var(--color-text-muted)" }}
          >
            {group.label}
          </div>
          <div className="flex flex-col gap-1">
            {group.entries.map((entry) => {
              const key = getEntryKey(entry);
              const isExpanded = expandedId === key;
              const isCopied = copiedId === key;
              const isError = entry.status === "error";

              return (
                <div
                  key={key}
                  data-testid="query-history-entry"
                  className="rounded border overflow-hidden"
                  style={{
                    borderColor: isError
                      ? "rgba(239, 68, 68, 0.3)"
                      : "var(--color-border)",
                    backgroundColor: "var(--color-bg)",
                  }}
                >
                  {/* Entry header — click to expand */}
                  <button
                    data-testid="query-history-entry-toggle"
                    className="w-full flex items-start gap-1.5 px-2 py-1.5 text-left hover:opacity-80 transition-opacity"
                    onClick={() => handleToggleExpand(entry)}
                  >
                    {/* Status icon */}
                    <span className="mt-0.5 shrink-0">
                      {isError ? (
                        <svg
                          data-testid="status-icon-error"
                          className="w-3 h-3"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="rgb(239, 68, 68)"
                          strokeWidth="2"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <line x1="15" y1="9" x2="9" y2="15" />
                          <line x1="9" y1="9" x2="15" y2="15" />
                        </svg>
                      ) : (
                        <svg
                          data-testid="status-icon-success"
                          className="w-3 h-3"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="rgb(34, 197, 94)"
                          strokeWidth="2"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="9 12 11 14 15 10" />
                        </svg>
                      )}
                    </span>

                    {/* Query text (truncated) */}
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-xs font-mono truncate"
                        style={{ color: "var(--color-text)" }}
                        data-testid="query-history-entry-sql"
                      >
                        {entry.query}
                      </div>
                      <div
                        className="flex items-center gap-2 mt-0.5 text-[10px]"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        <span data-testid="query-history-entry-time">{formatTime(entry.timestamp)}</span>
                        {entry.execution_time_ms != null && (
                          <span data-testid="query-history-entry-duration">
                            {formatDuration(entry.execution_time_ms)}
                          </span>
                        )}
                        {entry.row_count != null && (
                          <span data-testid="query-history-entry-rows">
                            {entry.row_count.toLocaleString()} rows
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Expand chevron */}
                    <svg
                      className={`w-3 h-3 mt-0.5 shrink-0 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div
                      data-testid="query-history-entry-expanded"
                      className="border-t px-2 py-1.5"
                      style={{ borderColor: "var(--color-border)" }}
                    >
                      {/* Full SQL */}
                      <pre
                        className="text-xs font-mono whitespace-pre-wrap mb-2"
                        style={{ color: "var(--color-text)", lineHeight: "1.5" }}
                        data-testid="query-history-entry-full-sql"
                      >
                        {entry.query}
                      </pre>

                      {/* Error message if any */}
                      {entry.error_message && (
                        <div
                          data-testid="query-history-entry-error"
                          className="rounded px-2 py-1 text-[10px] mb-2"
                          style={{
                            backgroundColor: "rgba(239, 68, 68, 0.05)",
                            color: "var(--color-error)",
                          }}
                        >
                          {entry.error_message}
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex items-center gap-2">
                        <button
                          data-testid="query-history-copy"
                          className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded border font-medium transition-colors hover:opacity-80"
                          style={{
                            borderColor: "var(--color-border)",
                            color: "var(--color-text)",
                            backgroundColor: "transparent",
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopy(entry);
                          }}
                        >
                          <svg
                            className="w-3 h-3"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                          {isCopied ? "Copied!" : "Copy SQL"}
                        </button>
                        {onRunAgain && (
                          <button
                            data-testid="query-history-run-again"
                            className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded font-medium transition-colors"
                            style={{
                              backgroundColor: "var(--color-accent)",
                              color: "#fff",
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              onRunAgain(entry.query);
                            }}
                          >
                            <svg
                              className="w-3 h-3"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                              stroke="none"
                            >
                              <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                            Run Again
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
