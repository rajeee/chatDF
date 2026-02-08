// Tests: spec/frontend/left_panel/test_plan.md#chat-history-tests
// Verifies: spec/frontend/left_panel/chat_history/plan.md
//
// CH-1: Renders conversation list from API
// CH-2: Click selects conversation (sets chatStore.activeConversationId)
// CH-3: Active conversation is highlighted
// CH-4: Inline rename via double-click
// CH-5: Delete with confirmation
// CH-6: Empty state when no conversations
// CH-7: New Chat button creates conversation

import { describe, it, expect, beforeEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, waitFor, userEvent } from "../../helpers/render";
import { resetAllStores } from "../../helpers/stores";
import { server } from "../../helpers/mocks/server";
import { createConversationList, createConversation } from "../../helpers/mocks/data";
import { useChatStore } from "@/stores/chatStore";
import { useUiStore } from "@/stores/uiStore";
import { ChatHistory } from "@/components/left-panel/ChatHistory";

beforeEach(() => {
  resetAllStores();
});

describe("CH-1: Renders conversation list", () => {
  it("renders conversations fetched from the API", async () => {
    const conversations = createConversationList(3);

    server.use(
      http.get("/conversations", () => {
        return HttpResponse.json({ conversations });
      })
    );

    renderWithProviders(<ChatHistory />);

    await waitFor(() => {
      expect(screen.getByText("Conversation 1")).toBeInTheDocument();
    });
    expect(screen.getByText("Conversation 2")).toBeInTheDocument();
    expect(screen.getByText("Conversation 3")).toBeInTheDocument();
  });

  it("renders conversations sorted by updated_at descending", async () => {
    const conversations = [
      createConversation({ title: "Oldest", updated_at: "2026-01-01T00:00:00Z" }),
      createConversation({ title: "Newest", updated_at: "2026-02-05T00:00:00Z" }),
      createConversation({ title: "Middle", updated_at: "2026-01-15T00:00:00Z" }),
    ];

    server.use(
      http.get("/conversations", () => {
        // Server returns sorted; component renders in order
        return HttpResponse.json({
          conversations: [...conversations].sort(
            (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
          ),
        });
      })
    );

    renderWithProviders(<ChatHistory />);

    await waitFor(() => {
      expect(screen.getByText("Newest")).toBeInTheDocument();
    });

    const items = screen.getAllByTestId("conversation-item");
    expect(items[0]).toHaveTextContent("Newest");
    expect(items[1]).toHaveTextContent("Middle");
    expect(items[2]).toHaveTextContent("Oldest");
  });
});

describe("CH-2: Click selects conversation", () => {
  it("clicking a conversation sets activeConversationId in chatStore", async () => {
    const conversations = [
      createConversation({ id: "conv-abc", title: "My Chat" }),
    ];

    server.use(
      http.get("/conversations", () => {
        return HttpResponse.json({ conversations });
      })
    );

    const user = userEvent.setup();
    renderWithProviders(<ChatHistory />);

    await waitFor(() => {
      expect(screen.getByText("My Chat")).toBeInTheDocument();
    });

    await user.click(screen.getByText("My Chat"));

    expect(useChatStore.getState().activeConversationId).toBe("conv-abc");
  });
});

describe("CH-3: Active conversation highlighting", () => {
  it("applies active styles to the currently selected conversation", async () => {
    const conversations = [
      createConversation({ id: "conv-active", title: "Active Chat" }),
      createConversation({ id: "conv-other", title: "Other Chat" }),
    ];

    server.use(
      http.get("/conversations", () => {
        return HttpResponse.json({ conversations });
      })
    );

    useChatStore.setState({ activeConversationId: "conv-active" });

    renderWithProviders(<ChatHistory />);

    await waitFor(() => {
      expect(screen.getByText("Active Chat")).toBeInTheDocument();
    });

    const items = screen.getAllByTestId("conversation-item");
    const activeItem = items.find((el) => el.textContent?.includes("Active Chat"));
    expect(activeItem).toHaveAttribute("data-active", "true");
  });
});

describe("CH-4: Inline rename via double-click", () => {
  it("double-clicking title switches to input field", async () => {
    const conversations = [
      createConversation({ id: "conv-1", title: "Original Title" }),
    ];

    server.use(
      http.get("/conversations", () => {
        return HttpResponse.json({ conversations });
      })
    );

    const user = userEvent.setup();
    renderWithProviders(<ChatHistory />);

    await waitFor(() => {
      expect(screen.getByText("Original Title")).toBeInTheDocument();
    });

    await user.dblClick(screen.getByText("Original Title"));

    const input = screen.getByDisplayValue("Original Title");
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe("INPUT");
  });

  it("submitting rename calls PATCH and updates the list", async () => {
    const conversations = [
      createConversation({ id: "conv-rename", title: "Old Name" }),
    ];

    let patchCalled = false;
    let patchBody: { title?: string } = {};

    server.use(
      http.get("/conversations", () => {
        return HttpResponse.json({ conversations });
      }),
      http.patch("/conversations/:id", async ({ request }) => {
        patchCalled = true;
        patchBody = (await request.json()) as { title: string };
        return HttpResponse.json({ ...conversations[0], title: patchBody.title });
      })
    );

    const user = userEvent.setup();
    renderWithProviders(<ChatHistory />);

    await waitFor(() => {
      expect(screen.getByText("Old Name")).toBeInTheDocument();
    });

    await user.dblClick(screen.getByText("Old Name"));
    const input = screen.getByDisplayValue("Old Name");
    await user.clear(input);
    await user.type(input, "New Name");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(patchCalled).toBe(true);
    });
    expect(patchBody.title).toBe("New Name");
  });

  it("pressing Escape cancels rename and reverts to original", async () => {
    const conversations = [
      createConversation({ id: "conv-esc", title: "Keep This" }),
    ];

    server.use(
      http.get("/conversations", () => {
        return HttpResponse.json({ conversations });
      })
    );

    const user = userEvent.setup();
    renderWithProviders(<ChatHistory />);

    await waitFor(() => {
      expect(screen.getByText("Keep This")).toBeInTheDocument();
    });

    await user.dblClick(screen.getByText("Keep This"));
    const input = screen.getByDisplayValue("Keep This");
    await user.clear(input);
    await user.type(input, "Changed Text");
    await user.keyboard("{Escape}");

    // Should revert to span with original title
    expect(screen.getByText("Keep This")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Changed Text")).not.toBeInTheDocument();
  });
});

