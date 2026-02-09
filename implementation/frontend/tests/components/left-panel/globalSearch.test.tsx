// Tests for Global Search feature in ChatHistory component
//
// Tests:
// 1. "Search all conversations" button appears when searching
// 2. Clicking button calls the search API
// 3. Results are displayed correctly
// 4. Clicking a result navigates to that conversation

import { describe, it, expect, beforeEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, waitFor, userEvent } from "../../helpers/render";
import { resetAllStores } from "../../helpers/stores";
import { server } from "../../helpers/mocks/server";
import { createConversationList } from "../../helpers/mocks/data";
import { useChatStore } from "@/stores/chatStore";
import { ChatHistory } from "@/components/left-panel/ChatHistory";

beforeEach(() => {
  resetAllStores();
});

describe("Global Search", () => {
  it("shows 'Search all conversations' button when search query has 3+ chars", async () => {
    const conversations = createConversationList(3);

    server.use(
      http.get("/conversations", () => {
        return HttpResponse.json({ conversations });
      })
    );

    const user = userEvent.setup();
    renderWithProviders(<ChatHistory />);

    await waitFor(() => {
      expect(screen.getByTestId("conversation-search")).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId("conversation-search");

    // Type less than 3 chars - button should not appear
    await user.type(searchInput, "ab");
    expect(screen.queryByTestId("global-search-button")).not.toBeInTheDocument();

    // Type 3+ chars - button should appear
    await user.type(searchInput, "c");
    await waitFor(() => {
      expect(screen.getByTestId("global-search-button")).toBeInTheDocument();
    });
  });

  it("calls search API when 'Search all conversations' button is clicked", async () => {
    const conversations = createConversationList(2);
    let searchCalled = false;

    server.use(
      http.get("/conversations", () => {
        return HttpResponse.json({ conversations });
      }),
      http.get("/conversations/search", ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("q")).toBe("test query");
        searchCalled = true;
        return HttpResponse.json({
          results: [
            {
              conversation_id: "conv-1",
              conversation_title: "Test Chat",
              message_id: "msg-1",
              message_role: "user",
              snippet: "This is a test query result",
              created_at: new Date().toISOString(),
            },
          ],
          total: 1,
        });
      })
    );

    const user = userEvent.setup();
    renderWithProviders(<ChatHistory />);

    await waitFor(() => {
      expect(screen.getByTestId("conversation-search")).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId("conversation-search");
    await user.type(searchInput, "test query");

    await waitFor(() => {
      expect(screen.getByTestId("global-search-button")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("global-search-button"));

    await waitFor(() => {
      expect(searchCalled).toBe(true);
    });
  });

  it("calls search API when Enter is pressed in search box with 3+ chars", async () => {
    const conversations = createConversationList(2);
    let searchCalled = false;

    server.use(
      http.get("/conversations", () => {
        return HttpResponse.json({ conversations });
      }),
      http.get("/conversations/search", ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("q")).toBe("search");
        searchCalled = true;
        return HttpResponse.json({
          results: [],
          total: 0,
        });
      })
    );

    const user = userEvent.setup();
    renderWithProviders(<ChatHistory />);

    await waitFor(() => {
      expect(screen.getByTestId("conversation-search")).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId("conversation-search");
    await user.type(searchInput, "search");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(searchCalled).toBe(true);
    });
  });

  it("displays search results in dropdown", async () => {
    const conversations = createConversationList(2);

    server.use(
      http.get("/conversations", () => {
        return HttpResponse.json({ conversations });
      }),
      http.get("/conversations/search", () => {
        return HttpResponse.json({
          results: [
            {
              conversation_id: "conv-1",
              conversation_title: "First Chat",
              message_id: "msg-1",
              message_role: "user",
              snippet: "This is the first result with keyword",
              created_at: new Date().toISOString(),
            },
            {
              conversation_id: "conv-2",
              conversation_title: "Second Chat",
              message_id: "msg-2",
              message_role: "assistant",
              snippet: "This is the second result with keyword",
              created_at: new Date().toISOString(),
            },
          ],
          total: 2,
        });
      })
    );

    const user = userEvent.setup();
    renderWithProviders(<ChatHistory />);

    await waitFor(() => {
      expect(screen.getByTestId("conversation-search")).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId("conversation-search");
    await user.type(searchInput, "keyword");

    await waitFor(() => {
      expect(screen.getByTestId("global-search-button")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("global-search-button"));

    await waitFor(() => {
      expect(screen.getByTestId("global-search-results")).toBeInTheDocument();
    });

    // Check that results are displayed
    const results = screen.getAllByTestId("global-search-result");
    expect(results).toHaveLength(2);

    // Check that conversation titles are shown
    expect(screen.getByText("First Chat")).toBeInTheDocument();
    expect(screen.getByText("Second Chat")).toBeInTheDocument();

    // Check that snippets are shown (they contain highlighted <mark> tags via dangerouslySetInnerHTML)
    const resultItems = screen.getAllByTestId("global-search-result");
    expect(resultItems[0].textContent).toContain("first result with keyword");
    expect(resultItems[1].textContent).toContain("second result with keyword");
  });

  it("shows 'No results found' when search returns empty", async () => {
    const conversations = createConversationList(2);

    server.use(
      http.get("/conversations", () => {
        return HttpResponse.json({ conversations });
      }),
      http.get("/conversations/search", () => {
        return HttpResponse.json({
          results: [],
          total: 0,
        });
      })
    );

    const user = userEvent.setup();
    renderWithProviders(<ChatHistory />);

    await waitFor(() => {
      expect(screen.getByTestId("conversation-search")).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId("conversation-search");
    await user.type(searchInput, "nonexistent");

    await waitFor(() => {
      expect(screen.getByTestId("global-search-button")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("global-search-button"));

    await waitFor(() => {
      expect(screen.getByText("No results found")).toBeInTheDocument();
    });
  });

  it("navigates to conversation when clicking a search result", async () => {
    const conversations = createConversationList(2);

    server.use(
      http.get("/conversations", () => {
        return HttpResponse.json({ conversations });
      }),
      http.get("/conversations/search", () => {
        return HttpResponse.json({
          results: [
            {
              conversation_id: "conv-target",
              conversation_title: "Target Chat",
              message_id: "msg-1",
              message_role: "user",
              snippet: "Target result",
              created_at: new Date().toISOString(),
            },
          ],
          total: 1,
        });
      })
    );

    const user = userEvent.setup();
    renderWithProviders(<ChatHistory />);

    await waitFor(() => {
      expect(screen.getByTestId("conversation-search")).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId("conversation-search");
    await user.type(searchInput, "target");

    await waitFor(() => {
      expect(screen.getByTestId("global-search-button")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("global-search-button"));

    await waitFor(() => {
      expect(screen.getByTestId("global-search-result")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("global-search-result"));

    // Check that the conversation was selected
    expect(useChatStore.getState().activeConversationId).toBe("conv-target");

    // Check that global search was closed
    await waitFor(() => {
      expect(screen.queryByTestId("global-search-results")).not.toBeInTheDocument();
    });
  });

  it("closes global search when close button is clicked", async () => {
    const conversations = createConversationList(2);

    server.use(
      http.get("/conversations", () => {
        return HttpResponse.json({ conversations });
      }),
      http.get("/conversations/search", () => {
        return HttpResponse.json({
          results: [
            {
              conversation_id: "conv-1",
              conversation_title: "Test Chat",
              message_id: "msg-1",
              message_role: "user",
              snippet: "Test snippet",
              created_at: new Date().toISOString(),
            },
          ],
          total: 1,
        });
      })
    );

    const user = userEvent.setup();
    renderWithProviders(<ChatHistory />);

    await waitFor(() => {
      expect(screen.getByTestId("conversation-search")).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId("conversation-search");
    await user.type(searchInput, "test");

    await waitFor(() => {
      expect(screen.getByTestId("global-search-button")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("global-search-button"));

    await waitFor(() => {
      expect(screen.getByTestId("global-search-results")).toBeInTheDocument();
    });

    // Find and click the close button
    const closeButton = screen.getByLabelText("Close global search");
    await user.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByTestId("global-search-results")).not.toBeInTheDocument();
    });
  });

  it("hides 'Search all conversations' button when global search is shown", async () => {
    const conversations = createConversationList(2);

    server.use(
      http.get("/conversations", () => {
        return HttpResponse.json({ conversations });
      }),
      http.get("/conversations/search", () => {
        return HttpResponse.json({
          results: [],
          total: 0,
        });
      })
    );

    const user = userEvent.setup();
    renderWithProviders(<ChatHistory />);

    await waitFor(() => {
      expect(screen.getByTestId("conversation-search")).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId("conversation-search");
    await user.type(searchInput, "test");

    await waitFor(() => {
      expect(screen.getByTestId("global-search-button")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("global-search-button"));

    await waitFor(() => {
      expect(screen.getByTestId("global-search-results")).toBeInTheDocument();
    });

    // Button should be hidden when results are shown
    expect(screen.queryByTestId("global-search-button")).not.toBeInTheDocument();
  });

  it("resets global search when clearing search input", async () => {
    const conversations = createConversationList(2);

    server.use(
      http.get("/conversations", () => {
        return HttpResponse.json({ conversations });
      }),
      http.get("/conversations/search", () => {
        return HttpResponse.json({
          results: [
            {
              conversation_id: "conv-1",
              conversation_title: "Test Chat",
              message_id: "msg-1",
              message_role: "user",
              snippet: "Test snippet",
              created_at: new Date().toISOString(),
            },
          ],
          total: 1,
        });
      })
    );

    const user = userEvent.setup();
    renderWithProviders(<ChatHistory />);

    await waitFor(() => {
      expect(screen.getByTestId("conversation-search")).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId("conversation-search");
    await user.type(searchInput, "test");

    await waitFor(() => {
      expect(screen.getByTestId("global-search-button")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("global-search-button"));

    await waitFor(() => {
      expect(screen.getByTestId("global-search-results")).toBeInTheDocument();
    });

    // Clear the search
    const clearButton = screen.getByTestId("conversation-search-clear");
    await user.click(clearButton);

    // Global search should be hidden
    await waitFor(() => {
      expect(screen.queryByTestId("global-search-results")).not.toBeInTheDocument();
    });
  });
});
