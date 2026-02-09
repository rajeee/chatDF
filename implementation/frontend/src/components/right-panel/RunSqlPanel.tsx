// RunSqlPanel — collapsible SQL editor in the right panel.
// Users can type SQL queries and execute them against loaded datasets
// using Cmd/Ctrl+Enter or the Run button.
// Includes SQL autocomplete for keywords, table names, and column names.

import { useState, useRef, useCallback, useEffect } from "react";
import { apiPost } from "@/api/client";
import { useQueryHistoryStore } from "@/stores/queryHistoryStore";
import { useSavedQueryStore } from "@/stores/savedQueryStore";
import { useSqlAutocomplete, type Suggestion } from "@/hooks/useSqlAutocomplete";

interface RunQueryResponse {
  columns: string[];
  rows: unknown[][];
  total_rows: number;
  execution_time_ms: number;
}

interface RunSqlPanelProps {
  conversationId: string;
}

export function RunSqlPanel({ conversationId }: RunSqlPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [sql, setSql] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<RunQueryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);
  const addQuery = useQueryHistoryStore((s) => s.addQuery);
  const autocomplete = useSqlAutocomplete();

  const executeQuery = useCallback(async () => {
    const trimmed = sql.trim();
    if (!trimmed || isExecuting) return;

    setIsExecuting(true);
    setError(null);
    setResult(null);

    try {
      const response = await apiPost<RunQueryResponse>(
        `/conversations/${conversationId}/query`,
        { sql: trimmed },
        60_000 // 60s timeout for potentially long queries
      );
      setResult(response);
      addQuery(trimmed);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Query execution failed";
      setError(message);
    } finally {
      setIsExecuting(false);
    }
  }, [sql, isExecuting, conversationId, addQuery]);

  // Accept an autocomplete suggestion: update sql + cursor position
  const acceptSuggestion = useCallback(
    (suggestion: Suggestion) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const cursorPos = textarea.selectionStart ?? sql.length;
      const { newValue, newCursorPos } = autocomplete.accept(sql, cursorPos, suggestion);
      setSql(newValue);
      autocomplete.close();
      // Restore cursor position after React re-renders
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      });
    },
    [sql, autocomplete]
  );

  // Scroll selected item into view in the dropdown
  useEffect(() => {
    if (!autocomplete.isOpen || !dropdownRef.current) return;
    const selected = dropdownRef.current.children[autocomplete.selectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: "nearest" });
  }, [autocomplete.selectedIndex, autocomplete.isOpen]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // When autocomplete is open, intercept navigation keys
      if (autocomplete.isOpen) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          autocomplete.moveSelection(1);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          autocomplete.moveSelection(-1);
          return;
        }
        if (e.key === "Tab" || e.key === "Enter") {
          // Tab or Enter accepts the current suggestion (unless Cmd/Ctrl+Enter)
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            // Let Cmd/Ctrl+Enter fall through to execute
            autocomplete.close();
          } else {
            e.preventDefault();
            const suggestion = autocomplete.suggestions[autocomplete.selectedIndex];
            if (suggestion) acceptSuggestion(suggestion);
            return;
          }
        }
        if (e.key === "Escape") {
          e.preventDefault();
          autocomplete.close();
          return;
        }
      }

      // Cmd/Ctrl+Enter to execute
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        executeQuery();
      }
    },
    [executeQuery, autocomplete, acceptSuggestion]
  );

  // Handle textarea input changes — update sql and trigger autocomplete
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      setSql(newValue);
      const cursorPos = e.target.selectionStart ?? newValue.length;
      autocomplete.handleInput(newValue, cursorPos, e.target);
    },
    [autocomplete]
  );

  const handleSaveQuery = useCallback(async () => {
    const trimmed = sql.trim();
    if (!trimmed) return;
    const defaultName = trimmed.replace(/\s+/g, " ").slice(0, 50);
    try {
      await useSavedQueryStore.getState().saveQuery(defaultName, trimmed, undefined, result?.execution_time_ms);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // silently fail
    }
  }, [sql, result]);

  // Format execution time for display
  const formatTime = (ms: number): string => {
    if (ms < 1) return `${ms.toFixed(2)}ms`;
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  return (
    <div
      data-testid="run-sql-panel"
      className="border-t mt-2"
      style={{ borderColor: "var(--color-border)" }}
    >
      {/* Toggle header */}
      <button
        data-testid="run-sql-toggle"
        className="w-full flex items-center gap-2 px-1 py-2 text-xs font-medium hover:opacity-80 transition-opacity"
        style={{ color: "var(--color-text)" }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <svg
          className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        Run SQL
      </button>

      {isExpanded && (
        <div className="px-1 pb-2 space-y-2">
          {/* SQL textarea with autocomplete */}
          <div className="relative">
            <textarea
              ref={textareaRef}
              data-testid="run-sql-textarea"
              className="w-full rounded border px-2 py-1.5 text-xs font-mono resize-y focus:outline-none focus:ring-1"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg)",
                color: "var(--color-text)",
                minHeight: "4rem",
                maxHeight: "12rem",
              }}
              placeholder="SELECT * FROM table_name LIMIT 10"
              value={sql}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onBlur={() => {
                // Delay close so click on suggestion can fire first
                setTimeout(() => autocomplete.close(), 150);
              }}
              rows={3}
              aria-label="SQL query input"
              role="combobox"
              aria-expanded={autocomplete.isOpen}
              aria-autocomplete="list"
              aria-controls={autocomplete.isOpen ? "sql-autocomplete-list" : undefined}
              aria-activedescendant={
                autocomplete.isOpen
                  ? `sql-autocomplete-item-${autocomplete.selectedIndex}`
                  : undefined
              }
            />

            {/* Autocomplete dropdown */}
            {autocomplete.isOpen && (
              <ul
                ref={dropdownRef}
                id="sql-autocomplete-list"
                data-testid="sql-autocomplete-dropdown"
                role="listbox"
                className="absolute left-0 right-0 z-50 mt-0.5 max-h-48 overflow-y-auto rounded border shadow-lg"
                style={{
                  backgroundColor: "var(--color-bg)",
                  borderColor: "var(--color-border)",
                }}
              >
                {autocomplete.suggestions.map((suggestion, i) => (
                  <li
                    key={`${suggestion.kind}-${suggestion.text}-${i}`}
                    id={`sql-autocomplete-item-${i}`}
                    role="option"
                    aria-selected={i === autocomplete.selectedIndex}
                    data-testid={`sql-autocomplete-item-${i}`}
                    className="flex items-center gap-1.5 px-2 py-1 text-xs cursor-pointer transition-colors"
                    style={{
                      backgroundColor:
                        i === autocomplete.selectedIndex
                          ? "var(--color-accent-light, rgba(59,130,246,0.12))"
                          : "transparent",
                      color: "var(--color-text)",
                    }}
                    onMouseDown={(e) => {
                      // Use mousedown (not click) so it fires before textarea blur
                      e.preventDefault();
                      acceptSuggestion(suggestion);
                    }}
                    onMouseEnter={() => {
                      // Not calling moveSelection here to avoid stale closure;
                      // just visual hover via CSS is sufficient alongside keyboard nav
                    }}
                  >
                    {/* Kind indicator */}
                    <span
                      className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold shrink-0"
                      style={{
                        backgroundColor:
                          suggestion.kind === "keyword"
                            ? "rgba(147,51,234,0.15)"
                            : suggestion.kind === "table"
                              ? "rgba(59,130,246,0.15)"
                              : "rgba(34,197,94,0.15)",
                        color:
                          suggestion.kind === "keyword"
                            ? "rgb(147,51,234)"
                            : suggestion.kind === "table"
                              ? "rgb(59,130,246)"
                              : "rgb(34,197,94)",
                      }}
                    >
                      {suggestion.kind === "keyword"
                        ? "K"
                        : suggestion.kind === "table"
                          ? "T"
                          : "C"}
                    </span>

                    {/* Label */}
                    <span className="font-mono truncate">{suggestion.label}</span>

                    {/* Detail (right-aligned, muted) */}
                    {suggestion.detail && (
                      <span
                        className="ml-auto text-[10px] opacity-50 truncate"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        {suggestion.detail}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              data-testid="run-sql-execute"
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded font-medium transition-colors disabled:opacity-50"
              style={{
                backgroundColor: "var(--color-accent)",
                color: "#fff",
              }}
              disabled={!sql.trim() || isExecuting}
              onClick={executeQuery}
            >
              {isExecuting ? (
                <>
                  <svg
                    className="w-3 h-3 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" opacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" />
                  </svg>
                  Running...
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  Run
                </>
              )}
            </button>
            <span
              className="text-[10px] opacity-50"
              style={{ color: "var(--color-text-muted)" }}
            >
              {navigator.platform?.includes("Mac") ? "\u2318" : "Ctrl"}+Enter
            </span>
          </div>

          {/* Error display */}
          {error && (
            <div
              data-testid="run-sql-error"
              className="rounded border px-2 py-1.5 text-xs"
              style={{
                borderColor: "var(--color-error)",
                color: "var(--color-error)",
                backgroundColor: "rgba(239, 68, 68, 0.05)",
              }}
            >
              {error}
            </div>
          )}

          {/* Results display */}
          {result && (
            <div
              data-testid="run-sql-results"
              className="rounded border overflow-hidden"
              style={{ borderColor: "var(--color-border)" }}
            >
              {/* Results header */}
              <div
                className="flex items-center justify-between px-2 py-1 border-b"
                style={{
                  borderColor: "var(--color-border)",
                  backgroundColor: "var(--color-bg)",
                }}
              >
                <span className="text-[10px] font-medium" style={{ color: "var(--color-text)" }}>
                  {result.total_rows.toLocaleString()} rows
                  {result.execution_time_ms != null && (
                    <span className="opacity-50 ml-1">
                      ({formatTime(result.execution_time_ms)})
                    </span>
                  )}
                </span>
                <button
                  data-testid="run-sql-save"
                  className="text-[10px] px-1.5 py-0.5 rounded hover:opacity-70 transition-opacity"
                  style={{ color: "var(--color-accent)" }}
                  onClick={handleSaveQuery}
                >
                  {saved ? "Saved!" : "Save Query"}
                </button>
              </div>

              {/* Results table */}
              <div className="overflow-auto" style={{ maxHeight: "12rem" }}>
                <table className="w-full text-[10px]" style={{ color: "var(--color-text)" }}>
                  <thead>
                    <tr
                      className="sticky top-0"
                      style={{ backgroundColor: "var(--color-bg)" }}
                    >
                      {result.columns.map((col, i) => (
                        <th
                          key={i}
                          className="px-1.5 py-1 text-left font-medium whitespace-nowrap border-b"
                          style={{ borderColor: "var(--color-border)" }}
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.slice(0, 100).map((row, ri) => (
                      <tr
                        key={ri}
                        className="hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
                      >
                        {row.map((cell, ci) => (
                          <td
                            key={ci}
                            className="px-1.5 py-0.5 whitespace-nowrap border-b"
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

              {/* Truncation notice */}
              {result.rows.length > 100 && (
                <div
                  className="px-2 py-1 text-[10px] opacity-50 border-t"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  Showing 100 of {result.rows.length} returned rows
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
