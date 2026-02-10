// Tests for SavedQueries component
//
// Covers: render with queries, empty state, copy to clipboard, pin/unpin toggle,
// delete interaction, folder grouping, inline result preview, CSV export
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderWithProviders, screen, userEvent, within } from "../../helpers/render";
import { SavedQueries } from "@/components/chat-area/SavedQueries";
import { useSavedQueryStore, type SavedQuery } from "@/stores/savedQueryStore";
import { useUiStore } from "@/stores/uiStore";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

function makeQuery(overrides: Partial<SavedQuery> = {}): SavedQuery {
  return {
    id: "q1",
    name: "All users",
    query: "SELECT * FROM users",
    created_at: "2025-01-01T00:00:00Z",
    folder: "",
    is_pinned: false,
    ...overrides,
  };
}

const RESULT_DATA_SMALL = {
  columns: ["id", "name"],
  rows: [
    [1, "Alice"],
    [2, "Bob"],
  ],
  total_rows: 2,
};

const RESULT_DATA_LARGE = {
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
  total_rows: 200,
};

// ---------------------------------------------------------------------------
// Clipboard mock (module-level, same pattern as dataGrid.test.tsx)
// ---------------------------------------------------------------------------

Object.defineProperty(navigator, "clipboard", {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
  writable: true,
  configurable: true,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Reset store state
  useSavedQueryStore.setState({ queries: [], isLoading: false });

  // Prevent real API calls from fetchQueries
  vi.spyOn(useSavedQueryStore.getState(), "fetchQueries").mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Seed the store with given queries and render the component. */
function renderSavedQueries(
  queries: SavedQuery[],
  props: { onRunQuery?: (q: string) => void } = {},
) {
  useSavedQueryStore.setState({ queries, isLoading: false });
  // Re-stub fetchQueries after setState (setState replaces the object)
  vi.spyOn(useSavedQueryStore.getState(), "fetchQueries").mockResolvedValue(undefined);
  return renderWithProviders(<SavedQueries {...props} />);
}

/** Expand the saved queries panel by clicking the toggle. */
async function expandPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("saved-queries-toggle"));
}

// ===========================================================================
// 1. Renders saved queries list when store has queries
// ===========================================================================

describe("SavedQueries - renders list", () => {
  it("shows the toggle button with query count", () => {
    renderSavedQueries([makeQuery({ id: "q1" }), makeQuery({ id: "q2", name: "Order count" })]);

    const toggle = screen.getByTestId("saved-queries-toggle");
    expect(toggle.textContent).toContain("Saved Queries (2)");
  });

  it("displays each query name and SQL text when expanded", async () => {
    const user = userEvent.setup();
    renderSavedQueries([
      makeQuery({ id: "q1", name: "All users", query: "SELECT * FROM users" }),
      makeQuery({ id: "q2", name: "Orders", query: "SELECT * FROM orders" }),
    ]);

    await expandPanel(user);

    expect(screen.getByTestId("saved-query-q1")).toBeDefined();
    expect(screen.getByTestId("saved-query-q2")).toBeDefined();

    const row1 = screen.getByTestId("saved-query-q1");
    expect(row1.textContent).toContain("All users");
    expect(row1.textContent).toContain("SELECT * FROM users");

    const row2 = screen.getByTestId("saved-query-q2");
    expect(row2.textContent).toContain("Orders");
    expect(row2.textContent).toContain("SELECT * FROM orders");
  });

  it("shows execution time badge when execution_time_ms is present", async () => {
    const user = userEvent.setup();
    renderSavedQueries([
      makeQuery({ id: "q1", execution_time_ms: 42 }),
      makeQuery({ id: "q2", execution_time_ms: 1500 }),
    ]);

    await expandPanel(user);

    expect(screen.getByTestId("exec-time-q1").textContent).toBe("42ms");
    expect(screen.getByTestId("exec-time-q2").textContent).toBe("1.5s");
  });

  it("shows row count badge when result_data is present", async () => {
    const user = userEvent.setup();
    renderSavedQueries([
      makeQuery({ id: "q1", result_data: RESULT_DATA_SMALL }),
    ]);

    await expandPanel(user);

    const row = screen.getByTestId("saved-query-q1");
    expect(row.textContent).toContain("2 rows");
  });

  it("queries are hidden by default and shown after clicking toggle", async () => {
    const user = userEvent.setup();
    renderSavedQueries([makeQuery({ id: "q1" })]);

    // Not yet expanded -- query row should not be in the DOM
    expect(screen.queryByTestId("saved-query-q1")).toBeNull();

    await expandPanel(user);

    expect(screen.getByTestId("saved-query-q1")).toBeDefined();
  });
});

