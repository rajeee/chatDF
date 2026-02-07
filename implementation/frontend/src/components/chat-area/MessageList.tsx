// Implements: spec/frontend/chat_area/message_list/plan.md
//
// Scrollable message container with auto-scroll behavior.
// Maps over chatStore.messages to render MessageBubble components.
// Handles streaming display by merging streamingTokens into the active message.

import { useRef, useEffect, useState, useCallback } from "react";
import { useChatStore, type SqlExecution } from "@/stores/chatStore";
import { useUiStore } from "@/stores/uiStore";
import { MessageBubble } from "./MessageBubble";

const SCROLL_THRESHOLD = 100; // px from bottom to consider "at bottom"

export function MessageList() {
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const streamingMessageId = useChatStore((s) => s.streamingMessageId);
  const streamingTokens = useChatStore((s) => s.streamingTokens);
  const openSqlModal = useUiStore((s) => s.openSqlModal);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [userHasScrolledUp, setUserHasScrolledUp] = useState(false);

  // Check if user is near bottom
  const isNearBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_THRESHOLD;
  }, []);

  // Handle scroll events to detect manual scroll-up
  const handleScroll = useCallback(() => {
    if (isNearBottom()) {
      setUserHasScrolledUp(false);
    } else {
      setUserHasScrolledUp(true);
    }
  }, [isNearBottom]);

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    if (!userHasScrolledUp && sentinelRef.current) {
      sentinelRef.current.scrollIntoView?.({ behavior: "smooth" });
    }
  }, [messages, streamingTokens, userHasScrolledUp]);

  const scrollToBottom = useCallback(() => {
    setUserHasScrolledUp(false);
    sentinelRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, []);

  const handleShowSQL = useCallback(
    (executions: SqlExecution[]) => {
      openSqlModal(executions);
    },
    [openSqlModal]
  );

  const handleCopy = useCallback((content: string) => {
    navigator.clipboard.writeText(content);
  }, []);

  return (
    <div className="relative flex-1 flex flex-col overflow-hidden">
      <div
        data-testid="message-list-scroll"
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
        onScroll={handleScroll}
      >
        {messages.map((message) => {
          const isStreamingMessage =
            isStreaming && message.id === streamingMessageId;
          // For the streaming message, display streamingTokens instead of (possibly empty) content
          const displayContent = isStreamingMessage
            ? streamingTokens
            : message.content;

          return (
            <MessageBubble
              key={message.id}
              message={message}
              displayContent={displayContent}
              isCurrentlyStreaming={isStreamingMessage}
              onShowSQL={handleShowSQL}
              onCopy={handleCopy}
            />
          );
        })}

        {/* Scroll sentinel */}
        <div data-testid="scroll-sentinel" ref={sentinelRef} />
      </div>

      {/* Scroll to bottom button */}
      {userHasScrolledUp && (
        <button
          data-testid="scroll-to-bottom-btn"
          className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs shadow-md"
          style={{
            backgroundColor: "var(--color-surface)",
            color: "var(--color-text)",
          }}
          onClick={scrollToBottom}
        >
          Scroll to bottom
        </button>
      )}
    </div>
  );
}
