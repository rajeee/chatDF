// Implements: spec/frontend/plan.md#state-management-architecture
//
// Manages active conversation loading/switching.
// Sets chatStore.activeConversationId.
// Fetches conversation detail (messages + datasets) on switch.

import { useCallback, useEffect, useRef } from "react";
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

  // Track which conversation we already populated to avoid duplicate work
  const populatedRef = useRef<string | null>(null);

  // Reset populated ref when switching conversations so data reloads
  useEffect(() => {
    populatedRef.current = null;
  }, [activeConversationId]);

  // When conversation data loads, populate stores in a single batched update
  useEffect(() => {
    if (!conversation || !activeConversationId) return;
    // Skip if we already populated this exact conversation
    if (populatedRef.current === activeConversationId) return;
    populatedRef.current = activeConversationId;

    // Batch all messages into a single store update (not one-by-one)
    if (conversation.messages.length > 0) {
      const prepared = conversation.messages.map((msg) => ({
        ...msg,
        sql_executions: msg.sql_executions ?? parseSqlExecutions(msg.sql_query),
        reasoning: msg.reasoning ?? null,
        tool_call_trace: Array.isArray(msg.tool_call_trace)
          ? msg.tool_call_trace
          : typeof msg.tool_call_trace === "string"
            ? (() => { try { return JSON.parse(msg.tool_call_trace); } catch { return null; } })()
            : msg.tool_call_trace ?? null,
      }));
      useChatStore.getState().loadMessages(prepared);
    } else {
      useChatStore.getState().loadMessages([]);
    }

    // Populate datasets for this conversation
    if (conversation.datasets.length > 0) {
      const convDatasets = conversation.datasets.map((ds) => ({
        ...ds,
        conversation_id: conversation.id,
        status: ds.status ?? "ready",
        schema_json: ds.schema_json ?? "{}",
        error_message: ds.error_message ?? null,
      }));
      useDatasetStore.getState().setConversationDatasets(conversation.id, convDatasets);
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