// ===========================================================================
// 2. Empty state when no saved queries
// ===========================================================================

describe("SavedQueries - empty state", () => {
  it("renders nothing when store has no queries and is not loading", () => {
    renderSavedQueries([]);

    expect(screen.queryByTestId("saved-queries")).toBeNull();
    expect(screen.queryByTestId("saved-queries-toggle")).toBeNull();
  });
});

// ===========================================================================
// 3. Copy to clipboard functionality
// ===========================================================================

describe("SavedQueries - copy to clipboard", () => {
  it("copies query text to clipboard when clicking a query row", async () => {
    const user = userEvent.setup();
    renderSavedQueries([
      makeQuery({ id: "q1", query: "SELECT id FROM users" }),
    ]);
    // Spy after userEvent.setup() so we capture the actual clipboard call
    const clipboardSpy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);

    await expandPanel(user);
    await user.click(screen.getByTestId("saved-query-q1"));

    expect(clipboardSpy).toHaveBeenCalledWith("SELECT id FROM users");
    clipboardSpy.mockRestore();
  });

  it("shows 'Copied!' indicator after clicking a query row", async () => {
    const user = userEvent.setup();
    renderSavedQueries([makeQuery({ id: "q1" })]);
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);

    await expandPanel(user);
    await user.click(screen.getByTestId("saved-query-q1"));

    const row = screen.getByTestId("saved-query-q1");
    expect(row.textContent).toContain("Copied!");
  });
});

// ===========================================================================
// 4. Pin/unpin toggle
// ===========================================================================

describe("SavedQueries - pin/unpin toggle", () => {
  it("calls togglePin when clicking the pin button", async () => {
    const user = userEvent.setup();
    const togglePinSpy = vi.fn().mockResolvedValue(undefined);
    renderSavedQueries([makeQuery({ id: "q1", name: "Test Query", is_pinned: false })]);
    vi.spyOn(useSavedQueryStore.getState(), "togglePin").mockImplementation(togglePinSpy);

    await expandPanel(user);
    await user.click(screen.getByTestId("pin-saved-query-q1"));

    expect(togglePinSpy).toHaveBeenCalledWith("q1");
  });

  it("pin button has correct aria-label for unpinned queries", async () => {
    const user = userEvent.setup();
    renderSavedQueries([makeQuery({ id: "q1", name: "Test Q", is_pinned: false })]);

    await expandPanel(user);

    const btn = screen.getByTestId("pin-saved-query-q1");
    expect(btn.getAttribute("aria-label")).toBe("Pin Test Q");
  });

  it("pin button has correct aria-label for pinned queries", async () => {
    const user = userEvent.setup();
    renderSavedQueries([makeQuery({ id: "q1", name: "Test Q", is_pinned: true })]);

    await expandPanel(user);

    const btn = screen.getByTestId("pin-saved-query-q1");
    expect(btn.getAttribute("aria-label")).toBe("Unpin Test Q");
  });
});

// ===========================================================================
// 5. Delete query interaction
// ===========================================================================

describe("SavedQueries - delete", () => {
  it("calls deleteQuery when clicking the delete button", async () => {
    const user = userEvent.setup();
    const deleteSpy = vi.fn().mockResolvedValue(undefined);
    renderSavedQueries([makeQuery({ id: "q1" })]);
    vi.spyOn(useSavedQueryStore.getState(), "deleteQuery").mockImplementation(deleteSpy);

    await expandPanel(user);
    await user.click(screen.getByTestId("delete-saved-query-q1"));

    expect(deleteSpy).toHaveBeenCalledWith("q1");
  });

  it("delete button has correct aria-label", async () => {
    const user = userEvent.setup();
    renderSavedQueries([makeQuery({ id: "q1", name: "My Query" })]);

    await expandPanel(user);

    const btn = screen.getByTestId("delete-saved-query-q1");
    expect(btn.getAttribute("aria-label")).toBe("Delete saved query My Query");
  });

  it("delete button does not trigger copy (stopPropagation)", async () => {
    const user = userEvent.setup();
    const deleteSpy = vi.fn().mockResolvedValue(undefined);
    renderSavedQueries([makeQuery({ id: "q1" })]);
    vi.spyOn(useSavedQueryStore.getState(), "deleteQuery").mockImplementation(deleteSpy);
    const clipboardSpy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);

    await expandPanel(user);
    await user.click(screen.getByTestId("delete-saved-query-q1"));

    // Clipboard should NOT have been invoked (stopPropagation prevents row click)
    expect(clipboardSpy).not.toHaveBeenCalled();
    clipboardSpy.mockRestore();
  });
});

