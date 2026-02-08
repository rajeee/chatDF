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

export function ChatArea() {
  const queryClient = useQueryClient();
  const messages = useChatStore((s) => s.messages);
  const addMessage = useChatStore((s) => s.addMessage);
  const setStreaming = useChatStore((s) => s.setStreaming);
  const setLoadingPhase = useChatStore((s) => s.setLoadingPhase);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
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
        useToastStore.getState().error(errorMsg);
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

          {hasMessages && <MessageList isFirstMessageEntrance={exitingPanel === "onboarding"} onRetry={handleRetry} />}
        </div>

        {/* Chat input - sticky at bottom */}
        <div
          className="p-2 sm:p-4 border-t sticky bottom-0 safe-area-bottom"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-bg)",
          }}
        >
          <ChatInput ref={chatInputRef} onSend={handleSend} onStop={handleStop} />
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
