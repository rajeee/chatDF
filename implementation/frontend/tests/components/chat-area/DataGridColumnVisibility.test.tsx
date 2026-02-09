// Tests for DataGrid column visibility toggle feature.
//
// DG-COLVIS-1: Columns button appears in toolbar
// DG-COLVIS-2: Clicking Columns button opens dropdown with all column names
// DG-COLVIS-3: Unchecking a column hides it from the table
// DG-COLVIS-4: Show All resets all columns to visible
// DG-COLVIS-5: Hide All hides all columns
// DG-COLVIS-6: Hidden columns are excluded from copy TSV
// DG-COLVIS-7: Dropdown closes when clicking outside

import { describe, it, expect, vi, beforeEach } from "vitest";
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

const sampleColumns = ["id", "name", "score"];
const sampleRows: Record<string, unknown>[] = [
  { id: 1, name: "Alice", score: 90 },
  { id: 2, name: "Bob", score: 80 },
  { id: 3, name: "Charlie", score: 70 },
];

describe("DG-COLVIS-1: Columns button appears in toolbar", () => {
  it("renders a Columns button", () => {
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={sampleRows} totalRows={3} />
    );
    expect(
      screen.getByRole("button", { name: /toggle column visibility/i })
    ).toBeInTheDocument();
  });

  it("displays 'Columns' text on the button", () => {
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={sampleRows} totalRows={3} />
    );
    expect(screen.getByText("Columns")).toBeInTheDocument();
  });
});

describe("DG-COLVIS-2: Clicking Columns button opens dropdown", () => {
  it("does not show dropdown initially", () => {
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={sampleRows} totalRows={3} />
    );
    expect(screen.queryByTestId("columns-dropdown")).not.toBeInTheDocument();
  });

  it("shows dropdown with all column names when clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={sampleRows} totalRows={3} />
    );

    const columnsBtn = screen.getByRole("button", { name: /toggle column visibility/i });
    await user.click(columnsBtn);

    const dropdown = screen.getByTestId("columns-dropdown");
    expect(dropdown).toBeInTheDocument();

    // Each column should appear as a checkbox label in the dropdown
    const checkboxes = within(dropdown).getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(sampleColumns.length);

    // Verify column names are shown
    for (const col of sampleColumns) {
      expect(within(dropdown).getByText(col)).toBeInTheDocument();
    }
  });

  it("all checkboxes are checked by default", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={sampleRows} totalRows={3} />
    );

    const columnsBtn = screen.getByRole("button", { name: /toggle column visibility/i });
    await user.click(columnsBtn);

    const dropdown = screen.getByTestId("columns-dropdown");
    const checkboxes = within(dropdown).getAllByRole("checkbox");
    for (const cb of checkboxes) {
      expect(cb).toBeChecked();
    }
  });

  it("toggles dropdown open/closed on repeated clicks", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={sampleRows} totalRows={3} />
    );

    const columnsBtn = screen.getByRole("button", { name: /toggle column visibility/i });

    // Open
    await user.click(columnsBtn);
    expect(screen.getByTestId("columns-dropdown")).toBeInTheDocument();

    // Close
    await user.click(columnsBtn);
    expect(screen.queryByTestId("columns-dropdown")).not.toBeInTheDocument();
  });
});

