// Tests for QueryHistoryPanel component.
//
// QH-1: Renders empty state when no history
// QH-2: Renders query entries with correct data
// QH-3: Clicking entry expands full SQL
// QH-4: Search filters queries
// QH-5: Status filter works (All/Success/Error)
// QH-6: Copy SQL button works
// QH-7: Clear all with confirmation

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "../../helpers/render";
import { resetAllStores } from "../../helpers/stores";
import { useQueryHistoryStore, type QueryHistoryEntry } from "@/stores/queryHistoryStore";
import { QueryHistoryPanel } from "@/components/right-panel/QueryHistoryPanel";

// Mock the API client functions used by the store
vi.mock("@/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/client")>();
  return {
    ...actual,
    apiGet: vi.fn().mockResolvedValue({ history: [], total: 0 }),
    apiDelete: vi.fn().mockResolvedValue({ success: true }),
  };
});

/** Build a QueryHistoryEntry with defaults. */
function makeEntry(overrides: Partial<QueryHistoryEntry> = {}): QueryHistoryEntry {
  return {
    id: "qh-1",
    query: "SELECT * FROM sales",
    timestamp: Date.now(),
    conversation_id: "conv-1",
    execution_time_ms: 42,
    row_count: 100,
    status: "success",
    error_message: null,
    source: "manual",
    ...overrides,
  };
}

beforeEach(() => {
  resetAllStores();
  // Reset query history store to empty state and stub fetchHistory to prevent
  // the useEffect from triggering real API calls / setting isFetching
  useQueryHistoryStore.setState({
    queries: [],
    isFetching: false,
    fetchHistory: vi.fn(),
  });
  vi.restoreAllMocks();
});

describe("QH-1: Renders empty state when no history", () => {
  it("shows empty state with message when no queries exist", () => {
    renderWithProviders(<QueryHistoryPanel />);

    const emptyState = screen.getByTestId("query-history-empty");
    expect(emptyState).toBeInTheDocument();
    expect(screen.getByText("No query history")).toBeInTheDocument();
    expect(screen.getByText("Queries you run will appear here")).toBeInTheDocument();
  });

  it("does not show the clear all button when there are no queries", () => {
    renderWithProviders(<QueryHistoryPanel />);

    expect(screen.queryByTestId("query-history-clear")).not.toBeInTheDocument();
  });
});

describe("QH-2: Renders query entries with correct data", () => {
  it("displays query text, execution time, and row count", () => {
    const entry = makeEntry({
      query: "SELECT id, name FROM users",
      execution_time_ms: 150,
      row_count: 42,
    });
    useQueryHistoryStore.setState({ queries: [entry] });

    renderWithProviders(<QueryHistoryPanel />);

    // Should show truncated SQL
    expect(screen.getByTestId("query-history-entry-sql")).toHaveTextContent(
      "SELECT id, name FROM users"
    );

    // Execution time
    expect(screen.getByTestId("query-history-entry-duration")).toHaveTextContent("150ms");

    // Row count
    expect(screen.getByTestId("query-history-entry-rows")).toHaveTextContent("42 rows");
  });

  it("shows success icon for successful queries", () => {
    const entry = makeEntry({ status: "success" });
    useQueryHistoryStore.setState({ queries: [entry] });

    renderWithProviders(<QueryHistoryPanel />);

    expect(screen.getByTestId("status-icon-success")).toBeInTheDocument();
  });

  it("shows error icon for failed queries", () => {
    const entry = makeEntry({ status: "error", error_message: "Table not found" });
    useQueryHistoryStore.setState({ queries: [entry] });

    renderWithProviders(<QueryHistoryPanel />);

    expect(screen.getByTestId("status-icon-error")).toBeInTheDocument();
  });

  it("groups entries under Today for current-day timestamps", () => {
    const entry = makeEntry({ timestamp: Date.now() });
    useQueryHistoryStore.setState({ queries: [entry] });

    renderWithProviders(<QueryHistoryPanel />);

    expect(screen.getByTestId("query-history-group-today")).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
  });

  it("groups entries under Yesterday for previous-day timestamps", () => {
    const yesterday = Date.now() - 86_400_000;
    const entry = makeEntry({ id: "qh-y", timestamp: yesterday });
    useQueryHistoryStore.setState({ queries: [entry] });

    renderWithProviders(<QueryHistoryPanel />);

    expect(screen.getByTestId("query-history-group-yesterday")).toBeInTheDocument();
  });

  it("groups entries under Older for timestamps more than 2 days ago", () => {
    const threeDaysAgo = Date.now() - 3 * 86_400_000;
    const entry = makeEntry({ id: "qh-o", timestamp: threeDaysAgo });
    useQueryHistoryStore.setState({ queries: [entry] });

    renderWithProviders(<QueryHistoryPanel />);

    expect(screen.getByTestId("query-history-group-older")).toBeInTheDocument();
  });
});