// ===========================================================================
// 6. Folder grouping display
// ===========================================================================

describe("SavedQueries - folder grouping", () => {
  it("groups queries by folder when multiple folders exist", async () => {
    const user = userEvent.setup();
    renderSavedQueries([
      makeQuery({ id: "q1", name: "Alpha query", folder: "Analytics" }),
      makeQuery({ id: "q2", name: "Beta query", folder: "Reports" }),
      makeQuery({ id: "q3", name: "Gamma query", folder: "" }),
    ]);

    await expandPanel(user);

    // Folder headers should be present
    expect(screen.getByTestId("folder-header-Analytics")).toBeDefined();
    expect(screen.getByTestId("folder-header-Reports")).toBeDefined();
    expect(screen.getByTestId("folder-header-uncategorized")).toBeDefined();

    // Folder containers should be present
    expect(screen.getByTestId("saved-query-folder-Analytics")).toBeDefined();
    expect(screen.getByTestId("saved-query-folder-Reports")).toBeDefined();
    expect(screen.getByTestId("saved-query-folder-uncategorized")).toBeDefined();
  });

  it("folder headers show the query count", async () => {
    const user = userEvent.setup();
    renderSavedQueries([
      makeQuery({ id: "q1", folder: "Analytics" }),
      makeQuery({ id: "q2", folder: "Analytics" }),
      makeQuery({ id: "q3", folder: "" }),
    ]);

    await expandPanel(user);

    const analyticsHeader = screen.getByTestId("folder-header-Analytics");
    expect(analyticsHeader.textContent).toContain("(2)");
  });

  it("clicking a folder header collapses/expands that folder", async () => {
    const user = userEvent.setup();
    renderSavedQueries([
      makeQuery({ id: "q1", name: "In analytics", folder: "Analytics" }),
      makeQuery({ id: "q2", name: "In reports", folder: "Reports" }),
    ]);

    await expandPanel(user);

    // Both queries visible initially
    expect(screen.getByTestId("saved-query-q1")).toBeDefined();
    expect(screen.getByTestId("saved-query-q2")).toBeDefined();

    // Collapse Analytics folder
    await user.click(screen.getByTestId("folder-header-Analytics"));

    // Query in Analytics should disappear, Reports query should remain
    expect(screen.queryByTestId("saved-query-q1")).toBeNull();
    expect(screen.getByTestId("saved-query-q2")).toBeDefined();

    // Expand Analytics folder again
    await user.click(screen.getByTestId("folder-header-Analytics"));
    expect(screen.getByTestId("saved-query-q1")).toBeDefined();
  });

  it("shows flat list (no folder headers) when all queries are in the same folder", async () => {
    const user = userEvent.setup();
    renderSavedQueries([
      makeQuery({ id: "q1", folder: "" }),
      makeQuery({ id: "q2", folder: "" }),
    ]);

    await expandPanel(user);

    // Queries should be visible
    expect(screen.getByTestId("saved-query-q1")).toBeDefined();
    expect(screen.getByTestId("saved-query-q2")).toBeDefined();

    // No folder headers for single-group case
    expect(screen.queryByTestId("folder-header-uncategorized")).toBeNull();
  });

  it("named folders appear before uncategorized", async () => {
    const user = userEvent.setup();
    renderSavedQueries([
      makeQuery({ id: "q1", folder: "" }),
      makeQuery({ id: "q2", folder: "Zebra" }),
    ]);

    await expandPanel(user);

    // Both folder headers exist
    const zebraFolder = screen.getByTestId("saved-query-folder-Zebra");
    const uncatFolder = screen.getByTestId("saved-query-folder-uncategorized");

    // Zebra should appear before uncategorized in the DOM
    const container = zebraFolder.parentElement!;
    const children = Array.from(container.children);
    const zebraIdx = children.indexOf(zebraFolder);
    const uncatIdx = children.indexOf(uncatFolder);
    expect(zebraIdx).toBeLessThan(uncatIdx);
  });
});

