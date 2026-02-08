// Implements: spec/frontend/chat_area/message_list/plan.md#rendering-strategy
//
// Renders a single message bubble. User messages: right-aligned, accent bg, plain text.
// Assistant messages: left-aligned, surface bg, markdown rendered.
// Per-message actions: copy button, "Show SQL" button, "Show Reasoning" button, timestamp on hover.

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import type { Message, SqlExecution } from "@/stores/chatStore";
import { CodeBlock } from "./CodeBlock";
import { StreamingMessage } from "./StreamingMessage";

interface MessageBubbleProps {
  message: Message;
  isCurrentlyStreaming: boolean;
  onShowSQL: (executions: SqlExecution[]) => void;
  onShowReasoning: (reasoning: string) => void;
  onCopy: (content: string) => void;
  onCopySQL: (sql: string) => void;
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
  onCopySQL,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const reasoningContent = message.reasoning;

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
        className="relative max-w-[80%] rounded-lg px-4 py-2 text-sm"
        style={{
          backgroundColor: isUser ? "var(--color-accent)" : "var(--color-surface)",
          color: isUser ? "var(--color-white)" : "var(--color-text)",
          border: isUser ? "none" : "1px solid var(--color-border)",
          boxShadow: isUser ? "none" : "0 1px 2px var(--color-shadow)",
        }}
      >
        {/* Message content - use StreamingMessage component for active streaming, otherwise show finalized content */}
        {isUser ? (
          <span>{message.content}</span>
        ) : isCurrentlyStreaming ? (
          <StreamingMessage messageId={message.id} />
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none">
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

        {/* Action buttons row */}
        {!isUser && !isCurrentlyStreaming && (reasoningContent || message.sql_executions.length > 0) && (
          <div className="mt-2 flex gap-2">
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

            {/* Copy SQL button */}
            {message.sql_executions.length > 0 && (
              <button
                data-testid={`copy-sql-btn-${message.id}`}
                className="text-xs px-2 py-1 rounded border opacity-70 hover:opacity-100 hover:bg-accent/10 active:scale-95 transition-all duration-150 flex items-center gap-1"
                style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)" }}
                onClick={() => {
                  const allSQL = message.sql_executions.map((exec) => exec.query).join("\n\n");
                  onCopySQL(allSQL);
                }}
                aria-label="Copy SQL queries"
              >
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
                Copy SQL
              </button>
            )}
          </div>
        )}

        {/* Copy button - visible on hover via group-hover */}
        <button
          data-testid={`copy-btn-${message.id}`}
          className="touch-action-btn absolute top-1 right-1 p-1 rounded text-xs opacity-0 group-hover:opacity-100 hover:bg-white/10 active:scale-90 transition-all duration-150"
          style={{ color: isUser ? "var(--color-white)" : "var(--color-text)" }}
          onClick={() => onCopy(message.content)}
          aria-label="Copy message"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
        </button>
      </div>

      {/* Timestamp on hover */}
      <span
        data-testid={`timestamp-${message.id}`}
        className="touch-action-btn text-xs mt-1 opacity-0 group-hover:opacity-70 transition-opacity"
        style={{ color: "var(--color-text)" }}
      >
        {formatTimestamp(message.created_at)}
      </span>
    </div>
  );
}

// Export memoized version to prevent unnecessary re-renders when parent updates
export const MessageBubble = memo(MessageBubbleComponent);
