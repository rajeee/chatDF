// Implements: spec/frontend/chat_area/message_list/plan.md
//
// Message container that renders into the document flow (uses document scroll).
// Maps over chatStore.messages to render MessageBubble components.
// Handles streaming display by merging streamingTokens into the active message.

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useChatStore, type SqlExecution } from "@/stores/chatStore";
import { useUiStore } from "@/stores/uiStore";
import { useToastStore } from "@/stores/toastStore";
import { MessageBubble } from "./MessageBubble";
import { SearchBar } from "./SearchBar";
import { exportAsMarkdown, downloadMarkdown } from "@/utils/exportMarkdown";
import { exportAsJson, downloadJson } from "@/utils/exportJson";
import { deleteMessage, forkConversation, branchConversation, redoMessage, exportConversationHtml } from "@/api/client";
import { TokenUsage } from "./TokenUsage";

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
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  // Only subscribe to isStreaming for scroll behavior - not streamingTokens
  // This prevents MessageList from re-rendering on every token during streaming
  const isStreaming = useChatStore((s) => s.isStreaming);
  const streamingMessageId = useChatStore((s) => s.streamingMessageId);
  const searchQuery = useChatStore((s) => s.searchQuery);
  const searchOpen = useChatStore((s) => s.searchOpen);
  const messageDensity = useUiStore((s) => s.messageDensity);
  const openSqlModal = useUiStore((s) => s.openSqlModal);
  const openChartModal = useUiStore((s) => s.openChartModal);
  const openReasoningModal = useUiStore((s) => s.openReasoningModal);
  const showToast = useToastStore((s) => s.showToast);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const [userHasScrolledUp, setUserHasScrolledUp] = useState(false);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const scrollRafRef = useRef<number | null>(null);

  // Track initial load message count for staggered cascade animation.
  // When a conversation is first loaded (or switched to), we record how many
  // messages arrived in the initial batch so only those get the cascade delay.
  // New messages added during live chat use the regular message-appear animation.
  const initialLoadCountRef = useRef<number | null>(null);
  const prevConversationRef = useRef<string | null>(null);

  // Reset on conversation switch
  useEffect(() => {
    if (activeConversationId !== prevConversationRef.current) {
      initialLoadCountRef.current = null;
      prevConversationRef.current = activeConversationId;
    }
  }, [activeConversationId]);

  // Set initial count on first message batch
  useEffect(() => {
    if (messages.length > 0 && initialLoadCountRef.current === null) {
      initialLoadCountRef.current = messages.length;
    }
  }, [messages.length]);

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

  // Handle scroll events to detect manual scroll-up (throttled for performance)
  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => {
          setUserHasScrolledUp(!isNearBottom());
          setShowScrollToTop(!isNearTop());
          const scrollTop = window.scrollY || document.documentElement.scrollTop;
          const scrollHeight = document.documentElement.scrollHeight;
          const clientHeight = document.documentElement.clientHeight;
          const maxScroll = scrollHeight - clientHeight;
          setScrollProgress(maxScroll > 0 ? (scrollTop / maxScroll) * 100 : 0);
          ticking = false;
        });
      }
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

  const handleFork = useCallback(
    async (messageId: string) => {
      if (!activeConversationId) return;

      try {
        const result = await forkConversation(activeConversationId, messageId);
        // Invalidate conversations list to refresh sidebar
        await queryClient.invalidateQueries({ queryKey: ["conversations"] });
        // Switch to the new conversation
        setActiveConversation(result.id);
        // Show success toast
        showToast("Forked to new conversation", "success");
      } catch (error) {
        console.error("Failed to fork conversation:", error);
        showToast("Failed to fork conversation", "error");
      }
    },
    [activeConversationId, queryClient, setActiveConversation, showToast]
  );

  const handleBranch = useCallback(
    async (messageId: string) => {
      if (!activeConversationId) return;

      try {
        const result = await branchConversation(activeConversationId, messageId);
        // Invalidate conversations list to refresh sidebar
        await queryClient.invalidateQueries({ queryKey: ["conversations"] });
        // Switch to the new conversation
        setActiveConversation(result.id);
        // Show success toast
        showToast("Branched conversation created", "success");
      } catch (error) {
        console.error("Failed to branch conversation:", error);
        showToast("Failed to branch conversation", "error");
      }
    },
    [activeConversationId, queryClient, setActiveConversation, showToast]
  );

  const handleDelete = useCallback(
    async (messageId: string) => {
      if (!activeConversationId) return;

      try {
        await deleteMessage(activeConversationId, messageId);
        useChatStore.getState().removeMessage(messageId);
        showToast("Message deleted", "success");
      } catch (error) {
        console.error("Failed to delete message:", error);
        showToast("Failed to delete message", "error");
      }
    },
    [activeConversationId, showToast]
  );

  const handleRedo = useCallback(
    async (messageId: string) => {
      if (!activeConversationId) return;

      try {
        await redoMessage(activeConversationId, messageId);
        showToast("Redoing message...", "success");
      } catch (error) {
        console.error("Failed to redo message:", error);
        showToast("Failed to redo message", "error");
      }
    },
    [activeConversationId, showToast]
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

  const handleExportHtml = useCallback(async () => {
    if (!activeConversationId) return;
    setExportDropdownOpen(false);
    try {
      await exportConversationHtml(activeConversationId);
    } catch (error) {
      console.error("Failed to export as HTML:", error);
      showToast("Failed to export as HTML", "error");
    }
  }, [activeConversationId, showToast]);

  // Filter messages by search query (case-insensitive content match)
  const filteredMessages = useMemo(() => {
    if (!searchQuery) return messages;
    const q = searchQuery.toLowerCase();
    return messages.filter((m) => m.content.toLowerCase().includes(q));
  }, [messages, searchQuery]);

  return (
    <div className="flex flex-col">
      <div
        data-testid="scroll-progress"
        className="sticky top-0 z-10 h-0.5 transition-all duration-100"
        style={{
          width: `${scrollProgress}%`,
          background: "linear-gradient(90deg, var(--color-accent), var(--color-success))",
          opacity: scrollProgress > 0 && scrollProgress < 100 ? 0.6 : 0,
        }}
      />
      {searchOpen && <SearchBar />}

      {messages.length > 0 && (
        <div className="flex items-center justify-end gap-2 px-2 sm:px-4 pt-2">
          <TokenUsage />
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
                className="absolute right-0 mt-1 w-48 rounded-lg border shadow-lg z-50 py-1 dropdown-enter"
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
                <button
                  data-testid="export-html-btn"
                  className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-gray-500/10 transition-colors"
                  style={{ color: "var(--color-text)" }}
                  onClick={handleExportHtml}
                  role="menuitem"
                >
                  {/* HTML icon (code brackets) */}
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
                    <polyline points="16 18 22 12 16 6" />
                    <polyline points="8 6 2 12 8 18" />
                  </svg>
                  Export as HTML
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div
        data-testid="message-list-scroll"
        className={`${
          ({
            compact: "px-2 py-1 space-y-1 sm:px-3 sm:py-2 sm:space-y-2",
            normal: "px-2 py-2 space-y-3 sm:px-4 sm:py-4 sm:space-y-4",
            spacious: "px-3 py-3 space-y-5 sm:px-6 sm:py-6 sm:space-y-6",
          })[messageDensity]
        }${isFirstMessageEntrance ? " first-message-entrance" : ""}`}
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
      >
        {filteredMessages.map((message, index) => {
          const isStreamingMessage =
            isStreaming && message.id === streamingMessageId;
          // Only stagger the initial batch of messages, cap at 10 to keep it snappy
          const isInitialMessage =
            initialLoadCountRef.current !== null &&
            index < initialLoadCountRef.current;
          const staggerIndex = isInitialMessage
            ? Math.min(index, 10)
            : undefined;

          return (
            <MessageBubble
              key={message.id}
              message={message}
              isCurrentlyStreaming={isStreamingMessage}
              staggerIndex={staggerIndex}
              onShowSQL={handleShowSQL}
              onShowReasoning={handleShowReasoning}
              onCopy={handleCopy}
              onVisualize={handleVisualize}
              onRetry={onRetry}
              onFork={handleFork}
              onBranch={handleBranch}
              onDelete={handleDelete}
              onRedo={handleRedo}
              searchQuery={searchQuery}
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
