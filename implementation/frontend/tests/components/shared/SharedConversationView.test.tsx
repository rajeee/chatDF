// Tests for SharedConversationView - the read-only public shared conversation page.
//
// Tests:
// - SCV-1: Renders loading state initially
// - SCV-2: Renders conversation title and messages after fetch
// - SCV-3: Renders error state on 404 and network errors
// - SCV-4: Renders SQL previews when messages have sql_query
// - SCV-5: Shows dataset information
// - SCV-6: Shows "shared at" timestamp and metadata
// - SCV-7: Shows "Try ChatDF" call-to-action
// - SCV-8: Copy functionality in code blocks
// - SCV-9: Empty conversation (no messages)
// - SCV-10: Handles malformed/missing data gracefully
// - SCV-11: Dataset schema expansion
// - SCV-12: Markdown rendering with code blocks
// - SCV-13: SharedHeader component
// - SCV-14: SQL preview aria attributes and toggle collapse

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SharedConversationView } from "@/components/shared/SharedConversationView";

// Mock the API client
vi.mock("@/api/client", () => ({
  apiGetPublic: vi.fn(),
  ApiError: class ApiError extends Error {
    public readonly status: number;
    constructor(status: number, message: string) {
      super(message);
      this.name = "ApiError";
      this.status = status;
    }
  },
}));

import { apiGetPublic } from "@/api/client";
const mockApiGetPublic = vi.mocked(apiGetPublic);

