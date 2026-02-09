// Tests for DataGrid sort transition and visual polish classes.
// Verifies that smooth CSS transitions are applied to:
// - Column headers (transition-colors duration-200)
// - Sort icon wrappers (transition-transform duration-200)
// - Data rows (transition-colors duration-150)
// - Copy button (transition-all duration-150, scale on copied)

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderWithProviders, screen, userEvent, within } from "../../helpers/render";
import { DataGrid } from "@/components/chat-area/DataGrid";

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

const columns = ["name", "age"];
const rows = [
  { name: "Alice", age: 30 },
  { name: "Bob", age: 25 },
];

describe("DataGrid sort transitions - column headers", () => {
  it("renders column headers with transition-colors and duration-200 classes", () => {
    renderWithProviders(
      <DataGrid columns={columns} rows={rows} totalRows={2} />
    );
    const headers = screen.getAllByRole("columnheader");
    for (const h of headers) {
      expect(h.className).toContain("transition-colors");
      expect(h.className).toContain("duration-200");
    }
  });

  it("sorted column header still has transition classes alongside bg-accent/5", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DataGrid columns={columns} rows={rows} totalRows={2} />
    );

    const nameHeader = screen.getByRole("columnheader", { name: /name/i });
    await user.click(nameHeader);

    expect(nameHeader.className).toContain("transition-colors");
    expect(nameHeader.className).toContain("duration-200");
    expect(nameHeader.className).toContain("bg-accent/5");
  });
});

describe("DataGrid sort transitions - sort icon wrappers", () => {
  it("wraps sort icons in a span with transition-transform duration-200", () => {
    renderWithProviders(
      <DataGrid columns={columns} rows={rows} totalRows={2} />
    );

    const wrappers = screen.getAllByTestId("sort-icon-wrapper");
    expect(wrappers).toHaveLength(columns.length);
    for (const wrapper of wrappers) {
      expect(wrapper.tagName.toLowerCase()).toBe("span");
      expect(wrapper.className).toContain("transition-transform");
      expect(wrapper.className).toContain("duration-200");
    }
  });

  it("sort icon wrapper contains the sort SVG icon", () => {
    renderWithProviders(
      <DataGrid columns={columns} rows={rows} totalRows={2} />
    );

    const wrappers = screen.getAllByTestId("sort-icon-wrapper");
    for (const wrapper of wrappers) {
      const svg = wrapper.querySelector("svg");
      expect(svg).not.toBeNull();
    }
  });
});

describe("DataGrid sort transitions - row hover duration", () => {
  it("renders data rows with transition-colors and duration-150", () => {
    renderWithProviders(
      <DataGrid columns={columns} rows={rows} totalRows={2} />
    );
    const tbody = screen.getByTestId("data-grid-body");
    const dataRows = within(tbody).getAllByRole("row");
    for (const r of dataRows) {
      expect(r.className).toContain("transition-colors");
      expect(r.className).toContain("duration-150");
    }
  });
});

describe("DataGrid sort transitions - copy button feedback", () => {
  it("copy button has transition-all and duration-150 classes", () => {
    renderWithProviders(
      <DataGrid columns={columns} rows={rows} totalRows={2} />
    );

    const copyBtn = screen.getByRole("button", { name: /copy table/i });
    expect(copyBtn.className).toContain("transition-all");
    expect(copyBtn.className).toContain("duration-150");
  });

  it("copy button gains scale-105 class when copied", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithProviders(
      <DataGrid columns={columns} rows={rows} totalRows={2} />
    );

    const copyBtn = screen.getByRole("button", { name: /copy table/i });

    // Before clicking, no scale class
    expect(copyBtn.className).not.toContain("scale-105");

    await user.click(copyBtn);

    // After clicking, button should have the scale class and show "Copied!"
    expect(screen.getByText("Copied!")).toBeInTheDocument();
    expect(copyBtn.className).toContain("scale-105");
    expect(copyBtn.className).toContain("font-medium");

    vi.useRealTimers();
  });
});
