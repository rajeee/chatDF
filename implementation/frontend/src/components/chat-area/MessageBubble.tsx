// Implements: spec/frontend/chat_area/message_list/plan.md#rendering-strategy
//
// Renders a single message bubble. User messages: right-aligned, accent bg, plain text.
// Assistant messages: left-aligned, surface bg, markdown rendered.
// Per-message actions: copy button, "Show SQL" button, "Show Reasoning" button, timestamp on hover.

import { memo, useMemo, useState, useCallback, useRef } from "react";
import ReactMarkdown from "react-markdown";
import type { Message, SqlExecution } from "@/stores/chatStore";
import { useUiStore } from "@/stores/uiStore";
import { CodeBlock } from "./CodeBlock";
import { StreamingMessage } from "./StreamingMessage";
import { ChartVisualization } from "./ChartVisualization";
import { detectChartTypes } from "@/utils/chartDetection";
import { highlightText } from "@/utils/highlightText";

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
  onDelete?: (messageId: string) => void;
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
  onDelete,
  searchQuery,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const messageDensity = useUiStore((s) => s.messageDensity);
  const reasoningContent = message.reasoning;

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
  const [copied, setCopied] = useState(false);
  const [forked, setForked] = useState(false);
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
        {!isUser && !isCurrentlyStreaming && (reasoningContent || message.sql_executions.length > 0) && (
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
          </div>
        )}

        {/* Action buttons row - top right */}
        <div className="absolute top-1 right-1 flex items-center gap-1">
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

          {/* Fork button - only shown on assistant messages */}
          {!isUser && onFork && !isCurrentlyStreaming && (
            <button
              data-testid={`fork-btn-${message.id}`}
              className={`touch-action-btn p-1 rounded text-xs transition-all duration-150 ${
                forked
                  ? "opacity-100"
                  : "opacity-40 hover:opacity-100 hover:bg-white/10"
              } active:scale-90`}
              style={{
                color: forked ? "var(--color-success)" : "var(--color-text)",
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
      <span className="relative group/timestamp">
        <span
          data-testid={`timestamp-${message.id}`}
          className="text-xs mt-1 opacity-30 group-hover:opacity-60 transition-opacity"
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
    </div>
  );
}

// Export memoized version to prevent unnecessary re-renders when parent updates
export const MessageBubble = memo(MessageBubbleComponent);