// Helper: render the SharedConversationView at a given share token route
function renderSharedView(token: string = "abc123") {
  return render(
    <MemoryRouter initialEntries={[`/share/${token}`]}>
      <Routes>
        <Route path="/share/:shareToken" element={<SharedConversationView />} />
        <Route path="/" element={<div>Home Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

// Helper: render without a :shareToken route param (to simulate missing token)
function renderSharedViewWithoutToken() {
  return render(
    <MemoryRouter initialEntries={["/share/"]}>
      <Routes>
        {/* Route without :shareToken param */}
        <Route path="/share/" element={<SharedConversationView />} />
        <Route path="/" element={<div>Home Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

// Sample data factories
function createSharedConversation(overrides: Record<string, unknown> = {}) {
  return {
    title: "Test Conversation",
    messages: [
      {
        id: "msg-1",
        role: "user",
        content: "Show me the top 5 products",
        sql_query: null,
        reasoning: null,
        created_at: "2025-01-15T10:30:00Z",
      },
      {
        id: "msg-2",
        role: "assistant",
        content: "Here are the top 5 products by revenue.",
        sql_query: "SELECT name, revenue FROM products ORDER BY revenue DESC LIMIT 5",
        reasoning: null,
        created_at: "2025-01-15T10:30:05Z",
      },
    ],
    datasets: [
      {
        id: "ds-1",
        name: "sales_data.csv",
        url: "https://example.com/sales.csv",
        row_count: 1500,
        column_count: 8,
        status: "ready",
        schema_json: JSON.stringify([
          { name: "id", dtype: "Int64" },
          { name: "name", dtype: "Utf8" },
          { name: "revenue", dtype: "Float64" },
        ]),
      },
    ],
    shared_at: "2025-01-20T14:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  mockApiGetPublic.mockReset();
});

// ---------------------------------------------------------------------------
// SCV-1: Loading state
// ---------------------------------------------------------------------------

describe("SCV-1: Renders loading state initially", () => {
  it("shows loading text before data resolves", () => {
    // Never resolve the promise to keep it in loading state
    mockApiGetPublic.mockReturnValue(new Promise(() => {}));

    renderSharedView();

    expect(screen.getByText(/loading shared conversation/i)).toBeInTheDocument();
  });

  it("renders shared header in loading state", () => {
    mockApiGetPublic.mockReturnValue(new Promise(() => {}));

    renderSharedView();

    expect(screen.getByTestId("shared-header")).toBeInTheDocument();
  });

  it("does not show error message while loading", () => {
    mockApiGetPublic.mockReturnValue(new Promise(() => {}));

    renderSharedView();

    expect(screen.queryByTestId("error-message")).not.toBeInTheDocument();
  });

  it("does not show conversation content while loading", () => {
    mockApiGetPublic.mockReturnValue(new Promise(() => {}));

    renderSharedView();

    expect(screen.queryByTestId("conversation-title")).not.toBeInTheDocument();
    expect(screen.queryByTestId("try-chatdf-link")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// SCV-2: Conversation title and messages
// ---------------------------------------------------------------------------

describe("SCV-2: Renders conversation title and messages after fetch", () => {
  it("displays conversation title and message contents", async () => {
    const data = createSharedConversation();
    mockApiGetPublic.mockResolvedValue(data);

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("conversation-title")).toHaveTextContent("Test Conversation");
    });

    // User message
    expect(screen.getByText("Show me the top 5 products")).toBeInTheDocument();

    // Assistant message (rendered via ReactMarkdown, may be in a <p>)
    expect(screen.getByText(/top 5 products by revenue/i)).toBeInTheDocument();
  });

  it("calls apiGetPublic with the correct path", async () => {
    mockApiGetPublic.mockResolvedValue(createSharedConversation());

    renderSharedView("my-token-123");

    await waitFor(() => {
      expect(mockApiGetPublic).toHaveBeenCalledWith("/shared/my-token-123");
    });
  });

  it("shows the 'Shared conversation' badge", async () => {
    mockApiGetPublic.mockResolvedValue(createSharedConversation());

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByText("Shared conversation")).toBeInTheDocument();
    });
  });

  it("displays both user and assistant messages", async () => {
    mockApiGetPublic.mockResolvedValue(createSharedConversation());

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("message-msg-1")).toBeInTheDocument();
    });
    expect(screen.getByTestId("message-msg-2")).toBeInTheDocument();
  });

  it("shows 'Untitled Conversation' when title is empty", async () => {
    const data = createSharedConversation({ title: "" });
    mockApiGetPublic.mockResolvedValue(data);

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("conversation-title")).toHaveTextContent("Untitled Conversation");
    });
  });

  it("removes loading state once data is fetched", async () => {
    mockApiGetPublic.mockResolvedValue(createSharedConversation());

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("conversation-title")).toBeInTheDocument();
    });

    expect(screen.queryByText(/loading shared conversation/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// SCV-3: Error state
// ---------------------------------------------------------------------------

describe("SCV-3: Renders error state on 404 and network errors", () => {
  it("shows error message when API returns 404", async () => {
    mockApiGetPublic.mockRejectedValue(new Error("HTTP 404"));

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("error-message")).toHaveTextContent(
        /not found or has been unshared/i
      );
    });
  });

  it("shows generic error message for non-404 errors", async () => {
    mockApiGetPublic.mockRejectedValue(new Error("Network error"));

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("error-message")).toHaveTextContent(
        /failed to load shared conversation/i
      );
    });
  });

  it("shows 'Go to ChatDF' link in error state", async () => {
    mockApiGetPublic.mockRejectedValue(new Error("HTTP 404"));

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByText("Go to ChatDF")).toBeInTheDocument();
    });
  });

  it("shows error for 500 server errors with generic message", async () => {
    mockApiGetPublic.mockRejectedValue(new Error("HTTP 500 Internal Server Error"));

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("error-message")).toHaveTextContent(
        /failed to load shared conversation/i
      );
    });
  });

  it("renders shared header even in error state", async () => {
    mockApiGetPublic.mockRejectedValue(new Error("HTTP 404"));

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("error-message")).toBeInTheDocument();
    });

    expect(screen.getByTestId("shared-header")).toBeInTheDocument();
  });

  it("does not show conversation content in error state", async () => {
    mockApiGetPublic.mockRejectedValue(new Error("HTTP 404"));

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("error-message")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("conversation-title")).not.toBeInTheDocument();
    expect(screen.queryByTestId("try-chatdf-link")).not.toBeInTheDocument();
    expect(screen.queryByTestId("datasets-section")).not.toBeInTheDocument();
  });

  it("treats non-Error thrown values as generic failure", async () => {
    // Some network libraries throw strings or numbers
    mockApiGetPublic.mockRejectedValue("connection refused");

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("error-message")).toHaveTextContent(
        /failed to load shared conversation/i
      );
    });
  });
});

// ---------------------------------------------------------------------------
// SCV-4: SQL preview
// ---------------------------------------------------------------------------

