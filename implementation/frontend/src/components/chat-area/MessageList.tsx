// Implements: spec/frontend/chat_area/message_list/plan.md
//
// Message container that renders into the document flow (uses document scroll).
// Maps over chatStore.messages to render MessageBubble components.
// Handles streaming display by merging streamingTokens into the active message.

import { useRef, useEffect, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useChatStore, type SqlExecution } from "@/stores/chatStore";
import { useUiStore } from "@/stores/uiStore";
import { MessageBubble } from "./MessageBubble";
import { exportAsMarkdown, downloadMarkdown } from "@/utils/exportMarkdown";
import { exportAsJson, downloadJson } from "@/utils/exportJson";

const SCROLL_THRESHOLD = 100; // px from bottom to consider "at bottom"

interface MessageListProps {
  /** When true, the first message gets a more dramatic entrance animation */
  isFirstMessageEntrance?: boolean;
  onRetry?: (messageId: string, content: string) => void;
}

export function MessageList({ isFirstMessageEntrance = false, onRetry }: MessageListProps) {
  const queryClient = useQueryClient();
  const messages = useChatStore((s) => s.messages);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  // Only subscribe to isStreaming for scroll behavior - not streamingTokens
  // This prevents MessageList from re-rendering on every token during streaming
  const isStreaming = useChatStore((s) => s.isStreaming);
  const streamingMessageId = useChatStore((s) => s.streamingMessageId);
  const openSqlModal = useUiStore((s) => s.openSqlModal);
  const openChartModal = useUiStore((s) => s.openChartModal);
  const openReasoningModal = useUiStore((s) => s.openReasoningModal);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const [userHasScrolledUp, setUserHasScrolledUp] = useState(false);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const scrollRafRef = useRef<number | null>(null);

  // Check if user is near bottom of page
  const isNearBottom = useCallback(() => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollHeight = document.documentElement.scrollHeight;
    const clientHeight = document.documentElement.clientHeight;
    return scrollHeight - scrollTop - clientHeight < SCROLL_THRESHOLD;
  }, []);

  // Check if user is near top of page
  const isNearTop = useCallback(() => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    return scrollTop < SCROLL_THRESHOLD;
  }, []);

  // Handle scroll events to detect manual scroll-up
  useEffect(() => {
    const handleScroll = () => {
      setUserHasScrolledUp(!isNearBottom());
      setShowScrollToTop(!isNearTop());
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isNearBottom, isNearTop]);

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

  const scrollToTop = useCallback(() => {
    setShowScrollToTop(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
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

  const handleVisualize = useCallback(
    (executions: SqlExecution[], index: number) => {
      if (executions[index]) {
        openChartModal(executions[index]);
      }
    },
    [openChartModal]
  );

  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const exportDropdownRef = useRef<HTMLDivElement>(null);

  // Close export dropdown on click outside
  useEffect(() => {
    if (!exportDropdownOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        exportDropdownRef.current &&
        !exportDropdownRef.current.contains(e.target as Node)
      ) {
        setExportDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [exportDropdownOpen]);

  // Close export dropdown on Escape
  useEffect(() => {
    if (!exportDropdownOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setExportDropdownOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [exportDropdownOpen]);

  const getExportTitle = useCallback(() => {
    let title = "Conversation";
    if (activeConversationId) {
      const cached = queryClient.getQueryData<{ title?: string }>([
        "conversations",
        activeConversationId,
      ]);
      if (cached?.title) {
        title = cached.title;
      }
    }
    return title;
  }, [activeConversationId, queryClient]);

  const handleExportMarkdown = useCallback(() => {
    const title = getExportTitle();
    const markdown = exportAsMarkdown(messages, title);
    const safeTitle = title.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
    downloadMarkdown(markdown, `${safeTitle}.md`);
    setExportDropdownOpen(false);
  }, [messages, getExportTitle]);

  const handleExportJson = useCallback(() => {
    const title = getExportTitle();
    const json = exportAsJson(messages, title);
    const safeTitle = title.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
    downloadJson(json, `${safeTitle}.json`);
    setExportDropdownOpen(false);
  }, [messages, getExportTitle]);

  return (
    <div className="flex flex-col">
      {messages.length > 0 && (
        <div className="flex justify-end px-2 sm:px-4 pt-2">
          <div className="relative" ref={exportDropdownRef}>
            <button
              data-testid="export-btn"
              className="p-1.5 rounded text-xs opacity-40 hover:opacity-100 hover:bg-gray-500/10 active:scale-90 transition-all duration-150"
              style={{ color: "var(--color-text)" }}
              onClick={() => setExportDropdownOpen((o) => !o)}
              title="Export conversation"
              aria-label="Export conversation"
              aria-expanded={exportDropdownOpen}
              aria-haspopup="true"
            >
              <svg
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
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>

            {exportDropdownOpen && (
              <div
                data-testid="export-dropdown"
                className="absolute right-0 mt-1 w-48 rounded-lg border shadow-lg z-50 py-1"
                style={{
                  backgroundColor: "var(--color-surface)",
                  borderColor: "var(--color-border)",
                }}
                role="menu"
              >
                <button
                  data-testid="export-markdown-btn"
                  className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-gray-500/10 transition-colors"
                  style={{ color: "var(--color-text)" }}
                  onClick={handleExportMarkdown}
                  role="menuitem"
                >
                  {/* Markdown icon (M) */}
                  <svg
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
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="M6 8v8l3-4 3 4V8" />
                    <path d="M18 12l-2-2v4" />
                  </svg>
                  Export as Markdown
                </button>
                <button
                  data-testid="export-json-btn"
                  className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-gray-500/10 transition-colors"
                  style={{ color: "var(--color-text)" }}
                  onClick={handleExportJson}
                  role="menuitem"
                >
                  {/* JSON icon (braces) */}
                  <svg
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
                    <path d="M8 3H6a2 2 0 0 0-2 2v2" />
                    <path d="M4 13v2a2 2 0 0 0 2 2h2" />
                    <path d="M16 3h2a2 2 0 0 1 2 2v2" />
                    <path d="M20 13v2a2 2 0 0 1-2 2h-2" />
                    <path d="M9 10h1" />
                    <path d="M14 10h1" />
                    <path d="M9 14h6" />
                  </svg>
                  Export as JSON
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div
        data-testid="message-list-scroll"
        className={`px-2 py-2 sm:px-4 sm:py-4 space-y-3 sm:space-y-4${isFirstMessageEntrance ? " first-message-entrance" : ""}`}
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
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
              onVisualize={handleVisualize}
              onRetry={onRetry}
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
          className="fixed bottom-20 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full text-xs shadow-md z-10 flex items-center gap-1.5 hover:shadow-lg active:scale-95 transition-all duration-150"
          style={{
            backgroundColor: "var(--color-surface)",
            color: "var(--color-text)",
            border: "1px solid var(--color-border)",
          }}
          onClick={scrollToBottom}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
          Scroll to bottom
        </button>
      )}

      {/* Scroll to top button */}
      {showScrollToTop && (
        <button
          data-testid="scroll-to-top-btn"
          className="fixed top-20 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full text-xs shadow-md z-10 flex items-center gap-1.5 hover:shadow-lg active:scale-95 transition-all duration-150"
          style={{
            backgroundColor: "var(--color-surface)",
            color: "var(--color-text)",
            border: "1px solid var(--color-border)",
          }}
          onClick={scrollToTop}
          title="Scroll to top"
          aria-label="Scroll to top"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="18 15 12 9 6 15" />
          </svg>
          Scroll to top
        </button>
      )}
    </div>
  );
}
