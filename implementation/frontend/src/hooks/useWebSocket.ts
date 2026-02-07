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
import { useChatStore } from "@/stores/chatStore";
import { useDatasetStore } from "@/stores/datasetStore";

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

      switch (msg.type) {
        case "reasoning_token": {
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
          chatStore.appendReasoningToken(msg.token as string);
          break;
        }
        case "reasoning_complete": {
          const chatStore = useChatStore.getState();
          chatStore.setReasoning(false);
          break;
        }
        case "chat_token": {
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
          chatStore.appendStreamToken(msg.token as string);
          break;
        }
        case "chat_complete": {
          const chatStore = useChatStore.getState();
          // Copy accumulated streaming tokens into the message content
          // before clearing, so the response persists in the message list.
          // Attach sql_query and structured sql_executions from the backend.
          const sqlExecs = Array.isArray(msg.sql_executions)
            ? (msg.sql_executions as Array<Record<string, unknown>>).map((ex) => ({
                query: (ex.query as string) || "",
                columns: (ex.columns as string[] | null) ?? null,
                rows: (ex.rows as unknown[][] | null) ?? null,
                total_rows: (ex.total_rows as number | null) ?? null,
                error: (ex.error as string | null) ?? null,
              }))
            : [];
          chatStore.finalizeStreamingMessage({
            sql_query: (msg.sql_query as string) ?? null,
            sql_executions: sqlExecs,
            reasoning: (msg.reasoning as string) ?? null,
          });
          chatStore.setStreaming(false);
          chatStore.setLoadingPhase("idle");
          break;
        }
        case "chat_error": {
          const chatStore = useChatStore.getState();
          // Preserve any partial streaming content before clearing
          if (chatStore.isStreaming) {
            chatStore.finalizeStreamingMessage();
          }
          chatStore.setStreaming(false);
          chatStore.setLoadingPhase("idle");
          break;
        }
        case "dataset_loaded": {
          const datasetStore = useDatasetStore.getState();
          if (msg.dataset) {
            const dsPayload = msg.dataset as {
              id: string;
              url: string;
              name: string;
              row_count: number;
              column_count: number;
              schema_json: string;
              status: "loading" | "ready" | "error";
              error_message: string | null;
            };
            const exists = datasetStore.datasets.some(
              (d) => d.id === dsPayload.id
            );
            if (exists) {
              datasetStore.updateDataset(dsPayload.id, dsPayload);
            } else {
              // WS event arrived before HTTP response added the dataset
              datasetStore.addDataset(dsPayload);
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
        case "conversation_title_updated": {
          void queryClient.invalidateQueries({ queryKey: ["conversations"] });
          break;
        }
        case "usage_update": {
          void queryClient.invalidateQueries({ queryKey: ["usage"] });
          break;
        }
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

    socket.connect();

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isAuthenticated, queryClient]);
}
