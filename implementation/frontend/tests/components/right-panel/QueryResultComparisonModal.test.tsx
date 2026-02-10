// Tests for QueryResultComparisonModal component.
//
// QRCM-1:  Does not render when isOpen is false
// QRCM-2:  Renders modal when isOpen is true
// QRCM-3:  Closes on Escape key press
// QRCM-4:  Closes on backdrop click
// QRCM-5:  Does not close when clicking inside modal content
// QRCM-6:  Shows source selection dropdowns for left and right
// QRCM-7:  Renders current result in left panel by default
// QRCM-8:  Renders comparison summary when two results are provided
// QRCM-9:  Shows matching columns count in summary
// QRCM-10: Shows unique-to-left and unique-to-right counts in summary
// QRCM-11: Shows row count difference in summary
// QRCM-12: Handles empty results gracefully (no result data message)
// QRCM-13: Renders result table with correct data-testid
// QRCM-14: Accessibility: role=dialog, aria-modal, aria-labelledby
// QRCM-15: Renders saved queries with result_data in source dropdown
// QRCM-16: Shows pinned saved queries in a separate optgroup
// QRCM-17: History queries are shown as disabled options

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  renderWithProviders,
  screen,
  userEvent,
} from "../../helpers/render";
import { resetAllStores } from "../../helpers/stores";
import { useUiStore } from "@/stores/uiStore";
import { useSavedQueryStore } from "@/stores/savedQueryStore";
import { useQueryHistoryStore } from "@/stores/queryHistoryStore";
import { QueryResultComparisonModal } from "@/components/right-panel/QueryResultComparisonModal";

// Mock the API client functions used by stores
vi.mock("@/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/client")>();
  return {
    ...actual,
    apiGet: vi.fn().mockResolvedValue({ history: [], total: 0 }),
    apiDelete: vi.fn().mockResolvedValue({ success: true }),
    apiPatch: vi.fn().mockResolvedValue({}),
    apiPost: vi.fn().mockResolvedValue({}),
  };
});

const currentResult = {
  query: "SELECT id, name FROM users",
  columns: ["id", "name"],
  rows: [
    [1, "Alice"],
    [2, "Bob"],
  ],
  total_rows: 2,
};

const savedQueryWithData = {
  id: "sq-1",
  name: "Sales Query",
  query: "SELECT id, amount FROM sales",
  created_at: "2024-01-01T00:00:00Z",
  result_data: {
    columns: ["id", "amount"],
    rows: [
      [1, 100],
      [2, 200],
      [3, 300],
    ],
    total_rows: 3,
  },
  execution_time_ms: 50,
  folder: "",
  is_pinned: false,
};

const savedQueryPinned = {
  id: "sq-2",
  name: "Pinned Report",
  query: "SELECT id, name, value FROM report",
  created_at: "2024-01-02T00:00:00Z",
  result_data: {
    columns: ["id", "name", "value"],
    rows: [
      [1, "a", 10],
      [2, "b", 20],
    ],
    total_rows: 2,
  },
  execution_time_ms: 30,
  folder: "",
  is_pinned: true,
};

const savedQueryNoData = {
  id: "sq-3",
  name: "No Data Query",
  query: "SELECT * FROM empty",
  created_at: "2024-01-03T00:00:00Z",
  folder: "",
  is_pinned: false,
};

beforeEach(() => {
  resetAllStores();
  // Reset relevant stores to clean state
  useUiStore.setState({
    queryResultComparisonOpen: false,
    comparisonCurrentResult: null,
  });
  useSavedQueryStore.setState({ queries: [], isLoading: false });
  useQueryHistoryStore.setState({
    queries: [],
    isFetching: false,
    fetchHistory: vi.fn(),
  });
});

describe("QRCM-1: Does not render when isOpen is false", () => {
  it("returns null when queryResultComparisonOpen is false", () => {
    renderWithProviders(<QueryResultComparisonModal />);

    expect(
      screen.queryByTestId("query-result-comparison-modal")
    ).not.toBeInTheDocument();
  });
});

