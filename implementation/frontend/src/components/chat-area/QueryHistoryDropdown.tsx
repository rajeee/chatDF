// Query history dropdown showing recent SQL queries with quick re-run
import { useState, useRef, useEffect } from "react";
import { useQueryHistoryStore } from "@/stores/queryHistoryStore";

interface QueryHistoryDropdownProps {
  onSelectQuery: (query: string) => void;
  disabled?: boolean;
}

export function QueryHistoryDropdown({ onSelectQuery, disabled }: QueryHistoryDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const queries = useQueryHistoryStore((s) => s.queries);
  const clearHistory = useQueryHistoryStore((s) => s.clearHistory);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleSelectQuery = (query: string) => {
    onSelectQuery(query);
    setIsOpen(false);
  };

  const handleClearHistory = (e: React.MouseEvent) => {
    e.stopPropagation();
    clearHistory();
    setIsOpen(false);
  };

  const hasQueries = queries.length > 0;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        aria-label="Query history"
        data-testid="query-history-button"
        className="flex-shrink-0 rounded-lg p-2 transition-all duration-150 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled || !hasQueries}
        title={hasQueries ? "Recent SQL queries" : "No query history"}
      >
        {/* Clock/History icon */}
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <circle cx="10" cy="10" r="7" />
          <path d="M10 6v4l3 2" />
        </svg>
      </button>

      {isOpen && (
        <div
          data-testid="query-history-dropdown"
          className="absolute bottom-full mb-2 right-0 w-[calc(100vw-2rem)] sm:w-96 max-h-96 overflow-y-auto rounded-lg border shadow-lg z-50"
          style={{
            backgroundColor: "var(--color-surface)",
            borderColor: "var(--color-border)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-3 py-2 border-b sticky top-0 z-10"
            style={{
              backgroundColor: "var(--color-surface)",
              borderColor: "var(--color-border)",
            }}
          >
            <span className="text-xs font-semibold">Recent SQL Queries</span>
            <button
              type="button"
              onClick={handleClearHistory}
              className="text-xs px-2 py-0.5 rounded hover:opacity-70 transition-opacity"
              style={{ color: "var(--color-error)" }}
            >
              Clear All
            </button>
          </div>

          {/* Query list */}
          <div className="py-1">
            {queries.length === 0 ? (
              <div className="px-3 py-4 text-xs text-center opacity-60">
                No query history yet
              </div>
            ) : (
              queries.map((entry, index) => (
                <button
                  key={`${entry.timestamp}-${index}`}
                  type="button"
                  onClick={() => handleSelectQuery(entry.query)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border-b last:border-b-0"
                  style={{ borderColor: "var(--color-border)" }}
                  data-testid={`query-history-item-${index}`}
                >
                  <div className="font-mono text-xs truncate" title={entry.query}>
                    {entry.query}
                  </div>
                  <div className="text-[10px] opacity-50 mt-0.5">
                    {new Date(entry.timestamp).toLocaleString()}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
