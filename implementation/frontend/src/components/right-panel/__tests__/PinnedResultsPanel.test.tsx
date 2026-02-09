import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PinnedResultsPanel } from "../PinnedResultsPanel";

// --- Mock state ---

const mockTogglePin = vi.fn();
const mockFetchQueries = vi.fn();
let mockQueries: Array<{
  id: string;
  name: string;
  query: string;
  created_at: string;
  is_pinned: boolean;
  folder: string;
  execution_time_ms?: number | null;
  result_data?: {
    columns: string[];
    rows: unknown[][];
    total_rows: number;
  };
}> = [];
let mockIsLoading = false;

vi.mock("@/stores/savedQueryStore", () => ({
  useSavedQueryStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) => {
    const state = {
      queries: mockQueries,
      isLoading: mockIsLoading,
      fetchQueries: mockFetchQueries,
      togglePin: mockTogglePin,
    };
    return selector(state);
  }),
}));

const mockSetPendingSql = vi.fn();
const mockSetRightPanelTab = vi.fn();

vi.mock("@/stores/uiStore", () => ({
  useUiStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) => {
    const state = {
      setPendingSql: mockSetPendingSql,
      setRightPanelTab: mockSetRightPanelTab,
    };
    return selector(state);
  }),
}));

const mockToastSuccess = vi.fn();

vi.mock("@/stores/toastStore", () => ({
  useToastStore: Object.assign(
    vi.fn((selector: (s: Record<string, unknown>) => unknown) => {
      const state = { success: mockToastSuccess };
      return selector(state);
    }),
    {
      getState: () => ({ success: mockToastSuccess }),
    }
  ),
}));

// --- Test data ---

const pinnedQuery1 = {
  id: "pq-1",
  name: "Top Users",
  query: "SELECT * FROM users ORDER BY score DESC LIMIT 10",
  created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2h ago
  is_pinned: true,
  folder: "",
  execution_time_ms: 42,
  result_data: {
    columns: ["id", "name", "score"],
    rows: [
      [1, "Alice", 100],
      [2, "Bob", 90],
      [3, "Charlie", 80],
      [4, "Dave", 70],
    ],
    total_rows: 4,
  },
};

const pinnedQuery2 = {
  id: "pq-2",
  name: "Order Count",
  query: "SELECT COUNT(*) as cnt FROM orders",
  created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3d ago
  is_pinned: true,
  folder: "",
  execution_time_ms: null,
};

const unpinnedQuery = {
  id: "uq-1",
  name: "Not Pinned",
  query: "SELECT 1",
  created_at: new Date().toISOString(),
  is_pinned: false,
  folder: "",
};

// --- Tests ---