describe("SCV-4: Renders SQL previews when messages have sql_query", () => {
  it("renders a collapsible SQL preview for assistant messages with sql_query", async () => {
    mockApiGetPublic.mockResolvedValue(createSharedConversation());

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("sql-preview-msg-2")).toBeInTheDocument();
    });

    // SQL toggle button should show "SQL" label
    const toggleBtn = screen.getByTestId("sql-preview-toggle-msg-2");
    expect(toggleBtn).toHaveTextContent("SQL");
  });

  it("expands SQL preview when toggle is clicked", async () => {
    const user = userEvent.setup();
    mockApiGetPublic.mockResolvedValue(createSharedConversation());

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("sql-preview-toggle-msg-2")).toBeInTheDocument();
    });

    const toggleBtn = screen.getByTestId("sql-preview-toggle-msg-2");
    const content = screen.getByTestId("sql-preview-content-msg-2");

    // Initially collapsed (max-height 0)
    expect(content).toHaveStyle({ maxHeight: "0px" });

    // Click to expand
    await user.click(toggleBtn);

    expect(content).toHaveStyle({ maxHeight: "200px" });
  });

  it("does not render SQL preview for user messages", async () => {
    mockApiGetPublic.mockResolvedValue(createSharedConversation());

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("message-msg-1")).toBeInTheDocument();
    });

    // msg-1 is a user message -- should NOT have SQL preview
    expect(screen.queryByTestId("sql-preview-msg-1")).not.toBeInTheDocument();
  });

  it("does not render SQL preview for assistant messages without sql_query", async () => {
    const data = createSharedConversation({
      messages: [
        {
          id: "msg-3",
          role: "assistant",
          content: "Hello! How can I help?",
          sql_query: null,
          reasoning: null,
          created_at: "2025-01-15T10:30:00Z",
        },
      ],
    });
    mockApiGetPublic.mockResolvedValue(data);

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("message-msg-3")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("sql-preview-msg-3")).not.toBeInTheDocument();
  });

  it("shows the SQL query text when expanded", async () => {
    const user = userEvent.setup();
    mockApiGetPublic.mockResolvedValue(createSharedConversation());

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("sql-preview-toggle-msg-2")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("sql-preview-toggle-msg-2"));

    expect(
      screen.getByText("SELECT name, revenue FROM products ORDER BY revenue DESC LIMIT 5")
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// SCV-5: Dataset information
// ---------------------------------------------------------------------------

describe("SCV-5: Shows dataset information", () => {
  it("displays dataset name, row count, and column count", async () => {
    mockApiGetPublic.mockResolvedValue(createSharedConversation());

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("datasets-section")).toBeInTheDocument();
    });

    expect(screen.getByTestId("dataset-ds-1")).toBeInTheDocument();
    expect(screen.getByText("sales_data.csv")).toBeInTheDocument();
    expect(screen.getByText(/1,500 rows/)).toBeInTheDocument();
    expect(screen.getByText(/8 cols/)).toBeInTheDocument();
  });

  it("does not render dataset section when no datasets", async () => {
    const data = createSharedConversation({ datasets: [] });
    mockApiGetPublic.mockResolvedValue(data);

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("conversation-title")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("datasets-section")).not.toBeInTheDocument();
  });

  it("displays multiple datasets", async () => {
    const data = createSharedConversation({
      datasets: [
        {
          id: "ds-1",
          name: "orders.csv",
          url: "https://example.com/orders.csv",
          row_count: 500,
          column_count: 6,
          status: "ready",
          schema_json: "[]",
        },
        {
          id: "ds-2",
          name: "customers.csv",
          url: "https://example.com/customers.csv",
          row_count: 200,
          column_count: 4,
          status: "ready",
          schema_json: "[]",
        },
      ],
    });
    mockApiGetPublic.mockResolvedValue(data);

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("dataset-ds-1")).toBeInTheDocument();
    });
    expect(screen.getByTestId("dataset-ds-2")).toBeInTheDocument();
    expect(screen.getByText("orders.csv")).toBeInTheDocument();
    expect(screen.getByText("customers.csv")).toBeInTheDocument();
  });

  it("shows dataset count in metadata when datasets exist", async () => {
    mockApiGetPublic.mockResolvedValue(createSharedConversation());

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByText("1 dataset")).toBeInTheDocument();
    });
  });

  it("pluralizes dataset count correctly for multiple datasets", async () => {
    const data = createSharedConversation({
      datasets: [
        {
          id: "ds-1",
          name: "a.csv",
          url: "x",
          row_count: 10,
          column_count: 2,
          status: "ready",
          schema_json: "[]",
        },
        {
          id: "ds-2",
          name: "b.csv",
          url: "x",
          row_count: 20,
          column_count: 3,
          status: "ready",
          schema_json: "[]",
        },
      ],
    });
    mockApiGetPublic.mockResolvedValue(data);

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByText("2 datasets")).toBeInTheDocument();
    });
  });

  it("does not show dataset count in metadata when no datasets", async () => {
    const data = createSharedConversation({ datasets: [] });
    mockApiGetPublic.mockResolvedValue(data);

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("conversation-title")).toBeInTheDocument();
    });

    expect(screen.queryByText(/dataset/)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// SCV-6: Shared at timestamp and metadata
// ---------------------------------------------------------------------------

describe("SCV-6: Shows 'shared at' timestamp and metadata", () => {
  it("displays the shared date", async () => {
    mockApiGetPublic.mockResolvedValue(createSharedConversation());

    renderSharedView();

    await waitFor(() => {
      const sharedAt = screen.getByTestId("shared-at");
      // The exact format depends on the locale, but should contain "January" and "2025"
      expect(sharedAt.textContent).toContain("Shared");
      expect(sharedAt.textContent).toContain("2025");
    });
  });

  it("shows message count in metadata", async () => {
    mockApiGetPublic.mockResolvedValue(createSharedConversation());

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByText("2 messages")).toBeInTheDocument();
    });
  });

  it("shows singular 'message' for single message", async () => {
    const data = createSharedConversation({
      messages: [
        {
          id: "msg-1",
          role: "user",
          content: "Hello",
          sql_query: null,
          reasoning: null,
          created_at: "2025-01-15T10:30:00Z",
        },
      ],
    });
    mockApiGetPublic.mockResolvedValue(data);

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByText("1 message")).toBeInTheDocument();
    });
  });

  it("displays message timestamps for each message", async () => {
    mockApiGetPublic.mockResolvedValue(createSharedConversation());

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("message-msg-1")).toBeInTheDocument();
    });

    // Both messages should have time elements (formatTime output)
    const msg1 = screen.getByTestId("message-msg-1");
    const msg2 = screen.getByTestId("message-msg-2");

    // Each message container should have a time span with some text
    const msg1TimeSpans = msg1.parentElement!.querySelectorAll("span.text-xs");
    const msg2TimeSpans = msg2.parentElement!.querySelectorAll("span.text-xs");
    expect(msg1TimeSpans.length).toBeGreaterThan(0);
    expect(msg2TimeSpans.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// SCV-7: Try ChatDF call-to-action
// ---------------------------------------------------------------------------

describe("SCV-7: Shows 'Try ChatDF' call-to-action", () => {
  it("renders the Try ChatDF link", async () => {
    mockApiGetPublic.mockResolvedValue(createSharedConversation());

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("try-chatdf-link")).toBeInTheDocument();
    });

    expect(screen.getByTestId("try-chatdf-link")).toHaveTextContent("Try ChatDF");
  });

  it("renders the read-only footer note", async () => {
    mockApiGetPublic.mockResolvedValue(createSharedConversation());

    renderSharedView();

    await waitFor(() => {
      expect(
        screen.getByText(/read-only view of a shared conversation/i)
      ).toBeInTheDocument();
    });
  });

  it("renders the 'Explore your own data' prompt above Try ChatDF", async () => {
    mockApiGetPublic.mockResolvedValue(createSharedConversation());

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByText("Explore your own data with ChatDF")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// SCV-8: Copy functionality in code blocks
// ---------------------------------------------------------------------------

describe("SCV-8: Copy functionality in code blocks", () => {
  const originalClipboard = navigator.clipboard;

  function mockClipboard(writeTextFn: ReturnType<typeof vi.fn>) {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextFn },
      writable: true,
      configurable: true,
    });
  }

  afterEach(() => {
    // Restore the original clipboard
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      writable: true,
      configurable: true,
    });
  });

  it("renders Copy button in assistant markdown code blocks", async () => {
    const data = createSharedConversation({
      messages: [
        {
          id: "msg-code",
          role: "assistant",
          content: "Here is some code:\n```python\nprint('hello')\n```",
          sql_query: null,
          reasoning: null,
          created_at: "2025-01-15T10:30:00Z",
        },
      ],
    });
    mockApiGetPublic.mockResolvedValue(data);

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("message-msg-code")).toBeInTheDocument();
    });

    // The SharedCodeBlock renders a "Copy code" button for block code
    const copyBtn = screen.getByLabelText("Copy code");
    expect(copyBtn).toBeInTheDocument();
    expect(copyBtn).toHaveTextContent("Copy");
  });

  it("copies code to clipboard when Copy button is clicked", async () => {
    const user = userEvent.setup();
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    mockClipboard(writeTextMock);

    const data = createSharedConversation({
      messages: [
        {
          id: "msg-code",
          role: "assistant",
          content: "Code:\n```sql\nSELECT * FROM users\n```",
          sql_query: null,
          reasoning: null,
          created_at: "2025-01-15T10:30:00Z",
        },
      ],
    });
    mockApiGetPublic.mockResolvedValue(data);

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByLabelText("Copy code")).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText("Copy code"));

    expect(writeTextMock).toHaveBeenCalledWith("SELECT * FROM users");
  });

  it("shows 'Copied' text after successful copy", async () => {
    const user = userEvent.setup();
    mockClipboard(vi.fn().mockResolvedValue(undefined));

    const data = createSharedConversation({
      messages: [
        {
          id: "msg-code",
          role: "assistant",
          content: "Code:\n```\nsome code\n```",
          sql_query: null,
          reasoning: null,
          created_at: "2025-01-15T10:30:00Z",
        },
      ],
    });
    mockApiGetPublic.mockResolvedValue(data);

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByLabelText("Copy code")).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText("Copy code"));

    await waitFor(() => {
      expect(screen.getByText("Copied")).toBeInTheDocument();
    });
  });

  it("reverts from 'Copied' back to 'Copy' after timeout", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockClipboard(vi.fn().mockResolvedValue(undefined));

    const data = createSharedConversation({
      messages: [
        {
          id: "msg-code",
          role: "assistant",
          content: "Code:\n```\nsome code\n```",
          sql_query: null,
          reasoning: null,
          created_at: "2025-01-15T10:30:00Z",
        },
      ],
    });
    mockApiGetPublic.mockResolvedValue(data);

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByLabelText("Copy code")).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText("Copy code"));

    await waitFor(() => {
      expect(screen.getByText("Copied")).toBeInTheDocument();
    });

    // Advance time past the 1500ms timeout
    await vi.advanceTimersByTimeAsync(2000);

    await waitFor(() => {
      expect(screen.getByText("Copy")).toBeInTheDocument();
    });

    vi.useRealTimers();
  });

  it("handles clipboard write failure gracefully (no crash)", async () => {
    // Use a clipboard mock that rejects
    const writeTextMock = vi.fn().mockRejectedValue(new Error("Not allowed"));
    mockClipboard(writeTextMock);

    const data = createSharedConversation({
      messages: [
        {
          id: "msg-code",
          role: "assistant",
          content: "Code:\n```\nsome code\n```",
          sql_query: null,
          reasoning: null,
          created_at: "2025-01-15T10:30:00Z",
        },
      ],
    });
    mockApiGetPublic.mockResolvedValue(data);

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByLabelText("Copy code")).toBeInTheDocument();
    });

    // userEvent.setup() bypasses the native clipboard mock so we click directly
    const copyBtn = screen.getByLabelText("Copy code");
    copyBtn.click();

    // Wait a tick for the async rejection to settle
    await new Promise((r) => setTimeout(r, 50));

    // Button should still be present (component didn't crash)
    expect(screen.getByLabelText("Copy code")).toBeInTheDocument();

    // The "copied" state should NOT have been set because writeText rejected
    // The component catches the error silently, so it should still say "Copy"
    expect(copyBtn).toHaveTextContent("Copy");
  });
});

