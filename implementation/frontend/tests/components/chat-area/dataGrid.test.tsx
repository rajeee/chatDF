// Tests: spec/frontend/chat_area/data_grid/spec.md
// Verifies: spec/frontend/chat_area/data_grid/plan.md
//
// DG-SORT-1: Click header sorts ascending
// DG-SORT-2: Second click sorts descending
// DG-SORT-3: Third click removes sort
// DG-PAGE-1: Pagination at 50 rows
// DG-NULL-1: Null cells displayed as italic "null"
// DG-EMPTY-1: Empty state shows "No results"
// DG-COPY-1: Copy as TSV

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderWithProviders, screen, userEvent, within } from "../../helpers/render";
import { DataGrid } from "@/components/chat-area/DataGrid";

// --- Mock clipboard ---
const writeTextMock = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: writeTextMock },
    writable: true,
    configurable: true,
  });
  writeTextMock.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

// Helper to generate test rows
function generateRows(count: number, columns: string[]): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, i) => {
    const row: Record<string, unknown> = {};
    columns.forEach((col) => {
      if (col === "id") {
        row[col] = i + 1;
      } else if (col === "name") {
        row[col] = `Name ${i + 1}`;
      } else if (col === "score") {
        row[col] = Math.round((i + 1) * 1.5);
      } else {
        row[col] = `${col}_value_${i + 1}`;
      }
    });
    return row;
  });
}

const sampleColumns = ["id", "name", "score"];
const sampleRows = generateRows(5, sampleColumns);

describe("DataGrid rendering", () => {
  it("renders column headers", () => {
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={sampleRows} totalRows={5} />
    );
    expect(screen.getByText("id")).toBeInTheDocument();
    expect(screen.getByText("name")).toBeInTheDocument();
    expect(screen.getByText("score")).toBeInTheDocument();
  });

  it("renders row data", () => {
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={sampleRows} totalRows={5} />
    );
    expect(screen.getByText("Name 1")).toBeInTheDocument();
    expect(screen.getByText("Name 5")).toBeInTheDocument();
  });

  it("renders the data-testid for the grid container", () => {
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={sampleRows} totalRows={5} />
    );
    expect(screen.getByTestId("data-grid")).toBeInTheDocument();
  });
});

describe("DG-SORT-1: Click header sorts ascending", () => {
  it("sorts rows ascending when clicking a column header", async () => {
    const user = userEvent.setup();
    const rows: Record<string, unknown>[] = [
      { id: 3, name: "Charlie", score: 90 },
      { id: 1, name: "Alice", score: 70 },
      { id: 2, name: "Bob", score: 80 },
    ];
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={rows} totalRows={3} />
    );

    // Click the "name" header to sort ascending
    const nameHeader = screen.getByRole("columnheader", { name: /name/i });
    await user.click(nameHeader);

    // Get all cells in the table body
    const tbody = screen.getByTestId("data-grid-body");
    const firstRowCells = within(tbody).getAllByRole("cell");
    // First row after sort should be Alice (id=1, name=Alice, score=70)
    // Cells are in order: id, name, score for each row
    expect(firstRowCells[1].textContent).toBe("Alice");
  });
});

describe("DG-SORT-2: Second click sorts descending", () => {
  it("sorts rows descending on second header click", async () => {
    const user = userEvent.setup();
    const rows: Record<string, unknown>[] = [
      { id: 3, name: "Charlie", score: 90 },
      { id: 1, name: "Alice", score: 70 },
      { id: 2, name: "Bob", score: 80 },
    ];
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={rows} totalRows={3} />
    );

    const nameHeader = screen.getByRole("columnheader", { name: /name/i });
    // First click: asc
    await user.click(nameHeader);
    // Second click: desc
    await user.click(nameHeader);

    const tbody = screen.getByTestId("data-grid-body");
    const firstRowCells = within(tbody).getAllByRole("cell");
    // First row after desc sort should be Charlie
    expect(firstRowCells[1].textContent).toBe("Charlie");
  });
});

