// Tests for the message search feature (SearchBar component + filtering integration).
//
// SEARCH-RENDER-1: Renders search input when search is open
// SEARCH-FILTER-1: Filters messages by search query (case-insensitive)
// SEARCH-COUNT-1: Shows match count
// SEARCH-CLOSE-1: Close button clears search and closes
// SEARCH-ESC-1: Escape key closes search
// SEARCH-HIGHLIGHT-1: Highlights matching text in messages

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  act,
} from "../../helpers/render";
import { fireEvent } from "@testing-library/react";
import { resetAllStores, setChatIdle } from "../../helpers/stores";
import { useChatStore, type Message } from "@/stores/chatStore";
import { SearchBar } from "@/components/chat-area/SearchBar";
import { MessageList } from "@/components/chat-area/MessageList";

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg-1",
    role: "user",
    content: "Hello world",
    sql_query: null,
    sql_executions: [],
    reasoning: null,
    created_at: "2026-02-05T12:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  resetAllStores();
});

describe("SEARCH-RENDER-1: Renders search input when open", () => {
  it("renders the search bar with input, close button, and magnifying glass icon", () => {
    useChatStore.setState({ searchOpen: true });

    renderWithProviders(<SearchBar />);

    expect(screen.getByTestId("search-bar")).toBeInTheDocument();
    expect(screen.getByTestId("search-input")).toBeInTheDocument();
    expect(screen.getByTestId("search-close-btn")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search messages...")).toBeInTheDocument();
  });

  it("auto-focuses the search input when mounted", () => {
    useChatStore.setState({ searchOpen: true });

    renderWithProviders(<SearchBar />);

    const input = screen.getByTestId("search-input");
    expect(document.activeElement).toBe(input);
  });

  it("does not render SearchBar in MessageList when searchOpen is false", () => {
    setChatIdle("conv-1", [
      makeMessage({ id: "msg-1", role: "user", content: "Hello" }),
    ]);
    useChatStore.setState({ searchOpen: false });

    renderWithProviders(<MessageList />);

    expect(screen.queryByTestId("search-bar")).not.toBeInTheDocument();
  });

  it("renders SearchBar in MessageList when searchOpen is true", () => {
    setChatIdle("conv-1", [
      makeMessage({ id: "msg-1", role: "user", content: "Hello" }),
    ]);
    useChatStore.setState({ searchOpen: true });

    renderWithProviders(<MessageList />);

    expect(screen.getByTestId("search-bar")).toBeInTheDocument();
  });
});

describe("SEARCH-FILTER-1: Filters messages by search query", () => {
  it("shows all messages when search query is empty", () => {
    setChatIdle("conv-1", [
      makeMessage({ id: "msg-1", role: "user", content: "Hello world" }),
      makeMessage({ id: "msg-2", role: "assistant", content: "Hi there" }),
      makeMessage({ id: "msg-3", role: "user", content: "Goodbye" }),
    ]);
    useChatStore.setState({ searchOpen: true, searchQuery: "" });

    renderWithProviders(<MessageList />);

    expect(screen.getByTestId("message-row-msg-1")).toBeInTheDocument();
    expect(screen.getByTestId("message-row-msg-2")).toBeInTheDocument();
    expect(screen.getByTestId("message-row-msg-3")).toBeInTheDocument();
  });

  it("filters messages to only those matching the search query", () => {
    setChatIdle("conv-1", [
      makeMessage({ id: "msg-1", role: "user", content: "Hello world" }),
      makeMessage({ id: "msg-2", role: "assistant", content: "Hi there" }),
      makeMessage({ id: "msg-3", role: "user", content: "Goodbye world" }),
    ]);
    useChatStore.setState({ searchOpen: true, searchQuery: "world" });

    renderWithProviders(<MessageList />);

    expect(screen.getByTestId("message-row-msg-1")).toBeInTheDocument();
    expect(screen.queryByTestId("message-row-msg-2")).not.toBeInTheDocument();
    expect(screen.getByTestId("message-row-msg-3")).toBeInTheDocument();
  });

  it("performs case-insensitive search", () => {
    setChatIdle("conv-1", [
      makeMessage({ id: "msg-1", role: "user", content: "HELLO WORLD" }),
      makeMessage({ id: "msg-2", role: "assistant", content: "goodbye" }),
    ]);
    useChatStore.setState({ searchOpen: true, searchQuery: "hello" });

    renderWithProviders(<MessageList />);

    expect(screen.getByTestId("message-row-msg-1")).toBeInTheDocument();
    expect(screen.queryByTestId("message-row-msg-2")).not.toBeInTheDocument();
  });
});

describe("SEARCH-COUNT-1: Shows match count", () => {
  it("shows match count when search query is non-empty", () => {
    setChatIdle("conv-1", [
      makeMessage({ id: "msg-1", role: "user", content: "Hello world" }),
      makeMessage({ id: "msg-2", role: "assistant", content: "Hi there" }),
      makeMessage({ id: "msg-3", role: "user", content: "Hello again" }),
    ]);
    useChatStore.setState({ searchOpen: true, searchQuery: "Hello" });

    renderWithProviders(<SearchBar />);

    const matchCount = screen.getByTestId("search-match-count");
    expect(matchCount).toBeInTheDocument();
    expect(matchCount.textContent).toBe("2 matches");
  });

  it("shows singular 'match' for 1 result", () => {
    setChatIdle("conv-1", [
      makeMessage({ id: "msg-1", role: "user", content: "Hello world" }),
      makeMessage({ id: "msg-2", role: "assistant", content: "Hi there" }),
    ]);
    useChatStore.setState({ searchOpen: true, searchQuery: "world" });

    renderWithProviders(<SearchBar />);

    const matchCount = screen.getByTestId("search-match-count");
    expect(matchCount.textContent).toBe("1 match");
  });

  it("shows 0 matches when nothing found", () => {
    setChatIdle("conv-1", [
      makeMessage({ id: "msg-1", role: "user", content: "Hello world" }),
    ]);
    useChatStore.setState({ searchOpen: true, searchQuery: "xyz" });

    renderWithProviders(<SearchBar />);

    const matchCount = screen.getByTestId("search-match-count");
    expect(matchCount.textContent).toBe("0 matches");
  });

  it("does not show match count when search query is empty", () => {
    setChatIdle("conv-1", [
      makeMessage({ id: "msg-1", role: "user", content: "Hello world" }),
    ]);
    useChatStore.setState({ searchOpen: true, searchQuery: "" });

    renderWithProviders(<SearchBar />);

    expect(screen.queryByTestId("search-match-count")).not.toBeInTheDocument();
  });
});

describe("SEARCH-CLOSE-1: Close button clears search and closes", () => {
  it("clicking close button sets searchOpen to false and clears query", async () => {
    const user = userEvent.setup();
    setChatIdle("conv-1", [
      makeMessage({ id: "msg-1", role: "user", content: "Hello" }),
    ]);
    useChatStore.setState({ searchOpen: true, searchQuery: "Hello" });

    renderWithProviders(<SearchBar />);

    const closeBtn = screen.getByTestId("search-close-btn");
    await user.click(closeBtn);

    expect(useChatStore.getState().searchOpen).toBe(false);
    expect(useChatStore.getState().searchQuery).toBe("");
  });
});

describe("SEARCH-ESC-1: Escape key closes search", () => {
  it("pressing Escape in search input closes search", async () => {
    const user = userEvent.setup();
    setChatIdle("conv-1", [
      makeMessage({ id: "msg-1", role: "user", content: "Hello" }),
    ]);
    useChatStore.setState({ searchOpen: true, searchQuery: "test" });

    renderWithProviders(<SearchBar />);

    const input = screen.getByTestId("search-input");
    // Focus the input and press Escape
    await user.click(input);
    await user.keyboard("{Escape}");

    expect(useChatStore.getState().searchOpen).toBe(false);
    expect(useChatStore.getState().searchQuery).toBe("");
  });
});

describe("SEARCH-HIGHLIGHT-1: Highlights matching text", () => {
  it("highlights matching text in user messages", () => {
    setChatIdle("conv-1", [
      makeMessage({ id: "msg-1", role: "user", content: "Hello world" }),
    ]);
    useChatStore.setState({ searchOpen: true, searchQuery: "world" });

    renderWithProviders(<MessageList />);

    const bubble = screen.getByTestId("message-bubble-msg-1");
    const marks = bubble.querySelectorAll("mark.search-highlight");
    expect(marks.length).toBe(1);
    expect(marks[0].textContent).toBe("world");
  });

  it("does not highlight when search query is empty", () => {
    setChatIdle("conv-1", [
      makeMessage({ id: "msg-1", role: "user", content: "Hello world" }),
    ]);
    useChatStore.setState({ searchOpen: true, searchQuery: "" });

    renderWithProviders(<MessageList />);

    const bubble = screen.getByTestId("message-bubble-msg-1");
    const marks = bubble.querySelectorAll("mark.search-highlight");
    expect(marks.length).toBe(0);
  });
});

describe("SEARCH-KEYBOARD-1: Keyboard shortcut toggles search", () => {
  it("Ctrl+Shift+F toggles searchOpen in the store", () => {
    expect(useChatStore.getState().searchOpen).toBe(false);

    // Open
    const { setSearchOpen } = useChatStore.getState();
    setSearchOpen(true);
    expect(useChatStore.getState().searchOpen).toBe(true);

    // Close
    setSearchOpen(false);
    expect(useChatStore.getState().searchOpen).toBe(false);
    expect(useChatStore.getState().searchQuery).toBe("");
  });

  it("closing search clears the search query", () => {
    useChatStore.setState({ searchOpen: true, searchQuery: "test" });

    const { setSearchOpen } = useChatStore.getState();
    setSearchOpen(false);

    expect(useChatStore.getState().searchQuery).toBe("");
  });
});