// ---------------------------------------------------------------------------
// SCV-9: Empty conversation (no messages)
// ---------------------------------------------------------------------------

describe("SCV-9: Empty conversation (no messages)", () => {
  it("renders title and metadata even with no messages", async () => {
    const data = createSharedConversation({ messages: [] });
    mockApiGetPublic.mockResolvedValue(data);

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("conversation-title")).toHaveTextContent("Test Conversation");
    });

    // Should not crash, still show the footer
    expect(screen.getByTestId("try-chatdf-link")).toBeInTheDocument();
  });

  it("shows '0 messages' count for empty conversation", async () => {
    const data = createSharedConversation({ messages: [] });
    mockApiGetPublic.mockResolvedValue(data);

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByText("0 messages")).toBeInTheDocument();
    });
  });

  it("does not render any message elements for empty conversation", async () => {
    const data = createSharedConversation({ messages: [] });
    mockApiGetPublic.mockResolvedValue(data);

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("conversation-title")).toBeInTheDocument();
    });

    // No message-* test IDs should exist
    const messageElements = document.querySelectorAll('[data-testid^="message-"]');
    expect(messageElements.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// SCV-10: Malformed/missing data
// ---------------------------------------------------------------------------

describe("SCV-10: Handles malformed/missing data gracefully", () => {
  it("handles missing shareToken param by showing error", async () => {
    renderSharedViewWithoutToken();

    await waitFor(() => {
      expect(screen.getByTestId("error-message")).toHaveTextContent(/invalid share link/i);
    });
  });

  it("does not call API when shareToken is missing", async () => {
    renderSharedViewWithoutToken();

    await waitFor(() => {
      expect(screen.getByTestId("error-message")).toBeInTheDocument();
    });

    expect(mockApiGetPublic).not.toHaveBeenCalled();
  });

  it("handles dataset with invalid schema_json without crashing", async () => {
    const data = createSharedConversation({
      datasets: [
        {
          id: "ds-bad",
          name: "bad_schema.csv",
          url: "https://example.com/bad.csv",
          row_count: 100,
          column_count: 3,
          status: "ready",
          schema_json: "not valid json {{{",
        },
      ],
    });
    mockApiGetPublic.mockResolvedValue(data);

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("dataset-ds-bad")).toBeInTheDocument();
    });

    // Should show dataset name but not crash
    expect(screen.getByText("bad_schema.csv")).toBeInTheDocument();
  });

  it("handles dataset with empty schema_json array", async () => {
    const data = createSharedConversation({
      datasets: [
        {
          id: "ds-empty-schema",
          name: "empty_schema.csv",
          url: "https://example.com/empty.csv",
          row_count: 50,
          column_count: 0,
          status: "ready",
          schema_json: "[]",
        },
      ],
    });
    mockApiGetPublic.mockResolvedValue(data);

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("dataset-ds-empty-schema")).toBeInTheDocument();
    });

    // No "columns" button should be rendered (DatasetSchemaInfo returns null for empty columns)
    expect(screen.queryByText(/columns/)).not.toBeInTheDocument();
  });

  it("handles messages with all null optional fields", async () => {
    const data = createSharedConversation({
      messages: [
        {
          id: "msg-null",
          role: "assistant",
          content: "Simple response",
          sql_query: null,
          reasoning: null,
          created_at: "2025-01-15T10:30:00Z",
        },
      ],
    });
    mockApiGetPublic.mockResolvedValue(data);

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("message-msg-null")).toBeInTheDocument();
    });

    expect(screen.getByText("Simple response")).toBeInTheDocument();
    expect(screen.queryByTestId("sql-preview-msg-null")).not.toBeInTheDocument();
  });

  it("handles conversation with empty title gracefully", async () => {
    const data = createSharedConversation({ title: "" });
    mockApiGetPublic.mockResolvedValue(data);

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("conversation-title")).toHaveTextContent("Untitled Conversation");
    });
  });
});

