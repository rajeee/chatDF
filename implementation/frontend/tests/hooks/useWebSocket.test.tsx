// Comprehensive tests for the useWebSocket hook.
// Covers: connection lifecycle, chat tokens, chat complete, reasoning tokens,
// dataset events, error handling, tool calls, query progress, followup
// suggestions, chart specs, and unknown/invalid message handling.
//
// Tests: spec/frontend/test_plan.md (WebSocket integration)

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import React from "react";

import { useWebSocket } from "@/hooks/useWebSocket";
import { useChatStore } from "@/stores/chatStore";
import { useConnectionStore } from "@/stores/connectionStore";
import { useDatasetStore } from "@/stores/datasetStore";
import { useToastStore } from "@/stores/toastStore";
import { useQueryHistoryStore } from "@/stores/queryHistoryStore";
import {
  installMockWebSocket,
  MockWebSocket,
} from "../helpers/mocks/websocket";
import { resetAllStores } from "../helpers/stores";

// ---------------------------------------------------------------------------
// Test utilities
// ---------------------------------------------------------------------------

let wsInstances: MockWebSocket[];
let wsCleanup: () => void;

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function createWrapper(queryClient?: QueryClient) {
  const qc = queryClient ?? createTestQueryClient();
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  };
}

/**
 * Helper: render the hook with isAuthenticated=true, wait for the
 * MockWebSocket instance to appear, and simulate the connection opening.
 * Returns the latest MockWebSocket instance and the unmount function.
 */
function mountAuthenticated(queryClient?: QueryClient) {
  const wrapper = createWrapper(queryClient);
  const hookResult = renderHook(() => useWebSocket(true), { wrapper });

  // ChatDFSocket.connect() creates a WebSocket synchronously
  const ws = wsInstances[wsInstances.length - 1];
  if (!ws) throw new Error("Expected MockWebSocket instance to be created");

  return { ws, ...hookResult };
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  const mock = installMockWebSocket();
  wsInstances = mock.instances;
  wsCleanup = mock.cleanup;

  resetAllStores();

  // Also reset stores not covered by resetAllStores
  useConnectionStore.setState({ status: "disconnected" });
  useToastStore.setState({ toasts: [] });
  useQueryHistoryStore.setState({ queries: [], isFetching: false });
});

afterEach(() => {
  wsCleanup();
  vi.restoreAllMocks();
});

// ===========================================================================
// 1. Connection lifecycle
// ===========================================================================