describe("QH-3: Clicking entry expands full SQL", () => {
  it("expands to show full SQL when entry is clicked", async () => {
    const entry = makeEntry({
      query: "SELECT very_long_column_name, another_column FROM my_table WHERE condition = true",
    });
    useQueryHistoryStore.setState({ queries: [entry] });

    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryPanel />);

    // Should not have expanded content initially
    expect(screen.queryByTestId("query-history-entry-expanded")).not.toBeInTheDocument();

    // Click the entry toggle
    const toggle = screen.getByTestId("query-history-entry-toggle");
    await user.click(toggle);

    // Should now show the expanded section with full SQL
    expect(screen.getByTestId("query-history-entry-expanded")).toBeInTheDocument();
    expect(screen.getByTestId("query-history-entry-full-sql")).toHaveTextContent(
      "SELECT very_long_column_name, another_column FROM my_table WHERE condition = true"
    );
  });

  it("collapses when clicked again", async () => {
    const entry = makeEntry();
    useQueryHistoryStore.setState({ queries: [entry] });

    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryPanel />);

    const toggle = screen.getByTestId("query-history-entry-toggle");

    // Expand
    await user.click(toggle);
    expect(screen.getByTestId("query-history-entry-expanded")).toBeInTheDocument();

    // Collapse
    await user.click(toggle);
    expect(screen.queryByTestId("query-history-entry-expanded")).not.toBeInTheDocument();
  });

  it("shows error message in expanded view for failed queries", async () => {
    const entry = makeEntry({
      status: "error",
      error_message: "Syntax error near FROM",
    });
    useQueryHistoryStore.setState({ queries: [entry] });

    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryPanel />);

    await user.click(screen.getByTestId("query-history-entry-toggle"));

    expect(screen.getByTestId("query-history-entry-error")).toHaveTextContent(
      "Syntax error near FROM"
    );
  });
});

describe("QH-4: Search filters queries", () => {
  it("filters queries by SQL content when typing in search", async () => {
    const entries = [
      makeEntry({ id: "qh-1", query: "SELECT * FROM users", timestamp: Date.now() }),
      makeEntry({ id: "qh-2", query: "SELECT * FROM orders", timestamp: Date.now() - 1000 }),
      makeEntry({ id: "qh-3", query: "INSERT INTO logs VALUES (1)", timestamp: Date.now() - 2000 }),
    ];
    useQueryHistoryStore.setState({ queries: entries });

    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryPanel />);

    // All 3 entries visible initially
    expect(screen.getAllByTestId("query-history-entry")).toHaveLength(3);

    // Type in search
    const searchInput = screen.getByTestId("query-history-search");
    await user.type(searchInput, "users");

    // Only 1 entry should match
    expect(screen.getAllByTestId("query-history-entry")).toHaveLength(1);
    expect(screen.getByTestId("query-history-entry-sql")).toHaveTextContent(
      "SELECT * FROM users"
    );
  });

  it("shows no-results message when search matches nothing", async () => {
    const entry = makeEntry({ query: "SELECT * FROM sales" });
    useQueryHistoryStore.setState({ queries: [entry] });

    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryPanel />);

    const searchInput = screen.getByTestId("query-history-search");
    await user.type(searchInput, "nonexistent_table");

    expect(screen.getByTestId("query-history-no-results")).toBeInTheDocument();
    expect(screen.getByText("No queries match your filters")).toBeInTheDocument();
  });

  it("search is case-insensitive", async () => {
    const entry = makeEntry({ query: "SELECT * FROM Users" });
    useQueryHistoryStore.setState({ queries: [entry] });

    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryPanel />);

    const searchInput = screen.getByTestId("query-history-search");
    await user.type(searchInput, "users");

    expect(screen.getAllByTestId("query-history-entry")).toHaveLength(1);
  });
});

