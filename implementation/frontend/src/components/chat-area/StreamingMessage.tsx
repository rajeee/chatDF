// Isolated component that handles streaming message display.
// Subscribes ONLY to streaming-related state to minimize re-renders.
// During streaming, only this component re-renders on each token, not the entire MessageList.

import { memo, useState } from "react";
import { useChatStore } from "@/stores/chatStore";
import ReactMarkdown from "react-markdown";
import { CodeBlock } from "./CodeBlock";

interface StreamingMessageProps {
  messageId: string;
}

function StreamingMessageComponent({ messageId }: StreamingMessageProps) {
  // Subscribe ONLY to streaming state - this is the only component that re-renders per token
  const isStreaming = useChatStore((s) => s.isStreaming);
  const streamingMessageId = useChatStore((s) => s.streamingMessageId);
  const streamingTokens = useChatStore((s) => s.streamingTokens);
  const isReasoning = useChatStore((s) => s.isReasoning);
  const streamingReasoning = useChatStore((s) => s.streamingReasoning);

  const [reasoningCollapsed, setReasoningCollapsed] = useState(false);

  const isThisMessageStreaming = isStreaming && messageId === streamingMessageId;

  if (!isThisMessageStreaming) {
    return null; // Not streaming or different message
  }

  return (
    <>
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