describe("useWebSocket - connection lifecycle", () => {
  it("does not connect when isAuthenticated=false", () => {
    renderHook(() => useWebSocket(false), {
      wrapper: createWrapper(),
    });

    expect(wsInstances).toHaveLength(0);
  });

  it("creates WebSocket and connects when isAuthenticated=true", () => {
    renderHook(() => useWebSocket(true), {
      wrapper: createWrapper(),
    });

    expect(wsInstances).toHaveLength(1);
    expect(wsInstances[0].url).toContain("ws");
  });

  it("sets connection status to 'connected' on open", () => {
    const { ws } = mountAuthenticated();

    act(() => {
      ws.simulateOpen();
    });

    expect(useConnectionStore.getState().status).toBe("connected");
  });

  it("sets connection status to 'reconnecting' on unexpected close", () => {
    const { ws } = mountAuthenticated();

    act(() => {
      ws.simulateOpen();
    });
    expect(useConnectionStore.getState().status).toBe("connected");

    act(() => {
      ws.simulateClose();
    });

    expect(useConnectionStore.getState().status).toBe("reconnecting");
  });

  it("sets connection status to 'disconnected' on cleanup (unmount)", () => {
    const { ws, unmount } = mountAuthenticated();

    act(() => {
      ws.simulateOpen();
    });
    expect(useConnectionStore.getState().status).toBe("connected");

    act(() => {
      unmount();
    });

    expect(useConnectionStore.getState().status).toBe("disconnected");
  });

  it("disconnects on unmount", () => {
    const { ws, unmount } = mountAuthenticated();

    act(() => {
      ws.simulateOpen();
    });

    act(() => {
      unmount();
    });

    // MockWebSocket.close() sets readyState to CLOSED
    expect(ws.readyState).toBe(MockWebSocket.CLOSED);
  });

  it("clears streaming state on unexpected WS close mid-stream", () => {
    const { ws } = mountAuthenticated();

    act(() => {
      ws.simulateOpen();
    });

    // Start streaming some tokens
    act(() => {
      ws.simulateMessage({ type: "ct", t: "partial " });
    });
    act(() => {
      ws.simulateMessage({ type: "ct", t: "response" });
    });

    expect(useChatStore.getState().isStreaming).toBe(true);
    expect(useChatStore.getState().streamingTokens).toBe("partial response");

    // Unexpected WS close
    act(() => {
      ws.simulateClose();
    });

    const chatState = useChatStore.getState();
    expect(chatState.isStreaming).toBe(false);
    expect(chatState.loadingPhase).toBe("idle");
    // Partial content should be preserved in the finalized message
    expect(chatState.messages[0].content).toBe("partial response");
  });

  it("shows error toast on unexpected WS close mid-stream", () => {
    const { ws } = mountAuthenticated();

    act(() => {
      ws.simulateOpen();
    });

    act(() => {
      ws.simulateMessage({ type: "ct", t: "hello" });
    });

    act(() => {
      ws.simulateClose();
    });

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].type).toBe("error");
    expect(toasts[0].message).toContain("Connection lost");
  });

  it("clears loadingPhase on unexpected WS close during thinking phase", () => {
    const { ws } = mountAuthenticated();

    act(() => {
      ws.simulateOpen();
    });

    // Simulate thinking phase (set by ChatArea.handleSend before tokens arrive)
    useChatStore.setState({ loadingPhase: "thinking" });

    act(() => {
      ws.simulateClose();
    });

    expect(useChatStore.getState().loadingPhase).toBe("idle");
    expect(useChatStore.getState().isStreaming).toBe(false);
  });

  it("does not show error toast on intentional disconnect during streaming", () => {
    const { ws, unmount } = mountAuthenticated();

    act(() => {
      ws.simulateOpen();
    });

    act(() => {
      ws.simulateMessage({ type: "ct", t: "streaming" });
    });

    expect(useChatStore.getState().isStreaming).toBe(true);

    // Intentional disconnect via unmount
    act(() => {
      unmount();
    });

    const toasts = useToastStore.getState().toasts;
    // No error toast for intentional disconnect
    expect(toasts).toHaveLength(0);
  });
});

// ===========================================================================
// 2. Chat token handling (ct / chat_token)
// ===========================================================================

describe("useWebSocket - chat token handling", () => {
  it("first chat_token creates placeholder message and starts streaming", () => {
    const { ws } = mountAuthenticated();

    act(() => {
      ws.simulateOpen();
    });

    act(() => {
      ws.simulateMessage({ type: "chat_token", token: "Hello" });
    });

    const chatState = useChatStore.getState();
    expect(chatState.isStreaming).toBe(true);
    expect(chatState.streamingMessageId).toBeTruthy();
    expect(chatState.messages).toHaveLength(1);
    expect(chatState.messages[0].role).toBe("assistant");
    expect(chatState.messages[0].content).toBe("");
    expect(chatState.streamingTokens).toBe("Hello");
  });

  it("subsequent tokens append to streaming tokens", () => {
    const { ws } = mountAuthenticated();

    act(() => {
      ws.simulateOpen();
    });

    act(() => {
      ws.simulateMessage({ type: "chat_token", token: "Hello" });
    });

    act(() => {
      ws.simulateMessage({ type: "chat_token", token: " World" });
    });

    const chatState = useChatStore.getState();
    expect(chatState.streamingTokens).toBe("Hello World");
    // Should still be just the one placeholder message
    expect(chatState.messages).toHaveLength(1);
  });

  it("works with compressed 'ct' type and 't' field", () => {
    const { ws } = mountAuthenticated();

    act(() => {
      ws.simulateOpen();
    });

    act(() => {
      ws.simulateMessage({ type: "ct", t: "compressed" });
    });

    const chatState = useChatStore.getState();
    expect(chatState.isStreaming).toBe(true);
    expect(chatState.streamingTokens).toBe("compressed");
  });

  it("works with uncompressed 'chat_token' type and 'token' field", () => {
    const { ws } = mountAuthenticated();

    act(() => {
      ws.simulateOpen();
    });

    act(() => {
      ws.simulateMessage({ type: "chat_token", token: "uncompressed" });
    });

    const chatState = useChatStore.getState();
    expect(chatState.isStreaming).toBe(true);
    expect(chatState.streamingTokens).toBe("uncompressed");
  });
});