describe("DG-COLVIS-3: Unchecking a column hides it from the table", () => {
  it("hides a column header when its checkbox is unchecked", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={sampleRows} totalRows={3} />
    );

    // Initially all 3 column headers are visible
    expect(screen.getAllByRole("columnheader")).toHaveLength(3);

    // Open dropdown and uncheck "name"
    const columnsBtn = screen.getByRole("button", { name: /toggle column visibility/i });
    await user.click(columnsBtn);

    const dropdown = screen.getByTestId("columns-dropdown");
    const nameCheckbox = within(dropdown).getAllByRole("checkbox")[1]; // "name" is 2nd column
    await user.click(nameCheckbox);

    // Now only 2 column headers should be visible
    expect(screen.getAllByRole("columnheader")).toHaveLength(2);

    // "name" header should be gone; "id" and "score" remain
    const headers = screen.getAllByRole("columnheader");
    const headerTexts = headers.map((h) => h.textContent?.replace(/\s+/g, " ").trim());
    expect(headerTexts).not.toContain("name");
  });

  it("hides column data cells when column is hidden", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={sampleRows} totalRows={3} />
    );

    // "Alice" should be visible initially
    expect(screen.getByText("Alice")).toBeInTheDocument();

    // Open dropdown and uncheck "name"
    const columnsBtn = screen.getByRole("button", { name: /toggle column visibility/i });
    await user.click(columnsBtn);

    const dropdown = screen.getByTestId("columns-dropdown");
    const nameCheckbox = within(dropdown).getAllByRole("checkbox")[1];
    await user.click(nameCheckbox);

    // "Alice", "Bob", "Charlie" should no longer be in data cells
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    expect(screen.queryByText("Bob")).not.toBeInTheDocument();
    expect(screen.queryByText("Charlie")).not.toBeInTheDocument();
  });

  it("re-shows a column when its checkbox is re-checked", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={sampleRows} totalRows={3} />
    );

    const columnsBtn = screen.getByRole("button", { name: /toggle column visibility/i });
    await user.click(columnsBtn);

    const dropdown = screen.getByTestId("columns-dropdown");
    const nameCheckbox = within(dropdown).getAllByRole("checkbox")[1];

    // Hide
    await user.click(nameCheckbox);
    expect(screen.getAllByRole("columnheader")).toHaveLength(2);

    // Show again
    await user.click(nameCheckbox);
    expect(screen.getAllByRole("columnheader")).toHaveLength(3);
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });
});

describe("DG-COLVIS-4: Show All resets visibility", () => {
  it("restores all columns after some were hidden", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={sampleRows} totalRows={3} />
    );

    const columnsBtn = screen.getByRole("button", { name: /toggle column visibility/i });
    await user.click(columnsBtn);

    const dropdown = screen.getByTestId("columns-dropdown");

    // Hide "name" and "score"
    const checkboxes = within(dropdown).getAllByRole("checkbox");
    await user.click(checkboxes[1]); // hide name
    await user.click(checkboxes[2]); // hide score
    expect(screen.getAllByRole("columnheader")).toHaveLength(1);

    // Click "Show All"
    const showAllBtn = within(dropdown).getByText("Show All");
    await user.click(showAllBtn);

    // All columns should be back
    expect(screen.getAllByRole("columnheader")).toHaveLength(3);
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });
});

describe("DG-COLVIS-5: Hide All hides all columns", () => {
  it("hides all column headers when Hide All is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={sampleRows} totalRows={3} />
    );

    const columnsBtn = screen.getByRole("button", { name: /toggle column visibility/i });
    await user.click(columnsBtn);

    const dropdown = screen.getByTestId("columns-dropdown");
    const hideAllBtn = within(dropdown).getByText("Hide All");
    await user.click(hideAllBtn);

    // No column headers should be visible
    expect(screen.queryAllByRole("columnheader")).toHaveLength(0);
  });
});

describe("DG-COLVIS-6: Hidden columns excluded from copy", () => {
  it("excludes hidden columns from TSV copy", async () => {
    const user = userEvent.setup();
    const clipboardSpy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);

    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={sampleRows} totalRows={3} />
    );

    // Open dropdown and hide "score"
    const columnsBtn = screen.getByRole("button", { name: /toggle column visibility/i });
    await user.click(columnsBtn);

    const dropdown = screen.getByTestId("columns-dropdown");
    const scoreCheckbox = within(dropdown).getAllByRole("checkbox")[2];
    await user.click(scoreCheckbox);

    // Copy table
    const copyBtn = screen.getByRole("button", { name: /copy table/i });
    await user.click(copyBtn);

    // TSV should only have id and name columns
    const expectedTSV = "id\tname\n1\tAlice\n2\tBob\n3\tCharlie";
    expect(clipboardSpy).toHaveBeenCalledWith(expectedTSV);
    clipboardSpy.mockRestore();
  });
});

describe("DG-COLVIS-7: Dropdown closes when clicking outside", () => {
  it("closes the dropdown when clicking outside of it", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={sampleRows} totalRows={3} />
    );

    // Open dropdown
    const columnsBtn = screen.getByRole("button", { name: /toggle column visibility/i });
    await user.click(columnsBtn);
    expect(screen.getByTestId("columns-dropdown")).toBeInTheDocument();

    // Click outside (on the data-grid container)
    const grid = screen.getByTestId("data-grid");
    await user.click(grid);

    expect(screen.queryByTestId("columns-dropdown")).not.toBeInTheDocument();
  });
});
