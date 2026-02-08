// Implements: spec/frontend/chat_area/message_list/plan.md#rendering-strategy
//
// Renders a single message bubble. User messages: right-aligned, accent bg, plain text.
// Assistant messages: left-aligned, surface bg, markdown rendered.
// Per-message actions: copy button, "Show SQL" button, "Show Reasoning" button, timestamp on hover.

import ReactMarkdown from "react-markdown";
import type { Message, SqlExecution } from "@/stores/chatStore";

interface MessageBubbleProps {
  message: Message;
  displayContent: string;
  isCurrentlyStreaming: boolean;
  isShowingReasoning: boolean;
  streamingReasoningContent: string;
  reasoningContent: string | null;
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

export function MessageBubble({
  message,
  displayContent,
  isCurrentlyStreaming,
  isShowingReasoning,
  streamingReasoningContent,
  reasoningContent,
  onShowSQL,
  onShowReasoning,
  onCopy,
  onCopySQL,
}: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div
      data-testid={`message-row-${message.id}`}
      className={`flex flex-col ${isUser ? "items-end" : "items-start"} group message-appear`}
    >
      <div
        data-testid={`message-bubble-${message.id}`}
        className="relative max-w-[80%] rounded-lg px-4 py-2 text-sm"
        style={{
          backgroundColor: isUser ? "var(--color-accent)" : "var(--color-surface)",
          color: isUser ? "#ffffff" : "var(--color-text)",
          border: isUser ? "none" : "1px solid var(--color-border)",
          boxShadow: isUser ? "none" : "0 1px 2px var(--color-shadow)",
        }}
      >
        {/* Streaming reasoning display */}
        {isShowingReasoning && streamingReasoningContent && (
          <div className="mb-2 pb-2 border-b" style={{ borderColor: "var(--color-border)" }}>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-xs font-medium opacity-60">Thinking...</span>
              <span className="inline-flex gap-0.5">
                <span className="animate-bounce text-xs opacity-40" style={{ animationDelay: "0ms" }}>.</span>
                <span className="animate-bounce text-xs opacity-40" style={{ animationDelay: "150ms" }}>.</span>
                <span className="animate-bounce text-xs opacity-40" style={{ animationDelay: "300ms" }}>.</span>
              </span>
            </div>
            <div className="text-xs italic opacity-50 max-h-40 overflow-y-auto">
              {streamingReasoningContent}
            </div>
          </div>
        )}

        {/* Message content */}
        {isUser ? (
          <span>{displayContent}</span>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown>{displayContent}</ReactMarkdown>
          </div>
        )}

        {/* Streaming indicator */}
        {isCurrentlyStreaming && !isShowingReasoning && (
          <span data-testid="streaming-indicator" className="inline-flex gap-1 ml-2 align-middle" style={{ opacity: 0.6 }}>
            <span className="typing-dot"></span>
            <span className="typing-dot"></span>
            <span className="typing-dot"></span>
          </span>
        )}

        {/* Action buttons row */}
        {!isUser && !isCurrentlyStreaming && (reasoningContent || message.sql_executions.length > 0) && (
          <div className="mt-2 flex gap-2">
            {/* Show Reasoning button */}
            {reasoningContent && (
              <button
                className="text-xs px-2 py-1 rounded border opacity-70 hover:opacity-100"
                style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)" }}
                onClick={() => onShowReasoning(reasoningContent)}
              >
                Show Reasoning
              </button>
            )}

            {/* Show SQL button */}
            {message.sql_executions.length > 0 && (
              <button
                className="text-xs px-2 py-1 rounded border opacity-70 hover:opacity-100"
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
                className="text-xs px-2 py-1 rounded border opacity-70 hover:opacity-100 flex items-center gap-1"
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
          className="absolute top-1 right-1 p-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: isUser ? "#ffffff" : "var(--color-text)" }}
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
        className="text-xs mt-1 opacity-0 group-hover:opacity-70 transition-opacity"
        style={{ color: "var(--color-text)" }}
      >
        {formatTimestamp(message.created_at)}
      </span>
    </div>
  );
}