// ===========================================================================
// 3. Chat complete handling (cc / chat_complete)
// ===========================================================================

describe("useWebSocket - chat complete handling", () => {
  it("finalizes streaming message with sql_executions", () => {
    const { ws } = mountAuthenticated();

    act(() => {
      ws.simulateOpen();
    });

    // Start streaming
    act(() => {
      ws.simulateMessage({ type: "chat_token", token: "Result: " });
    });

    const sqlExecs = [
      {
        query: "SELECT * FROM users",
        columns: ["id", "name"],
        rows: [[1, "Alice"]],
        total_rows: 1,
        error: null,
        execution_time_ms: 42,
      },
    ];

    act(() => {
      ws.simulateMessage({
        type: "chat_complete",
        sql_query: "SELECT * FROM users",
        sql_executions: sqlExecs,
        reasoning: "I analyzed the data",
        input_tokens: 100,
        output_tokens: 50,
      });
    });

    const chatState = useChatStore.getState();
    expect(chatState.isStreaming).toBe(false);
    expect(chatState.loadingPhase).toBe("idle");
    expect(chatState.messages).toHaveLength(1);

    const msg = chatState.messages[0];
    expect(msg.content).toBe("Result: ");
    expect(msg.sql_query).toBe("SELECT * FROM users");
    expect(msg.sql_executions).toHaveLength(1);
    expect(msg.sql_executions[0].query).toBe("SELECT * FROM users");
    expect(msg.reasoning).toBe("I analyzed the data");
    expect(msg.input_tokens).toBe(100);
    expect(msg.output_tokens).toBe(50);
  });

  it("sets streaming to false and loadingPhase to idle", () => {
    const { ws } = mountAuthenticated();

    act(() => {
      ws.simulateOpen();
    });

    act(() => {
      ws.simulateMessage({ type: "ct", t: "x" });
    });

    // Confirm streaming is on
    expect(useChatStore.getState().isStreaming).toBe(true);

    act(() => {
      ws.simulateMessage({ type: "cc", sql_executions: [] });
    });

    expect(useChatStore.getState().isStreaming).toBe(false);
    expect(useChatStore.getState().loadingPhase).toBe("idle");
  });

  it("adds queries to queryHistoryStore", () => {
    const { ws } = mountAuthenticated();

    act(() => {
      ws.simulateOpen();
    });

    act(() => {
      ws.simulateMessage({ type: "ct", t: "done" });
    });

    act(() => {
      ws.simulateMessage({
        type: "cc",
        sql_executions: [
          { query: "SELECT 1", columns: null, rows: null, total_rows: null, error: null, execution_time_ms: null },
          { query: "SELECT 2", columns: null, rows: null, total_rows: null, error: null, execution_time_ms: null },
        ],
      });
    });

    const historyState = useQueryHistoryStore.getState();
    expect(historyState.queries).toHaveLength(2);
    expect(historyState.queries.map((q) => q.query)).toContain("SELECT 1");
    expect(historyState.queries.map((q) => q.query)).toContain("SELECT 2");
  });

  it("handles compressed field names (sq, se, r, it, ot, tct)", () => {
    const { ws } = mountAuthenticated();

    act(() => {
      ws.simulateOpen();
    });

    act(() => {
      ws.simulateMessage({ type: "ct", t: "answer" });
    });

    const trace = [{ type: "tool_call", tool: "run_sql", args: {} }];

    act(() => {
      ws.simulateMessage({
        type: "cc",
        sq: "SELECT count(*) FROM t",
        se: [
          { query: "SELECT count(*) FROM t", columns: ["count"], rows: [[5]], total_rows: 1, error: null, execution_time_ms: 10 },
        ],
        r: "My reasoning",
        it: 200,
        ot: 80,
        tct: trace,
      });
    });

    const msg = useChatStore.getState().messages[0];
    expect(msg.sql_query).toBe("SELECT count(*) FROM t");
    expect(msg.sql_executions[0].columns).toEqual(["count"]);
    expect(msg.reasoning).toBe("My reasoning");
    expect(msg.input_tokens).toBe(200);
    expect(msg.output_tokens).toBe(80);
    expect(msg.tool_call_trace).toEqual(trace);
  });

  it("merges pendingChartSpecs into sql_executions", () => {
    const { ws } = mountAuthenticated();

    act(() => {
      ws.simulateOpen();
    });

    act(() => {
      ws.simulateMessage({ type: "ct", t: "chart" });
    });

    // Simulate a chart_spec arriving before chat_complete
    const chartSpec = { chart_type: "bar", title: "Sales by Region" };
    act(() => {
      ws.simulateMessage({
        type: "chart_spec",
        execution_index: 0,
        spec: chartSpec,
      });
    });

    // Verify pending chart spec was stored
    expect(useChatStore.getState().pendingChartSpecs).toHaveLength(1);

    act(() => {
      ws.simulateMessage({
        type: "cc",
        sql_executions: [
          { query: "SELECT region, sum(sales) FROM t GROUP BY region", columns: ["region", "sales"], rows: [["East", 100]], total_rows: 1, error: null, execution_time_ms: 5 },
        ],
      });
    });

    const msg = useChatStore.getState().messages[0];
    expect(msg.sql_executions[0].chartSpec).toEqual(chartSpec);
  });
});