describe("CH-5: Delete with confirmation", () => {
  it("shows confirmation when delete button is clicked", async () => {
    const conversations = [
      createConversation({ id: "conv-del", title: "Delete Me" }),
    ];

    server.use(
      http.get("/conversations", () => {
        return HttpResponse.json({ conversations });
      })
    );

    const user = userEvent.setup();
    renderWithProviders(<ChatHistory />);

    await waitFor(() => {
      expect(screen.getByText("Delete Me")).toBeInTheDocument();
    });

    // Hover to reveal delete button
    const item = screen.getByTestId("conversation-item");
    await user.hover(item);

    const deleteBtn = screen.getByTestId("delete-conversation-conv-del");
    await user.click(deleteBtn);

    // Confirmation should appear
    expect(screen.getByText("Delete?")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument();
  });

  it("confirming delete calls DELETE and removes the conversation", async () => {
    const conversations = [
      createConversation({ id: "conv-del2", title: "To Delete" }),
    ];

    let deleteCalled = false;

    server.use(
      http.get("/conversations", () => {
        if (deleteCalled) {
          return HttpResponse.json({ conversations: [] });
        }
        return HttpResponse.json({ conversations });
      }),
      http.delete("/conversations/:id", () => {
        deleteCalled = true;
        return HttpResponse.json({ success: true });
      })
    );

    const user = userEvent.setup();
    renderWithProviders(<ChatHistory />);

    await waitFor(() => {
      expect(screen.getByText("To Delete")).toBeInTheDocument();
    });

    const item = screen.getByTestId("conversation-item");
    await user.hover(item);

    const deleteBtn = screen.getByTestId("delete-conversation-conv-del2");
    await user.click(deleteBtn);
    await user.click(screen.getByText("Yes"));

    await waitFor(() => {
      expect(deleteCalled).toBe(true);
    });
  });

  it("cancelling delete keeps the conversation", async () => {
    const conversations = [
      createConversation({ id: "conv-keep", title: "Keep Me" }),
    ];

    server.use(
      http.get("/conversations", () => {
        return HttpResponse.json({ conversations });
      })
    );

    const user = userEvent.setup();
    renderWithProviders(<ChatHistory />);

    await waitFor(() => {
      expect(screen.getByText("Keep Me")).toBeInTheDocument();
    });

    const item = screen.getByTestId("conversation-item");
    await user.hover(item);

    const deleteBtn = screen.getByTestId("delete-conversation-conv-keep");
    await user.click(deleteBtn);
    await user.click(screen.getByText("No"));

    // Conversation should still be there, confirmation gone
    expect(screen.getByText("Keep Me")).toBeInTheDocument();
    expect(screen.queryByText("Delete?")).not.toBeInTheDocument();
  });

  it("deleting active conversation sets activeConversationId to null", async () => {
    const conversations = [
      createConversation({ id: "conv-active-del", title: "Active To Delete" }),
    ];

    useChatStore.setState({ activeConversationId: "conv-active-del" });

    server.use(
      http.get("/conversations", () => {
        return HttpResponse.json({ conversations });
      }),
      http.delete("/conversations/:id", () => {
        return HttpResponse.json({ success: true });
      })
    );

    const user = userEvent.setup();
    renderWithProviders(<ChatHistory />);

    await waitFor(() => {
      expect(screen.getByText("Active To Delete")).toBeInTheDocument();
    });

    const item = screen.getByTestId("conversation-item");
    await user.hover(item);

    const deleteBtn = screen.getByTestId("delete-conversation-conv-active-del");
    await user.click(deleteBtn);
    await user.click(screen.getByText("Yes"));

    await waitFor(() => {
      expect(useChatStore.getState().activeConversationId).toBeNull();
    });
  });

  it("shows loading spinner on confirm delete button during deletion", async () => {
    const conversations = [
      createConversation({ id: "conv-spinner", title: "Loading Test" }),
    ];

    server.use(
      http.get("/conversations", () => {
        return HttpResponse.json({ conversations });
      }),
      http.delete("/conversations/:id", async () => {
        // Delay to ensure spinner is visible
        await new Promise((resolve) => setTimeout(resolve, 100));
        return HttpResponse.json({ success: true });
      })
    );

    const user = userEvent.setup();
    renderWithProviders(<ChatHistory />);

    await waitFor(() => {
      expect(screen.getByText("Loading Test")).toBeInTheDocument();
    });

    const item = screen.getByTestId("conversation-item");
    await user.hover(item);

    const deleteBtn = screen.getByTestId("delete-conversation-conv-spinner");
    await user.click(deleteBtn);

    const confirmBtn = screen.getByTestId("confirm-delete-conv-spinner");
    await user.click(confirmBtn);

    // Spinner should appear in the confirm button
    await waitFor(() => {
      const spinner = confirmBtn.querySelector(".animate-spin");
      expect(spinner).toBeInTheDocument();
    });
  });

  it("disables both Yes and No buttons during deletion", async () => {
    const conversations = [
      createConversation({ id: "conv-disable", title: "Disable Test" }),
    ];

    server.use(
      http.get("/conversations", () => {
        return HttpResponse.json({ conversations });
      }),
      http.delete("/conversations/:id", async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return HttpResponse.json({ success: true });
      })
    );

    const user = userEvent.setup();
    renderWithProviders(<ChatHistory />);

    await waitFor(() => {
      expect(screen.getByText("Disable Test")).toBeInTheDocument();
    });

    const item = screen.getByTestId("conversation-item");
    await user.hover(item);

    const deleteBtn = screen.getByTestId("delete-conversation-conv-disable");
    await user.click(deleteBtn);

    const yesBtn = screen.getByText("Yes");
    const noBtn = screen.getByText("No");

    await user.click(yesBtn);

    // Both buttons should be disabled during deletion
    await waitFor(() => {
      expect(yesBtn).toBeDisabled();
      expect(noBtn).toBeDisabled();
    });
  });
});

