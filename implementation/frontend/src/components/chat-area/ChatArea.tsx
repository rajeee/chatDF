// Implements: spec/frontend/plan.md#component-hierarchy (ChatArea)
//
// Conditional rendering based on state:
// - No datasets AND no messages -> OnboardingGuide
// - Datasets exist but no messages -> SuggestedPrompts
// - Otherwise -> MessageList
// ChatInput is always visible at the bottom.
// SQLModal is rendered as a portal-style fixed overlay (self-managed via uiStore).

import { useCallback, useEffect, useRef } from "react";
import { useChatStore } from "@/stores/chatStore";
import { useDatasetStore } from "@/stores/datasetStore";
import { useKeyboardShortcuts, type ChatInputHandle } from "@/hooks/useKeyboardShortcuts";
import { apiPost } from "@/api/client";
import { OnboardingGuide } from "./OnboardingGuide";
import { SuggestedPrompts } from "./SuggestedPrompts";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { SQLModal } from "./SQLPanel";
import { ReasoningModal } from "./ReasoningModal";

export function ChatArea() {
  const messages = useChatStore((s) => s.messages);
  const addMessage = useChatStore((s) => s.addMessage);
  const setStreaming = useChatStore((s) => s.setStreaming);
  const setLoadingPhase = useChatStore((s) => s.setLoadingPhase);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const datasets = useDatasetStore((s) => s.datasets);

  const hasDatasets = datasets.length > 0;
  const hasMessages = messages.length > 0;

  // Ref for chat input to enable keyboard shortcuts
  const chatInputRef = useRef<ChatInputHandle>(null);

  const handleSend = useCallback(
    async (text: string) => {
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
      } catch (err) {
        console.error("Failed to send message:", err);
        setLoadingPhase("idle");
        setStreaming(false);
      }
    },
    [addMessage, setStreaming, setLoadingPhase, activeConversationId, setActiveConversation]
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

  return (
    <section
      data-testid="chat-area"
      className="relative flex flex-col flex-1 min-w-0 items-center"
      style={{ backgroundColor: "var(--color-bg)" }}
    >
      {/* Constrained-width inner container */}
      <div className="flex flex-col w-full max-w-3xl flex-1">
        {/* Main content area - conditional rendering */}
        <div className="flex-1 flex flex-col">
          {!hasDatasets && !hasMessages && (
            <OnboardingGuide onSendPrompt={handleSend} />
          )}

          {hasDatasets && !hasMessages && (
            <SuggestedPrompts
              datasetNames={datasets.map((d) => d.name)}
              onSendPrompt={handleSend}
            />
          )}

          {hasMessages && <MessageList />}
        </div>

        {/* Chat input - sticky at bottom */}
        <div
          className="p-4 border-t sticky bottom-0"
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

      {/* Reasoning Modal */}
      <ReasoningModal />
    </section>
  );
}
