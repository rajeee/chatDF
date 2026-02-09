// Tests for SharedConversationView - the read-only public shared conversation page.
//
// Tests:
// - SCV-1: Renders loading state initially
// - SCV-2: Renders conversation title and messages after fetch
// - SCV-3: Renders error state on 404
// - SCV-4: Renders SQL previews when messages have sql_query
// - SCV-5: Shows dataset information
// - SCV-6: Shows "shared at" timestamp
// - SCV-7: Shows "Try ChatDF" call-to-action

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SharedConversationView } from "@/components/shared/SharedConversationView";
import { ApiError } from "@/api/client";

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

describe("SCV-1: Renders loading state initially", () => {
  it("shows loading text before data resolves", () => {
    // Never resolve the promise to keep it in loading state
    mockApiGetPublic.mockReturnValue(new Promise(() => {}));

    renderSharedView();

    expect(screen.getByText(/loading shared conversation/i)).toBeInTheDocument();
  });
});

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
});

describe("SCV-3: Renders error state on 404", () => {
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
});

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

    // msg-1 is a user message — should NOT have SQL preview
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
});

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
});

describe("SCV-6: Shows 'shared at' timestamp", () => {
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
});

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
});
