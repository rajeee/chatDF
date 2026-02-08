// Implements: spec/frontend/chat_area/message_list/plan.md
//
// Message container that renders into the document flow (uses document scroll).
// Maps over chatStore.messages to render MessageBubble components.
// Handles streaming display by merging streamingTokens into the active message.

import { useRef, useEffect, useState, useCallback } from "react";
import { useChatStore, type SqlExecution } from "@/stores/chatStore";
import { useUiStore } from "@/stores/uiStore";
import { MessageBubble } from "./MessageBubble";

const SCROLL_THRESHOLD = 100; // px from bottom to consider "at bottom"

export function MessageList() {
  const messages = useChatStore((s) => s.messages);
  // Only subscribe to isStreaming for scroll behavior - not streamingTokens
  // This prevents MessageList from re-rendering on every token during streaming
  const isStreaming = useChatStore((s) => s.isStreaming);
  const streamingMessageId = useChatStore((s) => s.streamingMessageId);
  const openSqlModal = useUiStore((s) => s.openSqlModal);
  const openReasoningModal = useUiStore((s) => s.openReasoningModal);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const [userHasScrolledUp, setUserHasScrolledUp] = useState(false);
  const scrollRafRef = useRef<number | null>(null);

  // Check if user is near bottom of page
  const isNearBottom = useCallback(() => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollHeight = document.documentElement.scrollHeight;
    const clientHeight = document.documentElement.clientHeight;
    return scrollHeight - scrollTop - clientHeight < SCROLL_THRESHOLD;
  }, []);

  // Handle scroll events to detect manual scroll-up
  useEffect(() => {
    const handleScroll = () => {
      setUserHasScrolledUp(!isNearBottom());
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isNearBottom]);

  // Auto-scroll to bottom when new content arrives
  // Uses requestAnimationFrame for smoother performance during streaming
  // Note: We don't depend on streamingTokens here to avoid re-running on every token.
  // Scrolling is handled by the browser's smooth scroll behavior and triggered on message changes.
  useEffect(() => {
    if (!userHasScrolledUp && sentinelRef.current) {
      // Cancel any pending scroll animation
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
      }

      // Schedule scroll on next animation frame for smooth performance
      scrollRafRef.current = requestAnimationFrame(() => {
        sentinelRef.current?.scrollIntoView?.({ behavior: "smooth" });
        scrollRafRef.current = null;
      });
    }

    // Cleanup: cancel pending animation on unmount
    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [messages, userHasScrolledUp]);

  const scrollToBottom = useCallback(() => {
    setUserHasScrolledUp(false);
    // Use requestAnimationFrame for smooth scroll on manual button click too
    requestAnimationFrame(() => {
      sentinelRef.current?.scrollIntoView?.({ behavior: "smooth" });
    });
  }, []);

  const handleShowSQL = useCallback(
    (executions: SqlExecution[]) => {
      openSqlModal(executions);
    },
    [openSqlModal]
  );

  const handleShowReasoning = useCallback(
    (reasoning: string) => {
      openReasoningModal(reasoning);
    },
    [openReasoningModal]
  );

  const handleCopy = useCallback((content: string) => {
    navigator.clipboard.writeText(content);
  }, []);

  const handleCopySQL = useCallback((sql: string) => {
    navigator.clipboard.writeText(sql);
  }, []);

  return (
    <div className="flex flex-col">
      <div
        data-testid="message-list-scroll"
        className="px-4 py-4 space-y-4"
      >
        {messages.map((message) => {
          const isStreamingMessage =
            isStreaming && message.id === streamingMessageId;

          return (
            <MessageBubble
              key={message.id}
              message={message}
              isCurrentlyStreaming={isStreamingMessage}
              onShowSQL={handleShowSQL}
              onShowReasoning={handleShowReasoning}
              onCopy={handleCopy}
              onCopySQL={handleCopySQL}
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
          className="fixed bottom-20 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs shadow-md z-10"
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
