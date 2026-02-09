// Tests for DataGrid "Download Excel" button.
// DG-XLSX-1: Button renders in the toolbar
// DG-XLSX-2: Clicking the button calls downloadExcel with correct arguments

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, userEvent } from "../../../helpers/render";
import { DataGrid } from "@/components/chat-area/DataGrid";

// --- Mock excelExport module ---
const downloadExcelMock = vi.fn();
vi.mock("@/utils/excelExport", () => ({
  downloadExcel: (...args: unknown[]) => downloadExcelMock(...args),
}));

// --- Mock csvExport module (DataGrid also imports it) ---
vi.mock("@/utils/csvExport", () => ({
  downloadCsv: vi.fn(),
}));

// --- Mock clipboard (DataGrid also uses clipboard for Copy) ---
const writeTextMock = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  downloadExcelMock.mockClear();
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
];

describe("DG-XLSX-1: Download Excel button renders", () => {
  it("renders a Download Excel button in the toolbar", () => {
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={sampleRows} totalRows={2} />
    );

    const btn = screen.getByRole("button", { name: /download excel/i });
    expect(btn).toBeInTheDocument();
  });

  it("renders alongside the Download CSV and Copy table buttons", () => {
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={sampleRows} totalRows={2} />
    );

    expect(screen.getByRole("button", { name: /download excel/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download csv/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy table/i })).toBeInTheDocument();
  });

  it("contains a spreadsheet icon SVG", () => {
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={sampleRows} totalRows={2} />
    );

    const btn = screen.getByRole("button", { name: /download excel/i });
    const svg = btn.querySelector("svg");
    expect(svg).not.toBeNull();
  });
});

describe("DG-XLSX-2: Download Excel calls downloadExcel with correct arguments", () => {
  it("calls downloadExcel with columns, rows, and filename on click", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={sampleRows} totalRows={2} />
    );

    const btn = screen.getByRole("button", { name: /download excel/i });
    await user.click(btn);

    expect(downloadExcelMock).toHaveBeenCalledTimes(1);
    expect(downloadExcelMock).toHaveBeenCalledWith(
      sampleColumns,
      sampleRows,
      "query-results",
    );
  });

  it("passes all rows (not just visible page) to downloadExcel", async () => {
    const user = userEvent.setup();
    // Create enough rows that pagination kicks in (>50), but totalRows reflects all
    const manyRows = Array.from({ length: 60 }, (_, i) => ({
      id: i + 1,
      name: `Name ${i + 1}`,
      score: (i + 1) * 10,
    }));
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={manyRows} totalRows={60} />
    );

    const btn = screen.getByRole("button", { name: /download excel/i });
    await user.click(btn);

    expect(downloadExcelMock).toHaveBeenCalledTimes(1);
    // Should pass ALL 60 rows, not just the 50 visible on the first page
    const passedRows = downloadExcelMock.mock.calls[0][1];
    expect(passedRows).toHaveLength(60);
  });

  it("does not call downloadExcel when not clicked", () => {
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={sampleRows} totalRows={2} />
    );

    expect(downloadExcelMock).not.toHaveBeenCalled();
  });
});
