// Tests for PinnedResultsPanel component.
//
// PIN-EMPTY-1:    Shows empty state when no pinned queries
// PIN-LOADING-1:  Shows loading state while fetching
// PIN-RENDER-1:   Renders pinned query cards
// PIN-RENDER-2:   Shows correct count of pinned results
// PIN-META-1:     Shows query metadata (execution time, date)
// PIN-META-2:     Truncates long SQL to 80 chars
// PIN-PREVIEW-1:  Shows mini data preview table
// PIN-UNPIN-1:    Unpin button triggers togglePin
// PIN-RUN-1:      Run Again button sets pending SQL and switches tab
// PIN-COPY-1:     Copy SQL button copies to clipboard
// PIN-TIME-1:     relativeTime formatting works for various durations
// PIN-SORT-1:     Pinned queries sorted most-recent first
// PIN-FETCH-1:    Fetches queries on mount when empty

import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "../../helpers/render";
import { resetAllStores } from "../../helpers/stores";
import { useSavedQueryStore, type SavedQuery } from "@/stores/savedQueryStore";
import { useUiStore } from "@/stores/uiStore";
import { useToastStore } from "@/stores/toastStore";
import { PinnedResultsPanel } from "@/components/right-panel/PinnedResultsPanel";

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

function makePinnedQuery(overrides: Partial<SavedQuery> = {}): SavedQuery {
  return {
    id: "sq-1",
    name: "Top Sales",
    query: "SELECT * FROM sales ORDER BY amount DESC LIMIT 10",
    created_at: new Date().toISOString(),
    execution_time_ms: 42,
    folder: "",
    is_pinned: true,
    result_data: {
      columns: ["id", "amount"],
      rows: [
        [1, 100],
        [2, 200],
      ],
      total_rows: 2,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetAllStores();
  vi.restoreAllMocks();
  // Clear toasts
  useToastStore.setState({ toasts: [] });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PIN-EMPTY-1: Empty state", () => {
  it("shows empty state when no pinned queries exist", () => {
    // Provide a non-pinned query so queries.length > 0 (avoids triggering fetchQueries
    // which would flip isLoading to true and show the loading state instead)
    useSavedQueryStore.setState({
      queries: [makePinnedQuery({ is_pinned: false })],
      isLoading: false,
    });

    renderWithProviders(<PinnedResultsPanel />);

    expect(screen.getByTestId("pinned-results-empty")).toBeInTheDocument();
    expect(screen.getByText("No pinned results yet")).toBeInTheDocument();
    expect(
      screen.getByText("Pin query results to keep them handy for comparison.")
    ).toBeInTheDocument();
  });

  it("shows empty state when queries array is empty and fetchQueries is no-op", () => {
    // Mock fetchQueries so it doesn't set isLoading
    useSavedQueryStore.setState({
      queries: [],
      isLoading: false,
      fetchQueries: vi.fn(),
    });

    renderWithProviders(<PinnedResultsPanel />);

    expect(screen.getByTestId("pinned-results-empty")).toBeInTheDocument();
  });
});

describe("PIN-LOADING-1: Loading state", () => {
  it("shows loading spinner when isLoading and no queries", () => {
    useSavedQueryStore.setState({
      queries: [],
      isLoading: true,
    });

    renderWithProviders(<PinnedResultsPanel />);

    expect(screen.getByTestId("pinned-results-loading")).toBeInTheDocument();
    expect(screen.getByText("Loading pinned results...")).toBeInTheDocument();
  });

  it("does not show loading when queries already loaded", () => {
    useSavedQueryStore.setState({
      queries: [makePinnedQuery()],
      isLoading: true,
    });

    renderWithProviders(<PinnedResultsPanel />);

    expect(screen.queryByTestId("pinned-results-loading")).not.toBeInTheDocument();
  });
});

describe("PIN-RENDER-1: Renders pinned query cards", () => {
  it("renders a card for each pinned query", () => {
    useSavedQueryStore.setState({
      queries: [
        makePinnedQuery({ id: "sq-1", name: "Top Sales" }),
        makePinnedQuery({ id: "sq-2", name: "User Count" }),
      ],
      isLoading: false,
    });

    renderWithProviders(<PinnedResultsPanel />);

    const cards = screen.getAllByTestId("pinned-query-card");
    expect(cards).toHaveLength(2);
    expect(screen.getByText("Top Sales")).toBeInTheDocument();
    expect(screen.getByText("User Count")).toBeInTheDocument();
  });

  it("shows the panel container with correct testid", () => {
    useSavedQueryStore.setState({
      queries: [makePinnedQuery()],
      isLoading: false,
    });

    renderWithProviders(<PinnedResultsPanel />);

    expect(screen.getByTestId("pinned-results-panel")).toBeInTheDocument();
  });
});

describe("PIN-RENDER-2: Pinned results count", () => {
  it("shows singular 'pinned result' for 1 item", () => {
    useSavedQueryStore.setState({
      queries: [makePinnedQuery()],
      isLoading: false,
    });

    renderWithProviders(<PinnedResultsPanel />);

    expect(screen.getByText("1 pinned result")).toBeInTheDocument();
  });

  it("shows plural 'pinned results' for multiple items", () => {
    useSavedQueryStore.setState({
      queries: [
        makePinnedQuery({ id: "sq-1" }),
        makePinnedQuery({ id: "sq-2" }),
        makePinnedQuery({ id: "sq-3" }),
      ],
      isLoading: false,
    });

    renderWithProviders(<PinnedResultsPanel />);

    expect(screen.getByText("3 pinned results")).toBeInTheDocument();
  });
});

describe("PIN-META-1: Query metadata display", () => {
  it("shows execution time for a query", () => {
    useSavedQueryStore.setState({
      queries: [makePinnedQuery({ execution_time_ms: 42 })],
      isLoading: false,
    });

    renderWithProviders(<PinnedResultsPanel />);

    expect(screen.getByTestId("pinned-query-duration")).toBeInTheDocument();
    expect(screen.getByTestId("pinned-query-duration").textContent).toBe("42ms");
  });

  it("shows execution time in seconds for >= 1000ms", () => {
    useSavedQueryStore.setState({
      queries: [makePinnedQuery({ execution_time_ms: 2345 })],
      isLoading: false,
    });

    renderWithProviders(<PinnedResultsPanel />);

    expect(screen.getByTestId("pinned-query-duration").textContent).toBe("2.35s");
  });

  it("does not show duration when execution_time_ms is null", () => {
    useSavedQueryStore.setState({
      queries: [makePinnedQuery({ execution_time_ms: null })],
      isLoading: false,
    });

    renderWithProviders(<PinnedResultsPanel />);

    expect(screen.queryByTestId("pinned-query-duration")).not.toBeInTheDocument();
  });

  it("shows relative time for the created_at date", () => {
    useSavedQueryStore.setState({
      queries: [makePinnedQuery({ created_at: new Date().toISOString() })],
      isLoading: false,
    });

    renderWithProviders(<PinnedResultsPanel />);

    expect(screen.getByTestId("pinned-query-date")).toBeInTheDocument();
    expect(screen.getByTestId("pinned-query-date").textContent).toBe("just now");
  });
});

describe("PIN-META-2: SQL text truncation", () => {
  it("truncates SQL longer than 80 chars", () => {
    const longSql = "SELECT " + "a".repeat(100) + " FROM table";
    useSavedQueryStore.setState({
      queries: [makePinnedQuery({ query: longSql })],
      isLoading: false,
    });

    renderWithProviders(<PinnedResultsPanel />);

    const sqlEl = screen.getByTestId("pinned-query-sql");
    expect(sqlEl.textContent).toHaveLength(83); // 80 + "..."
    expect(sqlEl.textContent!.endsWith("...")).toBe(true);
  });

  it("does not truncate SQL <= 80 chars", () => {
    const shortSql = "SELECT * FROM t";
    useSavedQueryStore.setState({
      queries: [makePinnedQuery({ query: shortSql })],
      isLoading: false,
    });

    renderWithProviders(<PinnedResultsPanel />);

    const sqlEl = screen.getByTestId("pinned-query-sql");
    expect(sqlEl.textContent).toBe(shortSql);
  });
});

describe("PIN-PREVIEW-1: Mini data preview table", () => {
  it("shows preview table when result_data has columns", () => {
    useSavedQueryStore.setState({
      queries: [
        makePinnedQuery({
          result_data: {
            columns: ["id", "name"],
            rows: [
              [1, "Alice"],
              [2, "Bob"],
            ],
            total_rows: 2,
          },
        }),
      ],
      isLoading: false,
    });

    renderWithProviders(<PinnedResultsPanel />);

    expect(screen.getByTestId("pinned-query-preview")).toBeInTheDocument();
    expect(screen.getByText("id")).toBeInTheDocument();
    expect(screen.getByText("name")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("does not show preview when no result_data", () => {
    useSavedQueryStore.setState({
      queries: [makePinnedQuery({ result_data: undefined })],
      isLoading: false,
    });

    renderWithProviders(<PinnedResultsPanel />);

    expect(screen.queryByTestId("pinned-query-preview")).not.toBeInTheDocument();
  });

  it("limits preview rows to 3", () => {
    useSavedQueryStore.setState({
      queries: [
        makePinnedQuery({
          result_data: {
            columns: ["val"],
            rows: [[1], [2], [3], [4], [5]],
            total_rows: 5,
          },
        }),
      ],
      isLoading: false,
    });

    renderWithProviders(<PinnedResultsPanel />);

    const preview = screen.getByTestId("pinned-query-preview");
    const rows = preview.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(3);
  });

  it("renders null cells with italic 'null' text", () => {
    useSavedQueryStore.setState({
      queries: [
        makePinnedQuery({
          result_data: {
            columns: ["val"],
            rows: [[null]],
            total_rows: 1,
          },
        }),
      ],
      isLoading: false,
    });

    renderWithProviders(<PinnedResultsPanel />);

    const nullEl = screen.getByText("null");
    expect(nullEl).toHaveClass("italic");
  });
});

describe("PIN-UNPIN-1: Unpin button", () => {
  it("calls togglePin when unpin button is clicked", async () => {
    const togglePinMock = vi.fn().mockResolvedValue(undefined);
    useSavedQueryStore.setState({
      queries: [makePinnedQuery({ id: "sq-1" })],
      isLoading: false,
      togglePin: togglePinMock,
    });

    const user = userEvent.setup();
    renderWithProviders(<PinnedResultsPanel />);

    const unpinBtn = screen.getByTestId("pinned-query-unpin");
    await user.click(unpinBtn);

    expect(togglePinMock).toHaveBeenCalledWith("sq-1");
  });

  it("shows success toast after unpinning", async () => {
    const togglePinMock = vi.fn().mockResolvedValue(undefined);
    useSavedQueryStore.setState({
      queries: [makePinnedQuery({ id: "sq-1" })],
      isLoading: false,
      togglePin: togglePinMock,
    });

    const user = userEvent.setup();
    renderWithProviders(<PinnedResultsPanel />);

    await user.click(screen.getByTestId("pinned-query-unpin"));

    await waitFor(() => {
      const toasts = useToastStore.getState().toasts;
      expect(toasts.some((t) => t.message === "Result unpinned")).toBe(true);
    });
  });
});

describe("PIN-RUN-1: Run Again button", () => {
  it("sets pending SQL and switches to datasets tab", async () => {
    const sql = "SELECT * FROM sales LIMIT 10";
    useSavedQueryStore.setState({
      queries: [makePinnedQuery({ query: sql })],
      isLoading: false,
    });

    const user = userEvent.setup();
    renderWithProviders(<PinnedResultsPanel />);

    await user.click(screen.getByTestId("pinned-query-run-again"));

    expect(useUiStore.getState().pendingSql).toBe(sql);
    expect(useUiStore.getState().rightPanelTab).toBe("datasets");
  });
});

describe("PIN-COPY-1: Copy SQL button", () => {
  it("copies SQL to clipboard and shows toast", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    // userEvent.setup() overrides navigator.clipboard. Pass our own mock
    // by creating userEvent without clipboard support and manually mocking.
    const user = userEvent.setup({ writeToClipboard: false });

    // Define clipboard after userEvent.setup to avoid being overwritten
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock, readText: vi.fn(), read: vi.fn(), write: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() },
      writable: true,
      configurable: true,
    });

    const sql = "SELECT * FROM sales";
    useSavedQueryStore.setState({
      queries: [makePinnedQuery({ query: sql })],
      isLoading: false,
    });

    renderWithProviders(<PinnedResultsPanel />);

    await user.click(screen.getByTestId("pinned-query-copy-sql"));

    expect(writeTextMock).toHaveBeenCalledWith(sql);

    await waitFor(() => {
      const toasts = useToastStore.getState().toasts;
      expect(toasts.some((t) => t.message === "SQL copied to clipboard")).toBe(true);
    });
  });
});

