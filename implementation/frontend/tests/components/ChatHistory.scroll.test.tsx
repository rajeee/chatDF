// Tests: Auto-scroll to active conversation in sidebar
//
// CH-SCROLL-1: scrollIntoView is called when activeConversationId changes
// CH-SCROLL-2: scrollIntoView is called with correct options
// CH-SCROLL-3: scrollIntoView is not called when activeConversationId is null
// CH-SCROLL-4: scrollIntoView targets the correct element
//
// Note: These tests use queryClient.setQueryData() to pre-populate the
// conversations cache, bypassing the fetch layer. This avoids a known
// AbortSignal compatibility issue between MSW interceptors and jsdom.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { renderWithProviders, screen, waitFor, act } from "../helpers/render";
import { resetAllStores } from "../helpers/stores";
import { createConversation } from "../helpers/mocks/data";
import { useChatStore } from "@/stores/chatStore";
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

describe("CH-SCROLL: Auto-scroll to active conversation", () => {
  it("calls scrollIntoView on the active conversation element when activeConversationId changes", async () => {
    const conversations = [
      createConversation({ id: "conv-1", title: "First Chat" }),
      createConversation({ id: "conv-2", title: "Second Chat" }),
      createConversation({ id: "conv-3", title: "Third Chat" }),
    ];
    const queryClient = createQueryClientWithConversations(conversations);

    renderWithProviders(<ChatHistory />, { queryClient });

    expect(screen.getByText("First Chat")).toBeInTheDocument();

    // Mock scrollIntoView on all conversation items
    const items = screen.getAllByTestId("conversation-item");
    const scrollMocks = items.map((item) => {
      const mock = vi.fn();
      item.scrollIntoView = mock;
      return mock;
    });

    // Set active conversation to the second one
    await act(async () => {
      useChatStore.setState({ activeConversationId: "conv-2" });
    });

    // Wait for requestAnimationFrame to fire
    await waitFor(() => {
      const secondItem = items.find((el) =>
        el.textContent?.includes("Second Chat")
      );
      expect(secondItem!.scrollIntoView).toHaveBeenCalled();
    });
  });

  it("calls scrollIntoView with behavior 'smooth' and block 'nearest'", async () => {
    const conversations = [
      createConversation({ id: "conv-a", title: "Chat A" }),
      createConversation({ id: "conv-b", title: "Chat B" }),
    ];
    const queryClient = createQueryClientWithConversations(conversations);

    renderWithProviders(<ChatHistory />, { queryClient });

    expect(screen.getByText("Chat A")).toBeInTheDocument();

    // Mock scrollIntoView on all conversation items
    const items = screen.getAllByTestId("conversation-item");
    items.forEach((item) => {
      item.scrollIntoView = vi.fn();
    });

    // Set active conversation
    await act(async () => {
      useChatStore.setState({ activeConversationId: "conv-b" });
    });

    await waitFor(() => {
      const targetItem = items.find((el) =>
        el.textContent?.includes("Chat B")
      );
      expect(targetItem!.scrollIntoView).toHaveBeenCalledWith({
        behavior: "smooth",
        block: "nearest",
      });
    });
  });

  it("does not call scrollIntoView when activeConversationId is null", async () => {
    const conversations = [
      createConversation({ id: "conv-x", title: "Chat X" }),
    ];
    const queryClient = createQueryClientWithConversations(conversations);

    // Start with an active conversation
    useChatStore.setState({ activeConversationId: "conv-x" });

    renderWithProviders(<ChatHistory />, { queryClient });

    expect(screen.getByText("Chat X")).toBeInTheDocument();

    // Mock scrollIntoView
    const items = screen.getAllByTestId("conversation-item");
    const scrollMock = vi.fn();
    items[0].scrollIntoView = scrollMock;

    // Wait for initial rAF scroll to complete before clearing
    await waitFor(() => {
      expect(scrollMock).toHaveBeenCalled();
    });

    // Clear the mock after initial render scroll
    scrollMock.mockClear();

    // Set activeConversationId to null
    await act(async () => {
      useChatStore.setState({ activeConversationId: null });
    });

    // Give time for any potential rAF callback
    await new Promise((r) => setTimeout(r, 50));

    expect(scrollMock).not.toHaveBeenCalled();
  });

  it("scrolls to the correct element when switching between conversations", async () => {
    const conversations = [
      createConversation({ id: "conv-alpha", title: "Alpha" }),
      createConversation({ id: "conv-beta", title: "Beta" }),
      createConversation({ id: "conv-gamma", title: "Gamma" }),
    ];
    const queryClient = createQueryClientWithConversations(conversations);

    renderWithProviders(<ChatHistory />, { queryClient });

    expect(screen.getByText("Alpha")).toBeInTheDocument();

    const items = screen.getAllByTestId("conversation-item");
    const scrollMocks: Record<string, ReturnType<typeof vi.fn>> = {};

    items.forEach((item) => {
      const title = item.textContent ?? "";
      const mock = vi.fn();
      item.scrollIntoView = mock;
      if (title.includes("Alpha")) scrollMocks["alpha"] = mock;
      if (title.includes("Beta")) scrollMocks["beta"] = mock;
      if (title.includes("Gamma")) scrollMocks["gamma"] = mock;
    });

    // Switch to Alpha
    await act(async () => {
      useChatStore.setState({ activeConversationId: "conv-alpha" });
    });

    await waitFor(() => {
      expect(scrollMocks["alpha"]).toHaveBeenCalled();
    });

    // Clear all mocks
    Object.values(scrollMocks).forEach((m) => m.mockClear());

    // Switch to Gamma
    await act(async () => {
      useChatStore.setState({ activeConversationId: "conv-gamma" });
    });

    await waitFor(() => {
      expect(scrollMocks["gamma"]).toHaveBeenCalled();
    });

    // Beta should NOT have been called during this switch
    expect(scrollMocks["beta"]).not.toHaveBeenCalled();
  });
});
