// Extended tests for QueryHistoryPanel component.
// Complements the existing queryHistoryPanel.test.tsx with additional coverage:
//
// QHP-1:  Panel renders with history items showing correct structure
// QHP-2:  Panel shows empty state when no history
// QHP-3:  Search input filters history items by SQL content
// QHP-4:  Clicking a history entry toggle expands it and calls handler on Run Again
// QHP-5:  Star toggle calls toggleStar on the store
// QHP-6:  Clear all removes items after double-click confirmation
// QHP-7:  Shows execution time and row count metadata
// QHP-8:  Starred filter shows only starred entries
// QHP-9:  Multiple entries expand/collapse independently
// QHP-10: Combined search and status filter

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "../../helpers/render";
import { resetAllStores } from "../../helpers/stores";
import {
  useQueryHistoryStore,
  type QueryHistoryEntry,
} from "@/stores/queryHistoryStore";
import { QueryHistoryPanel } from "@/components/right-panel/QueryHistoryPanel";

// Mock the API client functions used by the store
vi.mock("@/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/client")>();
  return {
    ...actual,
    apiGet: vi.fn().mockResolvedValue({ history: [], total: 0 }),
    apiDelete: vi.fn().mockResolvedValue({ success: true }),
    apiPatch: vi.fn().mockResolvedValue({ id: "qh-1", is_starred: true }),
  };
});

/** Build a QueryHistoryEntry with defaults. */
function makeEntry(
  overrides: Partial<QueryHistoryEntry> = {}
): QueryHistoryEntry {
  return {
    id: "qh-1",
    query: "SELECT * FROM products",
    timestamp: Date.now(),
    conversation_id: "conv-1",
    execution_time_ms: 75,
    row_count: 250,
    status: "success",
    error_message: null,
    source: "manual",
    is_starred: false,
    ...overrides,
  };
}

beforeEach(() => {
  resetAllStores();
  useQueryHistoryStore.setState({
    queries: [],
    isFetching: false,
    fetchHistory: vi.fn(),
    clearHistory: vi.fn().mockImplementation(() => {
      useQueryHistoryStore.setState({ queries: [] });
    }),
    toggleStar: vi.fn(),
  });
  vi.restoreAllMocks();
});

describe("QHP-1: Panel renders with history items showing correct structure", () => {
  it("renders the panel container with data-testid", () => {
    const entry = makeEntry();
    useQueryHistoryStore.setState({ queries: [entry] });

    renderWithProviders(<QueryHistoryPanel />);

    expect(screen.getByTestId("query-history-panel")).toBeInTheDocument();
  });

  it("renders multiple history entries", () => {
    const entries = [
      makeEntry({ id: "qh-1", query: "SELECT * FROM users", timestamp: Date.now() }),
      makeEntry({ id: "qh-2", query: "SELECT * FROM orders", timestamp: Date.now() - 1000 }),
      makeEntry({ id: "qh-3", query: "SELECT * FROM products", timestamp: Date.now() - 2000 }),
    ];
    useQueryHistoryStore.setState({ queries: entries });

    renderWithProviders(<QueryHistoryPanel />);

    expect(screen.getAllByTestId("query-history-entry")).toHaveLength(3);
  });

  it("displays query SQL text for each entry", () => {
    const entries = [
      makeEntry({ id: "qh-1", query: "SELECT id FROM users", timestamp: Date.now() }),
      makeEntry({ id: "qh-2", query: "SELECT name FROM orders", timestamp: Date.now() - 1000 }),
    ];
    useQueryHistoryStore.setState({ queries: entries });

    renderWithProviders(<QueryHistoryPanel />);

    const sqlElements = screen.getAllByTestId("query-history-entry-sql");
    expect(sqlElements[0]).toHaveTextContent("SELECT id FROM users");
    expect(sqlElements[1]).toHaveTextContent("SELECT name FROM orders");
  });
});

describe("QHP-2: Panel shows empty state when no history", () => {
  it("shows empty state message", () => {
    renderWithProviders(<QueryHistoryPanel />);

    expect(screen.getByTestId("query-history-empty")).toBeInTheDocument();
    expect(screen.getByText("No query history")).toBeInTheDocument();
    expect(
      screen.getByText("Queries you run will appear here")
    ).toBeInTheDocument();
  });

  it("does not render any entry elements", () => {
    renderWithProviders(<QueryHistoryPanel />);

    expect(screen.queryAllByTestId("query-history-entry")).toHaveLength(0);
  });

  it("does not show the clear button when empty", () => {
    renderWithProviders(<QueryHistoryPanel />);

    expect(
      screen.queryByTestId("query-history-clear")
    ).not.toBeInTheDocument();
  });
});

