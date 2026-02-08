// Tests for U37: Conversation search/filter in left panel
//
// CS-1: Search input appears when 2+ conversations
// CS-2: Search input hidden when 0-1 conversations
// CS-3: Typing filters conversations by title
// CS-4: Search is case-insensitive
// CS-5: Search matches message preview
// CS-6: Clear button clears search
// CS-7: Escape clears search
// CS-8: No matches state
// CS-9: Creating new chat clears search
//
// Note: These tests use queryClient.setQueryData() to pre-populate the
// conversations cache, bypassing the fetch layer. This avoids a known
// AbortSignal compatibility issue between MSW interceptors and jsdom.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { renderWithProviders, screen, waitFor, userEvent } from "../../helpers/render";
import { resetAllStores } from "../../helpers/stores";
import { createConversationList, createConversation } from "../../helpers/mocks/data";
import { ChatHistory } from "@/components/left-panel/ChatHistory";

beforeEach(() => {
  resetAllStores();
});

/** Create a QueryClient pre-populated with conversations data */
function createQueryClientWithConversations(conversations: ReturnType<typeof createConversation>[]) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  queryClient.setQueryData(["conversations"], { conversations });
  return queryClient;
}

describe("CS-1: Search input appears when 2+ conversations", () => {
  it("renders search input when there are 3 conversations", () => {
    const conversations = createConversationList(3);
    const queryClient = createQueryClientWithConversations(conversations);

    renderWithProviders(<ChatHistory />, { queryClient });

    expect(screen.getByText("Conversation 1")).toBeInTheDocument();
    expect(screen.getByTestId("conversation-search")).toBeInTheDocument();
  });

  it("renders search input when there are exactly 2 conversations", () => {
    const conversations = createConversationList(2);
    const queryClient = createQueryClientWithConversations(conversations);

    renderWithProviders(<ChatHistory />, { queryClient });

    expect(screen.getByText("Conversation 1")).toBeInTheDocument();
    expect(screen.getByTestId("conversation-search")).toBeInTheDocument();
  });
});

describe("CS-2: Search input hidden when 0-1 conversations", () => {
  it("does not render search input when there are 0 conversations", () => {
    const queryClient = createQueryClientWithConversations([]);

    renderWithProviders(<ChatHistory />, { queryClient });

    expect(screen.getByText("No conversations yet")).toBeInTheDocument();
    expect(screen.queryByTestId("conversation-search")).not.toBeInTheDocument();
  });

  it("does not render search input when there is 1 conversation", () => {
    const conversations = [createConversation({ title: "Only Chat" })];
    const queryClient = createQueryClientWithConversations(conversations);

    renderWithProviders(<ChatHistory />, { queryClient });

    expect(screen.getByText("Only Chat")).toBeInTheDocument();
    expect(screen.queryByTestId("conversation-search")).not.toBeInTheDocument();
  });
});

describe("CS-3: Typing filters conversations by title", () => {
  it("filters conversations to only show matching titles", async () => {
    const conversations = [
      createConversation({ title: "Sales Analysis" }),
      createConversation({ title: "Weather Data" }),
      createConversation({ title: "Sales Report" }),
    ];
    const queryClient = createQueryClientWithConversations(conversations);

    const user = userEvent.setup();
    renderWithProviders(<ChatHistory />, { queryClient });

    expect(screen.getByText("Sales Analysis")).toBeInTheDocument();

    const searchInput = screen.getByTestId("conversation-search");
    await user.type(searchInput, "Sales");

    expect(screen.getByText("Sales Analysis")).toBeInTheDocument();
    expect(screen.getByText("Sales Report")).toBeInTheDocument();
    expect(screen.queryByText("Weather Data")).not.toBeInTheDocument();
  });
});

describe("CS-4: Search is case-insensitive", () => {
  it("matches uppercase title with lowercase search", async () => {
    const conversations = [
      createConversation({ title: "UPPERCASE TITLE" }),
      createConversation({ title: "Other Chat" }),
    ];
    const queryClient = createQueryClientWithConversations(conversations);

    const user = userEvent.setup();
    renderWithProviders(<ChatHistory />, { queryClient });

    expect(screen.getByText("UPPERCASE TITLE")).toBeInTheDocument();

    const searchInput = screen.getByTestId("conversation-search");
    await user.type(searchInput, "uppercase");

    expect(screen.getByText("UPPERCASE TITLE")).toBeInTheDocument();
    expect(screen.queryByText("Other Chat")).not.toBeInTheDocument();
  });
});