describe("PIN-SORT-1: Sort order", () => {
  it("sorts pinned queries by most recently created first", () => {
    const older = makePinnedQuery({
      id: "sq-old",
      name: "Older Query",
      created_at: "2024-01-01T00:00:00Z",
    });
    const newer = makePinnedQuery({
      id: "sq-new",
      name: "Newer Query",
      created_at: "2025-06-15T12:00:00Z",
    });

    useSavedQueryStore.setState({
      queries: [older, newer],
      isLoading: false,
    });

    renderWithProviders(<PinnedResultsPanel />);

    const names = screen.getAllByTestId("pinned-query-name");
    expect(names[0].textContent).toBe("Newer Query");
    expect(names[1].textContent).toBe("Older Query");
  });
});

describe("PIN-FETCH-1: Fetches on mount", () => {
  it("calls fetchQueries on mount when queries list is empty", () => {
    const fetchMock = vi.fn();
    useSavedQueryStore.setState({
      queries: [],
      isLoading: false,
      fetchQueries: fetchMock,
    });

    renderWithProviders(<PinnedResultsPanel />);

    expect(fetchMock).toHaveBeenCalled();
  });

  it("does not call fetchQueries if already loading", () => {
    const fetchMock = vi.fn();
    useSavedQueryStore.setState({
      queries: [],
      isLoading: true,
      fetchQueries: fetchMock,
    });

    renderWithProviders(<PinnedResultsPanel />);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("PIN-TIME-1: relativeTime formatting", () => {
  it("shows 'just now' for dates within the last minute", () => {
    const now = new Date();
    useSavedQueryStore.setState({
      queries: [makePinnedQuery({ created_at: now.toISOString() })],
      isLoading: false,
    });

    renderWithProviders(<PinnedResultsPanel />);

    expect(screen.getByTestId("pinned-query-date").textContent).toBe("just now");
  });

  it("shows minutes ago for dates within the last hour", () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    useSavedQueryStore.setState({
      queries: [makePinnedQuery({ created_at: thirtyMinAgo })],
      isLoading: false,
    });

    renderWithProviders(<PinnedResultsPanel />);

    expect(screen.getByTestId("pinned-query-date").textContent).toBe("30m ago");
  });

  it("shows hours ago for dates within the last day", () => {
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    useSavedQueryStore.setState({
      queries: [makePinnedQuery({ created_at: fiveHoursAgo })],
      isLoading: false,
    });

    renderWithProviders(<PinnedResultsPanel />);

    expect(screen.getByTestId("pinned-query-date").textContent).toBe("5h ago");
  });

  it("shows days ago for dates within the last month", () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    useSavedQueryStore.setState({
      queries: [makePinnedQuery({ created_at: tenDaysAgo })],
      isLoading: false,
    });

    renderWithProviders(<PinnedResultsPanel />);

    expect(screen.getByTestId("pinned-query-date").textContent).toBe("10d ago");
  });
});

describe("PIN-DURATION-FORMAT: formatDuration edge cases", () => {
  it("shows fractional ms for sub-1ms times", () => {
    useSavedQueryStore.setState({
      queries: [makePinnedQuery({ execution_time_ms: 0.45 })],
      isLoading: false,
    });

    renderWithProviders(<PinnedResultsPanel />);

    expect(screen.getByTestId("pinned-query-duration").textContent).toBe("0.45ms");
  });
});
