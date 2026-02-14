// Implements: spec/frontend/plan.md#websocket-integration
//
// Connects ChatDFSocket on mount when authenticated.
// Disconnects on unmount/logout.
// Routes incoming events to Zustand stores:
//   chat_token / chat_complete / chat_error -> chatStore
//   dataset_loaded / dataset_error -> datasetStore
//   usage_update / rate_limit_warning -> uiStore + invalidate ["usage"] query

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChatDFSocket } from "@/lib/websocket";
import { useChatStore, type SqlExecution, type TraceEntry } from "@/stores/chatStore";
import { useConnectionStore } from "@/stores/connectionStore";
import { useDatasetStore } from "@/stores/datasetStore";
import { useQueryHistoryStore } from "@/stores/queryHistoryStore";
import { useToastStore } from "@/stores/toastStore";

interface WsMessage {
  type: string;
  [key: string]: unknown;
}

export function useWebSocket(isAuthenticated: boolean): void {
  const queryClient = useQueryClient();
  const socketRef = useRef<ChatDFSocket | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const socket = new ChatDFSocket();
    socketRef.current = socket;

    socket.onMessage((data: unknown) => {
      const msg = data as WsMessage;
      if (!msg || typeof msg.type !== "string") {
        return;
      }

      // Guard: ignore chat/tool events for a different conversation.
      // The backend injects `cid` (conversation_id) into every WS message.
      // If the event is for a conversation we're not viewing, discard it
      // to prevent cross-conversation state pollution on rapid switching.
      const eventConvId = msg.cid as string | undefined;
      const isForActiveConversation = () => {
        if (!eventConvId) return true; // no cid = legacy/global event, allow
        return useChatStore.getState().activeConversationId === eventConvId;
      };

      switch (msg.type) {
        case "rt": // reasoning_token (compressed)
        case "reasoning_token": {
          if (!isForActiveConversation()) break;
          const chatStore = useChatStore.getState();
          if (!chatStore.isStreaming) {
            // First reasoning token: add placeholder message
            const tempId = `streaming-${Date.now()}`;
            chatStore.addMessage({
              id: tempId,
              role: "assistant",
              content: "",
              sql_query: null,
              sql_executions: [],
              reasoning: null,
              created_at: new Date().toISOString(),
            });
            chatStore.setStreaming(true, tempId);
            chatStore.setReasoning(true);
          }
          chatStore.appendReasoningToken((msg.t || msg.token) as string);
          break;
        }
        case "rc": // reasoning_complete (compressed)
        case "reasoning_complete": {
          if (!isForActiveConversation()) break;
          const chatStore = useChatStore.getState();
          chatStore.setReasoning(false);
          break;
        }
        case "ct": // chat_token (compressed)
        case "chat_token": {
          if (!isForActiveConversation()) break;
          const chatStore = useChatStore.getState();
          if (!chatStore.isStreaming) {
            // First token: add a placeholder assistant message so
            // MessageList has something to render the streaming tokens into.
            const tempId = `streaming-${Date.now()}`;
            chatStore.addMessage({
              id: tempId,
              role: "assistant",
              content: "",
              sql_query: null,
              sql_executions: [],
              reasoning: null,
              created_at: new Date().toISOString(),
            });
            chatStore.setStreaming(true, tempId);
          }
          chatStore.appendStreamToken((msg.t || msg.token) as string);
          break;
        }
        case "cc": // chat_complete (compressed)
        case "chat_complete": {
          if (!isForActiveConversation()) break;
          const chatStore = useChatStore.getState();
          // Copy accumulated streaming tokens into the message content
          // before clearing, so the response persists in the message list.
          // Attach sql_query and structured sql_executions from the backend.
          // Support both compressed (se) and uncompressed (sql_executions) field names
          const sqlExecsRaw = msg.se || msg.sql_executions;
          const sqlExecs: SqlExecution[] = Array.isArray(sqlExecsRaw)
            ? (sqlExecsRaw as Array<Record<string, unknown>>).map((ex) => ({
                query: (ex.query as string) || "",
                columns: (ex.columns as string[] | null) ?? null,
                rows: (ex.rows as unknown[][] | null) ?? null,
                total_rows: (ex.total_rows as number | null) ?? null,
                error: (ex.error as string | null) ?? null,
                execution_time_ms: (ex.execution_time_ms as number | null) ?? null,
              }))
            : [];
          // Merge any pending chart specs from create_chart tool calls
          const pendingSpecs = chatStore.pendingChartSpecs;
          for (const pending of pendingSpecs) {
            if (pending.executionIndex >= 0 && pending.executionIndex < sqlExecs.length) {
              sqlExecs[pending.executionIndex].chartSpec = pending.spec;
            }
          }
          const inputTokens = (msg.it ?? msg.input_tokens ?? 0) as number;
          const outputTokens = (msg.ot ?? msg.output_tokens ?? 0) as number;
          const toolCallTrace = (msg.tct ?? msg.tool_call_trace ?? null) as TraceEntry[] | null;

          chatStore.finalizeStreamingMessage({
            sql_query: ((msg.sq || msg.sql_query) as string) ?? null,
            sql_executions: sqlExecs,
            reasoning: ((msg.r || msg.reasoning) as string) ?? null,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            tool_call_trace: toolCallTrace,
          });
          chatStore.setStreaming(false);
          chatStore.setLoadingPhase("idle");

          // Save SQL queries to history
          const queryHistoryStore = useQueryHistoryStore.getState();
          sqlExecs.forEach((exec) => {
            if (exec.query && exec.query.trim()) {
              queryHistoryStore.addQuery(exec.query);
            }
          });
          break;
        }
        case "cs": // chart_spec (compressed)
        case "chart_spec": {
          if (!isForActiveConversation()) break;
          const chatStore = useChatStore.getState();
          const executionIndex = (msg.ei ?? msg.execution_index) as number;
          const spec = (msg.sp ?? msg.spec) as import("@/stores/chatStore").ChartSpec;
          // During streaming, the execution may not exist on the message yet
          // (chat_complete hasn't arrived). Store as pending and attach later.
          chatStore.addPendingChartSpec(executionIndex, spec);
          break;
        }
        case "tcs": // tool_call_start (compressed)
        case "tool_call_start": {
          if (!isForActiveConversation()) break;
          const chatStore = useChatStore.getState();
          const tool = (msg.tl || msg.tool) as string;
          const args = (msg.a || msg.args) as Record<string, unknown>;
          chatStore.setPendingToolCall({ tool, args });
          chatStore.setLoadingPhase("executing");
          break;
        }
        case "qp": // query_progress (compressed)
        case "query_progress": {
          if (!isForActiveConversation()) break;
          const chatStore = useChatStore.getState();
          chatStore.setQueryProgress((msg.n ?? msg.query_number) as number);
          break;
        }
        case "fs": // followup_suggestions (compressed)
        case "followup_suggestions": {
          if (!isForActiveConversation()) break;
          useChatStore.getState().setFollowupSuggestions(((msg.sg ?? msg.suggestions) as string[]) || []);
          break;
        }
        case "ce": // chat_error (compressed)
        case "chat_error": {
          if (!isForActiveConversation()) break;
          const chatStore = useChatStore.getState();
          // Show error toast to the user
          const errorMsg = (msg.error || msg.e) as string | undefined;
          useToastStore.getState().error(errorMsg || "Something went wrong while generating a response");
          // Preserve any partial streaming content before clearing
          if (chatStore.isStreaming) {
            chatStore.finalizeStreamingMessage();
          }
          chatStore.setStreaming(false);
          chatStore.setLoadingPhase("idle");
          break;
        }
        case "dataset_loaded": {
          if (msg.dataset) {
            const dsPayload = msg.dataset as {
              id: string;
              conversation_id: string;
              url: string;
              name: string;
              row_count: number;
              column_count: number;
              schema_json: string;
              status: "loading" | "ready" | "error";
              error_message: string | null;
            };
            // Only process dataset events for the active conversation
            const convId = dsPayload.conversation_id;
            if (convId && convId !== useChatStore.getState().activeConversationId) {
              break;
            }
            const datasetWithConv = { ...dsPayload, conversation_id: convId || "" };
            const datasetStore = useDatasetStore.getState();
            const exists = datasetStore.datasets.some(
              (d) => d.id === dsPayload.id
            );
            if (exists) {
              datasetStore.updateDataset(dsPayload.id, datasetWithConv);
            } else {
              // WS event arrived before HTTP response added the dataset
              datasetStore.addDataset(datasetWithConv);
            }
          }
          break;
        }
        case "dataset_error": {
          const datasetStore = useDatasetStore.getState();
          if (msg.dataset_id) {
            datasetStore.updateDataset(msg.dataset_id as string, {
              status: "error",
              error_message: (msg.error as string) ?? "Unknown error",
            });
          }
          break;
        }
        case "ctu": // conversation_title_updated (compressed)
        case "conversation_title_updated": {
          void queryClient.invalidateQueries({ queryKey: ["conversations"] });
          break;
        }
        case "uu": // usage_update (compressed)
        case "usage_update": {
          void queryClient.invalidateQueries({ queryKey: ["usage"] });
          break;
        }
        case "rlw": // rate_limit_warning (compressed)
        case "rate_limit_warning": {
          void queryClient.invalidateQueries({ queryKey: ["usage"] });
          if (msg.daily_limit_reached) {
            useChatStore.getState().setDailyLimitReached(true);
          }
          break;
        }
        // Unknown message types are silently ignored (per spec)
      }
    });

    const { setStatus } = useConnectionStore.getState();
    let intentionalDisconnect = false;

    socket.onOpen(() => {
      setStatus("connected");
    });

    socket.onClose(() => {
      // After intentional disconnect, stay "disconnected".
      // After unexpected close, ChatDFSocket auto-reconnects with backoff.
      setStatus(intentionalDisconnect ? "disconnected" : "reconnecting");

      // If WS drops mid-stream, clear streaming state so the UI doesn't
      // get stuck in a permanent loading/thinking state.
      const chatStore = useChatStore.getState();
      if (chatStore.isStreaming) {
        // Preserve any partial content that was already streamed
        chatStore.finalizeStreamingMessage();
        chatStore.setStreaming(false);
        chatStore.setLoadingPhase("idle");
        if (!intentionalDisconnect) {
          useToastStore.getState().error("Connection lost during response. Reconnecting...");
        }
      } else if (chatStore.loadingPhase !== "idle") {
        // Was in "thinking" phase (before any tokens arrived) — clear it
        chatStore.setLoadingPhase("idle");
      }
    });

    socket.connect();

    // Expose reconnect callback so ConnectionBanner can trigger it
    const { setReconnect } = useConnectionStore.getState();
    setReconnect(() => {
      setStatus("reconnecting");
      socket.reconnect();
    });

    return () => {
      intentionalDisconnect = true;
      socket.disconnect();
      socketRef.current = null;
      setStatus("disconnected");
      setReconnect(null);
    };
  }, [isAuthenticated, queryClient]);
}