describe("QRCM-2: Renders modal when isOpen is true", () => {
  it("renders the modal dialog when queryResultComparisonOpen is true", () => {
    useUiStore.setState({
      queryResultComparisonOpen: true,
      comparisonCurrentResult: currentResult,
    });

    renderWithProviders(<QueryResultComparisonModal />);

    expect(
      screen.getByTestId("query-result-comparison-modal")
    ).toBeInTheDocument();
    expect(screen.getByText("Compare Query Results")).toBeInTheDocument();
  });

  it("renders the close button", () => {
    useUiStore.setState({
      queryResultComparisonOpen: true,
      comparisonCurrentResult: currentResult,
    });

    renderWithProviders(<QueryResultComparisonModal />);

    expect(
      screen.getByTestId("query-result-comparison-close")
    ).toBeInTheDocument();
  });
});

describe("QRCM-3: Closes on Escape key press", () => {
  it("calls closeQueryResultComparison when Escape is pressed", async () => {
    useUiStore.setState({
      queryResultComparisonOpen: true,
      comparisonCurrentResult: currentResult,
    });

    const user = userEvent.setup();
    renderWithProviders(<QueryResultComparisonModal />);

    expect(
      screen.getByTestId("query-result-comparison-modal")
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(useUiStore.getState().queryResultComparisonOpen).toBe(false);
  });
});

describe("QRCM-4: Closes on backdrop click", () => {
  it("closes the modal when the backdrop is clicked", async () => {
    useUiStore.setState({
      queryResultComparisonOpen: true,
      comparisonCurrentResult: currentResult,
    });

    const user = userEvent.setup();
    renderWithProviders(<QueryResultComparisonModal />);

    const backdrop = screen.getByTestId("query-result-comparison-backdrop");
    await user.click(backdrop);

    expect(useUiStore.getState().queryResultComparisonOpen).toBe(false);
  });
});

describe("QRCM-5: Does not close when clicking inside modal content", () => {
  it("keeps modal open when clicking inside the content area", async () => {
    useUiStore.setState({
      queryResultComparisonOpen: true,
      comparisonCurrentResult: currentResult,
    });

    const user = userEvent.setup();
    renderWithProviders(<QueryResultComparisonModal />);

    const content = screen.getByTestId("query-result-comparison-content");
    await user.click(content);

    expect(useUiStore.getState().queryResultComparisonOpen).toBe(true);
  });
});

describe("QRCM-6: Shows source selection dropdowns", () => {
  it("renders left and right source select dropdowns", () => {
    useUiStore.setState({
      queryResultComparisonOpen: true,
      comparisonCurrentResult: currentResult,
    });

    renderWithProviders(<QueryResultComparisonModal />);

    expect(
      screen.getByTestId("query-result-comparison-left-select")
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("query-result-comparison-right-select")
    ).toBeInTheDocument();
  });

  it("includes 'Current Result' option when currentResult is provided", () => {
    useUiStore.setState({
      queryResultComparisonOpen: true,
      comparisonCurrentResult: currentResult,
    });

    renderWithProviders(<QueryResultComparisonModal />);

    const leftSelect = screen.getByTestId(
      "query-result-comparison-left-select"
    );
    const options = leftSelect.querySelectorAll("option");
    const optionTexts = Array.from(options).map((o) => o.textContent);
    expect(optionTexts).toContain("Current Result");
  });
});

describe("QRCM-7: Renders current result in left panel by default", () => {
  it("shows the current result SQL and stats on the left side", () => {
    useUiStore.setState({
      queryResultComparisonOpen: true,
      comparisonCurrentResult: currentResult,
    });

    renderWithProviders(<QueryResultComparisonModal />);

    // Left SQL preview
    expect(
      screen.getByTestId("query-result-comparison-left-sql")
    ).toHaveTextContent("SELECT id, name FROM users");

    // Left stats
    expect(
      screen.getByTestId("query-result-comparison-left-stats")
    ).toHaveTextContent("2 rows");
    expect(
      screen.getByTestId("query-result-comparison-left-stats")
    ).toHaveTextContent("2 columns");
  });

  it("renders the left result table", () => {
    useUiStore.setState({
      queryResultComparisonOpen: true,
      comparisonCurrentResult: currentResult,
    });

    renderWithProviders(<QueryResultComparisonModal />);

    expect(
      screen.getByTestId("comparison-result-table-left")
    ).toBeInTheDocument();
  });
});

describe("QRCM-8: Renders comparison summary when two results are provided", () => {
  it("shows summary when both left and right results are available", () => {
    useUiStore.setState({
      queryResultComparisonOpen: true,
      comparisonCurrentResult: currentResult,
    });
    useSavedQueryStore.setState({
      queries: [savedQueryWithData],
    });

    renderWithProviders(<QueryResultComparisonModal />);

    // The modal should auto-select the saved query for right side
    expect(
      screen.getByTestId("query-result-comparison-summary")
    ).toBeInTheDocument();
    expect(screen.getByText("Comparison Summary")).toBeInTheDocument();
  });
});

describe("QRCM-9: Shows matching columns count in summary", () => {
  it("displays the count of matching columns between left and right", () => {
    // currentResult: columns ["id", "name"]
    // savedQueryWithData: columns ["id", "amount"]
    // matching: "id" (1)
    useUiStore.setState({
      queryResultComparisonOpen: true,
      comparisonCurrentResult: currentResult,
    });
    useSavedQueryStore.setState({
      queries: [savedQueryWithData],
    });

    renderWithProviders(<QueryResultComparisonModal />);

    const matchingCount = screen.getByTestId("summary-matching-count");
    expect(matchingCount).toHaveTextContent("1");
    expect(screen.getByText("Matching columns")).toBeInTheDocument();
  });
});

describe("QRCM-10: Shows unique-to-left and unique-to-right counts", () => {
  it("displays the correct unique column counts", () => {
    // currentResult: ["id", "name"] -> unique left: "name" (1)
    // savedQueryWithData: ["id", "amount"] -> unique right: "amount" (1)
    useUiStore.setState({
      queryResultComparisonOpen: true,
      comparisonCurrentResult: currentResult,
    });
    useSavedQueryStore.setState({
      queries: [savedQueryWithData],
    });

    renderWithProviders(<QueryResultComparisonModal />);

    const uniqueLeft = screen.getByTestId("summary-unique-left-count");
    expect(uniqueLeft).toHaveTextContent("1");
    expect(screen.getByText("Unique to left")).toBeInTheDocument();

    const uniqueRight = screen.getByTestId("summary-unique-right-count");
    expect(uniqueRight).toHaveTextContent("1");
    expect(screen.getByText("Unique to right")).toBeInTheDocument();
  });
});

describe("QRCM-11: Shows row count difference in summary", () => {
  it("displays row count difference when totals differ", () => {
    // currentResult total_rows = 2, savedQueryWithData total_rows = 3
    // diff = 2 - 3 = -1
    useUiStore.setState({
      queryResultComparisonOpen: true,
      comparisonCurrentResult: currentResult,
    });
    useSavedQueryStore.setState({
      queries: [savedQueryWithData],
    });

    renderWithProviders(<QueryResultComparisonModal />);

    const rowDiff = screen.getByTestId("summary-row-diff");
    expect(rowDiff).toBeInTheDocument();
    // Should show "-1" (2 vs 3)
    expect(rowDiff).toHaveTextContent("-1");
    expect(rowDiff).toHaveTextContent("2 vs 3");
  });
});

describe("QRCM-12: Handles empty results gracefully", () => {
  it("shows 'no result data' message when source has no data", () => {
    useUiStore.setState({
      queryResultComparisonOpen: true,
      comparisonCurrentResult: null,
    });

    renderWithProviders(<QueryResultComparisonModal />);

    // The modal is open but with no current result, left source "current" resolves to null
    // Check that the "no result data" fallback message appears
    const noDataMessages = screen.getAllByText(
      "No result data available for this source."
    );
    expect(noDataMessages.length).toBeGreaterThanOrEqual(1);
  });

  it("does not show comparison summary when one side has no data", () => {
    useUiStore.setState({
      queryResultComparisonOpen: true,
      comparisonCurrentResult: currentResult,
    });
    // No saved queries => right side has no data
    useSavedQueryStore.setState({ queries: [] });

    renderWithProviders(<QueryResultComparisonModal />);

    expect(
      screen.queryByTestId("query-result-comparison-summary")
    ).not.toBeInTheDocument();
  });
});

describe("QRCM-13: Result table renders with correct columns and data", () => {
  it("renders column headers in the left result table", () => {
    useUiStore.setState({
      queryResultComparisonOpen: true,
      comparisonCurrentResult: currentResult,
    });

    renderWithProviders(<QueryResultComparisonModal />);

    const leftTable = screen.getByTestId("comparison-result-table-left");
    expect(leftTable).toHaveTextContent("id");
    expect(leftTable).toHaveTextContent("name");
  });

  it("renders cell data in the result table", () => {
    useUiStore.setState({
      queryResultComparisonOpen: true,
      comparisonCurrentResult: currentResult,
    });

    renderWithProviders(<QueryResultComparisonModal />);

    const leftTable = screen.getByTestId("comparison-result-table-left");
    expect(leftTable).toHaveTextContent("Alice");
    expect(leftTable).toHaveTextContent("Bob");
  });
});

describe("QRCM-14: Accessibility attributes", () => {
  it("has role=dialog and aria-modal=true", () => {
    useUiStore.setState({
      queryResultComparisonOpen: true,
      comparisonCurrentResult: currentResult,
    });

    renderWithProviders(<QueryResultComparisonModal />);

    const modal = screen.getByTestId("query-result-comparison-modal");
    expect(modal).toHaveAttribute("role", "dialog");
    expect(modal).toHaveAttribute("aria-modal", "true");
  });

  it("has aria-labelledby pointing to the modal title", () => {
    useUiStore.setState({
      queryResultComparisonOpen: true,
      comparisonCurrentResult: currentResult,
    });

    renderWithProviders(<QueryResultComparisonModal />);

    const modal = screen.getByTestId("query-result-comparison-modal");
    expect(modal).toHaveAttribute(
      "aria-labelledby",
      "query-result-comparison-modal-title"
    );

    const title = document.getElementById(
      "query-result-comparison-modal-title"
    );
    expect(title).toBeInTheDocument();
    expect(title?.textContent).toBe("Compare Query Results");
  });
});

describe("QRCM-15: Saved queries with result_data in dropdown", () => {
  it("shows saved queries with result data as selectable options", () => {
    useUiStore.setState({
      queryResultComparisonOpen: true,
      comparisonCurrentResult: currentResult,
    });
    useSavedQueryStore.setState({
      queries: [savedQueryWithData, savedQueryNoData],
    });

    renderWithProviders(<QueryResultComparisonModal />);

    const rightSelect = screen.getByTestId(
      "query-result-comparison-right-select"
    );
    // savedQueryWithData should be available, savedQueryNoData should not
    expect(rightSelect).toHaveTextContent("Sales Query");
    // "No Data Query" has no result_data so should NOT appear
    const options = rightSelect.querySelectorAll("option");
    const optTexts = Array.from(options).map((o) => o.textContent?.trim());
    expect(optTexts).toContain("Sales Query");
    expect(optTexts).not.toContain("No Data Query");
  });
});

describe("QRCM-16: Pinned saved queries in separate optgroup", () => {
  it("shows pinned queries under a 'Pinned' optgroup", () => {
    useUiStore.setState({
      queryResultComparisonOpen: true,
      comparisonCurrentResult: currentResult,
    });
    useSavedQueryStore.setState({
      queries: [savedQueryPinned, savedQueryWithData],
    });

    renderWithProviders(<QueryResultComparisonModal />);

    const leftSelect = screen.getByTestId(
      "query-result-comparison-left-select"
    );
    const optgroups = leftSelect.querySelectorAll("optgroup");
    const labels = Array.from(optgroups).map((g) => g.getAttribute("label"));
    expect(labels).toContain("Pinned");
    expect(labels).toContain("Saved Queries");
  });
});

describe("QRCM-17: History queries shown as disabled options", () => {
  it("shows history queries as disabled options in the dropdown", () => {
    useUiStore.setState({
      queryResultComparisonOpen: true,
      comparisonCurrentResult: currentResult,
    });
    useQueryHistoryStore.setState({
      queries: [
        {
          id: "hq-1",
          query: "SELECT * FROM logs",
          timestamp: Date.now(),
          status: "success" as const,
        },
      ],
      isFetching: false,
      fetchHistory: vi.fn(),
    });

    renderWithProviders(<QueryResultComparisonModal />);

    const leftSelect = screen.getByTestId(
      "query-result-comparison-left-select"
    );
    const optgroups = leftSelect.querySelectorAll("optgroup");
    const historyGroup = Array.from(optgroups).find(
      (g) => g.getAttribute("label") === "Query History (no data)"
    );
    expect(historyGroup).toBeTruthy();

    // The option should be disabled
    const historyOption = historyGroup!.querySelector("option");
    expect(historyOption).toHaveAttribute("disabled");
  });
});

describe("QRCM-18: Close button works", () => {
  it("closes the modal when the X close button is clicked", async () => {
    useUiStore.setState({
      queryResultComparisonOpen: true,
      comparisonCurrentResult: currentResult,
    });

    const user = userEvent.setup();
    renderWithProviders(<QueryResultComparisonModal />);

    const closeBtn = screen.getByTestId("query-result-comparison-close");
    await user.click(closeBtn);

    expect(useUiStore.getState().queryResultComparisonOpen).toBe(false);
  });
});

describe("QRCM-19: Switching source via dropdown", () => {
  it("updates right side when a different saved query is selected", async () => {
    useUiStore.setState({
      queryResultComparisonOpen: true,
      comparisonCurrentResult: currentResult,
    });
    useSavedQueryStore.setState({
      queries: [savedQueryWithData, savedQueryPinned],
    });

    const user = userEvent.setup();
    renderWithProviders(<QueryResultComparisonModal />);

    // Initially right side should auto-select pinned (first with data that is pinned)
    // or whichever is first with data. Let's switch to "Sales Query".
    const rightSelect = screen.getByTestId(
      "query-result-comparison-right-select"
    );
    await user.selectOptions(rightSelect, `saved:${savedQueryWithData.id}`);

    // Now right side should show savedQueryWithData stats
    expect(
      screen.getByTestId("query-result-comparison-right-stats")
    ).toHaveTextContent("3 rows");
    expect(
      screen.getByTestId("query-result-comparison-right-stats")
    ).toHaveTextContent("2 columns");
  });
});

describe("QRCM-20: Entrance animation classes", () => {
  it("applies animation classes to backdrop and content", () => {
    useUiStore.setState({
      queryResultComparisonOpen: true,
      comparisonCurrentResult: currentResult,
    });

    renderWithProviders(<QueryResultComparisonModal />);

    const backdrop = screen.getByTestId("query-result-comparison-backdrop");
    expect(backdrop).toHaveClass("modal-backdrop-enter");

    const content = screen.getByTestId("query-result-comparison-content");
    expect(content).toHaveClass("modal-scale-enter");
  });
});