describe("QHP-3: Search input filters history items", () => {
  it("filters entries by SQL keyword", async () => {
    const entries = [
      makeEntry({ id: "qh-1", query: "SELECT * FROM users", timestamp: Date.now() }),
      makeEntry({ id: "qh-2", query: "SELECT * FROM orders", timestamp: Date.now() - 1000 }),
      makeEntry({ id: "qh-3", query: "INSERT INTO logs VALUES (1)", timestamp: Date.now() - 2000 }),
    ];
    useQueryHistoryStore.setState({ queries: entries });

    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryPanel />);

    expect(screen.getAllByTestId("query-history-entry")).toHaveLength(3);

    const searchInput = screen.getByTestId("query-history-search");
    await user.type(searchInput, "orders");

    expect(screen.getAllByTestId("query-history-entry")).toHaveLength(1);
    expect(screen.getByTestId("query-history-entry-sql")).toHaveTextContent(
      "SELECT * FROM orders"
    );
  });

  it("is case-insensitive", async () => {
    const entries = [
      makeEntry({ id: "qh-1", query: "SELECT * FROM Users", timestamp: Date.now() }),
    ];
    useQueryHistoryStore.setState({ queries: entries });

    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryPanel />);

    const searchInput = screen.getByTestId("query-history-search");
    await user.type(searchInput, "users");

    expect(screen.getAllByTestId("query-history-entry")).toHaveLength(1);
  });

  it("shows no-results message when nothing matches", async () => {
    const entries = [
      makeEntry({ id: "qh-1", query: "SELECT * FROM users", timestamp: Date.now() }),
    ];
    useQueryHistoryStore.setState({ queries: entries });

    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryPanel />);

    const searchInput = screen.getByTestId("query-history-search");
    await user.type(searchInput, "zzz_no_match");

    expect(screen.getByTestId("query-history-no-results")).toBeInTheDocument();
    expect(
      screen.getByText("No queries match your filters")
    ).toBeInTheDocument();
  });
});

describe("QHP-4: Clicking entry expands and Run Again calls handler", () => {
  it("expands entry to show full SQL on click", async () => {
    const entry = makeEntry({ query: "SELECT a, b, c FROM my_table" });
    useQueryHistoryStore.setState({ queries: [entry] });

    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryPanel />);

    expect(
      screen.queryByTestId("query-history-entry-expanded")
    ).not.toBeInTheDocument();

    await user.click(screen.getByTestId("query-history-entry-toggle"));

    expect(
      screen.getByTestId("query-history-entry-expanded")
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("query-history-entry-full-sql")
    ).toHaveTextContent("SELECT a, b, c FROM my_table");
  });

  it("calls onRunAgain callback with the query SQL", async () => {
    const onRunAgain = vi.fn();
    const entry = makeEntry({ query: "SELECT * FROM items" });
    useQueryHistoryStore.setState({ queries: [entry] });

    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryPanel onRunAgain={onRunAgain} />);

    // Expand first
    await user.click(screen.getByTestId("query-history-entry-toggle"));
    // Click Run Again
    await user.click(screen.getByTestId("query-history-run-again"));

    expect(onRunAgain).toHaveBeenCalledWith("SELECT * FROM items");
    expect(onRunAgain).toHaveBeenCalledTimes(1);
  });

  it("does not show Run Again when onRunAgain is not provided", async () => {
    const entry = makeEntry();
    useQueryHistoryStore.setState({ queries: [entry] });

    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryPanel />);

    await user.click(screen.getByTestId("query-history-entry-toggle"));

    expect(
      screen.queryByTestId("query-history-run-again")
    ).not.toBeInTheDocument();
  });
});

describe("QHP-5: Star toggle calls toggleStar on the store", () => {
  it("renders star button for entries with an id", () => {
    const entry = makeEntry({ id: "qh-1", is_starred: false });
    useQueryHistoryStore.setState({ queries: [entry] });

    renderWithProviders(<QueryHistoryPanel />);

    expect(screen.getByTestId("query-history-star")).toBeInTheDocument();
  });

  it("calls toggleStar with the entry id when star button is clicked", async () => {
    const mockToggleStar = vi.fn();
    const entry = makeEntry({ id: "qh-42", is_starred: false });
    useQueryHistoryStore.setState({
      queries: [entry],
      toggleStar: mockToggleStar,
    });

    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryPanel />);

    await user.click(screen.getByTestId("query-history-star"));

    expect(mockToggleStar).toHaveBeenCalledWith("qh-42");
  });

  it("shows correct aria-label for unstarred entry", () => {
    const entry = makeEntry({ id: "qh-1", is_starred: false });
    useQueryHistoryStore.setState({ queries: [entry] });

    renderWithProviders(<QueryHistoryPanel />);

    expect(screen.getByTestId("query-history-star")).toHaveAttribute(
      "aria-label",
      "Star query"
    );
  });

  it("shows correct aria-label for starred entry", () => {
    const entry = makeEntry({ id: "qh-1", is_starred: true });
    useQueryHistoryStore.setState({ queries: [entry] });

    renderWithProviders(<QueryHistoryPanel />);

    expect(screen.getByTestId("query-history-star")).toHaveAttribute(
      "aria-label",
      "Unstar query"
    );
  });
});