describe("PinnedResultsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueries = [];
    mockIsLoading = false;
  });

  it("renders empty state when no pinned queries exist", () => {
    mockQueries = [unpinnedQuery];
    render(<PinnedResultsPanel />);

    expect(screen.getByTestId("pinned-results-empty")).toBeInTheDocument();
    expect(screen.getByText("No pinned results yet")).toBeInTheDocument();
    expect(
      screen.getByText("Pin query results to keep them handy for comparison.")
    ).toBeInTheDocument();
  });

  it("renders empty state when queries array is empty and not loading", () => {
    mockQueries = [];
    render(<PinnedResultsPanel />);

    // Should call fetchQueries on mount when empty
    expect(mockFetchQueries).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("pinned-results-empty")).toBeInTheDocument();
  });

  it("renders pinned queries with name and SQL", () => {
    mockQueries = [pinnedQuery1, pinnedQuery2, unpinnedQuery];
    render(<PinnedResultsPanel />);

    expect(screen.getByTestId("pinned-results-panel")).toBeInTheDocument();

    const cards = screen.getAllByTestId("pinned-query-card");
    expect(cards).toHaveLength(2); // Only pinned queries shown

    expect(screen.getByText("Top Users")).toBeInTheDocument();
    expect(screen.getByText("Order Count")).toBeInTheDocument();
    // Unpinned query should NOT appear
    expect(screen.queryByText("Not Pinned")).not.toBeInTheDocument();
  });

  it("displays SQL text for pinned queries", () => {
    mockQueries = [pinnedQuery1];
    render(<PinnedResultsPanel />);

    const sqlElements = screen.getAllByTestId("pinned-query-sql");
    expect(sqlElements.length).toBeGreaterThan(0);
    expect(sqlElements[0].textContent).toContain("SELECT * FROM users");
  });

  it("displays execution time badge when available", () => {
    mockQueries = [pinnedQuery1];
    render(<PinnedResultsPanel />);

    const duration = screen.getByTestId("pinned-query-duration");
    expect(duration).toBeInTheDocument();
    expect(duration.textContent).toBe("42ms");
  });

  it("does not display execution time badge when null", () => {
    mockQueries = [pinnedQuery2];
    render(<PinnedResultsPanel />);

    expect(screen.queryByTestId("pinned-query-duration")).not.toBeInTheDocument();
  });

  it("unpin button calls togglePin with the query id", () => {
    mockQueries = [pinnedQuery1];
    render(<PinnedResultsPanel />);

    const unpinButton = screen.getByTestId("pinned-query-unpin");
    fireEvent.click(unpinButton);

    expect(mockTogglePin).toHaveBeenCalledWith("pq-1");
  });

  it("'Run Again' button sets pending SQL and switches to datasets tab", () => {
    mockQueries = [pinnedQuery1];
    render(<PinnedResultsPanel />);

    const runButton = screen.getByTestId("pinned-query-run-again");
    fireEvent.click(runButton);

    expect(mockSetPendingSql).toHaveBeenCalledWith(
      "SELECT * FROM users ORDER BY score DESC LIMIT 10"
    );
    expect(mockSetRightPanelTab).toHaveBeenCalledWith("datasets");
  });

  it("'Copy SQL' button calls clipboard write", async () => {
    // Mock clipboard
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    mockQueries = [pinnedQuery1];
    render(<PinnedResultsPanel />);

    const copyButton = screen.getByTestId("pinned-query-copy-sql");
    fireEvent.click(copyButton);

    expect(writeText).toHaveBeenCalledWith(
      "SELECT * FROM users ORDER BY score DESC LIMIT 10"
    );
  });

  it("renders mini data preview for results with data", () => {
    mockQueries = [pinnedQuery1];
    render(<PinnedResultsPanel />);

    const preview = screen.getByTestId("pinned-query-preview");
    expect(preview).toBeInTheDocument();

    // Check column headers
    expect(screen.getByText("id")).toBeInTheDocument();
    expect(screen.getByText("name")).toBeInTheDocument();
    expect(screen.getByText("score")).toBeInTheDocument();

    // Check first 3 rows are shown (not 4th)
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Charlie")).toBeInTheDocument();
    expect(screen.queryByText("Dave")).not.toBeInTheDocument();
  });

  it("does not render data preview when no result_data", () => {
    mockQueries = [pinnedQuery2];
    render(<PinnedResultsPanel />);

    expect(screen.queryByTestId("pinned-query-preview")).not.toBeInTheDocument();
  });

  it("shows loading state", () => {
    mockQueries = [];
    mockIsLoading = true;
    render(<PinnedResultsPanel />);

    expect(screen.getByTestId("pinned-results-loading")).toBeInTheDocument();
    expect(screen.getByText("Loading pinned results...")).toBeInTheDocument();
  });

  it("displays relative created date", () => {
    mockQueries = [pinnedQuery1];
    render(<PinnedResultsPanel />);

    const dateEl = screen.getByTestId("pinned-query-date");
    expect(dateEl).toBeInTheDocument();
    expect(dateEl.textContent).toBe("2h ago");
  });
});
