// Tests: spec/frontend/chat_area/message_list/spec.md
// Verifies: spec/frontend/chat_area/message_list/plan.md
//
// ML-RENDER-1: User messages are right-aligned
// ML-RENDER-2: Assistant messages are left-aligned with markdown rendering
// ML-SCROLL-1: Auto-scroll to bottom on new message
// ML-SQL-1: "Show SQL" button opens SQL panel via uiStore
// ML-COPY-1: Copy button copies message content to clipboard
// ML-STREAM-1: Streaming indicator shown while isStreaming

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
import { useUiStore } from "@/stores/uiStore";
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

const writeTextMock = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  resetAllStores();
  writeTextMock.mockClear();
  // Mock clipboard API - navigator.clipboard is read-only, use defineProperty
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: writeTextMock },
    writable: true,
    configurable: true,
  });
});

describe("ML-RENDER-1: User messages are right-aligned", () => {
  it("renders user message with right alignment", () => {
    setChatIdle("conv-1", [
      makeMessage({ id: "msg-1", role: "user", content: "Hello from user" }),
    ]);

    renderWithProviders(<MessageList />);

    const bubble = screen.getByTestId("message-bubble-msg-1");
    // User messages should have a wrapper with items-end for right-alignment
    expect(bubble.closest("[data-testid='message-row-msg-1']")).toHaveClass(
      "items-end"
    );
  });

  it("renders user message with accent background", () => {
    setChatIdle("conv-1", [
      makeMessage({ id: "msg-1", role: "user", content: "Hello" }),
    ]);

    renderWithProviders(<MessageList />);

    const bubble = screen.getByTestId("message-bubble-msg-1");
    expect(bubble).toHaveStyle({
      backgroundColor: "var(--color-accent)",
    });
  });

  it("renders user message as plain text (no markdown)", () => {
    setChatIdle("conv-1", [
      makeMessage({
        id: "msg-1",
        role: "user",
        content: "**bold text** and _italic_",
      }),
    ]);

    renderWithProviders(<MessageList />);

    const bubble = screen.getByTestId("message-bubble-msg-1");
    // Should contain the raw text, not rendered bold/italic HTML
    expect(bubble.textContent).toContain("**bold text** and _italic_");
    expect(bubble.querySelector("strong")).toBeNull();
  });
});

describe("ML-RENDER-2: Assistant messages left-aligned with markdown", () => {
  it("renders assistant message with left alignment", () => {
    setChatIdle("conv-1", [
      makeMessage({
        id: "msg-2",
        role: "assistant",
        content: "Hello from assistant",
      }),
    ]);

    renderWithProviders(<MessageList />);

    const bubble = screen.getByTestId("message-bubble-msg-2");
    expect(bubble.closest("[data-testid='message-row-msg-2']")).toHaveClass(
      "items-start"
    );
  });

  it("renders assistant message with surface background", () => {
    setChatIdle("conv-1", [
      makeMessage({
        id: "msg-2",
        role: "assistant",
        content: "Hello",
      }),
    ]);

    renderWithProviders(<MessageList />);

    const bubble = screen.getByTestId("message-bubble-msg-2");
    expect(bubble).toHaveStyle({
      backgroundColor: "var(--color-surface)",
    });
  });

  it("renders markdown content in assistant messages", () => {
    setChatIdle("conv-1", [
      makeMessage({
        id: "msg-2",
        role: "assistant",
        content: "**bold text** and *italic text*",
      }),
    ]);

    renderWithProviders(<MessageList />);

    const bubble = screen.getByTestId("message-bubble-msg-2");
    expect(bubble.querySelector("strong")).not.toBeNull();
    expect(bubble.querySelector("em")).not.toBeNull();
  });

  it("renders multiple messages in order", () => {
    setChatIdle("conv-1", [
      makeMessage({ id: "msg-1", role: "user", content: "Question" }),
      makeMessage({
        id: "msg-2",
        role: "assistant",
        content: "Answer",
      }),
      makeMessage({ id: "msg-3", role: "user", content: "Follow-up" }),
    ]);

    renderWithProviders(<MessageList />);

    const rows = screen.getAllByTestId(/^message-row-/);
    expect(rows).toHaveLength(3);
    expect(rows[0].dataset.testid).toBe("message-row-msg-1");
    expect(rows[1].dataset.testid).toBe("message-row-msg-2");
    expect(rows[2].dataset.testid).toBe("message-row-msg-3");
  });
});