// ===========================================================================
// 7. Inline result preview rendering
// ===========================================================================

describe("SavedQueries - inline result preview", () => {
  it("shows inline preview table when preview toggle is clicked", async () => {
    const user = userEvent.setup();
    renderSavedQueries([
      makeQuery({ id: "q1", result_data: RESULT_DATA_SMALL }),
    ]);

    await expandPanel(user);

    // Preview should not be in the DOM initially
    expect(screen.queryByTestId("inline-preview-q1")).toBeNull();

    // Click preview toggle
    await user.click(screen.getByTestId("preview-toggle-q1"));

    // Preview should now appear
    const preview = screen.getByTestId("inline-preview-q1");
    expect(preview).toBeDefined();

    // Check column headers
    expect(preview.textContent).toContain("id");
    expect(preview.textContent).toContain("name");

    // Check row data
    expect(preview.textContent).toContain("Alice");
    expect(preview.textContent).toContain("Bob");
  });

  it("hides inline preview on second toggle click", async () => {
    const user = userEvent.setup();
    renderSavedQueries([
      makeQuery({ id: "q1", result_data: RESULT_DATA_SMALL }),
    ]);

    await expandPanel(user);

    // Show
    await user.click(screen.getByTestId("preview-toggle-q1"));
    expect(screen.getByTestId("inline-preview-q1")).toBeDefined();

    // Hide
    await user.click(screen.getByTestId("preview-toggle-q1"));
    expect(screen.queryByTestId("inline-preview-q1")).toBeNull();
  });

  it("limits inline preview to 5 rows", async () => {
    const user = userEvent.setup();
    renderSavedQueries([
      makeQuery({ id: "q1", result_data: RESULT_DATA_LARGE }),
    ]);

    await expandPanel(user);
    await user.click(screen.getByTestId("preview-toggle-q1"));

    const preview = screen.getByTestId("inline-preview-q1");

    // First 5 rows should be present
    expect(preview.textContent).toContain("Alice");
    expect(preview.textContent).toContain("Eve");

    // 6th row (Frank) should NOT be present in the table body
    expect(preview.textContent).not.toContain("Frank");
  });

  it("shows 'Showing N of M rows' footer when results are truncated", async () => {
    const user = userEvent.setup();
    renderSavedQueries([
      makeQuery({ id: "q1", result_data: RESULT_DATA_LARGE }),
    ]);

    await expandPanel(user);
    await user.click(screen.getByTestId("preview-toggle-q1"));

    const preview = screen.getByTestId("inline-preview-q1");
    expect(preview.textContent).toContain("Showing 5 of 200 rows");
  });

  it("shows simple row count when all rows fit in preview", async () => {
    const user = userEvent.setup();
    renderSavedQueries([
      makeQuery({ id: "q1", result_data: RESULT_DATA_SMALL }),
    ]);

    await expandPanel(user);
    await user.click(screen.getByTestId("preview-toggle-q1"));

    const preview = screen.getByTestId("inline-preview-q1");
    expect(preview.textContent).toContain("2 rows");
    expect(preview.textContent).not.toContain("Showing");
  });

  it("renders null values as 'null' text in preview", async () => {
    const user = userEvent.setup();
    const resultWithNull = {
      columns: ["id", "name"],
      rows: [[1, null]],
      total_rows: 1,
    };
    renderSavedQueries([
      makeQuery({ id: "q1", result_data: resultWithNull }),
    ]);

    await expandPanel(user);
    await user.click(screen.getByTestId("preview-toggle-q1"));

    const preview = screen.getByTestId("inline-preview-q1");
    expect(preview.textContent).toContain("null");
  });

  it("preview toggle button only shows for queries with result_data", async () => {
    const user = userEvent.setup();
    renderSavedQueries([
      makeQuery({ id: "q1", result_data: RESULT_DATA_SMALL }),
      makeQuery({ id: "q2" }), // no result_data
    ]);

    await expandPanel(user);

    expect(screen.getByTestId("preview-toggle-q1")).toBeDefined();
    expect(screen.queryByTestId("preview-toggle-q2")).toBeNull();
  });

  it("shows singular 'row' for single-row results", async () => {
    const user = userEvent.setup();
    const singleRow = {
      columns: ["count"],
      rows: [[42]],
      total_rows: 1,
    };
    renderSavedQueries([
      makeQuery({ id: "q1", result_data: singleRow }),
    ]);

    await expandPanel(user);
    await user.click(screen.getByTestId("preview-toggle-q1"));

    const preview = screen.getByTestId("inline-preview-q1");
    expect(preview.textContent).toContain("1 row");
    // Should not have "1 rows" (plural)
    expect(preview.textContent).not.toMatch(/1 rows/);
  });
});

