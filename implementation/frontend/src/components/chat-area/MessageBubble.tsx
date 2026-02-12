// Implements: spec/frontend/chat_area/message_list/plan.md#rendering-strategy
//
// Renders a single message bubble. User messages: right-aligned, accent bg, plain text.
// Assistant messages: left-aligned, surface bg, markdown rendered.
// Per-message actions: copy button, "Show SQL" button, "Show Reasoning" button, timestamp on hover.

import { memo, useMemo, useState, useCallback, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { useChatStore, type Message, type SqlExecution } from "@/stores/chatStore";
import { useUiStore } from "@/stores/uiStore";
import { useDevModeStore } from "@/stores/devModeStore";
import { useBookmarkStore } from "@/stores/bookmarkStore";
import { CodeBlock } from "./CodeBlock";
import { StreamingMessage } from "./StreamingMessage";
import { ChartVisualization } from "./ChartVisualization";
import { detectChartTypes } from "@/utils/chartDetection";
import { highlightText } from "@/utils/highlightText";
import { downloadCsv } from "@/utils/csvExport";
import { downloadExcel } from "@/utils/excelExport";

/** Recursively highlight text nodes within React children */
function highlightChildren(children: React.ReactNode, query: string): React.ReactNode {
  if (!children) return children;
  if (typeof children === "string") return highlightText(children, query);
  if (Array.isArray(children)) {
    return children.map((child, i) => {
      if (typeof child === "string") return <span key={i}>{highlightText(child, query)}</span>;
      return child;
    });
  }
  return children;
}

interface MessageBubbleProps {
  message: Message;
  isCurrentlyStreaming: boolean;
  staggerIndex?: number;
  onShowSQL: (executions: SqlExecution[]) => void;
  onShowReasoning: (reasoning: string) => void;
  onCopy: (content: string) => void;
  onVisualize: (executions: SqlExecution[], index: number) => void;
  onRetry?: (messageId: string, content: string) => void;
  onFork?: (messageId: string) => void;
  onBranch?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  onRedo?: (messageId: string) => void;
  searchQuery?: string;
}

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return date.toLocaleDateString();
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function MessageBubbleComponent({
  message,
  isCurrentlyStreaming,
  staggerIndex,
  onShowSQL,
  onShowReasoning,
  onCopy,
  onVisualize,
  onRetry,
  onFork,
  onBranch,
  onDelete,
  onRedo,
  searchQuery,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const messageDensity = useUiStore((s) => s.messageDensity);
  const devMode = useDevModeStore((s) => s.devMode);
  const reasoningContent = message.reasoning;

  // Bookmark state
  const isMessageBookmarked = useBookmarkStore((s) => s.isBookmarked(message.id));
  const addBookmark = useBookmarkStore((s) => s.addBookmark);
  const removeBookmarkAction = useBookmarkStore((s) => s.removeBookmark);
  const getBookmarkByMessageId = useBookmarkStore((s) => s.getBookmarkByMessageId);
  const activeConversationId = useChatStore((s) => s.activeConversationId);

  // Find the first sql_execution that has chartable data
  const visualizableIndex = useMemo(() => {
    for (let i = 0; i < message.sql_executions.length; i++) {
      const exec = message.sql_executions[i];
      if (exec.columns && exec.rows && detectChartTypes(exec.columns, exec.rows).length > 0) {
        return i;
      }
    }
    return -1;
  }, [message.sql_executions]);

  const [sqlExpanded, setSqlExpanded] = useState(false);
  const [traceExpanded, setTraceExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [forked, setForked] = useState(false);
  const [branched, setBranched] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopyClick = useCallback(() => {
    onCopy(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [onCopy, message.content]);

  const handleForkClick = useCallback(() => {
    if (onFork) {
      onFork(message.id);
      setForked(true);
      setTimeout(() => setForked(false), 1500);
    }
  }, [onFork, message.id]);

  const handleBranchClick = useCallback(() => {
    if (onBranch) {
      onBranch(message.id);
      setBranched(true);
      setTimeout(() => setBranched(false), 1500);
    }
  }, [onBranch, message.id]);

  const handleBookmarkClick = useCallback(() => {
    if (isMessageBookmarked) {
      const existing = getBookmarkByMessageId(message.id);
      if (existing) removeBookmarkAction(existing.id);
    } else {
      const sql = message.sql_executions.map((e) => e.query).join(";\n");
      const title = message.content.slice(0, 50).trim() || "Untitled query";
      addBookmark({
        messageId: message.id,
        conversationId: activeConversationId ?? "",
        sql,
        title,
        tags: [],
      });
    }
  }, [isMessageBookmarked, message.id, message.content, message.sql_executions, activeConversationId, addBookmark, removeBookmarkAction, getBookmarkByMessageId]);

  const handleDeleteClick = useCallback(() => {
    if (!onDelete) return;
    if (deleteConfirm) {
      // Second click within 2s — actually delete
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
      setDeleteConfirm(false);
      onDelete(message.id);
    } else {
      // First click — show confirmation
      setDeleteConfirm(true);
      deleteTimerRef.current = setTimeout(() => {
        setDeleteConfirm(false);
        deleteTimerRef.current = null;
      }, 2000);
    }
  }, [onDelete, message.id, deleteConfirm]);

  return (
    <div
      data-testid={`message-row-${message.id}`}
      className={`flex flex-col ${isUser ? "items-end" : "items-start"} group ${
        staggerIndex !== undefined ? "message-cascade" : "message-appear"
      }`}
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: "auto 100px",
        ...(staggerIndex !== undefined ? { "--stagger-index": staggerIndex } as React.CSSProperties : {}),
      }}
    >
      <div
        data-testid={`message-bubble-${message.id}`}
        className={`relative max-w-[80%] rounded-lg break-words ${
          ({
            compact: "px-3 py-1 text-xs",
            normal: "px-4 py-2 text-sm",
            spacious: "px-5 py-3 text-sm",
          })[messageDensity]
        }`}
        style={{
          backgroundColor: isUser ? "var(--color-accent)" : "var(--color-surface)",
          color: isUser ? "var(--color-white)" : "var(--color-text)",
          border: isUser ? "none" : "1px solid var(--color-border)",
          boxShadow: isUser ? "none" : "0 1px 2px var(--color-shadow)",
        }}
      >
        {/* Message content - use StreamingMessage component for active streaming, otherwise show finalized content */}
        {isUser ? (
          <span className="break-words">
            {searchQuery ? highlightText(message.content, searchQuery) : message.content}
          </span>
        ) : isCurrentlyStreaming ? (
          <StreamingMessage messageId={message.id} />
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none break-words">
            <ReactMarkdown
              components={{
                code: CodeBlock,
                // Custom p renderer to prevent wrapping code blocks in <p> tags
                p: ({ children }) => {
                  // If the only child is a code block (div element), render it without <p> wrapper
                  if (
                    children &&
                    typeof children === "object" &&
                    "type" in children &&
                    children.type === "div"
                  ) {
                    return <>{children}</>;
                  }
                  // Highlight search matches within paragraph text nodes
                  if (searchQuery) {
                    return <p>{highlightChildren(children, searchQuery)}</p>;
                  }
                  return <p>{children}</p>;
                },
                // Highlight in list items, headings, etc.
                li: ({ children }) => {
                  if (searchQuery) {
                    return <li>{highlightChildren(children, searchQuery)}</li>;
                  }
                  return <li>{children}</li>;
                },
                strong: ({ children }) => {
                  if (searchQuery) {
                    return <strong>{highlightChildren(children, searchQuery)}</strong>;
                  }
                  return <strong>{children}</strong>;
                },
                em: ({ children }) => {
                  if (searchQuery) {
                    return <em>{highlightChildren(children, searchQuery)}</em>;
                  }
                  return <em>{children}</em>;
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {/* Failed send indicator with retry button */}
        {isUser && message.sendFailed && onRetry && (
          <div
            data-testid={`retry-send-${message.id}`}
            className="mt-1.5 flex items-center gap-2 text-xs"
            style={{ color: "rgba(255,255,255,0.9)" }}
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>Failed to send</span>
            <button
              data-testid={`retry-btn-${message.id}`}
              className="underline font-medium hover:opacity-80 active:scale-95 transition-all px-1 py-0.5"
              onClick={() => onRetry(message.id, message.content)}
            >
              Retry
            </button>
          </div>
        )}

        {/* Inline SQL preview - collapsed by default */}
        {!isUser && !isCurrentlyStreaming && message.sql_executions.length > 0 && (
          <div
            data-testid={`sql-preview-${message.id}`}
            className="mt-2 rounded overflow-hidden text-xs"
            style={{
              backgroundColor: "var(--color-bg)",
              border: "1px solid var(--color-border)",
            }}
          >
            <button
              data-testid={`sql-preview-toggle-${message.id}`}
              className="w-full flex items-center gap-1.5 px-2 py-1 text-left opacity-60 hover:opacity-100 transition-opacity"
              style={{ color: "var(--color-text)" }}
              onClick={() => setSqlExpanded(!sqlExpanded)}
            >
              <svg
                className={`w-3 h-3 transition-transform duration-200 ${sqlExpanded ? "rotate-90" : ""}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
              <span className="font-mono opacity-70">SQL</span>
              {message.sql_executions.length > 1 && (
                <span className="opacity-40">({message.sql_executions.length} queries)</span>
              )}
              {(() => {
                const totalMs = message.sql_executions.reduce((sum, e) => sum + (e.execution_time_ms ?? 0), 0);
                if (totalMs <= 0) return null;
                const formatted = totalMs < 1 ? `${totalMs.toFixed(2)}ms` : totalMs < 1000 ? `${totalMs.toFixed(0)}ms` : `${(totalMs / 1000).toFixed(2)}s`;
                return (
                  <span data-testid={`sql-time-badge-${message.id}`} className="opacity-40 ml-auto font-mono tabular-nums">
                    {formatted}
                  </span>
                );
              })()}
              {(() => {
                const totalRows = message.sql_executions.reduce(
                  (sum, e) => sum + (e.total_rows ?? e.rows?.length ?? 0), 0
                );
                if (totalRows <= 0) return null;
                return (
                  <span
                    data-testid={`sql-rows-badge-${message.id}`}
                    className="opacity-40 font-mono tabular-nums text-[10px] px-1.5 py-0.5 rounded-full"
                    style={{ backgroundColor: "var(--color-border)" }}
                  >
                    {totalRows.toLocaleString()} rows
                  </span>
                );
              })()}
            </button>
            {/* SQL preview content with smooth expand/collapse */}
            <div
              data-testid={`sql-preview-content-${message.id}`}
              style={{
                maxHeight: sqlExpanded ? "200px" : "0px",
                opacity: sqlExpanded ? 1 : 0,
                overflow: "hidden",
                transition: "max-height 200ms ease, opacity 200ms ease",
              }}
            >
              <pre
                className="px-2 py-1.5 overflow-x-auto font-mono border-t"
                style={{
                  borderColor: "var(--color-border)",
                  color: "var(--color-text)",
                  fontSize: "0.7rem",
                  lineHeight: "1.4",
                  maxHeight: "120px",
                  overflowY: "auto",
                }}
              >
                {message.sql_executions.map((exec, i) => exec.query).join(";\n\n")}
              </pre>
              {/* Quick export buttons */}
              {message.sql_executions.some(e => e.columns && e.rows && e.rows.length > 0) && (
                <div
                  data-testid={`sql-quick-export-${message.id}`}
                  className="flex items-center gap-1 px-2 py-1 border-t"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <span className="text-[10px] opacity-40 mr-1">Export:</span>
                  {message.sql_executions.map((exec, i) => {
                    if (!exec.columns || !exec.rows || exec.rows.length === 0) return null;
                    const label = message.sql_executions.filter(e => e.columns && e.rows && e.rows.length > 0).length > 1
                      ? `Q${i + 1} ` : "";
                    return (
                      <span key={i} className="flex items-center gap-1">
                        <button
                          data-testid={`export-csv-btn-${message.id}-${i}`}
                          className="text-[10px] px-1.5 py-0.5 rounded hover:opacity-80 transition-opacity"
                          style={{ color: "var(--color-accent)" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadCsv(exec.columns!, exec.rows!, `query_${i + 1}.csv`);
                          }}
                        >
                          {label}CSV
                        </button>
                        <button
                          data-testid={`export-xlsx-btn-${message.id}-${i}`}
                          className="text-[10px] px-1.5 py-0.5 rounded hover:opacity-80 transition-opacity"
                          style={{ color: "var(--color-accent)" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadExcel(exec.columns!, exec.rows!, `query_${i + 1}`);
                          }}
                        >
                          {label}XLSX
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Inline SQL error display */}
        {!isUser && !isCurrentlyStreaming && message.sql_executions.some(e => e.error) && (
          <div
            data-testid={`sql-error-${message.id}`}
            className="mt-2 rounded text-xs px-3 py-2 flex items-start gap-2"
            style={{
              backgroundColor: "color-mix(in srgb, var(--color-error) 8%, transparent)",
              border: "1px solid var(--color-error)",
              color: "var(--color-error)",
            }}
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span className="break-words min-w-0">
              {message.sql_executions.filter(e => e.error).map((e, i) => (
                <span key={i}>
                  {i > 0 && <br />}
                  {message.sql_executions.filter(e => e.error).length > 1 && <strong>Query {message.sql_executions.indexOf(e) + 1}: </strong>}
                  {e.error}
                </span>
              ))}
            </span>
          </div>
        )}

        {/* Tool Call Trace Viewer (dev mode) */}
        {!isUser && devMode && !isCurrentlyStreaming && Array.isArray(message.tool_call_trace) && message.tool_call_trace.length > 0 && (
          <div
            data-testid={`trace-viewer-${message.id}`}
            className="mt-2 rounded overflow-hidden text-xs"
            style={{
              backgroundColor: "var(--color-bg)",
              border: "1px solid var(--color-border)",
            }}
          >
            <button
              data-testid={`trace-viewer-toggle-${message.id}`}
              className="w-full flex items-center gap-1.5 px-2 py-1 text-left opacity-60 hover:opacity-100 transition-opacity"
              style={{ color: "var(--color-text)" }}
              onClick={() => setTraceExpanded(!traceExpanded)}
            >
              <svg
                className={`w-3 h-3 transition-transform duration-200 ${traceExpanded ? "rotate-90" : ""}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
              <span className="font-mono opacity-70">Tool Calls ({message.tool_call_trace.length})</span>
            </button>
            <div
              data-testid={`trace-viewer-content-${message.id}`}
              style={{
                maxHeight: traceExpanded ? "400px" : "0px",
                opacity: traceExpanded ? 1 : 0,
                overflow: "hidden",
                transition: "max-height 200ms ease, opacity 200ms ease",
              }}
            >
              <div
                className="px-2 py-1.5 border-t flex flex-col gap-1.5"
                style={{
                  borderColor: "var(--color-border)",
                  maxHeight: "380px",
                  overflowY: "auto",
                }}
              >
                {message.tool_call_trace.map((entry, i) => (
                  <div
                    key={i}
                    className="rounded px-2 py-1.5"
                    style={{
                      backgroundColor: "var(--color-surface)",
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    {entry.type === "reasoning" && (
                      <>
                        <div className="font-mono font-medium opacity-60 text-[10px] mb-0.5" style={{ color: "var(--color-accent)" }}>
                          Thinking...
                        </div>
                        <div className="font-mono text-[10px] opacity-70 break-words" style={{ color: "var(--color-text)" }}>
                          {(entry.content ?? "").length > 200 ? `${entry.content!.slice(0, 200)}...` : entry.content}
                        </div>
                      </>
                    )}
                    {entry.type === "text" && (
                      <>
                        <div className="font-mono font-medium opacity-60 text-[10px] mb-0.5" style={{ color: "var(--color-success)" }}>
                          Response
                        </div>
                        <div className="font-mono text-[10px] opacity-70 break-words" style={{ color: "var(--color-text)" }}>
                          {(entry.content ?? "").length > 200 ? `${entry.content!.slice(0, 200)}...` : entry.content}
                        </div>
                      </>
                    )}
                    {entry.type === "tool_call" && (
                      <>
                        <div className="font-mono font-medium text-[10px] mb-0.5" style={{ color: "var(--color-warning, var(--color-accent))" }}>
                          {entry.tool ?? "unknown_tool"}
                        </div>
                        {entry.args && (
                          <pre
                            className="font-mono text-[10px] opacity-60 break-words whitespace-pre-wrap mb-0.5"
                            style={{ color: "var(--color-text)" }}
                          >
                            {(() => {
                              const json = JSON.stringify(entry.args, null, 2);
                              return json.length > 300 ? `${json.slice(0, 300)}...` : json;
                            })()}
                          </pre>
                        )}
                        {entry.result && (
                          <div
                            className="font-mono text-[10px] opacity-50 break-words mt-0.5 pt-0.5"
                            style={{ color: "var(--color-text)", borderTop: "1px solid var(--color-border)" }}
                          >
                            {entry.result.length > 200 ? `${entry.result.slice(0, 200)}...` : entry.result}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Inline LLM-requested chart */}
        {!isUser && !isCurrentlyStreaming && message.sql_executions.some(e => e.chartSpec && e.columns && e.rows) && (
          <div
            data-testid={`inline-chart-${message.id}`}
            className="mt-3 rounded-lg overflow-hidden chart-fade-in"
            style={{
              border: "1px solid var(--color-border)",
              backgroundColor: "var(--color-bg)",
              height: "280px",
            }}
          >
            {message.sql_executions
              .filter(e => e.chartSpec && e.columns && e.rows)
              .map((exec, i) => {
                const execIndex = message.sql_executions.indexOf(exec);
                return (
                  <ChartVisualization
                    key={i}
                    columns={exec.columns!}
                    rows={exec.rows!}
                    llmSpec={exec.chartSpec}
                    onExpand={() => onVisualize(message.sql_executions, execIndex)}
                  />
                );
              })}
          </div>
        )}

        {/* Action buttons row */}
        {!isUser && !isCurrentlyStreaming && (reasoningContent || message.sql_executions.length > 0 || (devMode && onRedo)) && (
          <div className="mt-2 flex flex-wrap gap-2">
            {/* Show Reasoning button */}
            {reasoningContent && (
              <button
                className="action-btn-stagger text-xs px-2 py-1 rounded border opacity-70 hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-1 hover:shadow-sm active:scale-95 transition-all duration-150"
                style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)", '--btn-index': 0 } as React.CSSProperties}
                onClick={() => onShowReasoning(reasoningContent)}
              >
                Show Reasoning
              </button>
            )}

            {/* Show SQL button */}
            {message.sql_executions.length > 0 && (
              <button
                className="action-btn-stagger text-xs px-2 py-1 rounded border opacity-70 hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-1 hover:shadow-sm active:scale-95 transition-all duration-150"
                style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)", '--btn-index': reasoningContent ? 1 : 0 } as React.CSSProperties}
                onClick={() => onShowSQL(message.sql_executions)}
              >
                Show SQL ({message.sql_executions.length})
              </button>
            )}

            {/* Visualize button — prominent, shown when results have chartable data */}
            {visualizableIndex >= 0 && (
              <button
                data-testid={`visualize-btn-${message.id}`}
                className="action-btn-stagger text-xs px-3 py-1 rounded border font-medium hover:opacity-90 focus-visible:ring-1 active:scale-95 transition-all duration-150 flex items-center gap-1.5"
                style={{
                  borderColor: "var(--color-success)",
                  color: "var(--color-success)",
                  backgroundColor: "color-mix(in srgb, var(--color-success) 10%, transparent)",
                  '--btn-index': (reasoningContent ? 1 : 0) + (message.sql_executions.length > 0 ? 1 : 0),
                } as React.CSSProperties}
                onClick={() => onVisualize(message.sql_executions, visualizableIndex)}
                aria-label="Visualize query results"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="12" width="4" height="9" rx="1" />
                  <rect x="10" y="7" width="4" height="14" rx="1" />
                  <rect x="17" y="3" width="4" height="18" rx="1" />
                </svg>
                Visualize
              </button>
            )}

            {/* Redo button (dev mode) */}
            {devMode && onRedo && (
              <button
                data-testid={`redo-btn-${message.id}`}
                className="action-btn-stagger text-xs px-2 py-1 rounded border opacity-70 hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-1 hover:shadow-sm active:scale-95 transition-all duration-150 flex items-center gap-1"
                style={{
                  borderColor: "var(--color-accent)",
                  color: "var(--color-accent)",
                  '--btn-index': (reasoningContent ? 1 : 0) + (message.sql_executions.length > 0 ? 1 : 0) + (visualizableIndex >= 0 ? 1 : 0),
                } as React.CSSProperties}
                onClick={() => onRedo(message.id)}
                aria-label="Redo this message"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                Redo
              </button>
            )}
          </div>
        )}

        {/* Action buttons row - top right */}
        <div className="absolute top-1 right-1 flex items-center gap-1">
          {/* Bookmark button - only on assistant messages with SQL */}
          {!isUser && !isCurrentlyStreaming && message.sql_executions.length > 0 && (
            <button
              data-testid={`bookmark-btn-${message.id}`}
              className={`touch-action-btn p-1 rounded text-xs transition-all duration-150 ${
                isMessageBookmarked
                  ? "opacity-100"
                  : "opacity-40 hover:opacity-100 hover:bg-white/10"
              } active:scale-90`}
              style={{
                color: isMessageBookmarked ? "var(--color-accent)" : "var(--color-text)",
              }}
              onClick={handleBookmarkClick}
              aria-label={isMessageBookmarked ? "Remove bookmark" : "Bookmark query"}
              title={isMessageBookmarked ? "Remove bookmark" : "Bookmark query"}
            >
              {isMessageBookmarked ? (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                </svg>
              )}
            </button>
          )}

          {/* Delete button */}
          {onDelete && !isCurrentlyStreaming && (
            <button
              data-testid={`delete-btn-${message.id}`}
              className={`touch-action-btn p-1 rounded text-xs transition-all duration-150 ${
                deleteConfirm
                  ? "opacity-100"
                  : "opacity-40 hover:opacity-100 hover:bg-white/10"
              } active:scale-90`}
              style={{
                color: deleteConfirm ? "var(--color-error)" : isUser ? "var(--color-white)" : "var(--color-text)",
              }}
              onClick={handleDeleteClick}
              aria-label={deleteConfirm ? "Confirm delete" : "Delete message"}
              title={deleteConfirm ? "Click again to confirm" : "Delete message"}
            >
              {deleteConfirm ? (
                <span className="flex items-center gap-0.5 copy-check-enter">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6" />
                    <path d="M14 11v6" />
                  </svg>
                  <span className="text-[10px] font-medium">Delete?</span>
                </span>
              ) : (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                </svg>
              )}
            </button>
          )}

          {/* Fork button */}
          {onFork && !isCurrentlyStreaming && (
            <button
              data-testid={`fork-btn-${message.id}`}
              className={`touch-action-btn p-1 rounded text-xs transition-all duration-150 ${
                forked
                  ? "opacity-100"
                  : "opacity-40 hover:opacity-100 hover:bg-white/10"
              } active:scale-90`}
              style={{
                color: forked ? "var(--color-success)" : isUser ? "var(--color-white)" : "var(--color-text)",
              }}
              onClick={handleForkClick}
              aria-label={forked ? "Forked" : "Fork conversation"}
              title="Fork conversation from here"
            >
              {forked ? (
                <span className="flex items-center gap-0.5 copy-check-enter">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
              ) : (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="6" y1="3" x2="6" y2="15" />
                  <circle cx="18" cy="6" r="3" />
                  <circle cx="6" cy="18" r="3" />
                  <path d="M18 9a9 9 0 0 1-9 9" />
                </svg>
              )}
            </button>
          )}

          {/* Branch button */}
          {onBranch && !isCurrentlyStreaming && (
            <button
              data-testid={`branch-btn-${message.id}`}
              className={`touch-action-btn p-1 rounded text-xs transition-all duration-150 ${
                branched
                  ? "opacity-100"
                  : "opacity-40 hover:opacity-100 hover:bg-white/10"
              } active:scale-90`}
              style={{
                color: branched ? "var(--color-success)" : isUser ? "var(--color-white)" : "var(--color-text)",
              }}
              onClick={handleBranchClick}
              aria-label={branched ? "Branched" : "Branch from here"}
              title="Branch conversation from here"
            >
              {branched ? (
                <span className="flex items-center gap-0.5 copy-check-enter">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
              ) : (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="18" r="3" />
                  <circle cx="6" cy="6" r="3" />
                  <circle cx="18" cy="6" r="3" />
                  <path d="M12 15V9" />
                  <path d="M6 9v3a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V9" />
                </svg>
              )}
            </button>
          )}

          {/* Copy button - shows checkmark + "Copied!" for 1.5s after click */}
          <button
            data-testid={`copy-btn-${message.id}`}
            className={`touch-action-btn p-1 rounded text-xs transition-all duration-150 ${
              copied
                ? "opacity-100"
                : "opacity-40 hover:opacity-100 hover:bg-white/10"
            } active:scale-90`}
            style={{
              color: copied
                ? "var(--color-success)"
                : isUser
                  ? "var(--color-white)"
                  : "var(--color-text)",
            }}
            onClick={handleCopyClick}
            aria-label={copied ? "Copied" : "Copy message"}
          >
            {copied ? (
              <span className="flex items-center gap-0.5 copy-check-enter">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span className="text-[10px] font-medium">Copied!</span>
              </span>
            ) : (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Timestamp with custom tooltip */}
      <div className="flex items-center gap-2 mt-1">
        <span className="relative group/timestamp">
          <span
            data-testid={`timestamp-${message.id}`}
            className="text-xs opacity-30 group-hover:opacity-60 transition-opacity"
            style={{ color: "var(--color-text)" }}
          >
            {formatTimestamp(message.created_at)}
          </span>
          <span
            data-testid={`timestamp-tooltip-${message.id}`}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[10px] rounded whitespace-nowrap opacity-0 group-hover/timestamp:opacity-100 transition-opacity duration-150 pointer-events-none z-50"
            style={{
              background: "var(--color-surface)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
            }}
          >
            {new Date(message.created_at).toLocaleString(undefined, {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
        </span>

        {/* Token usage badge (dev mode) */}
        {!isUser && devMode && !isCurrentlyStreaming && ((message.input_tokens ?? 0) > 0 || (message.output_tokens ?? 0) > 0) && (
          <span
            data-testid={`token-badge-${message.id}`}
            className="text-[10px] font-mono opacity-50"
            style={{ color: "var(--color-text)" }}
          >
            {formatTokens(message.input_tokens ?? 0)} in / {formatTokens(message.output_tokens ?? 0)} out
          </span>
        )}
      </div>
    </div>
  );
}

// Export memoized version to prevent unnecessary re-renders when parent updates
export const MessageBubble = memo(MessageBubbleComponent);