// ===========================================================================
// 4. Reasoning tokens (rt / rc)
// ===========================================================================

describe("useWebSocket - reasoning tokens", () => {
  it("first reasoning token creates placeholder and starts streaming", () => {
    const { ws } = mountAuthenticated();

    act(() => {
      ws.simulateOpen();
    });

    act(() => {
      ws.simulateMessage({ type: "rt", t: "Let me think" });
    });

    const chatState = useChatStore.getState();
    expect(chatState.isStreaming).toBe(true);
    expect(chatState.isReasoning).toBe(true);
    expect(chatState.messages).toHaveLength(1);
    expect(chatState.messages[0].role).toBe("assistant");
    expect(chatState.streamingReasoning).toBe("Let me think");
  });

  it("reasoning_complete sets reasoning to false", () => {
    const { ws } = mountAuthenticated();

    act(() => {
      ws.simulateOpen();
    });

    act(() => {
      ws.simulateMessage({ type: "rt", t: "thinking..." });
    });

    expect(useChatStore.getState().isReasoning).toBe(true);

    act(() => {
      ws.simulateMessage({ type: "rc" });
    });

    expect(useChatStore.getState().isReasoning).toBe(false);
    // Streaming should still be true (reasoning done, chat tokens can follow)
    expect(useChatStore.getState().isStreaming).toBe(true);
  });

  it("works with uncompressed reasoning_token type", () => {
    const { ws } = mountAuthenticated();

    act(() => {
      ws.simulateOpen();
    });

    act(() => {
      ws.simulateMessage({ type: "reasoning_token", token: "step 1" });
    });

    expect(useChatStore.getState().isReasoning).toBe(true);
    expect(useChatStore.getState().streamingReasoning).toBe("step 1");
  });
});

// ===========================================================================
// 5. Dataset events
// ===========================================================================