// ===========================================================================
// 8. CSV export button
// ===========================================================================

describe("SavedQueries - CSV export", () => {
  it("copies all result data as CSV to clipboard when 'Copy as CSV' is clicked", async () => {
    const user = userEvent.setup();
    renderSavedQueries([
      makeQuery({ id: "q1", result_data: RESULT_DATA_SMALL }),
    ]);
    const clipboardSpy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);

    await expandPanel(user);
    await user.click(screen.getByTestId("preview-toggle-q1"));
    await user.click(screen.getByTestId("copy-csv-q1"));

    expect(clipboardSpy).toHaveBeenCalledTimes(1);
    const csv = clipboardSpy.mock.calls[0][0] as string;
    expect(csv).toContain("id,name");
    expect(csv).toContain("1,Alice");
    expect(csv).toContain("2,Bob");
    clipboardSpy.mockRestore();
  });

  it("shows 'Copied!' feedback after CSV copy", async () => {
    const user = userEvent.setup();
    renderSavedQueries([
      makeQuery({ id: "q1", result_data: RESULT_DATA_SMALL }),
    ]);
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);

    await expandPanel(user);
    await user.click(screen.getByTestId("preview-toggle-q1"));
    await user.click(screen.getByTestId("copy-csv-q1"));

    const csvBtn = screen.getByTestId("copy-csv-q1");
    expect(csvBtn.textContent).toBe("Copied!");
  });

  it("CSV export properly escapes values with commas", async () => {
    const user = userEvent.setup();
    const resultWithComma = {
      columns: ["name", "desc"],
      rows: [["Alice", "Hello, world"]],
      total_rows: 1,
    };
    renderSavedQueries([
      makeQuery({ id: "q1", result_data: resultWithComma }),
    ]);
    const clipboardSpy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);

    await expandPanel(user);
    await user.click(screen.getByTestId("preview-toggle-q1"));
    await user.click(screen.getByTestId("copy-csv-q1"));

    const csv = clipboardSpy.mock.calls[0][0] as string;
    // Value with comma should be quoted
    expect(csv).toContain('"Hello, world"');
    clipboardSpy.mockRestore();
  });

  it("CSV export properly escapes values with double quotes", async () => {
    const user = userEvent.setup();
    const resultWithQuotes = {
      columns: ["name", "note"],
      rows: [["Bob", 'She said "hi"']],
      total_rows: 1,
    };
    renderSavedQueries([
      makeQuery({ id: "q1", result_data: resultWithQuotes }),
    ]);
    const clipboardSpy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);

    await expandPanel(user);
    await user.click(screen.getByTestId("preview-toggle-q1"));
    await user.click(screen.getByTestId("copy-csv-q1"));

    const csv = clipboardSpy.mock.calls[0][0] as string;
    // Double quotes in value should be escaped as ""
    expect(csv).toContain('"She said ""hi"""');
    clipboardSpy.mockRestore();
  });

  it("CSV export includes ALL rows, not just the preview rows", async () => {
    const user = userEvent.setup();
    renderSavedQueries([
      makeQuery({ id: "q1", result_data: RESULT_DATA_LARGE }),
    ]);
    const clipboardSpy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);

    await expandPanel(user);
    await user.click(screen.getByTestId("preview-toggle-q1"));
    await user.click(screen.getByTestId("copy-csv-q1"));

    const csv = clipboardSpy.mock.calls[0][0] as string;
    // Frank (row 6) should be in the CSV even though it is not in the preview table
    expect(csv).toContain("Frank,72");
    expect(csv).toContain("Grace,68");
    clipboardSpy.mockRestore();
  });

  it("CSV copy does not trigger the row copy (stopPropagation)", async () => {
    const user = userEvent.setup();
    renderSavedQueries([
      makeQuery({ id: "q1", result_data: RESULT_DATA_SMALL }),
    ]);
    const clipboardSpy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);

    await expandPanel(user);
    await user.click(screen.getByTestId("preview-toggle-q1"));

    // Reset the spy so we only capture the CSV copy call
    clipboardSpy.mockClear();

    await user.click(screen.getByTestId("copy-csv-q1"));

    // Should have exactly one clipboard call (the CSV), not two (CSV + row query copy)
    expect(clipboardSpy).toHaveBeenCalledTimes(1);
    const csv = clipboardSpy.mock.calls[0][0] as string;
    expect(csv).toContain("id,name"); // CSV header, not a raw SQL query
    clipboardSpy.mockRestore();
  });
});

