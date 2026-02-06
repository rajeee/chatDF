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

export function useWebSocket(token: string | null): void {
  const queryClient = useQueryClient();
  const socketRef = useRef<ChatDFSocket | null>(null);

  useEffect(() => {
    if (!token) {
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
        case "chat_token": {
          const chatStore = useChatStore.getState();
          if (!chatStore.isStreaming && msg.message_id) {
            chatStore.setStreaming(true, msg.message_id as string);
          }
          chatStore.appendStreamToken(msg.token as string);
          break;
        }
        case "chat_complete": {
          const chatStore = useChatStore.getState();
          chatStore.setStreaming(false);
          if (msg.message) {
            chatStore.addMessage(msg.message as {
              id: string;
              role: "user" | "assistant";
              content: string;
              sql_query: string | null;
              created_at: string;
            });
          }
          chatStore.setLoadingPhase("idle");
          break;
        }
        case "chat_error": {
          const chatStore = useChatStore.getState();
          chatStore.setStreaming(false);
          chatStore.setLoadingPhase("idle");
          break;
        }
        case "dataset_loaded": {
          const datasetStore = useDatasetStore.getState();
          if (msg.dataset) {
            datasetStore.updateDataset(
              (msg.dataset as { id: string }).id,
              msg.dataset as Partial<{
                id: string;
                url: string;
                name: string;
                row_count: number;
                column_count: number;
                schema_json: string;
                status: "loading" | "ready" | "error";
                error_message: string | null;
              }>
            );
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

    socket.connect(token);

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, queryClient]);
}