describe("useWebSocket - dataset events", () => {
  it("dataset_loaded adds new dataset to store", () => {
    const { ws } = mountAuthenticated();

    act(() => {
      ws.simulateOpen();
    });

    const dataset = {
      id: "ds-1",
      conversation_id: "conv-1",
      url: "https://example.com/data.csv",
      name: "data.csv",
      row_count: 100,
      column_count: 5,
      schema_json: "{}",
      status: "ready" as const,
      error_message: null,
    };

    act(() => {
      ws.simulateMessage({ type: "dataset_loaded", dataset });
    });

    const datasets = useDatasetStore.getState().datasets;
    expect(datasets).toHaveLength(1);
    expect(datasets[0].id).toBe("ds-1");
    expect(datasets[0].name).toBe("data.csv");
    expect(datasets[0].status).toBe("ready");
  });

  it("dataset_loaded updates existing dataset", () => {
    // Pre-populate the store with a loading dataset
    useDatasetStore.getState().addDataset({
      id: "ds-2",
      conversation_id: "conv-1",
      url: "https://example.com/data.csv",
      name: "data.csv",
      row_count: 0,
      column_count: 0,
      schema_json: "{}",
      status: "loading",
      error_message: null,
    });

    const { ws } = mountAuthenticated();

    act(() => {
      ws.simulateOpen();
    });

    act(() => {
      ws.simulateMessage({
        type: "dataset_loaded",
        dataset: {
          id: "ds-2",
          conversation_id: "conv-1",
          url: "https://example.com/data.csv",
          name: "data.csv",
          row_count: 500,
          column_count: 10,
          schema_json: '{"columns":[]}',
          status: "ready",
          error_message: null,
        },
      });
    });

    const datasets = useDatasetStore.getState().datasets;
    expect(datasets).toHaveLength(1);
    expect(datasets[0].status).toBe("ready");
    expect(datasets[0].row_count).toBe(500);
    expect(datasets[0].column_count).toBe(10);
  });

  it("dataset_error updates dataset with error status", () => {
    // Pre-populate with a loading dataset
    useDatasetStore.getState().addDataset({
      id: "ds-3",
      conversation_id: "conv-1",
      url: "https://example.com/bad.csv",
      name: "bad.csv",
      row_count: 0,
      column_count: 0,
      schema_json: "{}",
      status: "loading",
      error_message: null,
    });

    const { ws } = mountAuthenticated();

    act(() => {
      ws.simulateOpen();
    });

    act(() => {
      ws.simulateMessage({
        type: "dataset_error",
        dataset_id: "ds-3",
        error: "Invalid CSV format",
      });
    });

    const ds = useDatasetStore.getState().datasets[0];
    expect(ds.status).toBe("error");
    expect(ds.error_message).toBe("Invalid CSV format");
  });

  it("dataset_loaded uses activeConversationId as fallback for conversation_id", () => {
    useChatStore.setState({ activeConversationId: "fallback-conv" });

    const { ws } = mountAuthenticated();

    act(() => {
      ws.simulateOpen();
    });

    // Send dataset without conversation_id
    act(() => {
      ws.simulateMessage({
        type: "dataset_loaded",
        dataset: {
          id: "ds-fallback",
          conversation_id: "",
          url: "https://example.com/data.csv",
          name: "data.csv",
          row_count: 10,
          column_count: 2,
          schema_json: "{}",
          status: "ready",
          error_message: null,
        },
      });
    });

    const ds = useDatasetStore.getState().datasets[0];
    expect(ds.conversation_id).toBe("fallback-conv");
  });
});

// ===========================================================================
// 6. Error handling (ce / chat_error)
// ===========================================================================