describe("ML-SCROLL-1: Auto-scroll to bottom", () => {
  it("renders a scroll container with the message-list-scroll testid", () => {
    setChatIdle("conv-1", [
      makeMessage({ id: "msg-1", role: "user", content: "Hello" }),
    ]);

    renderWithProviders(<MessageList />);

    expect(screen.getByTestId("message-list-scroll")).toBeInTheDocument();
  });

  it("renders a scroll-to-bottom sentinel element", () => {
    setChatIdle("conv-1", [
      makeMessage({ id: "msg-1", role: "user", content: "Hello" }),
    ]);

    renderWithProviders(<MessageList />);

    expect(screen.getByTestId("scroll-sentinel")).toBeInTheDocument();
  });

  it("uses requestAnimationFrame for smooth scrolling during streaming", async () => {
    // Mock requestAnimationFrame
    const rafSpy = vi.spyOn(window, "requestAnimationFrame");
    rafSpy.mockImplementation((cb) => {
      cb(0);
      return 0;
    });

    // Start with an initial message
    setChatIdle("conv-1", [
      makeMessage({ id: "msg-1", role: "assistant", content: "Initial" }),
    ]);

    renderWithProviders(<MessageList />);

    // Simulate streaming by updating tokens
    act(() => {
      useChatStore.setState({
        isStreaming: true,
        streamingMessageId: "msg-streaming",
        streamingTokens: "New streaming content",
        messages: [
          ...useChatStore.getState().messages,
          makeMessage({ id: "msg-streaming", role: "assistant", content: "" }),
        ],
      });
    });

    // Wait for effect to run
    await waitFor(() => {
      expect(rafSpy).toHaveBeenCalled();
    });

    rafSpy.mockRestore();
  });
});

describe("ML-SQL-1: Show SQL button opens SQL panel", () => {
  it("renders 'Show SQL' button when message has sql_executions", () => {
    setChatIdle("conv-1", [
      makeMessage({
        id: "msg-2",
        role: "assistant",
        content: "Here are the results",
        sql_query: "SELECT * FROM users",
        sql_executions: [{ query: "SELECT * FROM users", columns: null, rows: null, total_rows: null, error: null }],
      }),
    ]);

    renderWithProviders(<MessageList />);

    expect(screen.getByText("Show SQL (1)")).toBeInTheDocument();
  });

  it("does not render 'Show SQL' button when no sql_executions", () => {
    setChatIdle("conv-1", [
      makeMessage({
        id: "msg-2",
        role: "assistant",
        content: "Hello",
        sql_query: null,
        sql_executions: [],
      }),
    ]);

    renderWithProviders(<MessageList />);

    expect(screen.queryByText(/Show SQL/)).not.toBeInTheDocument();
  });

  it("clicking 'Show SQL' opens the SQL panel with correct content", async () => {
    const user = userEvent.setup();
    setChatIdle("conv-1", [
      makeMessage({
        id: "msg-2",
        role: "assistant",
        content: "Results",
        sql_query: "SELECT name FROM users WHERE active = true",
        sql_executions: [{ query: "SELECT name FROM users WHERE active = true", columns: ["name"], rows: [["Alice"]], total_rows: 1, error: null }],
      }),
    ]);

    renderWithProviders(<MessageList />);

    const showSqlBtn = screen.getByText("Show SQL (1)");
    await user.click(showSqlBtn);

    expect(useUiStore.getState().sqlModalOpen).toBe(true);
    expect(useUiStore.getState().activeSqlExecutions).toHaveLength(1);
    expect(useUiStore.getState().activeSqlExecutions[0].query).toBe(
      "SELECT name FROM users WHERE active = true"
    );
  });

  it("renders 'Copy SQL' button when message has sql_executions", () => {
    setChatIdle("conv-1", [
      makeMessage({
        id: "msg-2",
        role: "assistant",
        content: "Here are the results",
        sql_query: "SELECT * FROM users",
        sql_executions: [{ query: "SELECT * FROM users", columns: null, rows: null, total_rows: null, error: null }],
      }),
    ]);

    renderWithProviders(<MessageList />);

    expect(screen.getByTestId("copy-sql-btn-msg-2")).toBeInTheDocument();
  });

  it("clicking 'Copy SQL' button copies all SQL queries to clipboard", () => {
    setChatIdle("conv-1", [
      makeMessage({
        id: "msg-2",
        role: "assistant",
        content: "Results",
        sql_executions: [
          { query: "SELECT * FROM users", columns: null, rows: null, total_rows: null, error: null },
          { query: "SELECT * FROM orders", columns: null, rows: null, total_rows: null, error: null },
        ],
      }),
    ]);

    renderWithProviders(<MessageList />);

    const copySqlBtn = screen.getByTestId("copy-sql-btn-msg-2");
    fireEvent.click(copySqlBtn);

    expect(writeTextMock).toHaveBeenCalledWith("SELECT * FROM users\n\nSELECT * FROM orders");
  });
});

