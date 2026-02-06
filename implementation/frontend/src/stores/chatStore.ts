// Implements: spec/frontend/plan.md#state-management-architecture (chatStore)
import { create } from "zustand";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sql_query: string | null;
  created_at: string;
}

export type LoadingPhase = "idle" | "thinking" | "executing" | "formatting" | null;

interface ChatState {
  activeConversationId: string | null;
  messages: Message[];
  streamingTokens: string;
  isStreaming: boolean;
  streamingMessageId: string | null;
  loadingPhase: LoadingPhase;
  dailyLimitReached: boolean;
}

interface ChatActions {
  setActiveConversation: (id: string | null) => void;
  addMessage: (message: Message) => void;
  appendStreamToken: (token: string) => void;
  setStreaming: (isStreaming: boolean, messageId?: string) => void;
  setLoadingPhase: (phase: LoadingPhase) => void;
  setDailyLimitReached: (reached: boolean) => void;
  reset: () => void;
}

const initialState: ChatState = {
  activeConversationId: null,
  messages: [],
  streamingTokens: "",
  isStreaming: false,
  streamingMessageId: null,
  loadingPhase: "idle",
  dailyLimitReached: false,
};

export const useChatStore = create<ChatState & ChatActions>()((set) => ({
  ...initialState,

  setActiveConversation: (id) =>
    set({
      activeConversationId: id,
      messages: [],
      streamingTokens: "",
      isStreaming: false,
      streamingMessageId: null,
      loadingPhase: "idle",
    }),

  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),

  appendStreamToken: (token) =>
    set((state) => ({
      streamingTokens: state.streamingTokens + token,
    })),

  setStreaming: (isStreaming, messageId) =>
    set(
      isStreaming
        ? { isStreaming: true, streamingMessageId: messageId ?? null }
        : { isStreaming: false, streamingMessageId: null, streamingTokens: "" }
    ),

  setLoadingPhase: (phase) =>
    set({ loadingPhase: phase }),

  setDailyLimitReached: (reached) =>
    set({ dailyLimitReached: reached }),

  reset: () => set(initialState),
}));
