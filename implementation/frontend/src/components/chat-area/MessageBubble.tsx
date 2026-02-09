// Implements: spec/frontend/chat_area/message_list/plan.md#rendering-strategy
//
// Renders a single message bubble. User messages: right-aligned, accent bg, plain text.
// Assistant messages: left-aligned, surface bg, markdown rendered.
// Per-message actions: copy button, "Show SQL" button, "Show Reasoning" button, timestamp on hover.

import { memo, useMemo, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import type { Message, SqlExecution } from "@/stores/chatStore";
import { CodeBlock } from "./CodeBlock";
import { StreamingMessage } from "./StreamingMessage";
import { ChartVisualization } from "./ChartVisualization";
import { detectChartTypes } from "@/utils/chartDetection";

interface MessageBubbleProps {
  message: Message;
  isCurrentlyStreaming: boolean;
  onShowSQL: (executions: SqlExecution[]) => void;
  onShowReasoning: (reasoning: string) => void;
  onCopy: (content: string) => void;
  onVisualize: (executions: SqlExecution[], index: number) => void;
  onRetry?: (messageId: string, content: string) => void;
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
  onShowSQL,
  onShowReasoning,
  onCopy,
  onVisualize,
  onRetry,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
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

  const handleCopyClick = useCallback(() => {
    onCopy(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [onCopy, message.content]);

  return (
    <div
      data-testid={`message-row-${message.id}`}
      className={`flex flex-col ${isUser ? "items-end" : "items-start"} group message-appear`}
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: "auto 100px",
      }}
    >
      <div
        data-testid={`message-bubble-${message.id}`}
        className="relative max-w-[80%] rounded-lg px-4 py-2 text-sm break-words"
        style={{
          backgroundColor: isUser ? "var(--color-accent)" : "var(--color-surface)",
          color: isUser ? "var(--color-white)" : "var(--color-text)",
          border: isUser ? "none" : "1px solid var(--color-border)",
          boxShadow: isUser ? "none" : "0 1px 2px var(--color-shadow)",
        }}
      >
        {/* Message content - use StreamingMessage component for active streaming, otherwise show finalized content */}
        {isUser ? (
          <span className="break-words">{message.content}</span>
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
                  return <p>{children}</p>;
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
              className="underline font-medium hover:opacity-80 active:scale-95 transition-all"
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
            </button>
            {/* SQL preview content with smooth expand/collapse */}
            <div
              data-testid={`sql-preview-content-${message.id}`}
              style={{
                maxHeight: sqlExpanded ? "200px" : "0px",
                opacity: sqlExpanded ? 1 : 0,
                overflow: "hidden",
                transition: "max-height 200ms ease, opacity 150ms ease",
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
              backgroundColor: "rgba(220, 38, 38, 0.08)",
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
            className="mt-3 rounded-lg overflow-hidden"
            style={{
              border: "1px solid var(--color-border)",
              backgroundColor: "var(--color-bg)",
              height: "280px",
            }}
          >
            {message.sql_executions
              .filter(e => e.chartSpec && e.columns && e.rows)
              .map((exec, i) => (
                <ChartVisualization
                  key={i}
                  columns={exec.columns!}
                  rows={exec.rows!}
                  llmSpec={exec.chartSpec}
                />
              ))}
          </div>
        )}

        {/* Action buttons row */}
        {!isUser && !isCurrentlyStreaming && (reasoningContent || message.sql_executions.length > 0) && (
          <div className="mt-2 flex flex-wrap gap-2">
            {/* Show Reasoning button */}
            {reasoningContent && (
              <button
                className="text-xs px-2 py-1 rounded border opacity-70 hover:opacity-100 hover:bg-accent/10 active:scale-95 transition-all duration-150"
                style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)" }}
                onClick={() => onShowReasoning(reasoningContent)}
              >
                Show Reasoning
              </button>
            )}

            {/* Show SQL button */}
            {message.sql_executions.length > 0 && (
              <button
                className="text-xs px-2 py-1 rounded border opacity-70 hover:opacity-100 hover:bg-accent/10 active:scale-95 transition-all duration-150"
                style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)" }}
                onClick={() => onShowSQL(message.sql_executions)}
              >
                Show SQL ({message.sql_executions.length})
              </button>
            )}

            {/* Visualize button — prominent, shown when results have chartable data */}
            {visualizableIndex >= 0 && (
              <button
                data-testid={`visualize-btn-${message.id}`}
                className="text-xs px-3 py-1 rounded border font-medium hover:opacity-90 active:scale-95 transition-all duration-150 flex items-center gap-1.5"
                style={{
                  borderColor: "#34d399",
                  color: "#34d399",
                  backgroundColor: "rgba(52, 211, 153, 0.1)",
                }}
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

        {/* Copy button - shows checkmark + "Copied!" for 1.5s after click */}
        <button
          data-testid={`copy-btn-${message.id}`}
          className={`touch-action-btn absolute top-1 right-1 p-1 rounded text-xs transition-all duration-150 ${
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
            <span className="flex items-center gap-0.5">
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
