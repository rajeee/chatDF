// RunSqlPanel — collapsible SQL editor in the right panel.
// Users can type SQL queries and execute them against loaded datasets
// using Cmd/Ctrl+Enter or the Run button.
// Includes SQL autocomplete for keywords, table names, and column names.
// Uses CodeMirror 6 for the SQL editor with syntax highlighting.

import { useState, useRef, useCallback, useEffect, useMemo, lazy, Suspense } from "react";
import { apiPost, explainSql, generateSql } from "@/api/client";
import { useUiStore } from "@/stores/uiStore";
import { useQueryHistoryStore } from "@/stores/queryHistoryStore";
import { useSavedQueryStore } from "@/stores/savedQueryStore";
import {
  useSqlAutocomplete,
  parseSchema,
  type Suggestion,
} from "@/hooks/useSqlAutocomplete";
import { useToastStore } from "@/stores/toastStore";
import { useDatasetStore, filterDatasetsByConversation } from "@/stores/datasetStore";
import { useChatStore } from "@/stores/chatStore";
import { formatSql } from "@/utils/sqlFormatter";
import { detectChartTypes } from "@/utils/chartDetection";
import { generateQueryTemplates, type QueryTemplate } from "@/utils/queryTemplates";

const ChartVisualization = lazy(() =>
  import("@/components/chat-area/ChartVisualization").then((m) => ({
    default: m.ChartVisualization,
  }))
);
import { useEditableCodeMirror } from "@/hooks/useEditableCodeMirror";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

interface RunQueryResponse {
  columns: string[];
  rows: unknown[][];
  total_rows: number;
  execution_time_ms: number;
  page: number;
  page_size: number;
  total_pages: number;
  limit_applied?: boolean;
}

interface RunSqlPanelProps {
  conversationId: string;
}