describe("useWebSocket - chat error handling", () => {
  it("shows error toast", () => {
    const { ws } = mountAuthenticated();

    act(() => {
      ws.simulateOpen();
    });

    act(() => {
      ws.simulateMessage({
        type: "chat_error",
        error: "Rate limit exceeded",
      });
    });

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].type).toBe("error");
    expect(toasts[0].message).toBe("Rate limit exceeded");
  });

  it("shows default error message when no error field", () => {
    const { ws } = mountAuthenticated();

    act(() => {
      ws.simulateOpen();
    });

    act(() => {
      ws.simulateMessage({ type: "ce" });
    });

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toBe("Something went wrong while generating a response");
  });

  it("finalizes partial streaming on error", () => {
    const { ws } = mountAuthenticated();

    act(() => {
      ws.simulateOpen();
    });

    // Start streaming some tokens
    act(() => {
      ws.simulateMessage({ type: "ct", t: "partial content" });
    });

    expect(useChatStore.getState().isStreaming).toBe(true);

    act(() => {
      ws.simulateMessage({
        type: "ce",
        error: "Internal error",
      });
    });

    const chatState = useChatStore.getState();
    expect(chatState.isStreaming).toBe(false);
    expect(chatState.loadingPhase).toBe("idle");
    // The message should have been finalized with accumulated tokens
    expect(chatState.messages[0].content).toBe("partial content");
  });

  it("sets streaming false and loadingPhase idle even without active stream", () => {
    const { ws } = mountAuthenticated();

    act(() => {
      ws.simulateOpen();
    });

    act(() => {
      ws.simulateMessage({
        type: "chat_error",
        error: "Error without stream",
      });
    });

    const chatState = useChatStore.getState();
    expect(chatState.isStreaming).toBe(false);
    expect(chatState.loadingPhase).toBe("idle");
  });

  it("works with compressed 'ce' type and 'e' field", () => {
    const { ws } = mountAuthenticated();

    act(() => {
      ws.simulateOpen();
    });

    act(() => {
      ws.simulateMessage({ type: "ce", e: "compressed error" });
    });

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toBe("compressed error");
  });
});

// ===========================================================================
// 7. Other events
// ===========================================================================

describe("useWebSocket - tool_call_start", () => {
  it("sets pending tool call and loading phase to 'executing'", () => {
    const { ws } = mountAuthenticated();

    act(() => {
      ws.simulateOpen();
    });

    act(() => {
      ws.simulateMessage({
        type: "tool_call_start",
        tool: "run_sql",
        args: { query: "SELECT 1" },
      });
    });

    const chatState = useChatStore.getState();
    expect(chatState.pendingToolCall).toEqual({
      tool: "run_sql",
      args: { query: "SELECT 1" },
    });
    expect(chatState.loadingPhase).toBe("executing");
  });

  it("works with compressed 'tcs' type", () => {
    const { ws } = mountAuthenticated();

    act(() => {
      ws.simulateOpen();
    });

    act(() => {
      ws.simulateMessage({
        type: "tcs",
        tl: "create_chart",
        a: { type: "bar" },
      });
    });

    expect(useChatStore.getState().pendingToolCall).toEqual({
      tool: "create_chart",
      args: { type: "bar" },
    });
  });
});

describe("useWebSocket - query_progress", () => {
  it("updates query progress", () => {
    const { ws } = mountAuthenticated();

    act(() => {
      ws.simulateOpen();
    });

    act(() => {
      ws.simulateMessage({ type: "query_progress", query_number: 3 });
    });

    expect(useChatStore.getState().queryProgress).toBe(3);
  });

  it("works with compressed 'qp' type and 'n' field", () => {
    const { ws } = mountAuthenticated();

    act(() => {
      ws.simulateOpen();
    });

    act(() => {
      ws.simulateMessage({ type: "qp", n: 5 });
    });

    expect(useChatStore.getState().queryProgress).toBe(5);
  });
});

describe("useWebSocket - followup_suggestions", () => {
  it("sets followup suggestions", () => {
    const { ws } = mountAuthenticated();

    act(() => {
      ws.simulateOpen();
    });

    const suggestions = ["What are the top 5?", "Show a chart", "Export to CSV"];

    act(() => {
      ws.simulateMessage({
        type: "followup_suggestions",
        suggestions,
      });
    });

    expect(useChatStore.getState().followupSuggestions).toEqual(suggestions);
  });

  it("works with compressed 'fs' type and 'sg' field", () => {
    const { ws } = mountAuthenticated();

    act(() => {
      ws.simulateOpen();
    });

    act(() => {
      ws.simulateMessage({
        type: "fs",
        sg: ["suggestion A", "suggestion B"],
      });
    });

    expect(useChatStore.getState().followupSuggestions).toEqual([
      "suggestion A",
      "suggestion B",
    ]);
  });
});