describe("DG-SORT-3: Third click removes sort", () => {
  it("returns to original order on third header click", async () => {
    const user = userEvent.setup();
    const rows: Record<string, unknown>[] = [
      { id: 3, name: "Charlie", score: 90 },
      { id: 1, name: "Alice", score: 70 },
      { id: 2, name: "Bob", score: 80 },
    ];
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={rows} totalRows={3} />
    );

    const nameHeader = screen.getByRole("columnheader", { name: /name/i });
    // First click: asc
    await user.click(nameHeader);
    // Second click: desc
    await user.click(nameHeader);
    // Third click: unsorted (original order)
    await user.click(nameHeader);

    const tbody = screen.getByTestId("data-grid-body");
    const firstRowCells = within(tbody).getAllByRole("cell");
    // Back to original order: Charlie first
    expect(firstRowCells[1].textContent).toBe("Charlie");
  });
});

describe("DG-PAGE-1: Pagination at 50 rows", () => {
  it("shows only 50 rows per page when more data exists", () => {
    const manyRows = generateRows(120, sampleColumns);
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={manyRows} totalRows={120} />
    );

    const tbody = screen.getByTestId("data-grid-body");
    const dataRows = within(tbody).getAllByRole("row");
    expect(dataRows).toHaveLength(50);
  });

  it("shows page indicator with jump-to-page input", () => {
    const manyRows = generateRows(120, sampleColumns);
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={manyRows} totalRows={120} />
    );

    const pageInput = screen.getByLabelText("Go to page");
    expect(pageInput).toBeInTheDocument();
    expect(pageInput).toHaveValue(1);
    expect(screen.getByText(/of 3/)).toBeInTheDocument();
  });

  it("shows row count indicator", () => {
    const manyRows = generateRows(120, sampleColumns);
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={manyRows} totalRows={120} />
    );

    expect(screen.getByText(/Showing 1/)).toBeInTheDocument();
    expect(screen.getByText(/of 120 rows/)).toBeInTheDocument();
  });

  it("navigates to next page when Next is clicked", async () => {
    const user = userEvent.setup();
    const manyRows = generateRows(120, sampleColumns);
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={manyRows} totalRows={120} />
    );

    const nextBtn = screen.getByRole("button", { name: /next/i });
    await user.click(nextBtn);

    const pageInput = screen.getByLabelText("Go to page");
    expect(pageInput).toHaveValue(2);
    expect(screen.getByText(/of 3/)).toBeInTheDocument();
  });

  it("disables Previous button on first page", () => {
    const manyRows = generateRows(120, sampleColumns);
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={manyRows} totalRows={120} />
    );

    const prevBtn = screen.getByRole("button", { name: /previous/i });
    expect(prevBtn).toBeDisabled();
  });

  it("disables Next button on last page", async () => {
    const user = userEvent.setup();
    const manyRows = generateRows(120, sampleColumns);
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={manyRows} totalRows={120} />
    );

    // Navigate to last page (page 3)
    const nextBtn = screen.getByRole("button", { name: /next/i });
    await user.click(nextBtn); // page 2
    await user.click(nextBtn); // page 3

    expect(nextBtn).toBeDisabled();
  });

  it("does not show pagination controls when rows fit in one page", () => {
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={sampleRows} totalRows={5} />
    );

    expect(screen.queryByRole("button", { name: /next/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /previous/i })).not.toBeInTheDocument();
  });
});

describe("DG-NULL-1: Null cells displayed", () => {
  it("renders null values as italic 'null' text", () => {
    const rows: Record<string, unknown>[] = [
      { id: 1, name: null, score: 100 },
    ];
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={rows} totalRows={1} />
    );

    const nullCell = screen.getByText("null");
    expect(nullCell).toBeInTheDocument();
    expect(nullCell.tagName).toBe("SPAN");
    expect(nullCell).toHaveClass("italic");
  });

  it("renders null values with background tint for visual distinction", () => {
    const rows: Record<string, unknown>[] = [
      { id: 1, name: null, score: 100 },
    ];
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={rows} totalRows={1} />
    );

    const nullCell = screen.getByText("null");
    expect(nullCell).toHaveClass("bg-gray-100");
    expect(nullCell).toHaveClass("rounded");
    expect(nullCell).toHaveClass("text-xs");
  });
});

describe("DG-EMPTY-1: Empty state", () => {
  it("shows 'No results' when rows array is empty", () => {
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={[]} totalRows={0} />
    );

    expect(screen.getByText("No results")).toBeInTheDocument();
  });

  it("still shows column headers when empty", () => {
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={[]} totalRows={0} />
    );

    expect(screen.getByText("id")).toBeInTheDocument();
    expect(screen.getByText("name")).toBeInTheDocument();
    expect(screen.getByText("score")).toBeInTheDocument();
  });
});

