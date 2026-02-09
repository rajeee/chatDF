// Tests for DataGrid "Download CSV" button.
// DG-CSV-1: Button renders in the toolbar
// DG-CSV-2: Clicking the button calls downloadCsv with correct arguments

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, userEvent } from "../../../../tests/helpers/render";
import { DataGrid } from "@/components/chat-area/DataGrid";

// --- Mock csvExport module ---
const downloadCsvMock = vi.fn();
vi.mock("@/utils/csvExport", () => ({
  downloadCsv: (...args: unknown[]) => downloadCsvMock(...args),
}));

// --- Mock clipboard (DataGrid also uses clipboard for Copy) ---
const writeTextMock = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  downloadCsvMock.mockClear();
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

describe("DG-CSV-1: Download CSV button renders", () => {
  it("renders a Download CSV button in the toolbar", () => {
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={sampleRows} totalRows={2} />
    );

    const btn = screen.getByRole("button", { name: /download csv/i });
    expect(btn).toBeInTheDocument();
  });

  it("renders alongside the Copy table button", () => {
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={sampleRows} totalRows={2} />
    );

    expect(screen.getByRole("button", { name: /download csv/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy table/i })).toBeInTheDocument();
  });

  it("contains a download icon SVG", () => {
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={sampleRows} totalRows={2} />
    );

    const btn = screen.getByRole("button", { name: /download csv/i });
    const svg = btn.querySelector("svg");
    expect(svg).not.toBeNull();
  });
});

describe("DG-CSV-2: Download CSV calls downloadCsv with correct arguments", () => {
  it("calls downloadCsv with columns, rows, and filename on click", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={sampleRows} totalRows={2} />
    );

    const btn = screen.getByRole("button", { name: /download csv/i });
    await user.click(btn);

    expect(downloadCsvMock).toHaveBeenCalledTimes(1);
    expect(downloadCsvMock).toHaveBeenCalledWith(
      sampleColumns,
      sampleRows,
      "query-results.csv",
    );
  });

  it("passes all rows (not just visible page) to downloadCsv", async () => {
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

    const btn = screen.getByRole("button", { name: /download csv/i });
    await user.click(btn);

    expect(downloadCsvMock).toHaveBeenCalledTimes(1);
    // Should pass ALL 60 rows, not just the 50 visible on the first page
    const passedRows = downloadCsvMock.mock.calls[0][1];
    expect(passedRows).toHaveLength(60);
  });

  it("does not call downloadCsv when not clicked", () => {
    renderWithProviders(
      <DataGrid columns={sampleColumns} rows={sampleRows} totalRows={2} />
    );

    expect(downloadCsvMock).not.toHaveBeenCalled();
  });
});