describe("useWebSocket - chart_spec", () => {
  it("adds pending chart spec", () => {
    const { ws } = mountAuthenticated();

    act(() => {
      ws.simulateOpen();
    });

    const spec = { chart_type: "line", title: "Trend" };

    act(() => {
      ws.simulateMessage({
        type: "chart_spec",
        execution_index: 0,
        spec,
      });
    });

    const pending = useChatStore.getState().pendingChartSpecs;
    expect(pending).toHaveLength(1);
    expect(pending[0].executionIndex).toBe(0);
    expect(pending[0].spec).toEqual(spec);
  });

  it("works with compressed 'cs' type, 'ei' and 'sp' fields", () => {
    const { ws } = mountAuthenticated();

    act(() => {
      ws.simulateOpen();
    });

    const spec = { chart_type: "pie", title: "Distribution" };

    act(() => {
      ws.simulateMessage({
        type: "cs",
        ei: 1,
        sp: spec,
      });
    });

    const pending = useChatStore.getState().pendingChartSpecs;
    expect(pending).toHaveLength(1);
    expect(pending[0].executionIndex).toBe(1);
    expect(pending[0].spec).toEqual(spec);
  });
});

describe("useWebSocket - unknown and invalid messages", () => {
  it("unknown message types are silently ignored", () => {
    const { ws } = mountAuthenticated();

    act(() => {
      ws.simulateOpen();
    });

    // Should not throw
    act(() => {
      ws.simulateMessage({ type: "some_unknown_type", data: "foo" });
    });

    // State should be unchanged
    const chatState = useChatStore.getState();
    expect(chatState.isStreaming).toBe(false);
    expect(chatState.messages).toHaveLength(0);
  });

  it("invalid messages (no type) are silently ignored", () => {
    const { ws } = mountAuthenticated();

    act(() => {
      ws.simulateOpen();
    });

    // Message without a type field
    act(() => {
      ws.simulateMessage({ data: "no type field" });
    });

    // State should be unchanged
    expect(useChatStore.getState().isStreaming).toBe(false);
    expect(useChatStore.getState().messages).toHaveLength(0);
  });

  it("messages with non-string type are silently ignored", () => {
    const { ws } = mountAuthenticated();

    act(() => {
      ws.simulateOpen();
    });

    act(() => {
      ws.simulateMessage({ type: 123 });
    });

    expect(useChatStore.getState().isStreaming).toBe(false);
  });
});

// ===========================================================================
// 8. Query client invalidation events
// ===========================================================================

describe("useWebSocket - query client invalidation", () => {
  it("conversation_title_updated invalidates conversations query", () => {
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { ws } = mountAuthenticated(queryClient);

    act(() => {
      ws.simulateOpen();
    });

    act(() => {
      ws.simulateMessage({ type: "conversation_title_updated" });
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["conversations"] })
    );
  });

  it("usage_update invalidates usage query", () => {
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { ws } = mountAuthenticated(queryClient);

    act(() => {
      ws.simulateOpen();
    });

    act(() => {
      ws.simulateMessage({ type: "usage_update" });
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["usage"] })
    );
  });

  it("rate_limit_warning with daily_limit_reached sets flag in chatStore", () => {
    const queryClient = createTestQueryClient();

    const { ws } = mountAuthenticated(queryClient);

    act(() => {
      ws.simulateOpen();
    });

    act(() => {
      ws.simulateMessage({
        type: "rate_limit_warning",
        daily_limit_reached: true,
      });
    });

    expect(useChatStore.getState().dailyLimitReached).toBe(true);
  });
});