// ---------------------------------------------------------------------------
// SCV-11: Dataset schema expansion
// ---------------------------------------------------------------------------

describe("SCV-11: Dataset schema expansion", () => {
  it("shows columns count button when schema has columns", async () => {
    mockApiGetPublic.mockResolvedValue(createSharedConversation());

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("datasets-section")).toBeInTheDocument();
    });

    // The DatasetSchemaInfo shows "3 columns" (our sample data has 3 columns)
    expect(screen.getByText("3 columns")).toBeInTheDocument();
  });

  it("expands schema to show column names and types when clicked", async () => {
    const user = userEvent.setup();
    mockApiGetPublic.mockResolvedValue(createSharedConversation());

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByText("3 columns")).toBeInTheDocument();
    });

    await user.click(screen.getByText("3 columns"));

    // Should now see column names and types
    expect(screen.getByText("id")).toBeInTheDocument();
    expect(screen.getByText(/Int64/)).toBeInTheDocument();
    expect(screen.getByText("name")).toBeInTheDocument();
    expect(screen.getByText(/Utf8/)).toBeInTheDocument();
    expect(screen.getByText("revenue")).toBeInTheDocument();
    expect(screen.getByText(/Float64/)).toBeInTheDocument();
  });

  it("collapses schema when clicked again", async () => {
    const user = userEvent.setup();
    mockApiGetPublic.mockResolvedValue(createSharedConversation());

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByText("3 columns")).toBeInTheDocument();
    });

    // Expand
    await user.click(screen.getByText("3 columns"));
    expect(screen.getByText("id")).toBeInTheDocument();

    // Collapse
    await user.click(screen.getByText("3 columns"));

    // Column details should be gone (they are conditionally rendered, not just hidden)
    expect(screen.queryByText(/Int64/)).not.toBeInTheDocument();
  });

  it("does not show schema expand button for dataset with invalid schema", async () => {
    const data = createSharedConversation({
      datasets: [
        {
          id: "ds-invalid",
          name: "invalid.csv",
          url: "https://example.com/invalid.csv",
          row_count: 10,
          column_count: 2,
          status: "ready",
          schema_json: "not-json",
        },
      ],
    });
    mockApiGetPublic.mockResolvedValue(data);

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("dataset-ds-invalid")).toBeInTheDocument();
    });

    // DatasetSchemaInfo returns null when parsing fails (empty columns array)
    expect(screen.queryByText(/columns/)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// SCV-12: Markdown rendering with code blocks
// ---------------------------------------------------------------------------

describe("SCV-12: Markdown rendering with code blocks", () => {
  it("renders inline code within markdown text", async () => {
    const data = createSharedConversation({
      messages: [
        {
          id: "msg-inline",
          role: "assistant",
          content: "Use the `SELECT` statement to query data.",
          sql_query: null,
          reasoning: null,
          created_at: "2025-01-15T10:30:00Z",
        },
      ],
    });
    mockApiGetPublic.mockResolvedValue(data);

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("message-msg-inline")).toBeInTheDocument();
    });

    // Inline code should be rendered as a <code> element
    const codeEl = screen.getByTestId("message-msg-inline").querySelector("code");
    expect(codeEl).toBeInTheDocument();
    expect(codeEl?.textContent).toContain("SELECT");
  });

  it("renders fenced code block with language label", async () => {
    const data = createSharedConversation({
      messages: [
        {
          id: "msg-lang",
          role: "assistant",
          content: "Example:\n```python\nprint('hello')\n```",
          sql_query: null,
          reasoning: null,
          created_at: "2025-01-15T10:30:00Z",
        },
      ],
    });
    mockApiGetPublic.mockResolvedValue(data);

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("message-msg-lang")).toBeInTheDocument();
    });

    // Language label should be displayed in the code block header
    expect(screen.getByText("python")).toBeInTheDocument();
  });

  it("renders 'code' as default language label when no language is specified", async () => {
    const data = createSharedConversation({
      messages: [
        {
          id: "msg-nolang",
          role: "assistant",
          content: "Example:\n```\nsome code here\n```",
          sql_query: null,
          reasoning: null,
          created_at: "2025-01-15T10:30:00Z",
        },
      ],
    });
    mockApiGetPublic.mockResolvedValue(data);

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("message-msg-nolang")).toBeInTheDocument();
    });

    // Default "code" label when no language
    expect(screen.getByText("code")).toBeInTheDocument();
  });

  it("renders user messages as plain text (not markdown)", async () => {
    const data = createSharedConversation({
      messages: [
        {
          id: "msg-user-md",
          role: "user",
          content: "Show me **bold** and `code`",
          sql_query: null,
          reasoning: null,
          created_at: "2025-01-15T10:30:00Z",
        },
      ],
    });
    mockApiGetPublic.mockResolvedValue(data);

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("message-msg-user-md")).toBeInTheDocument();
    });

    // User messages should render as a plain <span>, not parsed as markdown
    // The raw markdown syntax should be visible
    expect(screen.getByText("Show me **bold** and `code`")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// SCV-13: SharedHeader component
// ---------------------------------------------------------------------------

describe("SCV-13: SharedHeader component", () => {
  it("renders the ChatDF brand name in the header", async () => {
    mockApiGetPublic.mockResolvedValue(createSharedConversation());

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("shared-header")).toBeInTheDocument();
    });

    const header = screen.getByTestId("shared-header");
    expect(within(header).getByText("ChatDF")).toBeInTheDocument();
  });

  it("renders a 'Shared' badge in the header", async () => {
    mockApiGetPublic.mockResolvedValue(createSharedConversation());

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("shared-header")).toBeInTheDocument();
    });

    const header = screen.getByTestId("shared-header");
    expect(within(header).getByText("Shared")).toBeInTheDocument();
  });

  it("header ChatDF link points to home page", async () => {
    mockApiGetPublic.mockResolvedValue(createSharedConversation());

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("shared-header")).toBeInTheDocument();
    });

    const header = screen.getByTestId("shared-header");
    const link = within(header).getByText("ChatDF").closest("a");
    expect(link).toHaveAttribute("href", "/");
  });
});

