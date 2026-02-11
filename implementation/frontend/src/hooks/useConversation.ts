// Implements: spec/frontend/plan.md#state-management-architecture
//
// Manages active conversation loading/switching.
// Sets chatStore.activeConversationId.
// Fetches conversation detail (messages + datasets) on switch.

import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet } from "@/api/client";
import { useChatStore, parseSqlExecutions, type Message } from "@/stores/chatStore";
import { useDatasetStore, type Dataset } from "@/stores/datasetStore";

interface ConversationDetail {
  id: string;
  title: string;
  messages: Message[];
  datasets: Dataset[];
}

export function useConversation() {
  const queryClient = useQueryClient();
  const activeConversationId = useChatStore(
    (state) => state.activeConversationId
  );

  const { data: conversation, isLoading } = useQuery({
    queryKey: ["conversations", activeConversationId],
    queryFn: () =>
      apiGet<ConversationDetail>(
        `/conversations/${activeConversationId}`
      ),
    enabled: activeConversationId != null,
    staleTime: 30_000, // 30s
  });

  // When conversation data loads, populate stores (must run in useEffect,
  // not during render, to avoid setState-during-render infinite loops)
  useEffect(() => {
    if (!conversation || !activeConversationId) return;

    const chatState = useChatStore.getState();
    // Only populate if messages are empty (first load or switch)
    if (chatState.messages.length === 0 && conversation.messages.length > 0) {
      for (const msg of conversation.messages) {
        chatState.addMessage({
          ...msg,
          sql_executions: msg.sql_executions ?? parseSqlExecutions(msg.sql_query),
          reasoning: msg.reasoning ?? null,
        });
      }
    }
    // Populate datasets for this conversation (merge with existing store)
    if (conversation.datasets.length > 0) {
      const datasetState = useDatasetStore.getState();
      const convDatasets = conversation.datasets.map((ds) => ({
        ...ds,
        conversation_id: conversation.id,
        status: ds.status ?? "ready",
        schema_json: ds.schema_json ?? "{}",
        error_message: ds.error_message ?? null,
      }));
      datasetState.setConversationDatasets(conversation.id, convDatasets);
    }
  }, [conversation, activeConversationId]);

  const switchConversation = useCallback(
    (conversationId: string | null) => {
      // Reset chat messages (per-conversation), keep datasets (already filtered by conversation_id)
      useChatStore.getState().setActiveConversation(conversationId);
      // Invalidate the conversation query to force a refetch
      if (conversationId) {
        void queryClient.invalidateQueries({
          queryKey: ["conversations", conversationId],
        });
      }
    },
    [queryClient]
  );

  return {
    activeConversationId,
    conversation: conversation ?? null,
    isLoading,
    switchConversation,
  };
}