describe("CH-6: Empty state", () => {
  it("shows skeleton loading state while fetching", async () => {
    server.use(
      http.get("/conversations", async () => {
        // Delay response to ensure skeleton is visible
        await new Promise((resolve) => setTimeout(resolve, 100));
        return HttpResponse.json({ conversations: [] });
      })
    );

    renderWithProviders(<ChatHistory />);

    // Should show skeleton items immediately
    const skeletons = screen.getAllByTestId("conversation-skeleton");
    expect(skeletons).toHaveLength(3);
    expect(skeletons[0].querySelector(".animate-pulse")).toBeInTheDocument();

    // After loading, should show empty state
    await waitFor(() => {
      expect(screen.queryByTestId("conversation-skeleton")).not.toBeInTheDocument();
      expect(screen.getByText("No conversations yet")).toBeInTheDocument();
    });
  });

  it("shows 'No conversations yet' when list is empty", async () => {
    server.use(
      http.get("/conversations", () => {
        return HttpResponse.json({ conversations: [] });
      })
    );

    renderWithProviders(<ChatHistory />);

    await waitFor(() => {
      expect(screen.getByText("No conversations yet")).toBeInTheDocument();
    });
  });
});

describe("Accessibility: ARIA attributes", () => {
  it("active conversation has aria-current='page'", async () => {
    const conversations = [
      createConversation({ id: "conv-a", title: "Chat A" }),
      createConversation({ id: "conv-b", title: "Chat B" }),
    ];

    server.use(
      http.get("/conversations", () => {
        return HttpResponse.json({ conversations });
      })
    );

    useChatStore.setState({ activeConversationId: "conv-a" });
    renderWithProviders(<ChatHistory />);

    await waitFor(() => {
      expect(screen.getByText("Chat A")).toBeInTheDocument();
    });

    const items = screen.getAllByTestId("conversation-item");
    const activeItem = items.find((el) => el.textContent?.includes("Chat A"));
    const inactiveItem = items.find((el) => el.textContent?.includes("Chat B"));

    expect(activeItem).toHaveAttribute("aria-current", "page");
    expect(inactiveItem).not.toHaveAttribute("aria-current");
  });

  it("conversation list has aria-label", async () => {
    const conversations = [
      createConversation({ id: "conv-1", title: "Chat 1" }),
    ];

    server.use(
      http.get("/conversations", () => {
        return HttpResponse.json({ conversations });
      })
    );

    renderWithProviders(<ChatHistory />);

    await waitFor(() => {
      expect(screen.getByText("Chat 1")).toBeInTheDocument();
    });

    const list = screen.getByRole("listbox");
    expect(list).toHaveAttribute("aria-label", "Conversations");
  });
});