describe("QH-5: Status filter works (All/Success/Error)", () => {
  it("shows all queries by default with All filter active", () => {
    const entries = [
      makeEntry({ id: "qh-1", query: "SELECT 1", status: "success", timestamp: Date.now() }),
      makeEntry({ id: "qh-2", query: "SELECT bad", status: "error", timestamp: Date.now() - 1000 }),
    ];
    useQueryHistoryStore.setState({ queries: entries });

    renderWithProviders(<QueryHistoryPanel />);

    expect(screen.getAllByTestId("query-history-entry")).toHaveLength(2);
  });

  it("filters to only success queries when Success filter is clicked", async () => {
    const entries = [
      makeEntry({ id: "qh-1", query: "SELECT 1", status: "success", timestamp: Date.now() }),
      makeEntry({ id: "qh-2", query: "SELECT bad", status: "error", timestamp: Date.now() - 1000 }),
    ];
    useQueryHistoryStore.setState({ queries: entries });

    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryPanel />);

    await user.click(screen.getByTestId("query-history-filter-success"));

    expect(screen.getAllByTestId("query-history-entry")).toHaveLength(1);
    expect(screen.getByTestId("status-icon-success")).toBeInTheDocument();
  });

  it("filters to only error queries when Error filter is clicked", async () => {
    const entries = [
      makeEntry({ id: "qh-1", query: "SELECT 1", status: "success", timestamp: Date.now() }),
      makeEntry({ id: "qh-2", query: "SELECT bad", status: "error", timestamp: Date.now() - 1000 }),
    ];
    useQueryHistoryStore.setState({ queries: entries });

    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryPanel />);

    await user.click(screen.getByTestId("query-history-filter-error"));

    expect(screen.getAllByTestId("query-history-entry")).toHaveLength(1);
    expect(screen.getByTestId("status-icon-error")).toBeInTheDocument();
  });

  it("returns to showing all queries when All filter is clicked after Error", async () => {
    const entries = [
      makeEntry({ id: "qh-1", query: "SELECT 1", status: "success", timestamp: Date.now() }),
      makeEntry({ id: "qh-2", query: "SELECT bad", status: "error", timestamp: Date.now() - 1000 }),
    ];
    useQueryHistoryStore.setState({ queries: entries });

    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryPanel />);

    // Filter to error only
    await user.click(screen.getByTestId("query-history-filter-error"));
    expect(screen.getAllByTestId("query-history-entry")).toHaveLength(1);

    // Back to all
    await user.click(screen.getByTestId("query-history-filter-all"));
    expect(screen.getAllByTestId("query-history-entry")).toHaveLength(2);
  });
});

describe("QH-6: Copy SQL button works", () => {
  it("shows Copy SQL button in expanded view and changes to Copied! after click", async () => {
    const entry = makeEntry({ query: "SELECT * FROM products" });
    useQueryHistoryStore.setState({ queries: [entry] });

    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryPanel />);

    // Expand the entry first
    await user.click(screen.getByTestId("query-history-entry-toggle"));

    // Initially shows "Copy SQL"
    const copyBtn = screen.getByTestId("query-history-copy");
    expect(copyBtn).toHaveTextContent("Copy SQL");

    // Click copy
    await user.click(copyBtn);

    // Should show "Copied!" feedback
    await waitFor(() => {
      expect(screen.getByTestId("query-history-copy")).toHaveTextContent("Copied!");
    });
  });

  it("copy button is present for each expanded entry", async () => {
    const entry = makeEntry({ query: "SELECT 1" });
    useQueryHistoryStore.setState({ queries: [entry] });

    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryPanel />);

    // Not visible when collapsed
    expect(screen.queryByTestId("query-history-copy")).not.toBeInTheDocument();

    // Visible when expanded
    await user.click(screen.getByTestId("query-history-entry-toggle"));
    expect(screen.getByTestId("query-history-copy")).toBeInTheDocument();
  });
});

describe("QH-7: Clear all with confirmation", () => {
  it("shows Confirm Clear on first click and clears on second click", async () => {
    const entry = makeEntry();
    useQueryHistoryStore.setState({ queries: [entry] });

    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryPanel />);

    const clearBtn = screen.getByTestId("query-history-clear");
    expect(clearBtn).toHaveTextContent("Clear All");

    // First click shows confirmation
    await user.click(clearBtn);
    expect(screen.getByTestId("query-history-clear")).toHaveTextContent("Confirm Clear");

    // Second click clears history
    await user.click(screen.getByTestId("query-history-clear"));

    // Should now show empty state
    await waitFor(() => {
      expect(screen.getByTestId("query-history-empty")).toBeInTheDocument();
    });
  });
});

describe("QH-8: Loading state", () => {
  it("shows loading state when fetching with no cached data", () => {
    useQueryHistoryStore.setState({ queries: [], isFetching: true });

    renderWithProviders(<QueryHistoryPanel />);

    expect(screen.getByTestId("query-history-loading")).toBeInTheDocument();
    expect(screen.getByText("Loading query history...")).toBeInTheDocument();
  });
});

describe("QH-9: Run Again button", () => {
  it("calls onRunAgain with the query SQL when Run Again is clicked", async () => {
    const onRunAgain = vi.fn();
    const entry = makeEntry({ query: "SELECT * FROM orders" });
    useQueryHistoryStore.setState({ queries: [entry] });

    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryPanel onRunAgain={onRunAgain} />);

    // Expand the entry
    await user.click(screen.getByTestId("query-history-entry-toggle"));

    // Click Run Again
    await user.click(screen.getByTestId("query-history-run-again"));

    expect(onRunAgain).toHaveBeenCalledWith("SELECT * FROM orders");
  });

  it("does not show Run Again button when onRunAgain is not provided", async () => {
    const entry = makeEntry();
    useQueryHistoryStore.setState({ queries: [entry] });

    const user = userEvent.setup();
    renderWithProviders(<QueryHistoryPanel />);

    await user.click(screen.getByTestId("query-history-entry-toggle"));

    expect(screen.queryByTestId("query-history-run-again")).not.toBeInTheDocument();
  });
});
