import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MessageBubble } from "../MessageBubble";
import { useBookmarkStore } from "@/stores/bookmarkStore";
import { useChatStore } from "@/stores/chatStore";

const noop = () => {};

const userMessage = {
  id: "msg-user-1",
  conversation_id: "conv-1",
  role: "user" as const,
  content: "Show me all users",
  sql_query: null,
  sql_executions: [],
  reasoning: null,
  created_at: new Date().toISOString(),
  sendFailed: false,
};

const assistantMessageNoSql = {
  id: "msg-assist-nosql",
  conversation_id: "conv-1",
  role: "assistant" as const,
  content: "Sure, I can help you with that.",
  sql_query: null,
  sql_executions: [],
  reasoning: null,
  created_at: new Date().toISOString(),
};

const assistantMessageWithSql = {
  id: "msg-assist-sql",
  conversation_id: "conv-1",
  role: "assistant" as const,
  content: "Here are the results from the users table showing all active accounts.",
  sql_query: "SELECT * FROM users WHERE active = true",
  sql_executions: [
    {
      query: "SELECT * FROM users WHERE active = true",
      columns: ["id", "name", "email"],
      rows: [
        [1, "Alice", "alice@example.com"],
        [2, "Bob", "bob@example.com"],
      ],
      total_rows: 2,
      error: null,
      execution_time_ms: 12,
    },
  ],
  reasoning: null,
  created_at: new Date().toISOString(),
};

function renderBubble(message: typeof userMessage | typeof assistantMessageNoSql | typeof assistantMessageWithSql) {
  return render(
    <MessageBubble
      message={message}
      isCurrentlyStreaming={false}
      onShowSQL={noop}
      onShowReasoning={noop}
      onCopy={noop}
      onVisualize={noop}
    />
  );
}

describe("MessageBubble bookmark button", () => {
  beforeEach(() => {
    // Reset bookmark store before each test
    useBookmarkStore.setState({ bookmarks: [] });
    // Set active conversation ID so bookmarks have a conversationId
    useChatStore.setState({ activeConversationId: "conv-1" });
  });

  it("shows bookmark button on assistant messages with SQL executions", () => {
    renderBubble(assistantMessageWithSql);
    expect(
      screen.getByTestId(`bookmark-btn-${assistantMessageWithSql.id}`)
    ).toBeInTheDocument();
  });

  it("does NOT show bookmark button on user messages", () => {
    renderBubble(userMessage);
    expect(
      screen.queryByTestId(`bookmark-btn-${userMessage.id}`)
    ).not.toBeInTheDocument();
  });

  it("does NOT show bookmark button on assistant messages without SQL", () => {
    renderBubble(assistantMessageNoSql);
    expect(
      screen.queryByTestId(`bookmark-btn-${assistantMessageNoSql.id}`)
    ).not.toBeInTheDocument();
  });

  it("does NOT show bookmark button while streaming", () => {
    render(
      <MessageBubble
        message={assistantMessageWithSql}
        isCurrentlyStreaming={true}
        onShowSQL={noop}
        onShowReasoning={noop}
        onCopy={noop}
        onVisualize={noop}
      />
    );
    expect(
      screen.queryByTestId(`bookmark-btn-${assistantMessageWithSql.id}`)
    ).not.toBeInTheDocument();
  });

  it("clicking bookmark button adds to bookmark store", () => {
    renderBubble(assistantMessageWithSql);

    // Verify not bookmarked initially
    expect(useBookmarkStore.getState().isBookmarked(assistantMessageWithSql.id)).toBe(false);

    // Click the bookmark button
    fireEvent.click(screen.getByTestId(`bookmark-btn-${assistantMessageWithSql.id}`));

    // Verify bookmark was added
    expect(useBookmarkStore.getState().isBookmarked(assistantMessageWithSql.id)).toBe(true);

    const bookmark = useBookmarkStore.getState().getBookmarkByMessageId(assistantMessageWithSql.id);
    expect(bookmark).toBeDefined();
    expect(bookmark!.sql).toBe("SELECT * FROM users WHERE active = true");
    expect(bookmark!.conversationId).toBe("conv-1");
    expect(bookmark!.tags).toEqual([]);
  });

  it("clicking bookmark button again removes from bookmark store", () => {
    renderBubble(assistantMessageWithSql);

    // Click to add bookmark
    fireEvent.click(screen.getByTestId(`bookmark-btn-${assistantMessageWithSql.id}`));
    expect(useBookmarkStore.getState().isBookmarked(assistantMessageWithSql.id)).toBe(true);

    // Click again to remove bookmark
    fireEvent.click(screen.getByTestId(`bookmark-btn-${assistantMessageWithSql.id}`));
    expect(useBookmarkStore.getState().isBookmarked(assistantMessageWithSql.id)).toBe(false);
  });

  it("bookmarked state shows filled icon (svg with fill=currentColor)", () => {
    // Pre-seed the bookmark store so the message is already bookmarked
    useBookmarkStore.getState().addBookmark({
      messageId: assistantMessageWithSql.id,
      conversationId: "conv-1",
      sql: "SELECT * FROM users WHERE active = true",
      title: "Test",
      tags: [],
    });

    renderBubble(assistantMessageWithSql);

    const btn = screen.getByTestId(`bookmark-btn-${assistantMessageWithSql.id}`);
    // When bookmarked, the SVG should have fill="currentColor" (filled icon)
    const svg = btn.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("fill")).toBe("currentColor");
  });

  it("unbookmarked state shows outline icon (svg with fill=none)", () => {
    renderBubble(assistantMessageWithSql);

    const btn = screen.getByTestId(`bookmark-btn-${assistantMessageWithSql.id}`);
    // When not bookmarked, the SVG should have fill="none" (outline icon)
    const svg = btn.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("fill")).toBe("none");
  });

  it("generates title from first 50 chars of message content", () => {
    renderBubble(assistantMessageWithSql);

    fireEvent.click(screen.getByTestId(`bookmark-btn-${assistantMessageWithSql.id}`));

    const bookmark = useBookmarkStore.getState().getBookmarkByMessageId(assistantMessageWithSql.id);
    expect(bookmark).toBeDefined();
    // The message content is "Here are the results from the users table showing all active accounts."
    // First 50 chars: "Here are the results from the users table showing"
    expect(bookmark!.title).toBe(assistantMessageWithSql.content.slice(0, 50).trim());
  });
});
