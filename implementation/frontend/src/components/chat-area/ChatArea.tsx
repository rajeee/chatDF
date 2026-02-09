// Implements: spec/frontend/plan.md#component-hierarchy (ChatArea)
//
// Conditional rendering based on state:
// - No datasets AND no messages -> OnboardingGuide
// - Datasets exist but no messages -> SuggestedPrompts
// - Otherwise -> MessageList
// ChatInput is always visible at the bottom.
// SQLModal is rendered as a portal-style fixed overlay (self-managed via uiStore).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useChatStore } from "@/stores/chatStore";
import { useDatasetStore, filterDatasetsByConversation } from "@/stores/datasetStore";
import { useKeyboardShortcuts, type ChatInputHandle } from "@/hooks/useKeyboardShortcuts";
import { apiPost, apiPatch } from "@/api/client";
import { useToastStore } from "@/stores/toastStore";
import { generateTitle } from "@/utils/generateTitle";
import { OnboardingGuide } from "./OnboardingGuide";
import { SuggestedPrompts } from "./SuggestedPrompts";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { SQLModal } from "./SQLPanel";
import { ChartModal } from "./ChartModal";
import { ReasoningModal } from "./ReasoningModal";
import { KeyboardShortcutsModal } from "./KeyboardShortcutsModal";
import { LiveRegion } from "./LiveRegion";
import { SkeletonMessages } from "./SkeletonMessages";
import { FollowupSuggestions } from "./FollowupSuggestions";
import { ShareDialog } from "./ShareDialog";
import { SavedQueries } from "./SavedQueries";

