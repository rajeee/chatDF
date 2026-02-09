// Isolated component that handles streaming message display.
// Subscribes ONLY to streaming-related state to minimize re-renders.
// During streaming, only this component re-renders on each token, not the entire MessageList.

import { memo, useState } from "react";
import { useChatStore } from "@/stores/chatStore";
import ReactMarkdown from "react-markdown";
import { CodeBlock } from "./CodeBlock";

/** Sparkle SVG icon used in the thinking indicator */
function SparkleIcon() {
  return (
    <svg
      className="thinking-indicator-icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
    </svg>
  );
}

/** Phase-aware thinking indicator shown before streaming tokens arrive */
function ThinkingIndicator() {
  return (
    <div
      data-testid="thinking-indicator"
      className="thinking-indicator relative flex items-center gap-2 rounded-lg px-3 py-2 overflow-hidden"
      style={{ color: "var(--color-text-secondary)" }}
    >
      {/* Shimmer sweep background */}
      <div
        className="thinking-indicator-shimmer absolute inset-0 pointer-events-none"
        aria-hidden="true"
      />
      {/* Icon + text */}
      <SparkleIcon />
      <span className="text-xs" style={{ opacity: 0.75 }}>
        Analyzing your question...
      </span>
    </div>
  );
}

interface StreamingMessageProps {
  messageId: string;
}

/** Spinner SVG used in tool call preview */
function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="0.75" />
    </svg>
  );
}

/** Human-readable label for a tool call */
function toolCallLabel(tool: string): string {
  switch (tool) {
    case "execute_sql":
      return "Executing SQL...";
    case "load_dataset":
      return "Loading dataset...";
    case "create_chart":
      return "Creating chart...";
    default:
      return `Running ${tool}...`;
  }
}

/** Inline preview shown when a tool call is in progress */
function ToolCallPreview({ tool, args }: { tool: string; args: Record<string, unknown> }) {
  const sqlQuery = (args.query || args.sql) as string | undefined;
  const showSql = tool === "execute_sql" && sqlQuery;

  return (
    <div
      data-testid="tool-call-preview"
      className="my-2 rounded-md border overflow-hidden"
      style={{
        borderColor: "var(--color-border)",
        background: "var(--color-bg-secondary, var(--color-bg-subtle, rgba(0,0,0,0.03)))",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium"
        style={{ color: "var(--color-text-secondary)" }}
        data-testid="tool-call-label"
      >
        <Spinner />
        <span>{toolCallLabel(tool)}</span>
      </div>

      {/* SQL code block */}
      {showSql && (
        <div
          data-testid="tool-call-sql"
          className="px-3 pb-2"
        >
          <pre
            className="font-mono text-xs rounded px-2.5 py-2 overflow-x-auto whitespace-pre-wrap break-words"
            style={{
              background: "var(--color-bg-tertiary, var(--color-bg-subtle, rgba(0,0,0,0.05)))",
              color: "var(--color-text-primary)",
              margin: 0,
              maxHeight: "10rem",
            }}
          >
            {sqlQuery}
          </pre>
        </div>
      )}
    </div>
  );
}

function StreamingMessageComponent({ messageId }: StreamingMessageProps) {
  // Subscribe ONLY to streaming state - this is the only component that re-renders per token
  const isStreaming = useChatStore((s) => s.isStreaming);
  const streamingMessageId = useChatStore((s) => s.streamingMessageId);
  const streamingTokens = useChatStore((s) => s.streamingTokens);
  const isReasoning = useChatStore((s) => s.isReasoning);
  const streamingReasoning = useChatStore((s) => s.streamingReasoning);
  const queryProgress = useChatStore((s) => s.queryProgress);
  const pendingToolCall = useChatStore((s) => s.pendingToolCall);

  const [reasoningCollapsed, setReasoningCollapsed] = useState(false);

  const isThisMessageStreaming = isStreaming && messageId === streamingMessageId;

  if (!isThisMessageStreaming) {
    return null; // Not streaming or different message
  }

  const showThinkingIndicator =
    isThisMessageStreaming && !streamingTokens && !streamingReasoning;

  return (
    <>
      {/* Thinking indicator — shown before any tokens or reasoning arrive */}
      {showThinkingIndicator && <ThinkingIndicator />}

      {/* Multi-query progress indicator */}
      {queryProgress !== null && queryProgress > 1 && (
        <div
          className="flex items-center gap-1.5 px-3 py-1"
          style={{ color: "var(--color-text-secondary)" }}
        >
          <svg
            className="w-3 h-3 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="0.75" />
          </svg>
          <span className="text-xs" style={{ opacity: 0.75 }}>
            Running query {queryProgress}...
          </span>
        </div>
      )}

      {/* Streaming reasoning display */}
      {streamingReasoning && (
        <div className="mb-2 pb-2 border-b" style={{ borderColor: "var(--color-border)" }}>
          <button
            onClick={() => setReasoningCollapsed(!reasoningCollapsed)}
            className="flex items-center gap-1.5 mb-1 w-full text-left hover:opacity-80 transition-opacity"
            data-testid="reasoning-toggle"
            aria-expanded={!reasoningCollapsed}
          >
            <svg
              className={`w-3 h-3 transition-transform duration-200 ${reasoningCollapsed ? "" : "rotate-90"}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <span className="text-xs font-medium opacity-60">
              {isReasoning ? "Thinking..." : "Reasoning"}
            </span>
            {isReasoning && (
              <span className="inline-flex gap-0.5">
                <span className="animate-bounce text-xs opacity-40" style={{ animationDelay: "0ms" }}>.</span>
                <span className="animate-bounce text-xs opacity-40" style={{ animationDelay: "150ms" }}>.</span>
                <span className="animate-bounce text-xs opacity-40" style={{ animationDelay: "300ms" }}>.</span>
              </span>
            )}
          </button>
          {!reasoningCollapsed && (
            <div className="text-xs italic opacity-50 max-h-40 overflow-y-auto">
              {streamingReasoning}
            </div>
          )}
        </div>
      )}

      {/* Tool call preview — shown when LLM invokes a tool (e.g., execute_sql) */}
      {pendingToolCall && (
        <ToolCallPreview tool={pendingToolCall.tool} args={pendingToolCall.args} />
      )}

      {/* Streaming message content */}
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <ReactMarkdown
          components={{
            code: CodeBlock,
            // Custom p renderer to prevent wrapping code blocks in <p> tags
            p: ({ children }) => {
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
          {streamingTokens}
        </ReactMarkdown>
        {/* Pulsing cursor at end of streaming text */}
        {!isReasoning && (
          <span data-testid="streaming-cursor" className="streaming-cursor" aria-hidden="true" />
        )}
      </div>
    </>
  );
}

export const StreamingMessage = memo(StreamingMessageComponent);
