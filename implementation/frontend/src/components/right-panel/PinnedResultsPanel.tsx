// PinnedResultsPanel — shows all pinned query results in a unified view
// with quick re-run, unpin, and copy capabilities.

import { useEffect, useCallback, useMemo } from "react";
import { useSavedQueryStore, type SavedQuery } from "@/stores/savedQueryStore";
import { useUiStore } from "@/stores/uiStore";
import { useToastStore } from "@/stores/toastStore";

/** Format a date string as a relative time (e.g. "2h ago", "3d ago"). */
function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return "just now";

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

/** Format execution time for display. */
function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "";
  if (ms < 1) return `${ms.toFixed(2)}ms`;
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function PinnedResultsPanel() {
  const queries = useSavedQueryStore((s) => s.queries);
  const isLoading = useSavedQueryStore((s) => s.isLoading);
  const fetchQueries = useSavedQueryStore((s) => s.fetchQueries);
  const togglePin = useSavedQueryStore((s) => s.togglePin);
  const setPendingSql = useUiStore((s) => s.setPendingSql);
  const setRightPanelTab = useUiStore((s) => s.setRightPanelTab);

  // Fetch queries on mount if not already loaded
  useEffect(() => {
    if (queries.length === 0 && !isLoading) {
      fetchQueries();
    }
  }, [queries.length, isLoading, fetchQueries]);

  // Filter and sort pinned queries (most recently created first)
  const pinnedQueries = useMemo(() => {
    return queries
      .filter((q) => q.is_pinned)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [queries]);

  const handleUnpin = useCallback(
    async (id: string) => {
      await togglePin(id);
      useToastStore.getState().success("Result unpinned");
    },
    [togglePin]
  );

  const handleRunAgain = useCallback(
    (sql: string) => {
      setPendingSql(sql);
      setRightPanelTab("datasets");
    },
    [setPendingSql, setRightPanelTab]
  );

  const handleCopySql = useCallback(async (sql: string) => {
    try {
      await navigator.clipboard.writeText(sql);
      useToastStore.getState().success("SQL copied to clipboard");
    } catch {
      // Silently fail
    }
  }, []);

  // Loading state
  if (isLoading && queries.length === 0) {
    return (
      <div
        data-testid="pinned-results-loading"
        className="flex flex-col items-center justify-center py-12 px-4"
      >
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
          Loading pinned results...
        </span>
      </div>
    );
  }

  // Empty state
  if (pinnedQueries.length === 0) {
    return (
      <div
        data-testid="pinned-results-empty"
        className="flex flex-col items-center justify-center py-12 px-4 text-center"
      >
        <svg
          className="w-12 h-12 mb-3 opacity-20"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 2l0 5M5 12l14 0M12 22l0-5M9 7l1.5 5H12h1.5L15 7a3 3 0 0 0-6 0z"
          />
          <line x1="12" y1="17" x2="12" y2="22" strokeLinecap="round" />
        </svg>
        <p
          className="text-sm font-medium mb-1"
          style={{ color: "var(--color-text)" }}
        >
          No pinned results yet
        </p>
        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          Pin query results to keep them handy for comparison.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="pinned-results-panel" className="flex flex-col gap-2">
      <div
        className="text-[10px] font-semibold uppercase tracking-wide px-1 py-1"
        style={{ color: "var(--color-text-muted)" }}
      >
        {pinnedQueries.length} pinned result{pinnedQueries.length !== 1 ? "s" : ""}
      </div>

      {pinnedQueries.map((query) => (
        <PinnedQueryCard
          key={query.id}
          query={query}
          onUnpin={handleUnpin}
          onRunAgain={handleRunAgain}
          onCopySql={handleCopySql}
        />
      ))}
    </div>
  );
}

interface PinnedQueryCardProps {
  query: SavedQuery;
  onUnpin: (id: string) => void;
  onRunAgain: (sql: string) => void;
  onCopySql: (sql: string) => void;
}

function PinnedQueryCard({ query, onUnpin, onRunAgain, onCopySql }: PinnedQueryCardProps) {
  const truncatedSql =
    query.query.length > 80 ? query.query.slice(0, 80) + "..." : query.query;

  return (
    <div
      data-testid="pinned-query-card"
      className="rounded border overflow-hidden"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-bg)",
      }}
    >
      {/* Header */}
      <div className="px-2 py-1.5">
        {/* Query name */}
        <div
          className="text-xs font-semibold truncate"
          style={{ color: "var(--color-text)" }}
          data-testid="pinned-query-name"
        >
          {query.name}
        </div>

        {/* SQL text */}
        <div
          className="text-[10px] font-mono mt-0.5 truncate"
          style={{ color: "var(--color-text-muted)" }}
          data-testid="pinned-query-sql"
          title={query.query}
        >
          {truncatedSql}
        </div>

        {/* Meta row: execution time + created date */}
        <div
          className="flex items-center gap-2 mt-1 text-[10px]"
          style={{ color: "var(--color-text-muted)" }}
        >
          {query.execution_time_ms != null && (
            <span
              data-testid="pinned-query-duration"
              className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded"
              style={{ backgroundColor: "rgba(59,130,246,0.08)" }}
            >
              {formatDuration(query.execution_time_ms)}
            </span>
          )}
          <span data-testid="pinned-query-date">
            {relativeTime(query.created_at)}
          </span>
        </div>
      </div>

      {/* Mini data preview */}
      {query.result_data && query.result_data.columns.length > 0 && (
        <div
          data-testid="pinned-query-preview"
          className="border-t overflow-auto"
          style={{
            borderColor: "var(--color-border)",
            maxHeight: "5rem",
          }}
        >
          <table
            className="w-full text-[9px]"
            style={{ color: "var(--color-text)" }}
          >
            <thead>
              <tr style={{ backgroundColor: "var(--color-bg)" }}>
                {query.result_data.columns.map((col, i) => (
                  <th
                    key={i}
                    className="px-1 py-0.5 text-left font-medium whitespace-nowrap border-b"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {query.result_data.rows.slice(0, 3).map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className="px-1 py-0.5 whitespace-nowrap border-b"
                      style={{ borderColor: "var(--color-border)" }}
                    >
                      {cell == null ? (
                        <span className="opacity-30 italic">null</span>
                      ) : (
                        String(cell)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Action buttons */}
      <div
        className="flex items-center gap-1.5 px-2 py-1.5 border-t"
        style={{ borderColor: "var(--color-border)" }}
      >
        <button
          data-testid="pinned-query-unpin"
          className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded border font-medium transition-colors hover:opacity-80"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-text)",
            backgroundColor: "transparent",
          }}
          onClick={() => onUnpin(query.id)}
        >
          <svg
            className="w-3 h-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          Unpin
        </button>
        <button
          data-testid="pinned-query-run-again"
          className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded font-medium transition-colors"
          style={{
            backgroundColor: "var(--color-accent)",
            color: "#fff",
          }}
          onClick={() => onRunAgain(query.query)}
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
        <button
          data-testid="pinned-query-copy-sql"
          className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded border font-medium transition-colors hover:opacity-80"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-text)",
            backgroundColor: "transparent",
          }}
          onClick={() => onCopySql(query.query)}
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
          Copy SQL
        </button>
      </div>
    </div>
  );
}