describe("CS-5: Search matches message preview", () => {
  it("filters conversations by last_message_preview content", async () => {
    const conversations = [
      createConversation({
        title: "Chat A",
        last_message_preview: "What is the average salary?",
      }),
      createConversation({
        title: "Chat B",
        last_message_preview: "Show me the revenue chart",
      }),
    ];
    const queryClient = createQueryClientWithConversations(conversations);

    const user = userEvent.setup();
    renderWithProviders(<ChatHistory />, { queryClient });

    expect(screen.getByText("Chat A")).toBeInTheDocument();

    const searchInput = screen.getByTestId("conversation-search");
    await user.type(searchInput, "salary");

    expect(screen.getByText("Chat A")).toBeInTheDocument();
    expect(screen.queryByText("Chat B")).not.toBeInTheDocument();
  });
});

describe("CS-6: Clear button clears search", () => {
  it("clicking the clear button restores all conversations", async () => {
    const conversations = [
      createConversation({ title: "Alpha" }),
      createConversation({ title: "Beta" }),
      createConversation({ title: "Gamma" }),
    ];
    const queryClient = createQueryClientWithConversations(conversations);

    const user = userEvent.setup();
    renderWithProviders(<ChatHistory />, { queryClient });

    expect(screen.getByText("Alpha")).toBeInTheDocument();

    const searchInput = screen.getByTestId("conversation-search");
    await user.type(searchInput, "Alpha");

    // Only Alpha should be visible
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();

    // Click clear button
    const clearBtn = screen.getByTestId("conversation-search-clear");
    await user.click(clearBtn);

    // All conversations should be visible again
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("Gamma")).toBeInTheDocument();

    // Search input should be empty
    expect(searchInput).toHaveValue("");
  });
});

describe("CS-7: Escape clears search", () => {
  it("pressing Escape in search input clears the search text", async () => {
    const conversations = [
      createConversation({ title: "First" }),
      createConversation({ title: "Second" }),
    ];
    const queryClient = createQueryClientWithConversations(conversations);

    const user = userEvent.setup();
    renderWithProviders(<ChatHistory />, { queryClient });

    expect(screen.getByText("First")).toBeInTheDocument();

    const searchInput = screen.getByTestId("conversation-search");
    await user.type(searchInput, "First");

    // Only First visible
    expect(screen.queryByText("Second")).not.toBeInTheDocument();

    // Press Escape
    await user.keyboard("{Escape}");

    // Both should be visible again
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(searchInput).toHaveValue("");
  });
});

describe("CS-8: No matches state", () => {
  it("shows 'No matches' when search produces empty results", async () => {
    const conversations = [
      createConversation({ title: "Chat One" }),
      createConversation({ title: "Chat Two" }),
    ];
    const queryClient = createQueryClientWithConversations(conversations);

    const user = userEvent.setup();
    renderWithProviders(<ChatHistory />, { queryClient });

    expect(screen.getByText("Chat One")).toBeInTheDocument();

    const searchInput = screen.getByTestId("conversation-search");
    await user.type(searchInput, "zzz_nonexistent");

    expect(screen.getByText("No matches")).toBeInTheDocument();
    expect(screen.queryByText("Chat One")).not.toBeInTheDocument();
    expect(screen.queryByText("Chat Two")).not.toBeInTheDocument();
  });

  it("does not show 'No matches' when search is empty", () => {
    const conversations = [
      createConversation({ title: "Chat One" }),
      createConversation({ title: "Chat Two" }),
    ];
    const queryClient = createQueryClientWithConversations(conversations);

    renderWithProviders(<ChatHistory />, { queryClient });

    expect(screen.getByText("Chat One")).toBeInTheDocument();
    expect(screen.queryByText("No matches")).not.toBeInTheDocument();
  });
});

describe("CS-9: Creating new chat clears search", () => {
  it("clicking New Chat clears the search query", async () => {
    const conversations = [
      createConversation({ title: "Existing A" }),
      createConversation({ title: "Existing B" }),
    ];
    const queryClient = createQueryClientWithConversations(conversations);

    // Mock apiPost to avoid AbortSignal incompatibility in jsdom/MSW
    const apiModule = await import("@/api/client");
    const postSpy = vi.spyOn(apiModule, "apiPost").mockResolvedValue(
      createConversation({ id: "conv-new", title: "New Conversation" })
    );

    const user = userEvent.setup();
    renderWithProviders(<ChatHistory />, { queryClient });

    expect(screen.getByText("Existing A")).toBeInTheDocument();

    // Type a search query
    const searchInput = screen.getByTestId("conversation-search");
    await user.type(searchInput, "Existing A");

    // Only Existing A visible
    expect(screen.queryByText("Existing B")).not.toBeInTheDocument();

    // Click New Chat
    await user.click(screen.getByTestId("new-chat-button"));

    // Search should be cleared after mutation succeeds
    await waitFor(() => {
      expect(searchInput).toHaveValue("");
    });

    postSpy.mockRestore();
  });
});