describe("QHP-6: Clear all removes items after double-click confirmation", () => {
  it("shows Clear All button when there are entries", () => {
    const entry = makeEntry();
    useQueryHistoryStore.setState({ queries: [entry] });

    renderWithProviders(<QueryHistoryPanel />);

    const clearBtn = screen.getByTestId("query-history-clear");
    expect(clearBtn).toHaveTextContent("Clear All");
  });

  it("shows Confirm Clear on first click, then calls clearHistory on second click", async () => {
    const mockClearHistory = vi.fn().mockImplementation(async () => {
      useQueryHistoryStore.setState({ queries: [] });
    });
    const entry = makeEntry();
    useQueryHistoryStore.setState({ queries: [entry], clearHistory: mockClearHistory });

    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryPanel />);

    const clearBtn = screen.getByTestId("query-history-clear");
    expect(clearBtn).toHaveTextContent("Clear All");

    // First click: confirmation
    await user.click(clearBtn);
    expect(screen.getByTestId("query-history-clear")).toHaveTextContent(
      "Confirm Clear"
    );

    // Second click: actually clears
    await user.click(screen.getByTestId("query-history-clear"));

    // clearHistory should have been called
    expect(mockClearHistory).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(screen.getByTestId("query-history-empty")).toBeInTheDocument();
    });
  });
});

describe("QHP-7: Shows execution time and row count", () => {
  it("displays execution time in milliseconds", () => {
    const entry = makeEntry({ execution_time_ms: 150 });
    useQueryHistoryStore.setState({ queries: [entry] });

    renderWithProviders(<QueryHistoryPanel />);

    expect(
      screen.getByTestId("query-history-entry-duration")
    ).toHaveTextContent("150ms");
  });

  it("displays execution time in seconds for > 1000ms", () => {
    const entry = makeEntry({ execution_time_ms: 2500 });
    useQueryHistoryStore.setState({ queries: [entry] });

    renderWithProviders(<QueryHistoryPanel />);

    expect(
      screen.getByTestId("query-history-entry-duration")
    ).toHaveTextContent("2.50s");
  });

  it("displays row count with locale formatting", () => {
    const entry = makeEntry({ row_count: 1234 });
    useQueryHistoryStore.setState({ queries: [entry] });

    renderWithProviders(<QueryHistoryPanel />);

    const rowsEl = screen.getByTestId("query-history-entry-rows");
    // toLocaleString varies, but should contain "rows"
    expect(rowsEl).toHaveTextContent("rows");
    expect(rowsEl).toHaveTextContent("1,234");
  });

  it("does not show duration when execution_time_ms is not set", () => {
    const entry = makeEntry({ execution_time_ms: undefined });
    useQueryHistoryStore.setState({ queries: [entry] });

    renderWithProviders(<QueryHistoryPanel />);

    expect(
      screen.queryByTestId("query-history-entry-duration")
    ).not.toBeInTheDocument();
  });

  it("does not show row count when row_count is not set", () => {
    const entry = makeEntry({ row_count: undefined });
    useQueryHistoryStore.setState({ queries: [entry] });

    renderWithProviders(<QueryHistoryPanel />);

    expect(
      screen.queryByTestId("query-history-entry-rows")
    ).not.toBeInTheDocument();
  });
});

describe("QHP-8: Starred filter shows only starred entries", () => {
  it("filters to only starred entries when Starred button is clicked", async () => {
    const entries = [
      makeEntry({ id: "qh-1", query: "SELECT 1", is_starred: true, timestamp: Date.now() }),
      makeEntry({ id: "qh-2", query: "SELECT 2", is_starred: false, timestamp: Date.now() - 1000 }),
      makeEntry({ id: "qh-3", query: "SELECT 3", is_starred: true, timestamp: Date.now() - 2000 }),
    ];
    useQueryHistoryStore.setState({ queries: entries });

    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryPanel />);

    expect(screen.getAllByTestId("query-history-entry")).toHaveLength(3);

    await user.click(screen.getByTestId("query-history-filter-starred"));

    expect(screen.getAllByTestId("query-history-entry")).toHaveLength(2);
  });

  it("toggles starred filter off when clicked again", async () => {
    const entries = [
      makeEntry({ id: "qh-1", query: "SELECT 1", is_starred: true, timestamp: Date.now() }),
      makeEntry({ id: "qh-2", query: "SELECT 2", is_starred: false, timestamp: Date.now() - 1000 }),
    ];
    useQueryHistoryStore.setState({ queries: entries });

    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryPanel />);

    // Enable starred filter
    await user.click(screen.getByTestId("query-history-filter-starred"));
    expect(screen.getAllByTestId("query-history-entry")).toHaveLength(1);

    // Disable starred filter
    await user.click(screen.getByTestId("query-history-filter-starred"));
    expect(screen.getAllByTestId("query-history-entry")).toHaveLength(2);
  });
});

