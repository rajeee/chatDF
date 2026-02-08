// Tests for conversation pinning feature in ChatHistory component.
//
// PIN-FE-1: Pinned conversations appear in a "Pinned" group
// PIN-FE-2: Clicking pin button calls the API
// PIN-FE-3: Pin icon is visible on pinned conversations
// PIN-FE-4: Unpinned conversations stay in date groups
// PIN-FE-5: Pin button shows on hover for unpinned conversations
//
// Note: These tests use queryClient.setQueryData() to pre-populate the
// conversations cache, bypassing the fetch layer. This avoids a known
// AbortSignal compatibility issue between MSW interceptors and jsdom.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { renderWithProviders, screen, waitFor, userEvent } from "../helpers/render";
import { resetAllStores } from "../helpers/stores";
import { createConversation } from "../helpers/mocks/data";
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

describe("PIN-FE-1: Pinned conversations appear in Pinned group", () => {
  it("renders a 'Pinned' group header when there are pinned conversations", () => {
    const conversations = [
      createConversation({ id: "conv-pinned", title: "Pinned Chat", is_pinned: true }),
      createConversation({ id: "conv-normal", title: "Normal Chat", is_pinned: false }),
    ];
    const queryClient = createQueryClientWithConversations(conversations);

    renderWithProviders(<ChatHistory />, { queryClient });

    expect(screen.getByText("Pinned Chat")).toBeInTheDocument();

    // There should be a "Pinned" group label
    const groups = screen.getAllByRole("group");
    const pinnedGroup = groups.find((g) => g.getAttribute("aria-label") === "Pinned");
    expect(pinnedGroup).toBeDefined();
  });

  it("pinned conversations appear before date-grouped conversations", () => {
    const conversations = [
      createConversation({
        id: "conv-pinned",
        title: "Pinned Chat",
        is_pinned: true,
        updated_at: "2025-01-01T00:00:00Z",
      }),
      createConversation({
        id: "conv-recent",
        title: "Recent Chat",
        is_pinned: false,
        updated_at: new Date().toISOString(),
      }),
    ];
    const queryClient = createQueryClientWithConversations(conversations);

    renderWithProviders(<ChatHistory />, { queryClient });

    expect(screen.getByText("Pinned Chat")).toBeInTheDocument();

    const items = screen.getAllByTestId("conversation-item");
    // Pinned should come first even though it's older
    expect(items[0]).toHaveTextContent("Pinned Chat");
    expect(items[1]).toHaveTextContent("Recent Chat");
  });

  it("does not show Pinned group when no conversations are pinned", () => {
    const conversations = [
      createConversation({ id: "conv-1", title: "Chat A", is_pinned: false }),
      createConversation({ id: "conv-2", title: "Chat B", is_pinned: false }),
    ];
    const queryClient = createQueryClientWithConversations(conversations);

    renderWithProviders(<ChatHistory />, { queryClient });

    expect(screen.getByText("Chat A")).toBeInTheDocument();

    const groups = screen.getAllByRole("group");
    const pinnedGroup = groups.find((g) => g.getAttribute("aria-label") === "Pinned");
    expect(pinnedGroup).toBeUndefined();
  });
});

describe("PIN-FE-2: Clicking pin button calls the API", () => {
  it("clicking pin button on unpinned conversation calls PATCH with is_pinned=true", async () => {
    const conversations = [
      createConversation({ id: "conv-to-pin", title: "Pin Me", is_pinned: false }),
    ];
    const queryClient = createQueryClientWithConversations(conversations);

    // Mock apiPatch to capture the call
    const apiModule = await import("@/api/client");
    const patchSpy = vi.spyOn(apiModule, "apiPatch").mockResolvedValue({
      id: "conv-to-pin",
      is_pinned: true,
      updated_at: new Date().toISOString(),
    });

    const user = userEvent.setup();
    renderWithProviders(<ChatHistory />, { queryClient });

    // Hover to reveal pin button
    const item = screen.getByTestId("conversation-item");
    await user.hover(item);

    const pinBtn = screen.getByTestId("pin-conversation-conv-to-pin");
    await user.click(pinBtn);

    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith("/conversations/conv-to-pin/pin", { is_pinned: true });
    });

    patchSpy.mockRestore();
  });

  it("clicking pin button on pinned conversation calls PATCH with is_pinned=false", async () => {
    const conversations = [
      createConversation({ id: "conv-to-unpin", title: "Unpin Me", is_pinned: true }),
    ];
    const queryClient = createQueryClientWithConversations(conversations);

    // Mock apiPatch to capture the call
    const apiModule = await import("@/api/client");
    const patchSpy = vi.spyOn(apiModule, "apiPatch").mockResolvedValue({
      id: "conv-to-unpin",
      is_pinned: false,
      updated_at: new Date().toISOString(),
    });

    const user = userEvent.setup();
    renderWithProviders(<ChatHistory />, { queryClient });

    const pinBtn = screen.getByTestId("pin-conversation-conv-to-unpin");
    await user.click(pinBtn);

    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith("/conversations/conv-to-unpin/pin", { is_pinned: false });
    });

    patchSpy.mockRestore();
  });
});