describe("DG-COPY-1: Copy as TSV", () => {
  it("renders a copy table button", () => {
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={sampleRows} totalRows={5} />
    );

    expect(screen.getByRole("button", { name: /copy table/i })).toBeInTheDocument();
  });

  it("copies current page as TSV when copy button is clicked", async () => {
    const user = userEvent.setup();
    // Spy after userEvent.setup() so we capture the actual clipboard call
    const clipboardSpy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    const rows: Record<string, unknown>[] = [
      { id: 1, name: "Alice", score: 90 },
      { id: 2, name: "Bob", score: 80 },
    ];
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={rows} totalRows={2} />
    );

    const copyBtn = screen.getByRole("button", { name: /copy table/i });
    await user.click(copyBtn);

    const expectedTSV = "id\tname\tscore\n1\tAlice\t90\n2\tBob\t80";
    expect(clipboardSpy).toHaveBeenCalledWith(expectedTSV);
    clipboardSpy.mockRestore();
  });

  it("shows 'Copied!' feedback after copying", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const rows: Record<string, unknown>[] = [
      { id: 1, name: "Alice", score: 90 },
    ];
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={rows} totalRows={1} />
    );

    const copyBtn = screen.getByRole("button", { name: /copy table/i });
    await user.click(copyBtn);

    expect(screen.getByText("Copied!")).toBeInTheDocument();

    vi.useRealTimers();
  });
});

describe("DG-HOVER-1: Row hover highlight", () => {
  it("applies hover highlight classes to data rows", () => {
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={sampleRows} totalRows={5} />
    );

    const tbody = screen.getByTestId("data-grid-body");
    const dataRows = within(tbody).getAllByRole("row");

    for (const row of dataRows) {
      expect(row.className).toContain("hover:bg-black/[0.04]");
      expect(row.className).toContain("dark:hover:bg-white/[0.06]");
      expect(row.className).toContain("transition-colors");
    }
  });

  it("does not apply hover classes to the empty state row", () => {
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={[]} totalRows={0} />
    );

    const tbody = screen.getByTestId("data-grid-body");
    const rows = within(tbody).getAllByRole("row");
    // The empty state row should not have hover classes
    expect(rows[0].className).not.toContain("hover:bg-black");
  });
});