export function RunSqlPanel({ conversationId }: RunSqlPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [sql, setSql] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [nlQuestion, setNlQuestion] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<RunQueryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [showSavePopover, setShowSavePopover] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveFolder, setSaveFolder] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const savePopoverRef = useRef<HTMLDivElement>(null);
  const [resultCopied, setResultCopied] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pinnedQueryId, setPinnedQueryId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isExplaining, setIsExplaining] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explanationExpanded, setExplanationExpanded] = useState(true);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [sortColumn, setSortColumn] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [showTemplates, setShowTemplates] = useState(false);
  const [resultFilter, setResultFilter] = useState("");
  const [debouncedFilter, setDebouncedFilter] = useState("");
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);
  const templatesRef = useRef<HTMLDivElement>(null);
  const pendingSql = useUiStore((s) => s.pendingSql);
  const setPendingSql = useUiStore((s) => s.setPendingSql);
  const openQueryResultComparison = useUiStore((s) => s.openQueryResultComparison);
  const addQuery = useQueryHistoryStore((s) => s.addQuery);
  const autocomplete = useSqlAutocomplete();

  // Get datasets for the current conversation to generate templates
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const allDatasets = useDatasetStore((s) => s.datasets);
  const conversationDatasets = useMemo(
    () => filterDatasetsByConversation(allDatasets, activeConversationId),
    [allDatasets, activeConversationId]
  );

  // Generate templates from datasets
  const templates = useMemo(() => {
    const readyDatasets = conversationDatasets.filter((d) => d.status === "ready");
    if (readyDatasets.length === 0) return [];
    const schemas = readyDatasets.map((d) => ({
      tableName: d.name,
      columns: parseSchema(d.schema_json).map((c) => ({
        name: c.name,
        type: c.type,
      })),
    }));
    return generateQueryTemplates(schemas);
  }, [conversationDatasets]);

  // Click outside to close templates dropdown
  useEffect(() => {
    if (!showTemplates) return;
    function handleClick(e: MouseEvent) {
      if (templatesRef.current && !templatesRef.current.contains(e.target as Node)) {
        setShowTemplates(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showTemplates]);

  // Debounce the result filter input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFilter(resultFilter);
    }, 300);
    return () => clearTimeout(timer);
  }, [resultFilter]);

  // Theme detection (same approach as SQLPanel.tsx)
  const isDark = document.documentElement.classList.contains("dark");

  // Refs for callbacks passed to CodeMirror so the hook doesn't
  // need to be recreated when executeQuery/handleFormat change.
  const executeQueryRef = useRef<() => void>(() => {});
  const handleFormatRef = useRef<() => void>(() => {});

  const sortedRows = useMemo(() => {
    if (sortColumn == null || !result) return result?.rows ?? [];
    const col = sortColumn;
    const dir = sortDirection === "asc" ? 1 : -1;
    return [...result.rows].sort((a, b) => {
      const va = a[col];
      const vb = b[col];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [result, sortColumn, sortDirection]);

  const filteredRows = useMemo(() => {
    if (!debouncedFilter) return sortedRows;
    const lowerFilter = debouncedFilter.toLowerCase();
    return sortedRows.filter((row) =>
      row.some((cell) =>
        String(cell ?? "").toLowerCase().includes(lowerFilter)
      )
    );
  }, [sortedRows, debouncedFilter]);

  const handleSortClick = useCallback((colIndex: number) => {
    if (sortColumn === colIndex) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else {
        // Third click: clear sort
        setSortColumn(null);
        setSortDirection("asc");
      }
    } else {
      setSortColumn(colIndex);
      setSortDirection("asc");
    }
  }, [sortColumn, sortDirection]);

  const executeQuery = useCallback(async () => {
    const trimmed = sql.trim();
    if (!trimmed || isExecuting) return;

    setIsExecuting(true);
    setError(null);
    setResult(null);
    setCurrentPage(1);
    setSortColumn(null);
    setSortDirection("asc");
    setShowChart(false);
    setResultFilter("");
    setDebouncedFilter("");
    setPinned(false);
    setPinnedQueryId(null);

    try {
      const response = await apiPost<RunQueryResponse>(
        `/conversations/${conversationId}/query`,
        { sql: trimmed, page: 1, page_size: 100 },
        60_000 // 60s timeout for potentially long queries
      );
      setResult(response);
      setCurrentPage(response.page);
      addQuery(trimmed);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Query execution failed";
      setError(message);
    } finally {
      setIsExecuting(false);
    }
  }, [sql, isExecuting, conversationId, addQuery]);

  const fetchPage = useCallback(
    async (page: number) => {
      const trimmed = sql.trim();
      if (!trimmed || isExecuting || !result) return;

      setIsExecuting(true);
      setError(null);
      setSortColumn(null);
      setSortDirection("asc");

      try {
        const response = await apiPost<RunQueryResponse>(
          `/conversations/${conversationId}/query`,
          { sql: trimmed, page, page_size: result.page_size },
          60_000
        );
        setResult(response);
        setCurrentPage(response.page);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Query execution failed";
        setError(message);
      } finally {
        setIsExecuting(false);
      }
    },
    [sql, isExecuting, conversationId, result]
  );

  // Handle CodeMirror content changes — update sql state and trigger autocomplete
  const handleEditorChange = useCallback(
    (newValue: string, cursorPos: number) => {
      setSql(newValue);
      // Trigger autocomplete (pass a dummy textarea element; autocomplete only uses value + cursor)
      autocomplete.handleInput(
        newValue,
        cursorPos,
        document.createElement("textarea")
      );
    },
    [autocomplete]
  );

  // Stable wrappers that use refs to avoid recreating CodeMirror on callback changes
  const stableOnExecute = useCallback(() => {
    executeQueryRef.current();
  }, []);

  const stableOnFormat = useCallback(() => {
    handleFormatRef.current();
  }, []);

  // Initialize CodeMirror editable editor
  const editor = useEditableCodeMirror({
    containerRef: editorContainerRef,
    initialDoc: sql,
    isDark,
    onChange: handleEditorChange,
    onExecute: stableOnExecute,
    onFormat: stableOnFormat,
  });

  // handleFormat needs editor, so define it after the hook
  const handleFormat = useCallback(() => {
    if (!sql.trim()) return;
    const formatted = formatSql(sql);
    setSql(formatted);
    editor.setValue(formatted);
  }, [sql, editor]);

  // Keep refs up to date
  useEffect(() => {
    executeQueryRef.current = executeQuery;
  }, [executeQuery]);

  useEffect(() => {
    handleFormatRef.current = handleFormat;
  }, [handleFormat]);

  // Accept an autocomplete suggestion: update sql + cursor position via CodeMirror
  const acceptSuggestion = useCallback(
    (suggestion: Suggestion) => {
      const cursorPos = editor.getCursorPos();
      const currentSql = editor.getValue();
      const { newValue, newCursorPos } = autocomplete.accept(
        currentSql,
        cursorPos,
        suggestion
      );
      setSql(newValue);
      editor.setValue(newValue);
      autocomplete.close();
      // Set cursor after the inserted text
      requestAnimationFrame(() => {
        const view = editor.viewRef.current;
        if (view) {
          view.dispatch({
            selection: { anchor: newCursorPos },
          });
          view.focus();
        }
      });
    },
    [autocomplete, editor]
  );

  // Scroll selected item into view in the dropdown
  useEffect(() => {
    if (!autocomplete.isOpen || !dropdownRef.current) return;
    const selected = dropdownRef.current.children[
      autocomplete.selectedIndex
    ] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: "nearest" });
  }, [autocomplete.selectedIndex, autocomplete.isOpen]);

  // Consume pendingSql from uiStore (set by "Run Again" in QueryHistoryPanel)
  useEffect(() => {
    if (pendingSql != null) {
      setSql(pendingSql);
      editor.setValue(pendingSql);
      setIsExpanded(true);
      setPendingSql(null);
      // Focus the editor after React re-renders
      requestAnimationFrame(() => {
        editor.focus();
      });
    }
  }, [pendingSql, setPendingSql, editor]);

  // Handle DOM keydown on the CodeMirror container for autocomplete navigation
  const handleEditorContainerKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!autocomplete.isOpen) return;

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
          // Let Cmd/Ctrl+Enter fall through to CodeMirror execute binding
          autocomplete.close();
        } else {
          e.preventDefault();
          const suggestion =
            autocomplete.suggestions[autocomplete.selectedIndex];
          if (suggestion) acceptSuggestion(suggestion);
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        autocomplete.close();
        return;
      }
    },
    [autocomplete, acceptSuggestion]
  );

  const handleOpenSavePopover = useCallback(() => {
    const trimmed = sql.trim();
    if (!trimmed) return;
    const defaultName = trimmed.replace(/\s+/g, " ").slice(0, 50);
    setSaveName(defaultName);
    setSaveFolder("");
    setShowNewFolder(false);
    setShowSavePopover(true);
  }, [sql]);

  const handleSaveQuery = useCallback(async () => {
    const trimmed = sql.trim();
    if (!trimmed || !saveName.trim()) return;
    try {
      await useSavedQueryStore
        .getState()
        .saveQuery(saveName.trim(), trimmed, undefined, result?.execution_time_ms, saveFolder);
      setSaved(true);
      setShowSavePopover(false);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // silently fail
    }
  }, [sql, result, saveName, saveFolder]);

  const handlePinResult = useCallback(async () => {
    const trimmed = sql.trim();
    if (!trimmed || !result) return;

    if (pinned && pinnedQueryId) {
      // Already pinned — unpin it
      await useSavedQueryStore.getState().togglePin(pinnedQueryId);
      setPinned(false);
      setPinnedQueryId(null);
      useToastStore.getState().success("Result unpinned");
      return;
    }

    try {
      const autoName = `Pinned: ${trimmed.replace(/\s+/g, " ").slice(0, 30)}`;
      const saved = await useSavedQueryStore.getState().saveQuery(
        autoName,
        trimmed,
        result
          ? { columns: result.columns, rows: result.rows, total_rows: result.total_rows }
          : undefined,
        result?.execution_time_ms
      );
      await useSavedQueryStore.getState().togglePin(saved.id);
      setPinned(true);
      setPinnedQueryId(saved.id);
      useToastStore.getState().success("Result pinned");
    } catch {
      // silently fail
    }
  }, [sql, result, pinned, pinnedQueryId]);

  // Close save popover on click outside
  useEffect(() => {
    if (!showSavePopover) return;
    function handleClickOutside(e: MouseEvent) {
      if (savePopoverRef.current && !savePopoverRef.current.contains(e.target as Node)) {
        setShowSavePopover(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSavePopover]);

  const handleExplain = useCallback(async () => {
    const trimmed = sql.trim();
    if (!trimmed || isExplaining) return;

    setIsExplaining(true);
    try {
      const response = await explainSql(conversationId, trimmed);
      setExplanation(response.explanation);
      setExplanationExpanded(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to explain query";
      setExplanation(`Error: ${message}`);
      setExplanationExpanded(true);
    } finally {
      setIsExplaining(false);
    }
  }, [sql, isExplaining, conversationId]);

  const handleGenerateSql = useCallback(async () => {
    const trimmed = nlQuestion.trim();
    if (!trimmed || isGenerating) return;

    setIsGenerating(true);
    setError(null);
    try {
      const response = await generateSql(conversationId, trimmed);
      setSql(response.sql);
      editor.setValue(response.sql);
      if (response.explanation) {
        setExplanation(response.explanation);
        setExplanationExpanded(true);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to generate SQL";
      setError(message);
    } finally {
      setIsGenerating(false);
    }
  }, [nlQuestion, isGenerating, conversationId, editor]);

  // Export results as CSV or XLSX via the backend export endpoints
  const handleExport = useCallback(
    async (format: "csv" | "xlsx") => {
      if (!result) return;

      const setExporting =
        format === "csv" ? setExportingCsv : setExportingXlsx;
      setExporting(true);

      try {
        const response = await fetch(`${API_BASE}/export/${format}`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            columns: result.columns,
            rows: result.rows,
            filename: "query-results",
          }),
        });

        if (!response.ok) {
          let errorMessage = `Export failed (HTTP ${response.status})`;
          try {
            const body = await response.json();
            if (body && typeof body.error === "string") {
              errorMessage = body.error;
            }
          } catch {
            // Response was not JSON
          }
          throw new Error(errorMessage);
        }

        // Extract filename from Content-Disposition header if available
        const disposition = response.headers.get("Content-Disposition");
        let filename = `query-results.${format}`;
        if (disposition) {
          const match = disposition.match(/filename="?([^";\n]+)"?/);
          if (match?.[1]) {
            filename = match[1];
          }
        }

        // Create blob and trigger download
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Export failed";
        useToastStore.getState().error(message);
      } finally {
        setExporting(false);
      }
    },
    [result]
  );

  // Copy results to clipboard as TSV (tab-separated values)
  const handleCopyResults = useCallback(async () => {
    if (!result) return;
    const header = result.columns.join("\t");
    const body = result.rows
      .map((row) =>
        row.map((cell) => (cell == null ? "" : String(cell))).join("\t")
      )
      .join("\n");
    const tsv = header + "\n" + body;
    try {
      await navigator.clipboard.writeText(tsv);
      setResultCopied(true);
      setTimeout(() => setResultCopied(false), 2000);
    } catch {
      // clipboard write failed silently
    }
  }, [result]);

  // Format execution time for display
  const formatTime = (ms: number): string => {
    if (ms < 1) return `${ms.toFixed(2)}ms`;
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  // Spinner SVG used for export button loading states
  const spinnerSvg = (
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
  );

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
          {/* Natural language to SQL input */}
          <div className="flex gap-1.5">
            <input
              data-testid="nl-to-sql-input"
              type="text"
              className="flex-1 rounded border px-2 py-1.5 text-xs focus:outline-none focus:ring-1"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg)",
                color: "var(--color-text)",
              }}
              placeholder="Ask a question about your data..."
              value={nlQuestion}
              onChange={(e) => setNlQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleGenerateSql();
                }
              }}
            />
            <button
              data-testid="nl-to-sql-generate"
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
              style={{
                backgroundColor: "var(--color-accent)",
                color: "#fff",
              }}
              disabled={!nlQuestion.trim() || isGenerating}
              onClick={handleGenerateSql}
            >
              {isGenerating ? (
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
                  Generating...
                </>
              ) : (
                <>
                  <svg
                    className="w-3 h-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M12 2l2 7h7l-5.5 4 2 7L12 16l-5.5 4 2-7L3 9h7z" />
                  </svg>
                  Generate SQL
                </>
              )}
            </button>
          </div>

          {/* SQL CodeMirror editor with autocomplete */}
          <div className="relative">
            {/* Hidden input for test compatibility — keeps data-testid available */}
            <input
              type="hidden"
              data-testid="run-sql-textarea"
              value={sql}
              readOnly
            />
            <div
              ref={editorContainerRef}
              data-testid="run-sql-editor"
              className="w-full rounded border overflow-auto"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg)",
                color: "var(--color-text)",
                minHeight: "4rem",
                maxHeight: "12rem",
              }}
              onKeyDownCapture={handleEditorContainerKeyDown}
              onBlur={() => {
                // Delay close so click on suggestion can fire first
                setTimeout(() => autocomplete.close(), 150);
              }}
              role="combobox"
              aria-expanded={autocomplete.isOpen}
              aria-label="SQL query input"
              aria-autocomplete="list"
              aria-controls={
                autocomplete.isOpen ? "sql-autocomplete-list" : undefined
              }
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
                      // Use mousedown (not click) so it fires before editor blur
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
                    <span className="font-mono truncate">
                      {suggestion.label}
                    </span>

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
                  <svg
                    className="w-3 h-3"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    stroke="none"
                  >
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  Run
                </>
              )}
            </button>
            <button
              data-testid="run-sql-explain"
              className="flex items-center gap-1 px-2 py-1 text-[11px] rounded border font-medium transition-colors disabled:opacity-50"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "transparent",
                color: "var(--color-text)",
              }}
              disabled={!sql.trim() || isExecuting || isExplaining}
              onClick={handleExplain}
            >
              {isExplaining ? (
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
                  Explaining...
                </>
              ) : (
                "Explain"
              )}
            </button>
            <button
              data-testid="run-sql-format"
              className="flex items-center gap-1 px-2 py-1 text-[11px] rounded border font-medium transition-colors disabled:opacity-50"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "transparent",
                color: "var(--color-text)",
              }}
              disabled={!sql.trim()}
              onClick={handleFormat}
              title={`Format SQL (${navigator.platform?.includes("Mac") ? "\u2318" : "Ctrl"}+Shift+F)`}
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
                <polyline points="4 7 4 4 20 4 20 7" />
                <line x1="9" y1="20" x2="15" y2="20" />
                <line x1="12" y1="4" x2="12" y2="20" />
              </svg>
              Format
            </button>
            {/* Templates button + dropdown */}
            {templates.length > 0 && (
              <div ref={templatesRef} className="relative">
                <button
                  data-testid="run-sql-templates"
                  className="flex items-center gap-1 px-2 py-1 text-[11px] rounded border font-medium transition-colors"
                  style={{
                    borderColor: showTemplates ? "var(--color-accent)" : "var(--color-border)",
                    backgroundColor: "transparent",
                    color: showTemplates ? "var(--color-accent)" : "var(--color-text)",
                  }}
                  onClick={() => setShowTemplates((v) => !v)}
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
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                  Templates
                </button>
                {showTemplates && (
                  <div
                    data-testid="templates-dropdown"
                    className="absolute left-0 z-50 mt-1 w-72 rounded border shadow-lg overflow-hidden"
                    style={{
                      backgroundColor: "var(--color-surface, var(--color-bg))",
                      borderColor: "var(--color-border)",
                    }}
                  >
                    <div className="overflow-y-auto" style={{ maxHeight: "300px" }}>
                      {(["basic", "aggregation", "exploration", "join"] as const).map((category) => {
                        const catTemplates = templates.filter((t) => t.category === category);
                        if (catTemplates.length === 0) return null;
                        const categoryLabel =
                          category === "basic"
                            ? "Basic"
                            : category === "aggregation"
                              ? "Aggregation"
                              : category === "join"
                                ? "Cross-Table"
                                : "Exploration";
                        return (
                          <div key={category}>
                            <div
                              className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider"
                              style={{
                                color: "var(--color-text-muted)",
                                backgroundColor: "var(--color-bg)",
                              }}
                            >
                              {categoryLabel}
                            </div>
                            {catTemplates.map((tmpl, i) => (
                              <button
                                key={`${category}-${i}`}
                                data-testid={`template-item-${category}-${i}`}
                                className="w-full text-left px-2 py-1.5 text-xs transition-colors"
                                style={{ color: "var(--color-text)" }}
                                onMouseEnter={(e) => {
                                  (e.currentTarget as HTMLElement).style.backgroundColor =
                                    "var(--color-accent-light, rgba(59,130,246,0.08))";
                                }}
                                onMouseLeave={(e) => {
                                  (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                                }}
                                onClick={() => {
                                  setSql(tmpl.sql);
                                  editor.setValue(tmpl.sql);
                                  setShowTemplates(false);
                                  requestAnimationFrame(() => {
                                    editor.focus();
                                  });
                                }}
                              >
                                <div className="font-medium">{tmpl.label}</div>
                                <div
                                  className="text-[10px]"
                                  style={{ color: "var(--color-text-muted)" }}
                                >
                                  {tmpl.description}
                                </div>
                              </button>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
            <span
              className="text-[10px] opacity-50"
              style={{ color: "var(--color-text-muted)" }}
            >
              {navigator.platform?.includes("Mac") ? "\u2318" : "Ctrl"}+Enter
            </span>
          </div>

          {/* Explanation display */}
          {explanation && (
            <div
              data-testid="run-sql-explanation"
              className="rounded border"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg)",
              }}
            >
              {/* Explanation header */}
              <div
                className="flex items-center justify-between px-2 py-1 cursor-pointer select-none"
                style={{ color: "var(--color-text)" }}
                onClick={() => setExplanationExpanded(!explanationExpanded)}
              >
                <span className="text-[10px] font-medium flex items-center gap-1">
                  <svg
                    className={`w-2.5 h-2.5 transition-transform duration-200 ${explanationExpanded ? "rotate-90" : ""}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  Explanation
                </span>
                <button
                  data-testid="run-sql-explanation-dismiss"
                  className="text-[10px] px-1 py-0.5 rounded hover:opacity-70 transition-opacity"
                  style={{ color: "var(--color-text-muted)" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setExplanation(null);
                  }}
                  aria-label="Dismiss explanation"
                >
                  &times;
                </button>
              </div>
              {/* Explanation body */}
              {explanationExpanded && (
                <div
                  className="px-2 pb-2 text-xs whitespace-pre-wrap"
                  style={{ color: "var(--color-text)", lineHeight: "1.5" }}
                >
                  {explanation}
                </div>
              )}
            </div>
          )}

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
                <span
                  className="text-[10px] font-medium"
                  style={{ color: "var(--color-text)" }}
                >
                  {result.total_rows.toLocaleString()} rows
                  {result.execution_time_ms != null && (
                    <span className="opacity-50 ml-1">
                      ({formatTime(result.execution_time_ms)})
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-1.5">
                  {/* Copy to clipboard button */}
                  <button
                    data-testid="copy-results-tsv"
                    className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border hover:opacity-70 transition-opacity disabled:opacity-30"
                    style={{
                      borderColor: "var(--color-border)",
                      color: "var(--color-text)",
                      backgroundColor: "transparent",
                    }}
                    disabled={!result}
                    onClick={handleCopyResults}
                    title="Copy results as TSV"
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
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    {resultCopied ? "Copied!" : "Copy"}
                  </button>
                  {/* CSV export button */}
                  <button
                    data-testid="export-csv"
                    className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border hover:opacity-70 transition-opacity disabled:opacity-30"
                    style={{
                      borderColor: "var(--color-border)",
                      color: "var(--color-text)",
                      backgroundColor: "transparent",
                    }}
                    disabled={exportingCsv}
                    onClick={() => handleExport("csv")}
                    title="Export as CSV"
                  >
                    {exportingCsv ? (
                      spinnerSvg
                    ) : (
                      <svg
                        className="w-3 h-3"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    )}
                    CSV
                  </button>
                  {/* XLSX export button */}
                  <button
                    data-testid="export-xlsx"
                    className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border hover:opacity-70 transition-opacity disabled:opacity-30"
                    style={{
                      borderColor: "var(--color-border)",
                      color: "var(--color-text)",
                      backgroundColor: "transparent",
                    }}
                    disabled={exportingXlsx}
                    onClick={() => handleExport("xlsx")}
                    title="Export as Excel"
                  >
                    {exportingXlsx ? (
                      spinnerSvg
                    ) : (
                      <svg
                        className="w-3 h-3"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    )}
                    XLSX
                  </button>
                  {/* Save query button + popover */}
                  <div className="relative">
                    <button
                      data-testid="run-sql-save"
                      className="text-[10px] px-1.5 py-0.5 rounded hover:opacity-70 transition-opacity"
                      style={{ color: "var(--color-accent)" }}
                      onClick={saved ? undefined : handleOpenSavePopover}
                    >
                      {saved ? "Saved!" : "Save Query"}
                    </button>
                    {showSavePopover && (
                      <div
                        ref={savePopoverRef}
                        data-testid="save-query-popover"
                        className="absolute right-0 top-full mt-1 z-50 w-64 rounded border shadow-lg p-2.5 space-y-2"
                        style={{
                          backgroundColor: "var(--color-surface, var(--color-bg))",
                          borderColor: "var(--color-border)",
                        }}
                      >
                        {/* Query name */}
                        <div>
                          <label
                            className="block text-[10px] font-medium mb-0.5"
                            style={{ color: "var(--color-text-muted)" }}
                          >
                            Name
                          </label>
                          <input
                            data-testid="save-query-name"
                            type="text"
                            className="w-full rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1"
                            style={{
                              borderColor: "var(--color-border)",
                              backgroundColor: "var(--color-bg)",
                              color: "var(--color-text)",
                            }}
                            value={saveName}
                            onChange={(e) => setSaveName(e.target.value)}
                            maxLength={100}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveQuery();
                              if (e.key === "Escape") setShowSavePopover(false);
                            }}
                          />
                        </div>
                        {/* Folder selector */}
                        <div>
                          <label
                            className="block text-[10px] font-medium mb-0.5"
                            style={{ color: "var(--color-text-muted)" }}
                          >
                            Folder
                          </label>
                          {showNewFolder ? (
                            <div className="flex gap-1">
                              <input
                                data-testid="save-query-new-folder"
                                type="text"
                                className="flex-1 rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1"
                                style={{
                                  borderColor: "var(--color-border)",
                                  backgroundColor: "var(--color-bg)",
                                  color: "var(--color-text)",
                                }}
                                placeholder="New folder name..."
                                value={saveFolder}
                                onChange={(e) => setSaveFolder(e.target.value)}
                                maxLength={50}
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleSaveQuery();
                                  if (e.key === "Escape") {
                                    setShowNewFolder(false);
                                    setSaveFolder("");
                                  }
                                }}
                              />
                              <button
                                className="text-[10px] px-1.5 rounded border hover:opacity-70"
                                style={{
                                  borderColor: "var(--color-border)",
                                  color: "var(--color-text-muted)",
                                }}
                                onClick={() => {
                                  setShowNewFolder(false);
                                  setSaveFolder("");
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex gap-1">
                              <select
                                data-testid="save-query-folder-select"
                                className="flex-1 rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1"
                                style={{
                                  borderColor: "var(--color-border)",
                                  backgroundColor: "var(--color-bg)",
                                  color: "var(--color-text)",
                                }}
                                value={saveFolder}
                                onChange={(e) => setSaveFolder(e.target.value)}
                              >
                                <option value="">Uncategorized</option>
                                {useSavedQueryStore.getState().getFolders().map((f) => (
                                  <option key={f} value={f}>{f}</option>
                                ))}
                              </select>
                              <button
                                data-testid="save-query-new-folder-btn"
                                className="text-[10px] px-1.5 rounded border hover:opacity-70 whitespace-nowrap"
                                style={{
                                  borderColor: "var(--color-border)",
                                  color: "var(--color-accent)",
                                }}
                                onClick={() => setShowNewFolder(true)}
                              >
                                + New
                              </button>
                            </div>
                          )}
                        </div>
                        {/* Save / Cancel */}
                        <div className="flex justify-end gap-1.5">
                          <button
                            data-testid="save-query-cancel"
                            className="px-2 py-1 text-[10px] rounded border hover:opacity-70"
                            style={{
                              borderColor: "var(--color-border)",
                              color: "var(--color-text)",
                              backgroundColor: "transparent",
                            }}
                            onClick={() => setShowSavePopover(false)}
                          >
                            Cancel
                          </button>
                          <button
                            data-testid="save-query-confirm"
                            className="px-2 py-1 text-[10px] rounded font-medium"
                            style={{
                              backgroundColor: "var(--color-accent)",
                              color: "#fff",
                            }}
                            disabled={!saveName.trim()}
                            onClick={handleSaveQuery}
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Pin result button */}
                  <button
                    data-testid="run-sql-pin"
                    className="text-[10px] px-1.5 py-0.5 rounded hover:opacity-70 transition-opacity"
                    style={{ color: pinned ? "var(--color-text)" : "var(--color-accent)" }}
                    onClick={handlePinResult}
                  >
                    {pinned ? "Unpin" : "Pin Result"}
                  </button>
                  {/* Visualize toggle button */}
                  {detectChartTypes(result.columns, result.rows).length > 0 && (
                    <button
                      data-testid="run-sql-visualize"
                      className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border hover:opacity-70 transition-opacity"
                      style={{
                        borderColor: showChart ? "var(--color-accent)" : "var(--color-border)",
                        color: showChart ? "var(--color-accent)" : "var(--color-text)",
                        backgroundColor: "transparent",
                      }}
                      onClick={() => setShowChart((v) => !v)}
                      title={showChart ? "Hide chart" : "Visualize results"}
                    >
                      <svg
                        className="w-3 h-3"
                        viewBox="0 0 14 14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.2"
                      >
                        <rect x="1" y="6" width="3" height="7" rx="0.5" />
                        <rect x="5.5" y="2" width="3" height="11" rx="0.5" />
                        <rect x="10" y="4" width="3" height="9" rx="0.5" />
                      </svg>
                      {showChart ? "Hide" : "Chart"}
                    </button>
                  )}
                  {/* Compare button */}
                  <button
                    data-testid="run-sql-compare"
                    className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border hover:opacity-70 transition-opacity"
                    style={{
                      borderColor: "var(--color-border)",
                      color: "var(--color-text)",
                      backgroundColor: "transparent",
                    }}
                    onClick={() =>
                      openQueryResultComparison({
                        query: sql,
                        columns: result.columns,
                        rows: result.rows,
                        total_rows: result.total_rows,
                      })
                    }
                    title="Compare with another query result"
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
                      <line x1="18" y1="20" x2="18" y2="10" />
                      <line x1="12" y1="20" x2="12" y2="4" />
                      <line x1="6" y1="20" x2="6" y2="14" />
                    </svg>
                    Compare
                  </button>
                </div>
              </div>

              {/* Auto-LIMIT info banner */}
              {result.limit_applied && (
                <div
                  data-testid="limit-applied-banner"
                  className="flex items-center gap-1.5 px-2 py-1.5 text-xs border-b bg-blue-50 dark:bg-blue-900/20"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <svg
                    className="w-3.5 h-3.5 shrink-0 text-blue-500 dark:text-blue-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  <span className="text-blue-700 dark:text-blue-300">
                    Results limited to 10,000 rows. Add your own LIMIT clause to control this.
                  </span>
                </div>
              )}

              {/* Chart visualization (when toggled) */}
              {showChart && (
                <div className="border-b" style={{ borderColor: "var(--color-border)" }}>
                  <Suspense
                    fallback={
                      <div
                        className="flex items-center justify-center py-8 text-xs opacity-50"
                        style={{ color: "var(--color-text)" }}
                      >
                        Loading chart...
                      </div>
                    }
                  >
                    <ChartVisualization
                      columns={result.columns}
                      rows={result.rows}
                    />
                  </Suspense>
                </div>
              )}

              {/* Search / filter input */}
              <div className="px-2 py-1.5 border-b" style={{ borderColor: "var(--color-border)" }}>
                <div className="relative">
                  <input
                    data-testid="result-filter-input"
                    type="text"
                    className="w-full px-3 py-1.5 text-sm rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-blue-500"
                    style={{
                      borderColor: "var(--color-border)",
                      backgroundColor: "var(--color-bg)",
                      color: "var(--color-text)",
                    }}
                    placeholder="Search results..."
                    value={resultFilter}
                    onChange={(e) => setResultFilter(e.target.value)}
                  />
                  {resultFilter && (
                    <button
                      data-testid="result-filter-clear"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs px-1 py-0.5 rounded hover:opacity-70 transition-opacity"
                      style={{ color: "var(--color-text-muted)" }}
                      onClick={() => {
                        setResultFilter("");
                        setDebouncedFilter("");
                      }}
                      aria-label="Clear search"
                    >
                      &times;
                    </button>
                  )}
                </div>
                {debouncedFilter && (
                  <div
                    data-testid="result-filter-count"
                    className="mt-1 text-[10px]"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Showing {filteredRows.length} of {sortedRows.length} rows
                  </div>
                )}
              </div>

              {/* Results table */}
              <div className="overflow-auto" style={{ maxHeight: "12rem" }}>
                <table
                  className="w-full text-[10px]"
                  style={{ color: "var(--color-text)" }}
                >
                  <thead>
                    <tr
                      className="sticky top-0"
                      style={{ backgroundColor: "var(--color-bg)" }}
                    >
                      {result.columns.map((col, i) => (
                        <th
                          key={i}
                          data-testid={`sort-header-${i}`}
                          className="px-1.5 py-1 text-left font-medium whitespace-nowrap border-b cursor-pointer select-none hover:opacity-70 transition-opacity"
                          style={{ borderColor: "var(--color-border)" }}
                          onClick={() => handleSortClick(i)}
                        >
                          <span className="inline-flex items-center gap-0.5">
                            {col}
                            {sortColumn === i && (
                              <svg
                                className="w-2.5 h-2.5 shrink-0"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                data-testid={`sort-indicator-${sortDirection}`}
                              >
                                {sortDirection === "asc" ? (
                                  <polyline points="18 15 12 9 6 15" />
                                ) : (
                                  <polyline points="6 9 12 15 18 9" />
                                )}
                              </svg>
                            )}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row, ri) => (
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

              {/* Pagination controls */}
              {result.total_pages > 1 && (
                <div
                  className="flex items-center justify-between px-2 py-1 border-t"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <button
                    data-testid="pagination-prev"
                    className="text-[10px] px-1.5 py-0.5 rounded border disabled:opacity-30"
                    style={{
                      borderColor: "var(--color-border)",
                      color: "var(--color-text)",
                    }}
                    disabled={currentPage <= 1 || isExecuting}
                    onClick={() => fetchPage(currentPage - 1)}
                  >
                    Previous
                  </button>
                  <span
                    data-testid="pagination-info"
                    className="text-[10px]"
                    style={{ color: "var(--color-text)" }}
                  >
                    Page {currentPage} of {result.total_pages}
                  </span>
                  <button
                    data-testid="pagination-next"
                    className="text-[10px] px-1.5 py-0.5 rounded border disabled:opacity-30"
                    style={{
                      borderColor: "var(--color-border)",
                      color: "var(--color-text)",
                    }}
                    disabled={currentPage >= result.total_pages || isExecuting}
                    onClick={() => fetchPage(currentPage + 1)}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
