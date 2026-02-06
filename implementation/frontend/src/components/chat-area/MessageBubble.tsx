// Implements: spec/frontend/chat_area/message_list/plan.md#rendering-strategy
//
// Renders a single message bubble. User messages: right-aligned, accent bg, plain text.
// Assistant messages: left-aligned, surface bg, markdown rendered.
// Per-message actions: copy button, "Show SQL" button, timestamp on hover.

import ReactMarkdown from "react-markdown";
import type { Message } from "@/stores/chatStore";

interface MessageBubbleProps {
  message: Message;
  displayContent: string;
  isCurrentlyStreaming: boolean;
  onShowSQL: (sql: string) => void;
  onCopy: (content: string) => void;
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
  onShowSQL,
  onCopy,
}: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div
      data-testid={`message-row-${message.id}`}
      className={`flex flex-col ${isUser ? "items-end" : "items-start"} group`}
    >
      <div
        data-testid={`message-bubble-${message.id}`}
        className="relative max-w-[80%] rounded-lg px-4 py-2 text-sm"
        style={{
          backgroundColor: isUser ? "var(--color-accent)" : "var(--color-surface)",
          color: isUser ? "#ffffff" : "var(--color-text)",
        }}
      >
        {/* Message content */}
        {isUser ? (
          <span>{displayContent}</span>
        ) : (
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown>{displayContent}</ReactMarkdown>
          </div>
        )}

        {/* Streaming indicator */}
        {isCurrentlyStreaming && (
          <span data-testid="streaming-indicator" className="inline-flex gap-0.5 ml-1">
            <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
            <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
            <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
          </span>
        )}

        {/* Show SQL button */}
        {!isUser && message.sql_query && (
          <button
            className="mt-2 text-xs px-2 py-1 rounded border opacity-70 hover:opacity-100"
            style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)" }}
            onClick={() => onShowSQL(message.sql_query!)}
          >
            Show SQL
          </button>
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
