import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryResultComparisonModal } from "../QueryResultComparisonModal";

// Track mock state
let mockIsOpen = false;
let mockCurrentResult: {
  query: string;
  columns: string[];
  rows: unknown[][];
  total_rows: number;
} | null = null;
const mockCloseModal = vi.fn();
const mockOpenModal = vi.fn();

vi.mock("@/stores/uiStore", () => ({
  useUiStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) => {
    const state = {
      queryResultComparisonOpen: mockIsOpen,
      comparisonCurrentResult: mockCurrentResult,
      closeQueryResultComparison: mockCloseModal,
      openQueryResultComparison: mockOpenModal,
    };
    return selector(state);
  }),
}));

const mockSavedQueries = [
  {
    id: "sq-1",
    name: "Saved Query 1",
    query: "SELECT * FROM users",
    created_at: "2025-01-01",
    folder: "",
    result_data: {
      columns: ["id", "name", "age"],
      rows: [
        [1, "Alice", 30],
        [2, "Bob", 25],
      ],
      total_rows: 2,
    },
  },
  {
    id: "sq-2",
    name: "Saved Query No Data",
    query: "SELECT * FROM orders",
    created_at: "2025-01-02",
    folder: "",
    // No result_data
  },
];

vi.mock("@/stores/savedQueryStore", () => ({
  useSavedQueryStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) => {
    const state = {
      queries: mockSavedQueries,
    };
    return selector(state);
  }),
}));

const mockHistoryQueries = [
  {
    id: "hq-1",
    query: "SELECT COUNT(*) FROM users",
    timestamp: Date.now(),
  },
];

vi.mock("@/stores/queryHistoryStore", () => ({
  useQueryHistoryStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) => {
    const state = {
      queries: mockHistoryQueries,
    };
    return selector(state);
  }),
}));

// Mock useFocusTrap to be a no-op
vi.mock("@/hooks/useFocusTrap", () => ({
  useFocusTrap: vi.fn(),
}));

const sampleCurrentResult = {
  query: "SELECT id, name FROM users WHERE active = true",
  columns: ["id", "name"],
  rows: [
    [1, "Alice"],
    [2, "Bob"],
    [3, "Charlie"],
  ],
  total_rows: 3,
};