describe("DG-PAGE-JUMP: Jump-to-page input", () => {
  it("renders page input when there are multiple pages", () => {
    const manyRows = generateRows(120, sampleColumns);
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={manyRows} totalRows={120} />
    );

    const pageInput = screen.getByLabelText("Go to page");
    expect(pageInput).toBeInTheDocument();
    expect(pageInput).toHaveAttribute("type", "number");
    expect(pageInput).toHaveValue(1);
  });

  it("does not render page input when data fits on one page", () => {
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={sampleRows} totalRows={5} />
    );

    expect(screen.queryByLabelText("Go to page")).not.toBeInTheDocument();
  });

  it("navigates to entered page on Enter key", async () => {
    const user = userEvent.setup();
    const manyRows = generateRows(120, sampleColumns);
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={manyRows} totalRows={120} />
    );

    const pageInput = screen.getByLabelText("Go to page");
    await user.clear(pageInput);
    await user.type(pageInput, "3");
    await user.keyboard("{Enter}");

    expect(pageInput).toHaveValue(3);
    // Verify last page content: rows 101-120
    const tbody = screen.getByTestId("data-grid-body");
    const dataRows = within(tbody).getAllByRole("row");
    expect(dataRows).toHaveLength(20); // 120 - 100 = 20 rows on page 3
  });

  it("navigates to entered page on blur", async () => {
    const user = userEvent.setup();
    const manyRows = generateRows(120, sampleColumns);
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={manyRows} totalRows={120} />
    );

    const pageInput = screen.getByLabelText("Go to page");
    await user.clear(pageInput);
    await user.type(pageInput, "2");
    await user.tab(); // blur

    expect(pageInput).toHaveValue(2);
  });

  it("clamps values above pageCount to the last page", async () => {
    const user = userEvent.setup();
    const manyRows = generateRows(120, sampleColumns);
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={manyRows} totalRows={120} />
    );

    const pageInput = screen.getByLabelText("Go to page");
    await user.clear(pageInput);
    await user.type(pageInput, "99");
    await user.keyboard("{Enter}");

    // Should clamp to page 3 (the max)
    expect(pageInput).toHaveValue(3);
  });

  it("clamps values below 1 to the first page", async () => {
    const user = userEvent.setup();
    const manyRows = generateRows(120, sampleColumns);
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={manyRows} totalRows={120} />
    );

    const pageInput = screen.getByLabelText("Go to page");
    await user.clear(pageInput);
    await user.type(pageInput, "0");
    await user.keyboard("{Enter}");

    // Should clamp to page 1 (the min)
    expect(pageInput).toHaveValue(1);
  });

  it("clamps negative values to the first page", async () => {
    const user = userEvent.setup();
    const manyRows = generateRows(120, sampleColumns);
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={manyRows} totalRows={120} />
    );

    const pageInput = screen.getByLabelText("Go to page");
    await user.clear(pageInput);
    await user.type(pageInput, "-5");
    await user.keyboard("{Enter}");

    expect(pageInput).toHaveValue(1);
  });

  it("syncs input value when navigating via Previous/Next buttons", async () => {
    const user = userEvent.setup();
    const manyRows = generateRows(120, sampleColumns);
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={manyRows} totalRows={120} />
    );

    const pageInput = screen.getByLabelText("Go to page");
    expect(pageInput).toHaveValue(1);

    const nextBtn = screen.getByRole("button", { name: /next/i });
    await user.click(nextBtn);
    expect(pageInput).toHaveValue(2);

    await user.click(nextBtn);
    expect(pageInput).toHaveValue(3);

    const prevBtn = screen.getByRole("button", { name: /previous/i });
    await user.click(prevBtn);
    expect(pageInput).toHaveValue(2);
  });
});

describe("DG-SORT-ICONS: Sort indicator SVG icons", () => {
  it("shows unsorted icons on all headers before any click", () => {
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={sampleRows} totalRows={5} />
    );

    const unsortedIcons = screen.getAllByTestId("sort-unsorted-icon");
    // One unsorted icon per column header
    expect(unsortedIcons).toHaveLength(sampleColumns.length);
    // Each should be an SVG element
    for (const icon of unsortedIcons) {
      expect(icon.tagName.toLowerCase()).toBe("svg");
    }
  });

  it("shows ascending SVG icon after clicking a header once", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={sampleRows} totalRows={5} />
    );

    const nameHeader = screen.getByRole("columnheader", { name: /name/i });
    await user.click(nameHeader);

    // The clicked column should show the asc icon
    expect(screen.getByTestId("sort-asc-icon")).toBeInTheDocument();
    expect(screen.getByTestId("sort-asc-icon").tagName.toLowerCase()).toBe("svg");
    // No desc icon should be visible
    expect(screen.queryByTestId("sort-desc-icon")).not.toBeInTheDocument();
    // The other columns should still show unsorted icons
    const unsortedIcons = screen.getAllByTestId("sort-unsorted-icon");
    expect(unsortedIcons).toHaveLength(sampleColumns.length - 1);
  });

  it("shows descending SVG icon after clicking a header twice", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={sampleRows} totalRows={5} />
    );

    const nameHeader = screen.getByRole("columnheader", { name: /name/i });
    await user.click(nameHeader);
    await user.click(nameHeader);

    expect(screen.getByTestId("sort-desc-icon")).toBeInTheDocument();
    expect(screen.getByTestId("sort-desc-icon").tagName.toLowerCase()).toBe("svg");
    expect(screen.queryByTestId("sort-asc-icon")).not.toBeInTheDocument();
  });

  it("shows all unsorted icons after clicking a header three times (sort cleared)", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={sampleRows} totalRows={5} />
    );

    const nameHeader = screen.getByRole("columnheader", { name: /name/i });
    await user.click(nameHeader);
    await user.click(nameHeader);
    await user.click(nameHeader);

    // All columns should revert to unsorted icons
    const unsortedIcons = screen.getAllByTestId("sort-unsorted-icon");
    expect(unsortedIcons).toHaveLength(sampleColumns.length);
    expect(screen.queryByTestId("sort-asc-icon")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sort-desc-icon")).not.toBeInTheDocument();
  });

  it("unsorted icon is hidden by default and visible on group-hover", () => {
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={sampleRows} totalRows={5} />
    );

    const unsortedIcons = screen.getAllByTestId("sort-unsorted-icon");
    for (const icon of unsortedIcons) {
      expect(icon).toHaveClass("opacity-0");
      expect(icon).toHaveClass("group-hover:opacity-40");
    }
  });
});

