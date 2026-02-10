// Tests for useConversation hook
// Covers: conversation fetching, store population, switching, edge cases
//
// Uses MSW for API mocking (consistent with project conventions),
// real Zustand stores for chatStore/datasetStore, and QueryClientProvider wrapper.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import React from "react";
import { server } from "../helpers/mocks/server";
import { resetAllStores } from "../helpers/stores";
import { useChatStore } from "@/stores/chatStore";
import { useDatasetStore } from "@/stores/datasetStore";
import { useConversation } from "@/hooks/useConversation";
import type { Message } from "@/stores/chatStore";
import type { Dataset } from "@/stores/datasetStore";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

/** Build a valid Message object with sensible defaults */
function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg-1",
    role: "assistant",
    content: "Hello there",
    sql_query: null,
    sql_executions: [],
    reasoning: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/** Build a valid Dataset object with sensible defaults */
function makeDataset(overrides: Partial<Dataset> = {}): Dataset {
  return {
    id: "ds-1",
    conversation_id: "conv-1",
    url: "https://example.com/data.csv",
    name: "test_dataset",
    row_count: 100,
    column_count: 3,
    schema_json: '{"col1":"int","col2":"string"}',
    status: "ready",
    error_message: null,
    ...overrides,
  };
}

/** Conversation detail shape returned by the API */
interface ConversationDetail {
  id: string;
  title: string;
  messages: Message[];
  datasets: Dataset[];
}