export function ChatArea() {
  const queryClient = useQueryClient();
  const messages = useChatStore((s) => s.messages);
  const addMessage = useChatStore((s) => s.addMessage);
  const setStreaming = useChatStore((s) => s.setStreaming);
  const setLoadingPhase = useChatStore((s) => s.setLoadingPhase);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const isLoadingMessages = useChatStore((s) => s.isLoadingMessages);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const allDatasets = useDatasetStore((s) => s.datasets);
  const datasets = useMemo(
    () => filterDatasetsByConversation(allDatasets, activeConversationId),
    [allDatasets, activeConversationId]
  );

  const hasDatasets = datasets.length > 0;
  const hasMessages = messages.length > 0;

  // Track exit animation for SuggestedPrompts / OnboardingGuide
  const [exitingPanel, setExitingPanel] = useState<"suggested" | "onboarding" | null>(null);
  const prevShowSuggested = useRef(false);
  const prevShowOnboarding = useRef(false);

  const showSuggested = hasDatasets && !hasMessages;
  const showOnboarding = !hasDatasets && !hasMessages;

  useEffect(() => {
    // SuggestedPrompts was visible, now it's not → animate exit
    if (prevShowSuggested.current && !showSuggested) {
      setExitingPanel("suggested");
      const timer = setTimeout(() => setExitingPanel(null), 300);
      prevShowSuggested.current = false;
      return () => clearTimeout(timer);
    }
    // OnboardingGuide was visible, now it's not → animate exit
    if (prevShowOnboarding.current && !showOnboarding) {
      setExitingPanel("onboarding");
      const timer = setTimeout(() => setExitingPanel(null), 300);
      prevShowOnboarding.current = false;
      return () => clearTimeout(timer);
    }
    prevShowSuggested.current = showSuggested;
    prevShowOnboarding.current = showOnboarding;
  }, [showSuggested, showOnboarding]);

  // Ref for chat input to enable keyboard shortcuts
  const chatInputRef = useRef<ChatInputHandle>(null);

  const handleSend = useCallback(
    async (text: string) => {
      // Check if this is the first message BEFORE adding it to the store
      const isFirstMessage = messages.length === 0;

      // Clear any follow-up suggestions when user sends a new message
      useChatStore.getState().setFollowupSuggestions([]);

      // Optimistic: show user message immediately
      const userMessage = {
        id: `msg-${Date.now()}`,
        role: "user" as const,
        content: text,
        sql_query: null,
        sql_executions: [],
        reasoning: null,
        created_at: new Date().toISOString(),
      };
      addMessage(userMessage);
      setLoadingPhase("thinking");

      try {
        // Auto-create conversation if none active
        let convId = activeConversationId;
        if (!convId) {
          const newConv = await apiPost<{ id: string }>("/conversations");
          convId = newConv.id;
          setActiveConversation(convId);
        }

        // Send message to backend — response streams back via WebSocket
        await apiPost<{ message_id: string; status: string }>(
          `/conversations/${convId}/messages`,
          { content: text }
        );

        // Backend acknowledged — streaming will begin via WS (chat_token events).
        // The WS chat_token handler sets streaming=true on the first token.

        // Auto-generate conversation title from the first user message
        if (isFirstMessage) {
          const title = generateTitle(text);
          // Fire-and-forget: don't block on the title update
          apiPatch(`/conversations/${convId}`, { title }).then(() => {
            // Optimistically update the conversation list cache so the
            // left panel reflects the new title immediately
            queryClient.setQueryData<{ conversations: Array<{ id: string; title: string }> }>(
              ["conversations"],
              (old) => {
                if (!old) return old;
                return {
                  ...old,
                  conversations: old.conversations.map((c) =>
                    c.id === convId ? { ...c, title } : c
                  ),
                };
              }
            );
          }).catch((err) => {
            console.error("Failed to auto-generate conversation title:", err);
          });
        }
      } catch (err) {
        console.error("Failed to send message:", err);
        const errorMsg = err instanceof Error ? err.message : "Failed to send message";
        useToastStore.getState().error(errorMsg, undefined, {
          label: "Retry",
          onClick: () => handleSend(text),
        });
        useChatStore.getState().markMessageFailed(userMessage.id);
        setLoadingPhase("idle");
        setStreaming(false);
      }
    },
    [addMessage, setStreaming, setLoadingPhase, activeConversationId, setActiveConversation, queryClient, messages]
  );

  // Enable global keyboard shortcuts
  useKeyboardShortcuts({
    chatInputRef,
  });

  // Auto-focus chat input when switching conversations
  useEffect(() => {
    if (activeConversationId && chatInputRef.current) {
      // Small delay to allow the conversation to load before focusing
      const timer = setTimeout(() => {
        chatInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [activeConversationId]);

  // Clear skeleton loading state when messages arrive
  useEffect(() => {
    if (hasMessages && useChatStore.getState().isLoadingMessages) {
      useChatStore.getState().setLoadingMessages(false);
    }
  }, [hasMessages]);

  const handleStop = useCallback(async () => {
    if (!activeConversationId) return;
    try {
      await apiPost(`/conversations/${activeConversationId}/stop`);
    } catch (err) {
      console.error("Failed to stop generation:", err);
    }
  }, [activeConversationId]);

  const handleRetry = useCallback(
    (messageId: string, content: string) => {
      // Remove the failed message
      useChatStore.getState().removeMessage(messageId);
      // Re-send
      handleSend(content);
    },
    [handleSend]
  );

  // Run a saved query by inserting it into the chat input and auto-sending
  const handleRunQuery = useCallback((query: string) => {
    chatInputRef.current?.setInputValue(query);
    setTimeout(() => chatInputRef.current?.sendMessage(), 50);
  }, []);

  // Share dialog state
  const [shareOpen, setShareOpen] = useState(false);
  const shareContainerRef = useRef<HTMLDivElement>(null);

  return (
    <section
      id="main-content"
      tabIndex={-1}
      data-testid="chat-area"
      className="relative flex flex-col flex-1 min-w-0 items-center outline-none"
      style={{ backgroundColor: "var(--color-bg)" }}
    >
      {/* ARIA live region for screen reader announcements */}
      <LiveRegion />

      {/* Constrained-width inner container */}
      <div className="flex flex-col w-full max-w-3xl flex-1">
        {/* Share button - visible when conversation has messages */}
        {hasMessages && activeConversationId && (
          <div className="flex justify-end px-2 sm:px-4 pt-2">
            <div className="relative" ref={shareContainerRef}>
              <button
                data-testid="share-btn"
                className="p-1.5 rounded text-xs opacity-40 hover:opacity-100 hover:bg-gray-500/10 active:scale-90 transition-all duration-150"
                style={{ color: "var(--color-text)" }}
                onClick={() => setShareOpen((o) => !o)}
                title="Share conversation"
                aria-label="Share conversation"
                aria-expanded={shareOpen}
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
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
              </button>
              {shareOpen && (
                <ShareDialog
                  conversationId={activeConversationId}
                  onClose={() => setShareOpen(false)}
                />
              )}
            </div>
          </div>
        )}

        {/* Main content area - conditional rendering */}
        <div className="flex-1 flex flex-col">
          {showOnboarding && (
            <OnboardingGuide onSendPrompt={handleSend} />
          )}

          {(showSuggested || exitingPanel === "suggested") && (
            <div className={exitingPanel === "suggested" ? "onboarding-exit" : ""}>
              <SuggestedPrompts
                datasets={datasets}
                onSendPrompt={handleSend}
              />
            </div>
          )}

          {exitingPanel === "onboarding" && (
            <div className="onboarding-exit">
              <OnboardingGuide onSendPrompt={handleSend} />
            </div>
          )}

          {isLoadingMessages && !hasMessages && !showOnboarding && !showSuggested && (
            <SkeletonMessages />
          )}

          {hasMessages && <MessageList isFirstMessageEntrance={exitingPanel === "onboarding"} onRetry={handleRetry} />}
        </div>

        {/* Follow-up suggestion chips */}
        <FollowupSuggestions onSendPrompt={handleSend} />

        {/* Saved queries + Chat input - sticky at bottom */}
        <div
          className="sticky bottom-0 safe-area-bottom"
          style={{
            backgroundColor: "var(--color-bg)",
          }}
        >
          <SavedQueries onRunQuery={handleRunQuery} />
          <div
            className="p-2 sm:p-4 border-t"
            style={{
              borderColor: "var(--color-border)",
            }}
          >
            <ChatInput ref={chatInputRef} onSend={handleSend} onStop={handleStop} />
          </div>
        </div>
      </div>

      {/* SQL Modal (self-managed visibility via uiStore) */}
      <SQLModal />

      {/* Direct Chart Modal (opened by Visualize button in chat) */}
      <ChartModal />

      {/* Reasoning Modal */}
      <ReasoningModal />

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal />
    </section>
  );
}
