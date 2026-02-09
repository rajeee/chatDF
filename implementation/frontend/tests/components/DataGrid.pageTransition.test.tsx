import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderWithProviders, screen } from "../helpers/render";
import { resetAllStores } from "../helpers/stores";
import { DataGrid } from "@/components/chat-area/DataGrid";
import { fireEvent } from "@testing-library/react";
import { act } from "@testing-library/react";

const columns = ["id", "name", "value"];
const rows = Array.from({ length: 60 }, (_, i) => ({
  id: i + 1,
  name: `Item ${i + 1}`,
  value: Math.round(Math.random() * 100),
}));

describe("DataGrid page transition", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    resetAllStores();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows pagination when rows exceed page size", () => {
    renderWithProviders(
      <DataGrid columns={columns} rows={rows} totalRows={rows.length} />
    );

    expect(screen.getByLabelText("Next page")).toBeInTheDocument();
    expect(screen.getByLabelText("Previous page")).toBeInTheDocument();
    expect(screen.getByLabelText("Go to page")).toBeInTheDocument();
    expect(screen.getByText(/Showing 1–50 of 60 rows/)).toBeInTheDocument();
  });

  it("applies fade transition class on page change", () => {
    renderWithProviders(
      <DataGrid columns={columns} rows={rows} totalRows={rows.length} />
    );

    const tbody = screen.getByTestId("data-grid-body");

    // Initially no opacity-30 class
    expect(tbody.className).not.toContain("opacity-30");

    // Click Next to go to page 2
    fireEvent.click(screen.getByLabelText("Next page"));

    // After page change, tbody should have opacity-30 class
    expect(tbody.className).toContain("opacity-30");
    expect(tbody.className).toContain("transition-opacity");
  });

  it("removes transition class after delay", () => {
    renderWithProviders(
      <DataGrid columns={columns} rows={rows} totalRows={rows.length} />
    );

    const tbody = screen.getByTestId("data-grid-body");

    // Click Next to trigger page change
    fireEvent.click(screen.getByLabelText("Next page"));

    // Verify opacity class is applied
    expect(tbody.className).toContain("opacity-30");

    // Advance timers past the 150ms delay
    act(() => {
      vi.advanceTimersByTime(200);
    });

    // Opacity class should be removed
    expect(tbody.className).not.toContain("opacity-30");
    // But transition-opacity should still be present (it's always there)
    expect(tbody.className).toContain("transition-opacity");
  });
});
