// Tests: U31 - Conversation title auto-generation from first message
//
// AT-1: First message triggers PATCH to update conversation title
// AT-2: Title is truncated to 50 chars with "..." if needed
// AT-3: Subsequent messages do not change the title
// AT-4: Title strips newlines and leading/trailing whitespace
// AT-5: Query cache is updated after successful PATCH

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderWithProviders, screen, userEvent, waitFor } from "../../helpers/render";
import { resetAllStores } from "../../helpers/stores";
import { useChatStore } from "@/stores/chatStore";
import { ChatArea } from "@/components/chat-area/ChatArea";
import { QueryClient } from "@tanstack/react-query";

// Track all fetch calls for assertion
let fetchCalls: { url: string; method: string; body?: unknown }[] = [];

beforeEach(() => {
  resetAllStores();
  fetchCalls = [];

  // Mock fetch to handle all API calls
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(init.body as string) : undefined;

    fetchCalls.push({ url, method, body });

    // POST /conversations -> create conversation
    if (method === "POST" && url.endsWith("/conversations")) {
      return new Response(
        JSON.stringify({ id: "conv-new", title: "", created_at: new Date().toISOString() }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    }

    // POST /conversations/{id}/messages -> send message
    if (method === "POST" && url.includes("/messages")) {
      return new Response(
        JSON.stringify({ message_id: "msg-ack-1", status: "processing" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // PATCH /conversations/{id} -> rename conversation
    if (method === "PATCH" && url.includes("/conversations/")) {
      return new Response(
        JSON.stringify({ id: "conv-1", title: body?.title, updated_at: new Date().toISOString() }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AT-1: First message triggers PATCH to update conversation title", () => {
  it("sends PATCH request with title derived from first message", async () => {
    useChatStore.setState({ activeConversationId: "conv-1", messages: [] });
    const user = userEvent.setup();

    renderWithProviders(<ChatArea />);

    const textarea = screen.getByRole("textbox", { name: /message input/i });
    await user.type(textarea, "Show me the top 10 rows");
    await user.keyboard("{Enter}");

    // Wait for the PATCH call (fire-and-forget, so it may happen async)
    await waitFor(() => {
      const patchCall = fetchCalls.find((c) => c.method === "PATCH");
      expect(patchCall).toBeDefined();
      expect(patchCall!.body).toEqual({ title: "Show me the top 10 rows" });
    });
  });
});

describe("AT-2: Title is truncated to 50 chars with '...' if needed", () => {
  it("truncates long first messages to 50 characters plus ellipsis", async () => {
    useChatStore.setState({ activeConversationId: "conv-1", messages: [] });
    const user = userEvent.setup();

    renderWithProviders(<ChatArea />);

    const longMessage = "What is the average revenue per region for each quarter of the fiscal year 2024";
    const textarea = screen.getByRole("textbox", { name: /message input/i });
    await user.type(textarea, longMessage);
    await user.keyboard("{Enter}");

    await waitFor(() => {
      const patchCall = fetchCalls.find((c) => c.method === "PATCH");
      expect(patchCall).toBeDefined();
      const title = patchCall!.body.title;
      // Title should be exactly 53 chars: 50 + "..."
      expect(title.length).toBe(53);
      expect(title).toBe(longMessage.slice(0, 50) + "...");
    });
  });
});

describe("AT-3: Subsequent messages do not change the title", () => {
  it("does not send PATCH when messages already exist", async () => {
    // Set up store with an existing message (not the first message)
    useChatStore.setState({
      activeConversationId: "conv-1",
      messages: [
        {
          id: "msg-existing",
          role: "user",
          content: "Previous question",
          sql_query: null,
          sql_executions: [],
          reasoning: null,
          created_at: new Date().toISOString(),
        },
      ],
    });
    const user = userEvent.setup();

    renderWithProviders(<ChatArea />);

    const textarea = screen.getByRole("textbox", { name: /message input/i });
    await user.type(textarea, "Follow up question");
    await user.keyboard("{Enter}");

    // Wait a bit to make sure no PATCH is sent
    await new Promise((resolve) => setTimeout(resolve, 200));

    const patchCalls = fetchCalls.filter((c) => c.method === "PATCH");
    expect(patchCalls).toHaveLength(0);
  });
});

describe("AT-4: Title strips newlines and whitespace", () => {
  it("replaces newlines with spaces in the title", async () => {
    useChatStore.setState({ activeConversationId: "conv-1", messages: [] });
    const user = userEvent.setup();

    renderWithProviders(<ChatArea />);

    const textarea = screen.getByRole("textbox", { name: /message input/i });
    // Type a message with a newline (Shift+Enter for newline in ChatInput)
    await user.type(textarea, "line one");
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    await user.type(textarea, "line two");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      const patchCall = fetchCalls.find((c) => c.method === "PATCH");
      expect(patchCall).toBeDefined();
      // Newline should be replaced with space
      expect(patchCall!.body.title).toBe("line one line two");
    });
  });
});

describe("AT-5: Query cache is updated after successful PATCH", () => {
  it("updates the conversations query cache with the new title", async () => {
    // Use a long gcTime so the cache entry survives without active observers
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 60_000 },
        mutations: { retry: false },
      },
    });

    // Pre-populate the conversations cache
    queryClient.setQueryData(["conversations"], {
      conversations: [
        {
          id: "conv-1",
          title: "",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          dataset_count: 0,
        },
      ],
    });

    useChatStore.setState({ activeConversationId: "conv-1", messages: [] });
    const user = userEvent.setup();

    renderWithProviders(<ChatArea />, { queryClient });

    const textarea = screen.getByRole("textbox", { name: /message input/i });
    await user.type(textarea, "My first question");
    await user.keyboard("{Enter}");

    // Wait for the PATCH to complete and cache to be updated
    await waitFor(() => {
      const cached = queryClient.getQueryData<{
        conversations: Array<{ id: string; title: string }>;
      }>(["conversations"]);
      expect(cached).toBeDefined();
      const conv = cached!.conversations.find((c) => c.id === "conv-1");
      expect(conv).toBeDefined();
      expect(conv!.title).toBe("My first question");
    });
  });
});