describe("QHP-9: Expand/collapse entries independently", () => {
  it("only one entry is expanded at a time", async () => {
    const entries = [
      makeEntry({ id: "qh-1", query: "SELECT 1", timestamp: Date.now() }),
      makeEntry({ id: "qh-2", query: "SELECT 2", timestamp: Date.now() - 1000 }),
    ];
    useQueryHistoryStore.setState({ queries: entries });

    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryPanel />);

    const toggles = screen.getAllByTestId("query-history-entry-toggle");

    // Expand first
    await user.click(toggles[0]);
    expect(screen.getAllByTestId("query-history-entry-expanded")).toHaveLength(1);

    // Expand second - first should collapse (only one expandedId at a time)
    await user.click(toggles[1]);
    expect(screen.getAllByTestId("query-history-entry-expanded")).toHaveLength(1);
    expect(
      screen.getByTestId("query-history-entry-full-sql")
    ).toHaveTextContent("SELECT 2");
  });

  it("collapses an entry when clicking the same toggle again", async () => {
    const entry = makeEntry();
    useQueryHistoryStore.setState({ queries: [entry] });

    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryPanel />);

    const toggle = screen.getByTestId("query-history-entry-toggle");

    await user.click(toggle);
    expect(
      screen.getByTestId("query-history-entry-expanded")
    ).toBeInTheDocument();

    await user.click(toggle);
    expect(
      screen.queryByTestId("query-history-entry-expanded")
    ).not.toBeInTheDocument();
  });
});

describe("QHP-10: Combined search and status filter", () => {
  it("applies both search and status filter simultaneously", async () => {
    const entries = [
      makeEntry({ id: "qh-1", query: "SELECT * FROM users", status: "success", timestamp: Date.now() }),
      makeEntry({ id: "qh-2", query: "SELECT * FROM orders", status: "error", timestamp: Date.now() - 1000 }),
      makeEntry({ id: "qh-3", query: "SELECT * FROM users WHERE id=1", status: "error", timestamp: Date.now() - 2000 }),
    ];
    useQueryHistoryStore.setState({ queries: entries });

    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryPanel />);

    // Filter to errors
    await user.click(screen.getByTestId("query-history-filter-error"));
    expect(screen.getAllByTestId("query-history-entry")).toHaveLength(2);

    // Also search for "users"
    const searchInput = screen.getByTestId("query-history-search");
    await user.type(searchInput, "users");

    // Should only show the one error entry matching "users"
    expect(screen.getAllByTestId("query-history-entry")).toHaveLength(1);
    expect(screen.getByTestId("query-history-entry-sql")).toHaveTextContent(
      "SELECT * FROM users WHERE id=1"
    );
  });
});

describe("QHP-11: Error message in expanded view", () => {
  it("shows error message when entry has error_message and is expanded", async () => {
    const entry = makeEntry({
      status: "error",
      error_message: "Column 'foo' does not exist",
    });
    useQueryHistoryStore.setState({ queries: [entry] });

    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryPanel />);

    await user.click(screen.getByTestId("query-history-entry-toggle"));

    expect(screen.getByTestId("query-history-entry-error")).toHaveTextContent(
      "Column 'foo' does not exist"
    );
  });
});

describe("QHP-12: Loading state", () => {
  it("shows loading spinner when fetching with no cached data", () => {
    useQueryHistoryStore.setState({ queries: [], isFetching: true });

    renderWithProviders(<QueryHistoryPanel />);

    expect(screen.getByTestId("query-history-loading")).toBeInTheDocument();
    expect(
      screen.getByText("Loading query history...")
    ).toBeInTheDocument();
  });

  it("does not show loading state when fetching with existing data", () => {
    const entry = makeEntry();
    useQueryHistoryStore.setState({ queries: [entry], isFetching: true });

    renderWithProviders(<QueryHistoryPanel />);

    expect(
      screen.queryByTestId("query-history-loading")
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("query-history-panel")).toBeInTheDocument();
  });
});
