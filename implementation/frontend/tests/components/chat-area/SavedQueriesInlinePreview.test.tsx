// Tests for SavedQueries inline result preview and Copy as CSV
//
// SQ-PREVIEW-1: Preview toggle shows/hides inline table
// SQ-PREVIEW-2: Inline preview renders correct columns and rows
// SQ-PREVIEW-3: Copy as CSV copies data to clipboard
// SQ-PREVIEW-4: Preview shows "Showing N of M rows" for large results
// SQ-PREVIEW-5: Preview toggle button only appears for queries with result_data

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, userEvent } from "../../helpers/render";
import { SavedQueries } from "@/components/chat-area/SavedQueries";
import { useSavedQueryStore } from "@/stores/savedQueryStore";

const MOCK_QUERIES_WITH_RESULTS = [
  {
    id: "q1",
    name: "Top users",
    query: "SELECT name, score FROM users ORDER BY score DESC",
    created_at: "2025-01-01T00:00:00Z",
    result_data: {
      columns: ["name", "score"],
      rows: [
        ["Alice", 95],
        ["Bob", 88],
        ["Charlie", 82],
        ["Diana", 79],
        ["Eve", 75],
        ["Frank", 72],
        ["Grace", 68],
      ],
      total_rows: 100,
    },
  },
  {
    id: "q2",
    name: "Simple count",
    query: "SELECT COUNT(*) FROM users",
    created_at: "2025-01-02T00:00:00Z",
    // No result_data
  },
];

beforeEach(() => {
  useSavedQueryStore.setState({ queries: MOCK_QUERIES_WITH_RESULTS, isLoading: false });
  vi.spyOn(useSavedQueryStore.getState(), "fetchQueries").mockResolvedValue(undefined);
});

describe("SQ-PREVIEW-1: Preview toggle shows/hides inline table", () => {
  it("toggles inline preview on click", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SavedQueries />);

    await user.click(screen.getByTestId("saved-queries-toggle"));

    // Preview should not be visible initially
    expect(screen.queryByTestId("inline-preview-q1")).not.toBeInTheDocument();

    // Click the preview toggle
    await user.click(screen.getByTestId("preview-toggle-q1"));
    expect(screen.getByTestId("inline-preview-q1")).toBeInTheDocument();

    // Click again to hide
    await user.click(screen.getByTestId("preview-toggle-q1"));
    expect(screen.queryByTestId("inline-preview-q1")).not.toBeInTheDocument();
  });
});

describe("SQ-PREVIEW-2: Inline preview renders correct columns and rows", () => {
  it("shows column headers and limited rows", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SavedQueries />);

    await user.click(screen.getByTestId("saved-queries-toggle"));
    await user.click(screen.getByTestId("preview-toggle-q1"));

    const preview = screen.getByTestId("inline-preview-q1");
    // Check column headers
    expect(preview.textContent).toContain("name");
    expect(preview.textContent).toContain("score");
    // Check first row data
    expect(preview.textContent).toContain("Alice");
    expect(preview.textContent).toContain("95");
    // 6th row should NOT be visible (limit is 5)
    expect(preview.textContent).not.toContain("Frank");
  });
});

describe("SQ-PREVIEW-3: Copy as CSV copies data to clipboard", () => {
  it("copies all result data as CSV to clipboard", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });

    renderWithProviders(<SavedQueries />);

    await user.click(screen.getByTestId("saved-queries-toggle"));
    await user.click(screen.getByTestId("preview-toggle-q1"));
    await user.click(screen.getByTestId("copy-csv-q1"));

    expect(writeText).toHaveBeenCalledTimes(1);
    const csvContent = writeText.mock.calls[0][0] as string;
    // Header
    expect(csvContent).toContain("name,score");
    // All rows (not just preview rows)
    expect(csvContent).toContain("Alice,95");
    expect(csvContent).toContain("Frank,72");

    vi.unstubAllGlobals();
  });
});

describe("SQ-PREVIEW-4: Preview footer shows row count", () => {
  it("shows 'Showing 5 of 100 rows' when results are truncated", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SavedQueries />);

    await user.click(screen.getByTestId("saved-queries-toggle"));
    await user.click(screen.getByTestId("preview-toggle-q1"));

    const preview = screen.getByTestId("inline-preview-q1");
    expect(preview.textContent).toContain("Showing 5 of 100 rows");
  });
});

describe("SQ-PREVIEW-5: Preview toggle only for queries with results", () => {
  it("does not show preview toggle for queries without result_data", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SavedQueries />);

    await user.click(screen.getByTestId("saved-queries-toggle"));

    // q1 has result_data, q2 does not
    expect(screen.getByTestId("preview-toggle-q1")).toBeInTheDocument();
    expect(screen.queryByTestId("preview-toggle-q2")).not.toBeInTheDocument();
  });
});