// ===========================================================================
// Additional: View results button opens SQL modal
// ===========================================================================

describe("SavedQueries - view results button", () => {
  it("opens the SQL modal when clicking view results", async () => {
    const user = userEvent.setup();
    const openSqlModalSpy = vi.fn();
    const openSqlResultModalSpy = vi.fn();
    vi.spyOn(useUiStore, "getState").mockReturnValue({
      ...useUiStore.getState(),
      openSqlModal: openSqlModalSpy,
      openSqlResultModal: openSqlResultModalSpy,
    });

    renderSavedQueries([
      makeQuery({ id: "q1", result_data: RESULT_DATA_SMALL, query: "SELECT * FROM users" }),
    ]);

    await expandPanel(user);
    await user.click(screen.getByTestId("view-results-q1"));

    expect(openSqlModalSpy).toHaveBeenCalledTimes(1);
    const execArg = openSqlModalSpy.mock.calls[0][0];
    expect(execArg).toHaveLength(1);
    expect(execArg[0].query).toBe("SELECT * FROM users");
    expect(execArg[0].columns).toEqual(["id", "name"]);
    expect(openSqlResultModalSpy).toHaveBeenCalledWith(0);
  });

  it("view results button only shows for queries with result_data", async () => {
    const user = userEvent.setup();
    renderSavedQueries([
      makeQuery({ id: "q1", result_data: RESULT_DATA_SMALL }),
      makeQuery({ id: "q2" }),
    ]);

    await expandPanel(user);

    expect(screen.getByTestId("view-results-q1")).toBeDefined();
    expect(screen.queryByTestId("view-results-q2")).toBeNull();
  });
});

// ===========================================================================
// Additional: folder dropdown move
// ===========================================================================

describe("SavedQueries - folder dropdown", () => {
  it("shows folder dropdown menu on button click and moves query to new folder", async () => {
    const user = userEvent.setup();
    const moveToFolderSpy = vi.fn().mockResolvedValue(undefined);

    renderSavedQueries([
      makeQuery({ id: "q1", folder: "" }),
      makeQuery({ id: "q2", folder: "Analytics" }),
    ]);
    vi.spyOn(useSavedQueryStore.getState(), "moveToFolder").mockImplementation(moveToFolderSpy);

    await expandPanel(user);

    // Open folder dropdown for q1
    await user.click(screen.getByTestId("folder-dropdown-q1"));

    // Dropdown should be visible
    const menu = screen.getByTestId("folder-menu-q1");
    expect(menu).toBeDefined();

    // Menu should contain "Analytics" and "Uncategorized" options
    expect(menu.textContent).toContain("Analytics");
    expect(menu.textContent).toContain("Uncategorized");

    // Click "Analytics" to move q1
    const options = within(menu).getAllByRole("button");
    const analyticsOption = options.find((btn) => btn.textContent === "Analytics");
    expect(analyticsOption).toBeDefined();
    await user.click(analyticsOption!);

    expect(moveToFolderSpy).toHaveBeenCalledWith("q1", "Analytics");
  });
});