function makeConversationDetail(
  overrides: Partial<ConversationDetail> = {}
): ConversationDetail {
  return {
    id: "conv-1",
    title: "Test Conversation",
    messages: [],
    datasets: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useConversation", () => {
  beforeEach(() => {
    resetAllStores();
  });

  // -----------------------------------------------------------------------
  // 1. Returns null conversation and isLoading false when no active conversation
  // -----------------------------------------------------------------------
  it("returns null conversation and isLoading false when no active conversation", async () => {
    // activeConversationId defaults to null after reset
    const { result } = renderHook(() => useConversation(), {
      wrapper: createWrapper(),
    });

    // With no activeConversationId, the query is disabled
    // so it should not be loading and conversation should be null
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.conversation).toBeNull();
    expect(result.current.activeConversationId).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 2. Returns isLoading true while fetching
  // -----------------------------------------------------------------------
  it("returns isLoading true while fetching", async () => {
    // Set active conversation so the query fires
    useChatStore.setState({ activeConversationId: "conv-1" });

    // Use a delayed handler to keep the query in loading state
    server.use(
      http.get("/conversations/conv-1", async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return HttpResponse.json(makeConversationDetail({ id: "conv-1" }));
      })
    );

    const { result } = renderHook(() => useConversation(), {
      wrapper: createWrapper(),
    });

    // Should be loading initially
    expect(result.current.isLoading).toBe(true);
    expect(result.current.activeConversationId).toBe("conv-1");

    // Wait for the fetch to complete
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // 3. Populates chat store messages when conversation loads
  // -----------------------------------------------------------------------
  it("populates chat store messages when conversation loads", async () => {
    const messages: Message[] = [
      makeMessage({ id: "msg-1", role: "user", content: "What is this data?" }),
      makeMessage({
        id: "msg-2",
        role: "assistant",
        content: "This is a dataset about...",
        sql_executions: [
          {
            query: "SELECT * FROM test LIMIT 5",
            columns: ["id", "name"],
            rows: [[1, "a"]],
            total_rows: 1,
            error: null,
            execution_time_ms: 15,
          },
        ],
      }),
    ];

    const conversationDetail = makeConversationDetail({
      id: "conv-1",
      messages,
    });

    useChatStore.setState({ activeConversationId: "conv-1" });

    server.use(
      http.get("/conversations/conv-1", () => {
        return HttpResponse.json(conversationDetail);
      })
    );

    const { result } = renderHook(() => useConversation(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // The hook should have populated the chat store
    const chatMessages = useChatStore.getState().messages;
    expect(chatMessages).toHaveLength(2);
    expect(chatMessages[0].id).toBe("msg-1");
    expect(chatMessages[0].content).toBe("What is this data?");
    expect(chatMessages[1].id).toBe("msg-2");
    expect(chatMessages[1].sql_executions).toHaveLength(1);
    expect(chatMessages[1].sql_executions[0].query).toBe("SELECT * FROM test LIMIT 5");
  });

  // -----------------------------------------------------------------------
  // 4. Populates dataset store when conversation has datasets
  // -----------------------------------------------------------------------
  it("populates dataset store when conversation has datasets", async () => {
    const datasets: Dataset[] = [
      makeDataset({ id: "ds-1", name: "sales_data" }),
      makeDataset({ id: "ds-2", name: "customers", row_count: 500 }),
    ];

    const conversationDetail = makeConversationDetail({
      id: "conv-1",
      messages: [makeMessage()],
      datasets,
    });

    useChatStore.setState({ activeConversationId: "conv-1" });

    server.use(
      http.get("/conversations/conv-1", () => {
        return HttpResponse.json(conversationDetail);
      })
    );

    const { result } = renderHook(() => useConversation(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const storeDatasets = useDatasetStore.getState().datasets;
    expect(storeDatasets).toHaveLength(2);
    expect(storeDatasets[0].name).toBe("sales_data");
    expect(storeDatasets[1].name).toBe("customers");
    // Verify conversation_id is set
    expect(storeDatasets[0].conversation_id).toBe("conv-1");
    expect(storeDatasets[1].conversation_id).toBe("conv-1");
  });

  // -----------------------------------------------------------------------
  // 5. Does NOT re-populate messages if messages already exist
  // -----------------------------------------------------------------------
  it("does not re-populate messages if messages already exist in store", async () => {
    const existingMessage = makeMessage({
      id: "existing-msg",
      content: "Already in store",
    });

    // Pre-populate the chat store with a message
    useChatStore.setState({
      activeConversationId: "conv-1",
      messages: [existingMessage],
    });

    const conversationDetail = makeConversationDetail({
      id: "conv-1",
      messages: [
        makeMessage({ id: "api-msg-1", content: "From API" }),
        makeMessage({ id: "api-msg-2", content: "Also from API" }),
      ],
    });

    server.use(
      http.get("/conversations/conv-1", () => {
        return HttpResponse.json(conversationDetail);
      })
    );

    const { result } = renderHook(() => useConversation(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Messages should NOT have been replaced - existing message should still be there
    const chatMessages = useChatStore.getState().messages;
    expect(chatMessages).toHaveLength(1);
    expect(chatMessages[0].id).toBe("existing-msg");
    expect(chatMessages[0].content).toBe("Already in store");
  });

  // -----------------------------------------------------------------------
  // 6. switchConversation calls setActiveConversation and invalidates queries
  // -----------------------------------------------------------------------
  it("switchConversation calls setActiveConversation and invalidates queries", async () => {
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    // Start with no active conversation
    server.use(
      http.get("/conversations/conv-2", () => {
        return HttpResponse.json(
          makeConversationDetail({ id: "conv-2", title: "Second Conversation" })
        );
      })
    );

    const { result } = renderHook(() => useConversation(), {
      wrapper: createWrapper(queryClient),
    });

    // Switch to a new conversation
    act(() => {
      result.current.switchConversation("conv-2");
    });

    // Should have called setActiveConversation on the chat store
    expect(useChatStore.getState().activeConversationId).toBe("conv-2");

    // Should have invalidated the query for the new conversation
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["conversations", "conv-2"],
    });

    invalidateSpy.mockRestore();
  });

  // -----------------------------------------------------------------------
  // 7. switchConversation with null doesn't invalidate queries
  // -----------------------------------------------------------------------
  it("switchConversation with null does not invalidate queries", async () => {
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    // Start with an active conversation
    useChatStore.setState({ activeConversationId: "conv-1" });

    server.use(
      http.get("/conversations/conv-1", () => {
        return HttpResponse.json(makeConversationDetail({ id: "conv-1" }));
      })
    );

    const { result } = renderHook(() => useConversation(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Clear the spy calls from the initial render
    invalidateSpy.mockClear();

    // Switch to null (deselect conversation)
    act(() => {
      result.current.switchConversation(null);
    });

    expect(useChatStore.getState().activeConversationId).toBeNull();
    // invalidateQueries should NOT have been called
    expect(invalidateSpy).not.toHaveBeenCalled();

    invalidateSpy.mockRestore();
  });

  // -----------------------------------------------------------------------
  // 8. Handles conversations with empty messages array
  // -----------------------------------------------------------------------
  it("handles conversations with empty messages array", async () => {
    const conversationDetail = makeConversationDetail({
      id: "conv-1",
      messages: [],
      datasets: [makeDataset({ id: "ds-1" })],
    });

    useChatStore.setState({ activeConversationId: "conv-1" });

    server.use(
      http.get("/conversations/conv-1", () => {
        return HttpResponse.json(conversationDetail);
      })
    );

    const { result } = renderHook(() => useConversation(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Chat store messages should remain empty (no messages in response)
    expect(useChatStore.getState().messages).toHaveLength(0);

    // Datasets should still be populated
    expect(useDatasetStore.getState().datasets).toHaveLength(1);

    // Conversation data should be returned
    expect(result.current.conversation).not.toBeNull();
    expect(result.current.conversation!.id).toBe("conv-1");
  });

  // -----------------------------------------------------------------------
  // 9. Handles conversations with empty datasets array
  // -----------------------------------------------------------------------
  it("handles conversations with empty datasets array", async () => {
    const conversationDetail = makeConversationDetail({
      id: "conv-1",
      messages: [makeMessage({ id: "msg-1" })],
      datasets: [],
    });

    useChatStore.setState({ activeConversationId: "conv-1" });

    server.use(
      http.get("/conversations/conv-1", () => {
        return HttpResponse.json(conversationDetail);
      })
    );

    const { result } = renderHook(() => useConversation(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Messages should be populated
    expect(useChatStore.getState().messages).toHaveLength(1);

    // Dataset store should remain empty (no datasets in response)
    expect(useDatasetStore.getState().datasets).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // 10. Handles message fields with missing sql_executions (parseSqlExecutions fallback)
  // -----------------------------------------------------------------------
  it("uses parseSqlExecutions fallback when sql_executions is missing", async () => {
    // Build a message that has a sql_query but no sql_executions field.
    // We need to construct a raw API response where sql_executions is absent
    // but sql_query is present, so the hook falls back to parseSqlExecutions.
    const rawMessages = [
      {
        id: "msg-1",
        role: "user" as const,
        content: "Show me the data",
        sql_query: null,
        sql_executions: undefined as unknown as never[],
        reasoning: null,
        created_at: new Date().toISOString(),
      },
      {
        id: "msg-2",
        role: "assistant" as const,
        content: "Here is the result",
        sql_query: "SELECT * FROM test; SELECT COUNT(*) FROM test",
        sql_executions: undefined as unknown as never[],
        reasoning: undefined as unknown as null,
        created_at: new Date().toISOString(),
      },
    ];

    useChatStore.setState({ activeConversationId: "conv-1" });

    server.use(
      http.get("/conversations/conv-1", () => {
        return HttpResponse.json({
          id: "conv-1",
          title: "Test",
          messages: rawMessages,
          datasets: [],
        });
      })
    );

    const { result } = renderHook(() => useConversation(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const chatMessages = useChatStore.getState().messages;
    expect(chatMessages).toHaveLength(2);

    // First message: sql_query is null, so parseSqlExecutions returns []
    expect(chatMessages[0].sql_executions).toEqual([]);
    expect(chatMessages[0].reasoning).toBeNull();

    // Second message: sql_query has semicolon-separated queries
    // parseSqlExecutions should parse them into SqlExecution objects
    expect(chatMessages[1].sql_executions).toHaveLength(2);
    expect(chatMessages[1].sql_executions[0].query).toBe("SELECT * FROM test");
    expect(chatMessages[1].sql_executions[1].query).toBe("SELECT COUNT(*) FROM test");
    // Each parsed execution should have null columns/rows/error
    expect(chatMessages[1].sql_executions[0].columns).toBeNull();
    expect(chatMessages[1].sql_executions[0].rows).toBeNull();
    expect(chatMessages[1].sql_executions[0].error).toBeNull();
    // reasoning should fallback to null
    expect(chatMessages[1].reasoning).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 11. Uses parseSqlExecutions for JSON array format in sql_query
  // -----------------------------------------------------------------------
  it("parses JSON array sql_query format via parseSqlExecutions fallback", async () => {
    const jsonSqlExecution = JSON.stringify([
      {
        query: "SELECT id, name FROM users",
        columns: ["id", "name"],
        rows: [[1, "Alice"]],
        total_rows: 1,
        error: null,
        execution_time_ms: 5,
      },
    ]);

    const rawMessage = {
      id: "msg-1",
      role: "assistant" as const,
      content: "Here are the users",
      sql_query: jsonSqlExecution,
      sql_executions: undefined as unknown as never[],
      reasoning: "Thinking about users...",
      created_at: new Date().toISOString(),
    };

    useChatStore.setState({ activeConversationId: "conv-1" });

    server.use(
      http.get("/conversations/conv-1", () => {
        return HttpResponse.json({
          id: "conv-1",
          title: "Test",
          messages: [rawMessage],
          datasets: [],
        });
      })
    );

    const { result } = renderHook(() => useConversation(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const chatMessages = useChatStore.getState().messages;
    expect(chatMessages).toHaveLength(1);

    // parseSqlExecutions should have parsed the JSON array
    expect(chatMessages[0].sql_executions).toHaveLength(1);
    expect(chatMessages[0].sql_executions[0].query).toBe("SELECT id, name FROM users");
    expect(chatMessages[0].sql_executions[0].columns).toEqual(["id", "name"]);
    expect(chatMessages[0].sql_executions[0].rows).toEqual([[1, "Alice"]]);
    // reasoning should be preserved (not null fallback)
    expect(chatMessages[0].reasoning).toBe("Thinking about users...");
  });

  // -----------------------------------------------------------------------
  // 12. Dataset defaults are applied (status, schema_json, error_message)
  // -----------------------------------------------------------------------
  it("applies default values to datasets missing optional fields", async () => {
    // Construct datasets with missing optional fields so the hook fills defaults
    const rawDatasets = [
      {
        id: "ds-1",
        conversation_id: "conv-1",
        url: "https://example.com/data.csv",
        name: "dataset_no_defaults",
        row_count: 50,
        column_count: 2,
        // status, schema_json, and error_message are missing
      },
    ];

    useChatStore.setState({ activeConversationId: "conv-1" });

    server.use(
      http.get("/conversations/conv-1", () => {
        return HttpResponse.json({
          id: "conv-1",
          title: "Test",
          messages: [makeMessage()],
          datasets: rawDatasets,
        });
      })
    );

    const { result } = renderHook(() => useConversation(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const storeDatasets = useDatasetStore.getState().datasets;
    expect(storeDatasets).toHaveLength(1);
    // Should have default values applied by the hook
    expect(storeDatasets[0].status).toBe("ready");
    expect(storeDatasets[0].schema_json).toBe("{}");
    expect(storeDatasets[0].error_message).toBeNull();
    expect(storeDatasets[0].conversation_id).toBe("conv-1");
  });

  // -----------------------------------------------------------------------
  // 13. Returns conversation data in the hook result
  // -----------------------------------------------------------------------
  it("returns conversation data in the hook result when loaded", async () => {
    const conversationDetail = makeConversationDetail({
      id: "conv-1",
      title: "My Interesting Conversation",
      messages: [makeMessage({ id: "msg-1" })],
      datasets: [makeDataset({ id: "ds-1" })],
    });

    useChatStore.setState({ activeConversationId: "conv-1" });

    server.use(
      http.get("/conversations/conv-1", () => {
        return HttpResponse.json(conversationDetail);
      })
    );

    const { result } = renderHook(() => useConversation(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.conversation).not.toBeNull();
    expect(result.current.conversation!.id).toBe("conv-1");
    expect(result.current.conversation!.title).toBe("My Interesting Conversation");
    expect(result.current.conversation!.messages).toHaveLength(1);
    expect(result.current.conversation!.datasets).toHaveLength(1);
  });

  // -----------------------------------------------------------------------
  // 14. switchConversation resets chat store messages
  // -----------------------------------------------------------------------
  it("switchConversation resets chat store messages before loading new conversation", async () => {
    // Pre-populate with messages from a previous conversation
    useChatStore.setState({
      activeConversationId: "conv-1",
      messages: [makeMessage({ id: "old-msg", content: "Old message" })],
    });

    server.use(
      http.get("/conversations/:id", ({ params }) => {
        return HttpResponse.json(
          makeConversationDetail({
            id: params.id as string,
            messages: [makeMessage({ id: "new-msg", content: "New message" })],
          })
        );
      })
    );

    const { result } = renderHook(() => useConversation(), {
      wrapper: createWrapper(),
    });

    // Switch to a different conversation
    act(() => {
      result.current.switchConversation("conv-2");
    });

    // setActiveConversation should clear messages immediately
    expect(useChatStore.getState().messages).toHaveLength(0);
    expect(useChatStore.getState().activeConversationId).toBe("conv-2");

    // Wait for the new conversation to load
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // New messages should now be populated
    const chatMessages = useChatStore.getState().messages;
    expect(chatMessages).toHaveLength(1);
    expect(chatMessages[0].id).toBe("new-msg");
    expect(chatMessages[0].content).toBe("New message");
  });

  // -----------------------------------------------------------------------
  // 15. Multiple messages with mixed sql_executions presence
  // -----------------------------------------------------------------------
  it("handles mixed messages where some have sql_executions and some do not", async () => {
    const rawMessages = [
      {
        id: "msg-1",
        role: "user" as const,
        content: "Query one",
        sql_query: null,
        sql_executions: [] as never[],
        reasoning: null,
        created_at: new Date().toISOString(),
      },
      {
        id: "msg-2",
        role: "assistant" as const,
        content: "Result one",
        sql_query: "SELECT 1",
        // sql_executions explicitly provided
        sql_executions: [
          {
            query: "SELECT 1",
            columns: ["1"],
            rows: [[1]],
            total_rows: 1,
            error: null,
            execution_time_ms: 2,
          },
        ],
        reasoning: "Some reasoning",
        created_at: new Date().toISOString(),
      },
      {
        id: "msg-3",
        role: "assistant" as const,
        content: "Result two",
        sql_query: "SELECT 2",
        sql_executions: undefined as unknown as never[],
        reasoning: undefined as unknown as null,
        created_at: new Date().toISOString(),
      },
    ];

    useChatStore.setState({ activeConversationId: "conv-1" });

    server.use(
      http.get("/conversations/conv-1", () => {
        return HttpResponse.json({
          id: "conv-1",
          title: "Test",
          messages: rawMessages,
          datasets: [],
        });
      })
    );

    const { result } = renderHook(() => useConversation(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const chatMessages = useChatStore.getState().messages;
    expect(chatMessages).toHaveLength(3);

    // msg-1: user message, no sql
    expect(chatMessages[0].sql_executions).toEqual([]);

    // msg-2: has explicit sql_executions
    expect(chatMessages[1].sql_executions).toHaveLength(1);
    expect(chatMessages[1].sql_executions[0].query).toBe("SELECT 1");
    expect(chatMessages[1].reasoning).toBe("Some reasoning");

    // msg-3: missing sql_executions, should fall back to parseSqlExecutions
    expect(chatMessages[2].sql_executions).toHaveLength(1);
    expect(chatMessages[2].sql_executions[0].query).toBe("SELECT 2");
    expect(chatMessages[2].reasoning).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 16. Query is disabled when activeConversationId is null
  // -----------------------------------------------------------------------
  it("does not make API call when activeConversationId is null", async () => {
    let apiCalled = false;
    server.use(
      http.get("/conversations/:id", () => {
        apiCalled = true;
        return HttpResponse.json(makeConversationDetail());
      })
    );

    // activeConversationId is null by default
    const { result } = renderHook(() => useConversation(), {
      wrapper: createWrapper(),
    });

    // Give some time for any potential fetch to happen
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(apiCalled).toBe(false);
    expect(result.current.conversation).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 17. Datasets from different conversations are not mixed
  // -----------------------------------------------------------------------
  it("only sets datasets for the loaded conversation, preserving others", async () => {
    // Pre-populate dataset store with datasets from another conversation
    useDatasetStore.setState({
      datasets: [
        makeDataset({ id: "ds-other", conversation_id: "conv-other", name: "other_ds" }),
      ],
    });

    useChatStore.setState({ activeConversationId: "conv-1" });

    server.use(
      http.get("/conversations/conv-1", () => {
        return HttpResponse.json(
          makeConversationDetail({
            id: "conv-1",
            messages: [makeMessage()],
            datasets: [makeDataset({ id: "ds-1", conversation_id: "conv-1", name: "conv1_ds" })],
          })
        );
      })
    );

    const { result } = renderHook(() => useConversation(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const storeDatasets = useDatasetStore.getState().datasets;
    // Should have datasets from both conversations
    expect(storeDatasets).toHaveLength(2);
    expect(storeDatasets.find((d) => d.id === "ds-other")).toBeDefined();
    expect(storeDatasets.find((d) => d.id === "ds-1")).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 18. switchConversation is stable (memoized) across renders
  // -----------------------------------------------------------------------
  it("switchConversation is referentially stable across renders", async () => {
    useChatStore.setState({ activeConversationId: "conv-1" });

    server.use(
      http.get("/conversations/conv-1", () => {
        return HttpResponse.json(makeConversationDetail({ id: "conv-1" }));
      })
    );

    const { result, rerender } = renderHook(() => useConversation(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const switchFnBefore = result.current.switchConversation;

    // Re-render the hook
    rerender();

    const switchFnAfter = result.current.switchConversation;
    expect(switchFnBefore).toBe(switchFnAfter);
  });

  // -----------------------------------------------------------------------
  // 19. Handles API error gracefully
  // -----------------------------------------------------------------------
  it("handles API error gracefully", async () => {
    useChatStore.setState({ activeConversationId: "conv-1" });

    server.use(
      http.get("/conversations/conv-1", () => {
        return HttpResponse.json({ error: "Not found" }, { status: 404 });
      })
    );

    const { result } = renderHook(() => useConversation(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // On error, conversation should remain null
    expect(result.current.conversation).toBeNull();
    // Store messages should remain empty (nothing to populate)
    expect(useChatStore.getState().messages).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // 20. Preserves existing sql_executions when present (no fallback)
  // -----------------------------------------------------------------------
  it("preserves existing sql_executions without calling parseSqlExecutions", async () => {
    const explicitExecutions = [
      {
        query: "SELECT * FROM data",
        columns: ["a", "b"],
        rows: [["x", "y"]],
        total_rows: 1,
        error: null,
        execution_time_ms: 10,
      },
    ];

    const messages: Message[] = [
      makeMessage({
        id: "msg-1",
        sql_query: "SELECT something_else",
        sql_executions: explicitExecutions,
      }),
    ];

    useChatStore.setState({ activeConversationId: "conv-1" });

    server.use(
      http.get("/conversations/conv-1", () => {
        return HttpResponse.json(
          makeConversationDetail({ id: "conv-1", messages })
        );
      })
    );

    const { result } = renderHook(() => useConversation(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const chatMessages = useChatStore.getState().messages;
    expect(chatMessages).toHaveLength(1);
    // sql_executions should be the explicit ones, NOT parsed from sql_query
    expect(chatMessages[0].sql_executions).toEqual(explicitExecutions);
    expect(chatMessages[0].sql_executions[0].query).toBe("SELECT * FROM data");
  });
});