describe("DG-ZEBRA: Zebra striping on table rows", () => {
  it("applies zebra striping classes to odd rows", () => {
    const rows: Record<string, unknown>[] = [
      { id: 1, name: "Alice", score: 90 },
      { id: 2, name: "Bob", score: 80 },
      { id: 3, name: "Charlie", score: 70 },
      { id: 4, name: "Dave", score: 60 },
    ];
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={rows} totalRows={4} />
    );

    const tbody = screen.getByTestId("data-grid-body");
    const dataRows = within(tbody).getAllByRole("row");

    // Even-index rows (0, 2) should NOT have zebra class
    expect(dataRows[0].className).not.toContain("bg-black/[0.02]");
    expect(dataRows[2].className).not.toContain("bg-black/[0.02]");

    // Odd-index rows (1, 3) SHOULD have zebra class
    expect(dataRows[1].className).toContain("bg-black/[0.02]");
    expect(dataRows[1].className).toContain("dark:bg-white/[0.02]");
    expect(dataRows[3].className).toContain("bg-black/[0.02]");
    expect(dataRows[3].className).toContain("dark:bg-white/[0.02]");
  });

  it("preserves hover classes alongside zebra striping", () => {
    const rows: Record<string, unknown>[] = [
      { id: 1, name: "Alice", score: 90 },
      { id: 2, name: "Bob", score: 80 },
    ];
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={rows} totalRows={2} />
    );

    const tbody = screen.getByTestId("data-grid-body");
    const dataRows = within(tbody).getAllByRole("row");

    // Both rows should still have hover classes
    for (const row of dataRows) {
      expect(row.className).toContain("hover:bg-black/[0.04]");
      expect(row.className).toContain("dark:hover:bg-white/[0.06]");
    }
  });
});

describe("DG-SORT-HEADER: Active sort column header accent background", () => {
  it("adds bg-accent/5 class to the sorted column header", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={sampleRows} totalRows={5} />
    );

    // Before sorting, no header should have the accent class
    const headers = screen.getAllByRole("columnheader");
    for (const header of headers) {
      expect(header.className).not.toContain("bg-accent/5");
    }

    // Click "name" header to sort
    const nameHeader = screen.getByRole("columnheader", { name: /name/i });
    await user.click(nameHeader);

    // Now the name header should have the accent background
    expect(nameHeader.className).toContain("bg-accent/5");

    // Other headers should NOT have it
    const idHeader = screen.getByRole("columnheader", { name: /^id$/i });
    const scoreHeader = screen.getByRole("columnheader", { name: /score/i });
    expect(idHeader.className).not.toContain("bg-accent/5");
    expect(scoreHeader.className).not.toContain("bg-accent/5");
  });

  it("keeps bg-accent/5 on desc sort (second click)", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={sampleRows} totalRows={5} />
    );

    const nameHeader = screen.getByRole("columnheader", { name: /name/i });
    await user.click(nameHeader); // asc
    await user.click(nameHeader); // desc

    expect(nameHeader.className).toContain("bg-accent/5");
  });

  it("removes bg-accent/5 when sort is cleared (third click)", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={sampleRows} totalRows={5} />
    );

    const nameHeader = screen.getByRole("columnheader", { name: /name/i });
    await user.click(nameHeader); // asc
    await user.click(nameHeader); // desc
    await user.click(nameHeader); // clear

    expect(nameHeader.className).not.toContain("bg-accent/5");
  });
});

describe("Numeric alignment", () => {
  it("right-aligns numeric values", () => {
    const rows: Record<string, unknown>[] = [
      { id: 1, name: "Alice", score: 90 },
    ];
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={rows} totalRows={1} />
    );

    // Find the cell containing the numeric value "90"
    const scoreCell = screen.getByText("90").closest("td");
    expect(scoreCell).toHaveClass("text-right");
  });
});