// ---------------------------------------------------------------------------
// SCV-14: SQL preview aria attributes and toggle collapse
// ---------------------------------------------------------------------------

describe("SCV-14: SQL preview aria attributes and toggle collapse", () => {
  it("toggle button has aria-expanded=false when collapsed", async () => {
    mockApiGetPublic.mockResolvedValue(createSharedConversation());

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("sql-preview-toggle-msg-2")).toBeInTheDocument();
    });

    const toggleBtn = screen.getByTestId("sql-preview-toggle-msg-2");
    expect(toggleBtn).toHaveAttribute("aria-expanded", "false");
  });

  it("toggle button has aria-expanded=true when expanded", async () => {
    const user = userEvent.setup();
    mockApiGetPublic.mockResolvedValue(createSharedConversation());

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("sql-preview-toggle-msg-2")).toBeInTheDocument();
    });

    const toggleBtn = screen.getByTestId("sql-preview-toggle-msg-2");
    await user.click(toggleBtn);

    expect(toggleBtn).toHaveAttribute("aria-expanded", "true");
  });

  it("collapses SQL preview on second click", async () => {
    const user = userEvent.setup();
    mockApiGetPublic.mockResolvedValue(createSharedConversation());

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("sql-preview-toggle-msg-2")).toBeInTheDocument();
    });

    const toggleBtn = screen.getByTestId("sql-preview-toggle-msg-2");
    const content = screen.getByTestId("sql-preview-content-msg-2");

    // Expand
    await user.click(toggleBtn);
    expect(content).toHaveStyle({ maxHeight: "200px", opacity: "1" });
    expect(toggleBtn).toHaveAttribute("aria-expanded", "true");

    // Collapse
    await user.click(toggleBtn);
    expect(content).toHaveStyle({ maxHeight: "0px", opacity: "0" });
    expect(toggleBtn).toHaveAttribute("aria-expanded", "false");
  });

  it("SQL preview chevron rotates when expanded", async () => {
    const user = userEvent.setup();
    mockApiGetPublic.mockResolvedValue(createSharedConversation());

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("sql-preview-toggle-msg-2")).toBeInTheDocument();
    });

    const toggleBtn = screen.getByTestId("sql-preview-toggle-msg-2");
    const chevron = toggleBtn.querySelector("svg");

    expect(chevron?.classList.contains("rotate-90")).toBe(false);

    await user.click(toggleBtn);

    expect(chevron?.classList.contains("rotate-90")).toBe(true);
  });

  it("SQL preview content has transition styles", async () => {
    mockApiGetPublic.mockResolvedValue(createSharedConversation());

    renderSharedView();

    await waitFor(() => {
      expect(screen.getByTestId("sql-preview-content-msg-2")).toBeInTheDocument();
    });

    const content = screen.getByTestId("sql-preview-content-msg-2");
    expect(content).toHaveStyle({
      transition: "max-height 200ms ease, opacity 200ms ease",
    });
  });
});

// ---------------------------------------------------------------------------
// SCV-15: Cleanup / cancellation
// ---------------------------------------------------------------------------

describe("SCV-15: Cleanup cancellation", () => {
  it("does not update state after unmount (stale fetch)", async () => {
    // Use a deferred promise we can resolve after unmount
    let resolvePromise: (v: unknown) => void;
    mockApiGetPublic.mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      })
    );

    const { unmount } = renderSharedView();

    // Unmount before promise resolves
    unmount();

    // Resolve after unmount -- should not cause errors/warnings
    resolvePromise!(createSharedConversation());

    // No assertion needed beyond "this does not throw"
  });

  it("does not update state when fetch rejects after unmount", async () => {
    let rejectPromise: (e: Error) => void;
    mockApiGetPublic.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectPromise = reject;
      })
    );

    const { unmount } = renderSharedView();

    unmount();

    // Reject after unmount -- should not cause errors
    rejectPromise!(new Error("HTTP 404"));
  });
});
