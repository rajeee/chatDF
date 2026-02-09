// Implements: spec/frontend/plan.md#state-management-architecture (chatStore)
import { create } from "zustand";

export interface ChartSpec {
  chart_type: string;
  title: string;
  x_column?: string;
  y_columns?: string[];
  color_column?: string;
  orientation?: "vertical" | "horizontal";
  aggregation?: string;
  bar_mode?: string;
  color_scale?: string;
  x_label?: string;
  y_label?: string;
  show_values?: boolean;
  z_column?: string;           // heatmap value column
  location_column?: string;    // choropleth location column
  location_type?: string;      // choropleth location type (state_name, state_abbr, etc.)
}

export interface TraceEntry {
  type: "tool_call" | "text" | "reasoning";
  tool?: string;
  args?: Record<string, unknown>;
  result?: string;
  content?: string;
}

export interface SqlExecution {
  query: string;
  columns: string[] | null;
  rows: unknown[][] | null;
  total_rows: number | null;
  error: string | null;
  execution_time_ms: number | null;
  chartSpec?: ChartSpec;   // LLM-requested chart visualization
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sql_query: string | null;
  sql_executions: SqlExecution[];
  reasoning: string | null;
  created_at: string;
  sendFailed?: boolean;
  input_tokens?: number;
  output_tokens?: number;
  tool_call_trace?: TraceEntry[] | null;
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
          execution_time_ms: (item.execution_time_ms as number | null) ?? null,
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
    execution_time_ms: null,
    rows: null,
    total_rows: null,
    error: null,
  }));
}

export type LoadingPhase = "idle" | "thinking" | "executing" | "formatting" | null;

export interface PendingToolCall {
  tool: string;
  args: Record<string, unknown>;
}

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
  isLoadingMessages: boolean;
  pendingChartSpecs: Array<{ executionIndex: number; spec: ChartSpec }>;
  pendingToolCall: PendingToolCall | null;
  queryProgress: number | null;
  searchQuery: string;
  searchOpen: boolean;
  followupSuggestions: string[];
  templatePrompts: string[];
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
  setLoadingMessages: (loading: boolean) => void;
  markMessageFailed: (messageId: string) => void;
  removeMessage: (messageId: string) => void;
  setChartSpec: (executionIndex: number, spec: ChartSpec) => void;
  addPendingChartSpec: (executionIndex: number, spec: ChartSpec) => void;
  setPendingToolCall: (tc: PendingToolCall | null) => void;
  setQueryProgress: (queryNumber: number | null) => void;
  setSearchQuery: (query: string) => void;
  setSearchOpen: (open: boolean) => void;
  setFollowupSuggestions: (suggestions: string[]) => void;
  setTemplatePrompts: (prompts: string[]) => void;
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
  isLoadingMessages: false,
  pendingChartSpecs: [],
  pendingToolCall: null,
  queryProgress: null,
  searchQuery: "",
  searchOpen: false,
  followupSuggestions: [],
  templatePrompts: [],
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
      isLoadingMessages: id !== null,
      pendingChartSpecs: [],
      pendingToolCall: null,
      queryProgress: null,
      searchQuery: "",
      searchOpen: false,
      followupSuggestions: [],
      templatePrompts: [],
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
        : { isStreaming: false, streamingMessageId: null, streamingTokens: "", streamingReasoning: "", isReasoning: false, pendingChartSpecs: [], pendingToolCall: null, queryProgress: null }
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

  setLoadingMessages: (loading) =>
    set({ isLoadingMessages: loading }),

  markMessageFailed: (messageId) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, sendFailed: true } : m
      ),
    })),

  removeMessage: (messageId) =>
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== messageId),
    })),

  setChartSpec: (executionIndex, spec) =>
    set((state) => {
      // Find the streaming message (currently being built) and attach the chart spec
      // to the specified execution. If message doesn't have that execution yet,
      // store it for later attachment in the chat_complete handler.
      const msgId = state.streamingMessageId;
      if (!msgId) return state;
      return {
        messages: state.messages.map((m) => {
          if (m.id !== msgId) return m;
          const execs = [...m.sql_executions];
          if (executionIndex >= 0 && executionIndex < execs.length) {
            execs[executionIndex] = { ...execs[executionIndex], chartSpec: spec };
          }
          return { ...m, sql_executions: execs };
        }),
      };
    }),

  addPendingChartSpec: (executionIndex, spec) =>
    set((state) => ({
      pendingChartSpecs: [...state.pendingChartSpecs, { executionIndex, spec }],
    })),

  setPendingToolCall: (tc) =>
    set({ pendingToolCall: tc }),

  setQueryProgress: (queryNumber) =>
    set({ queryProgress: queryNumber }),

  setSearchQuery: (query) =>
    set({ searchQuery: query }),

  setSearchOpen: (open) =>
    set(open ? { searchOpen: true } : { searchOpen: false, searchQuery: "" }),

  setFollowupSuggestions: (suggestions) => set({ followupSuggestions: suggestions }),

  setTemplatePrompts: (prompts) => set({ templatePrompts: prompts }),

  reset: () => set(initialState),
}));
