// Implements: spec/frontend/plan.md#state-management-architecture (chatStore)
import { create } from "zustand";

export interface SqlExecution {
  query: string;
  columns: string[] | null;
  rows: unknown[][] | null;
  total_rows: number | null;
  error: string | null;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sql_query: string | null;
  sql_executions: SqlExecution[];
  reasoning: string | null;
  created_at: string;
}

/** Parse sql_query column into structured SqlExecution[].
 *  Handles: null/empty, JSON array (new format), legacy semicolon-joined string. */
export function parseSqlExecutions(sqlQuery: string | null): SqlExecution[] {
  if (!sqlQuery) return [];
  const trimmed = sqlQuery.trim();
  if (!trimmed) return [];

  // Try parsing as JSON array (new format)
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0].query === "string") {
        return parsed.map((item: Record<string, unknown>) => ({
          query: (item.query as string) || "",
          columns: (item.columns as string[] | null) ?? null,
          rows: (item.rows as unknown[][] | null) ?? null,
          total_rows: (item.total_rows as number | null) ?? null,
          error: (item.error as string | null) ?? null,
        }));
      }
    } catch {
      // Fall through to legacy handling
    }
  }

  // Legacy format: semicolon-separated SQL strings
  return trimmed.split("; ").map((q) => ({
    query: q,
    columns: null,
    rows: null,
    total_rows: null,
    error: null,
  }));
}

export type LoadingPhase = "idle" | "thinking" | "executing" | "formatting" | null;

interface ChatState {
  activeConversationId: string | null;
  messages: Message[];
  streamingTokens: string;
  streamingReasoning: string;
  isStreaming: boolean;
  isReasoning: boolean;
  streamingMessageId: string | null;
  loadingPhase: LoadingPhase;
  dailyLimitReached: boolean;
}

interface ChatActions {
  setActiveConversation: (id: string | null) => void;
  addMessage: (message: Message) => void;
  appendStreamToken: (token: string) => void;
  appendReasoningToken: (token: string) => void;
  setStreaming: (isStreaming: boolean, messageId?: string) => void;
  setReasoning: (isReasoning: boolean) => void;
  finalizeStreamingMessage: (extras?: Partial<Message>) => void;
  setLoadingPhase: (phase: LoadingPhase) => void;
  setDailyLimitReached: (reached: boolean) => void;
  reset: () => void;
}

const initialState: ChatState = {
  activeConversationId: null,
  messages: [],
  streamingTokens: "",
  streamingReasoning: "",
  isStreaming: false,
  isReasoning: false,
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
      streamingReasoning: "",
      isStreaming: false,
      isReasoning: false,
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

  appendReasoningToken: (token) =>
    set((state) => ({
      streamingReasoning: state.streamingReasoning + token,
    })),

  setStreaming: (isStreaming, messageId) =>
    set(
      isStreaming
        ? { isStreaming: true, streamingMessageId: messageId ?? null }
        : { isStreaming: false, streamingMessageId: null, streamingTokens: "", streamingReasoning: "", isReasoning: false }
    ),

  setReasoning: (isReasoning) =>
    set({ isReasoning }),

  finalizeStreamingMessage: (extras) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === state.streamingMessageId
          ? { ...m, content: state.streamingTokens, ...extras }
          : m
      ),
    })),

  setLoadingPhase: (phase) =>
    set({ loadingPhase: phase }),

  setDailyLimitReached: (reached) =>
    set({ dailyLimitReached: reached }),

  reset: () => set(initialState),
}));