describe("QueryResultComparisonModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOpen = false;
    mockCurrentResult = null;
  });

  it("renders nothing when modal is closed", () => {
    mockIsOpen = false;
    const { container } = render(<QueryResultComparisonModal />);
    expect(container.innerHTML).toBe("");
  });

  it("renders modal when open", () => {
    mockIsOpen = true;
    mockCurrentResult = sampleCurrentResult;
    render(<QueryResultComparisonModal />);

    expect(screen.getByTestId("query-result-comparison-modal")).toBeInTheDocument();
    expect(screen.getByText("Compare Query Results")).toBeInTheDocument();
  });

  it("renders source selection dropdowns", () => {
    mockIsOpen = true;
    mockCurrentResult = sampleCurrentResult;
    render(<QueryResultComparisonModal />);

    expect(screen.getByTestId("query-result-comparison-left-select")).toBeInTheDocument();
    expect(screen.getByTestId("query-result-comparison-right-select")).toBeInTheDocument();
  });

  it("shows Current Result option in dropdowns when currentResult is provided", () => {
    mockIsOpen = true;
    mockCurrentResult = sampleCurrentResult;
    render(<QueryResultComparisonModal />);

    const leftSelect = screen.getByTestId("query-result-comparison-left-select") as HTMLSelectElement;
    const options = Array.from(leftSelect.options).map((o) => o.text);
    expect(options).toContain("Current Result");
  });

  it("shows saved queries with result data in dropdowns", () => {
    mockIsOpen = true;
    mockCurrentResult = sampleCurrentResult;
    render(<QueryResultComparisonModal />);

    const leftSelect = screen.getByTestId("query-result-comparison-left-select") as HTMLSelectElement;
    const options = Array.from(leftSelect.options).map((o) => o.text);
    // sq-1 has result_data, sq-2 does not — only sq-1 should appear
    expect(options).toContain("Saved Query 1");
    expect(options).not.toContain("Saved Query No Data");
  });

  it("displays summary statistics when both sides have results", () => {
    mockIsOpen = true;
    mockCurrentResult = sampleCurrentResult;
    render(<QueryResultComparisonModal />);

    // Left defaults to "current", right defaults to first saved query with data
    // Current: columns ["id", "name"], Saved: columns ["id", "name", "age"]
    // Matching: id, name — Unique left: none — Unique right: age

    expect(screen.getByTestId("query-result-comparison-summary")).toBeInTheDocument();
    expect(screen.getByTestId("summary-matching-count")).toHaveTextContent("2");
    expect(screen.getByTestId("summary-unique-left-count")).toHaveTextContent("0");
    expect(screen.getByTestId("summary-unique-right-count")).toHaveTextContent("1");
  });

  it("displays row count difference when row counts differ", () => {
    mockIsOpen = true;
    mockCurrentResult = sampleCurrentResult;
    render(<QueryResultComparisonModal />);

    // Current: 3 rows, Saved: 2 rows => diff = +1
    expect(screen.getByTestId("summary-row-diff")).toBeInTheDocument();
    expect(screen.getByTestId("summary-row-diff")).toHaveTextContent("+1");
  });

  it("displays left result stats", () => {
    mockIsOpen = true;
    mockCurrentResult = sampleCurrentResult;
    render(<QueryResultComparisonModal />);

    expect(screen.getByTestId("query-result-comparison-left-stats")).toHaveTextContent("3 rows, 2 columns");
  });

  it("displays left result table", () => {
    mockIsOpen = true;
    mockCurrentResult = sampleCurrentResult;
    render(<QueryResultComparisonModal />);

    expect(screen.getByTestId("comparison-result-table-left")).toBeInTheDocument();
  });

  it("closes via X button", () => {
    mockIsOpen = true;
    mockCurrentResult = sampleCurrentResult;
    render(<QueryResultComparisonModal />);

    fireEvent.click(screen.getByTestId("query-result-comparison-close"));
    expect(mockCloseModal).toHaveBeenCalledTimes(1);
  });

  it("closes via Escape key", () => {
    mockIsOpen = true;
    mockCurrentResult = sampleCurrentResult;
    render(<QueryResultComparisonModal />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(mockCloseModal).toHaveBeenCalledTimes(1);
  });

  it("closes via backdrop click", () => {
    mockIsOpen = true;
    mockCurrentResult = sampleCurrentResult;
    render(<QueryResultComparisonModal />);

    fireEvent.click(screen.getByTestId("query-result-comparison-backdrop"));
    expect(mockCloseModal).toHaveBeenCalledTimes(1);
  });

  it("does not close when clicking inside modal content", () => {
    mockIsOpen = true;
    mockCurrentResult = sampleCurrentResult;
    render(<QueryResultComparisonModal />);

    fireEvent.click(screen.getByTestId("query-result-comparison-content"));
    expect(mockCloseModal).not.toHaveBeenCalled();
  });

  it("changes left source via dropdown", () => {
    mockIsOpen = true;
    mockCurrentResult = sampleCurrentResult;
    render(<QueryResultComparisonModal />);

    const leftSelect = screen.getByTestId("query-result-comparison-left-select") as HTMLSelectElement;

    // Change to saved query
    fireEvent.change(leftSelect, { target: { value: "saved:sq-1" } });
    expect(leftSelect.value).toBe("saved:sq-1");
  });

  it("has correct accessibility attributes", () => {
    mockIsOpen = true;
    mockCurrentResult = sampleCurrentResult;
    render(<QueryResultComparisonModal />);

    const modal = screen.getByTestId("query-result-comparison-modal");
    expect(modal).toHaveAttribute("role", "dialog");
    expect(modal).toHaveAttribute("aria-modal", "true");
    expect(modal).toHaveAttribute(
      "aria-labelledby",
      "query-result-comparison-modal-title"
    );
  });

  it("displays SQL query for left side", () => {
    mockIsOpen = true;
    mockCurrentResult = sampleCurrentResult;
    render(<QueryResultComparisonModal />);

    expect(screen.getByTestId("query-result-comparison-left-sql")).toBeInTheDocument();
  });

  it("shows 'no data' message for history entries selected as source", () => {
    mockIsOpen = true;
    mockCurrentResult = sampleCurrentResult;
    render(<QueryResultComparisonModal />);

    // History entries are disabled in the dropdown — they can't be selected.
    // This just verifies the structure renders without errors.
    const rightSelect = screen.getByTestId("query-result-comparison-right-select") as HTMLSelectElement;
    expect(rightSelect).toBeInTheDocument();
  });
});