describe("PIN-FE-3: Pin icon is visible on pinned conversations", () => {
  it("pinned conversations have a pin icon in the title area", () => {
    const conversations = [
      createConversation({ id: "conv-pinned", title: "Pinned Chat", is_pinned: true }),
      createConversation({ id: "conv-normal", title: "Normal Chat", is_pinned: false }),
    ];
    const queryClient = createQueryClientWithConversations(conversations);

    renderWithProviders(<ChatHistory />, { queryClient });

    expect(screen.getByText("Pinned Chat")).toBeInTheDocument();

    const items = screen.getAllByTestId("conversation-item");
    const pinnedItem = items.find((el) => el.textContent?.includes("Pinned Chat"));
    const normalItem = items.find((el) => el.textContent?.includes("Normal Chat"));

    // Pinned item should have data-pinned="true"
    expect(pinnedItem).toHaveAttribute("data-pinned", "true");
    expect(normalItem).toHaveAttribute("data-pinned", "false");
  });

  it("pinned conversations have a visible pin action button", () => {
    const conversations = [
      createConversation({ id: "conv-pinned", title: "Pinned Chat", is_pinned: true }),
    ];
    const queryClient = createQueryClientWithConversations(conversations);

    renderWithProviders(<ChatHistory />, { queryClient });

    expect(screen.getByText("Pinned Chat")).toBeInTheDocument();

    // Pin button for pinned conversations should exist (visible with opacity)
    const pinBtn = screen.getByTestId("pin-conversation-conv-pinned");
    expect(pinBtn).toBeInTheDocument();
    expect(pinBtn).toHaveAttribute("title", "Unpin conversation");
  });

  it("unpinned conversations have pin button with 'Pin conversation' title", () => {
    const conversations = [
      createConversation({ id: "conv-normal", title: "Normal Chat", is_pinned: false }),
    ];
    const queryClient = createQueryClientWithConversations(conversations);

    renderWithProviders(<ChatHistory />, { queryClient });

    expect(screen.getByText("Normal Chat")).toBeInTheDocument();

    const pinBtn = screen.getByTestId("pin-conversation-conv-normal");
    expect(pinBtn).toBeInTheDocument();
    expect(pinBtn).toHaveAttribute("title", "Pin conversation");
  });
});

describe("PIN-FE-4: Pinned conversation has visual indicator", () => {
  it("pinned conversation item has a left border indicator", () => {
    const conversations = [
      createConversation({ id: "conv-pinned", title: "Pinned Chat", is_pinned: true }),
    ];
    const queryClient = createQueryClientWithConversations(conversations);

    renderWithProviders(<ChatHistory />, { queryClient });

    expect(screen.getByText("Pinned Chat")).toBeInTheDocument();

    const item = screen.getByTestId("conversation-item");
    // Should have the border-l-2 class for visual indicator
    expect(item.className).toContain("border-l-2");
  });

  it("unpinned conversation item does not have the left border indicator", () => {
    const conversations = [
      createConversation({ id: "conv-normal", title: "Normal Chat", is_pinned: false }),
    ];
    const queryClient = createQueryClientWithConversations(conversations);

    renderWithProviders(<ChatHistory />, { queryClient });

    expect(screen.getByText("Normal Chat")).toBeInTheDocument();

    const item = screen.getByTestId("conversation-item");
    expect(item.className).not.toContain("border-l-2");
  });
});