describe("CH-7: New Chat button", () => {
  it("renders a New Chat button with icon", async () => {
    server.use(
      http.get("/conversations", () => {
        return HttpResponse.json({ conversations: [] });
      })
    );

    renderWithProviders(<ChatHistory />);

    await waitFor(() => {
      expect(screen.getByTestId("new-chat-button")).toBeInTheDocument();
    });

    const button = screen.getByTestId("new-chat-button");
    // Button should contain an SVG icon (plus symbol)
    expect(button.querySelector("svg")).toBeInTheDocument();
    expect(button.textContent).toContain("New Chat");
  });

  it("clicking New Chat creates a new conversation and selects it", async () => {
    let postCalled = false;

    server.use(
      http.get("/conversations", () => {
        return HttpResponse.json({ conversations: [] });
      }),
      http.post("/conversations", () => {
        postCalled = true;
        return HttpResponse.json(
          createConversation({ id: "conv-new", title: "New Conversation" }),
          { status: 201 }
        );
      })
    );

    const user = userEvent.setup();
    renderWithProviders(<ChatHistory />);

    await waitFor(() => {
      expect(screen.getByTestId("new-chat-button")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("new-chat-button"));

    await waitFor(() => {
      expect(postCalled).toBe(true);
    });
    expect(useChatStore.getState().activeConversationId).toBe("conv-new");
  });
});

describe("CH-8: Relative timestamps", () => {
  it("displays relative time for each conversation", async () => {
    const conversations = [
      createConversation({
        id: "conv-recent",
        title: "Recent Chat",
        updated_at: new Date().toISOString(),
      }),
    ];

    server.use(
      http.get("/conversations", () => {
        return HttpResponse.json({ conversations });
      })
    );

    renderWithProviders(<ChatHistory />);

    await waitFor(() => {
      expect(screen.getByText("Recent Chat")).toBeInTheDocument();
    });

    // Should show a relative time element
    const timeEl = screen.getByTestId("conversation-time");
    expect(timeEl).toBeInTheDocument();
    expect(timeEl.textContent).toBe("just now");
  });

  it("shows relative time for each conversation in a list", async () => {
    const conversations = [
      createConversation({
        title: "Chat A",
        updated_at: new Date().toISOString(),
      }),
      createConversation({
        title: "Chat B",
        updated_at: new Date(Date.now() - 3600 * 1000).toISOString(),
      }),
    ];

    server.use(
      http.get("/conversations", () => {
        return HttpResponse.json({ conversations });
      })
    );

    renderWithProviders(<ChatHistory />);

    await waitFor(() => {
      expect(screen.getByText("Chat A")).toBeInTheDocument();
    });

    const timeEls = screen.getAllByTestId("conversation-time");
    expect(timeEls).toHaveLength(2);
    expect(timeEls[0].textContent).toBe("just now");
    expect(timeEls[1].textContent).toBe("1h ago");
  });
});

describe("Mobile: auto-close left panel on conversation select", () => {
  it("closes left panel when selecting a conversation on mobile viewport", async () => {
    const conversations = [
      createConversation({ id: "conv-mobile", title: "Mobile Chat" }),
    ];

    server.use(
      http.get("/conversations", () => {
        return HttpResponse.json({ conversations });
      })
    );

    // Simulate mobile viewport
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 768,
    });

    // Left panel starts open
    useUiStore.setState({ leftPanelOpen: true });

    const user = userEvent.setup();
    renderWithProviders(<ChatHistory />);

    await waitFor(() => {
      expect(screen.getByText("Mobile Chat")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Mobile Chat"));

    // Panel should be closed after selecting
    expect(useUiStore.getState().leftPanelOpen).toBe(false);
    // Conversation should still be selected
    expect(useChatStore.getState().activeConversationId).toBe("conv-mobile");
  });

  it("does NOT close left panel when selecting a conversation on desktop viewport", async () => {
    const conversations = [
      createConversation({ id: "conv-desktop", title: "Desktop Chat" }),
    ];

    server.use(
      http.get("/conversations", () => {
        return HttpResponse.json({ conversations });
      })
    );

    // Simulate desktop viewport
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 1280,
    });

    useUiStore.setState({ leftPanelOpen: true });

    const user = userEvent.setup();
    renderWithProviders(<ChatHistory />);

    await waitFor(() => {
      expect(screen.getByText("Desktop Chat")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Desktop Chat"));

    // Panel should remain open on desktop
    expect(useUiStore.getState().leftPanelOpen).toBe(true);
    // Conversation should still be selected
    expect(useChatStore.getState().activeConversationId).toBe("conv-desktop");
  });
});