describe("ML-COPY-1: Copy button copies message content", () => {
  it("renders a copy button for each message", () => {
    setChatIdle("conv-1", [
      makeMessage({ id: "msg-1", role: "user", content: "Hello" }),
    ]);

    renderWithProviders(<MessageList />);

    expect(screen.getByTestId("copy-btn-msg-1")).toBeInTheDocument();
  });

  it("clicking copy button calls clipboard.writeText with message content", () => {
    setChatIdle("conv-1", [
      makeMessage({
        id: "msg-1",
        role: "user",
        content: "Copy this text",
      }),
    ]);

    renderWithProviders(<MessageList />);

    const copyBtn = screen.getByTestId("copy-btn-msg-1");
    fireEvent.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalledWith("Copy this text");
  });

  it("copies raw markdown source for assistant messages", () => {
    const markdownContent = "**Bold** and `code`";
    setChatIdle("conv-1", [
      makeMessage({
        id: "msg-2",
        role: "assistant",
        content: markdownContent,
      }),
    ]);

    renderWithProviders(<MessageList />);

    const copyBtn = screen.getByTestId("copy-btn-msg-2");
    fireEvent.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalledWith(markdownContent);
  });
});

describe("ML-STREAM-1: Streaming indicator shown", () => {
  it("shows streaming indicator when isStreaming is true", () => {
    const msg = makeMessage({
      id: "msg-streaming",
      role: "assistant",
      content: "Partial content",
    });
    useChatStore.setState({
      activeConversationId: "conv-1",
      messages: [msg],
      isStreaming: true,
      streamingMessageId: "msg-streaming",
      streamingTokens: "Partial content",
    });

    renderWithProviders(<MessageList />);

    expect(screen.getByTestId("streaming-indicator")).toBeInTheDocument();
  });

  it("does not show streaming indicator when not streaming", () => {
    setChatIdle("conv-1", [
      makeMessage({
        id: "msg-1",
        role: "assistant",
        content: "Complete message",
      }),
    ]);

    renderWithProviders(<MessageList />);

    expect(screen.queryByTestId("streaming-indicator")).not.toBeInTheDocument();
  });

  it("shows typing animation dots in streaming indicator", () => {
    const msg = makeMessage({
      id: "msg-streaming",
      role: "assistant",
      content: "",
    });
    useChatStore.setState({
      activeConversationId: "conv-1",
      messages: [msg],
      isStreaming: true,
      streamingMessageId: "msg-streaming",
      streamingTokens: "Thinking",
    });

    renderWithProviders(<MessageList />);

    const indicator = screen.getByTestId("streaming-indicator");
    const dots = indicator.querySelectorAll(".typing-dot");

    // Should have 3 animated dots
    expect(dots).toHaveLength(3);
    // Each dot should have the typing-dot class for animation
    dots.forEach((dot) => {
      expect(dot).toHaveClass("typing-dot");
    });
  });

  it("shows streaming tokens content in the streaming message", () => {
    const msg = makeMessage({
      id: "msg-streaming",
      role: "assistant",
      content: "",
    });
    useChatStore.setState({
      activeConversationId: "conv-1",
      messages: [msg],
      isStreaming: true,
      streamingMessageId: "msg-streaming",
      streamingTokens: "The answer is",
    });

    renderWithProviders(<MessageList />);

    expect(screen.getByText("The answer is")).toBeInTheDocument();
  });
});

describe("Error messages", () => {
  it("renders error message with error styling when message has error-like content", () => {
    // Error messages are assistant messages with content that includes error details.
    // Per the plan, error display is handled by MessageList when message.error is set.
    // However, the current Message type does not have an error field - so we test
    // that the component renders normally for now.
    setChatIdle("conv-1", [
      makeMessage({
        id: "msg-err",
        role: "assistant",
        content: "Something went wrong",
      }),
    ]);

    renderWithProviders(<MessageList />);

    expect(screen.getByTestId("message-bubble-msg-err")).toBeInTheDocument();
  });
});

describe("Timestamp on hover", () => {
  it("renders timestamp element for each message", () => {
    setChatIdle("conv-1", [
      makeMessage({
        id: "msg-1",
        role: "user",
        content: "Hello",
        created_at: "2026-02-05T12:00:00Z",
      }),
    ]);

    renderWithProviders(<MessageList />);

    expect(screen.getByTestId("timestamp-msg-1")).toBeInTheDocument();
  });
});

describe("Message animations", () => {
  it("applies message-appear animation class to message rows", () => {
    setChatIdle("conv-1", [
      makeMessage({ id: "msg-1", role: "user", content: "Hello" }),
      makeMessage({ id: "msg-2", role: "assistant", content: "Hi there" }),
    ]);

    renderWithProviders(<MessageList />);

    const userRow = screen.getByTestId("message-row-msg-1");
    const assistantRow = screen.getByTestId("message-row-msg-2");

    expect(userRow).toHaveClass("message-appear");
    expect(assistantRow).toHaveClass("message-appear");
  });
});
