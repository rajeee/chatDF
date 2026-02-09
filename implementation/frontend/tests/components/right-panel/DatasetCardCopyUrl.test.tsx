// Tests: Copy URL button on ready dataset cards
//
// DC-COPY-1: Copy URL button appears on ready dataset card
// DC-COPY-2: Clicking copy URL calls navigator.clipboard.writeText with correct URL
// DC-COPY-3: Shows checkmark icon after clicking

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  act,
} from "../../helpers/render";
import { resetAllStores, type Dataset } from "../../helpers/stores";
import { DatasetCard } from "@/components/right-panel/DatasetCard";

function makeDataset(overrides: Partial<Dataset> = {}): Dataset {
  return {
    id: "ds-1",
    conversation_id: "conv-1",
    url: "https://data.example.com/sales.parquet",
    name: "sales",
    row_count: 133433,
    column_count: 23,
    schema_json: "{}",
    status: "ready",
    error_message: null,
    ...overrides,
  };
}

const writeTextMock = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  resetAllStores();
  writeTextMock.mockClear();

  // Mock clipboard API - navigator.clipboard is read-only, use defineProperty
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: writeTextMock },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("DC-COPY-1: Copy URL button appears on ready dataset card", () => {
  it("renders copy URL button on a ready dataset card", () => {
    const dataset = makeDataset();

    renderWithProviders(<DatasetCard dataset={dataset} />);

    const copyBtn = screen.getByTestId("copy-url-button");
    expect(copyBtn).toBeInTheDocument();
  });

  it("does not render copy URL button on a loading dataset card", () => {
    const dataset = makeDataset({
      status: "loading",
      name: "",
      row_count: 0,
      column_count: 0,
    });

    renderWithProviders(<DatasetCard dataset={dataset} />);

    expect(screen.queryByTestId("copy-url-button")).not.toBeInTheDocument();
  });

  it("does not render copy URL button on an error dataset card", () => {
    const dataset = makeDataset({
      status: "error",
      error_message: "Could not access URL",
    });

    renderWithProviders(<DatasetCard dataset={dataset} />);

    expect(screen.queryByTestId("copy-url-button")).not.toBeInTheDocument();
  });

  it("has touch-action-btn class for touch device visibility", () => {
    const dataset = makeDataset();

    renderWithProviders(<DatasetCard dataset={dataset} />);

    const copyBtn = screen.getByTestId("copy-url-button");
    expect(copyBtn.className).toContain("touch-action-btn");
  });
});

describe("DC-COPY-2: Clicking copy URL calls navigator.clipboard.writeText", () => {
  it("calls navigator.clipboard.writeText with the dataset URL", async () => {
    const dataset = makeDataset({
      url: "https://data.example.com/sales.parquet",
    });

    const user = userEvent.setup();
    // Spy after userEvent.setup() so we capture the actual clipboard call
    const clipboardSpy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    renderWithProviders(<DatasetCard dataset={dataset} />);

    const copyBtn = screen.getByTestId("copy-url-button");
    await user.click(copyBtn);

    expect(clipboardSpy).toHaveBeenCalledWith(
      "https://data.example.com/sales.parquet"
    );
    clipboardSpy.mockRestore();
  });

  it("does not propagate click to card (no schema modal)", async () => {
    const dataset = makeDataset();

    const user = userEvent.setup();
    renderWithProviders(<DatasetCard dataset={dataset} />);

    const copyBtn = screen.getByTestId("copy-url-button");
    await user.click(copyBtn);

    // Schema modal should NOT open since stopPropagation is called
    const { useUiStore } = await import("@/stores/uiStore");
    expect(useUiStore.getState().schemaModalDatasetId).toBeNull();
  });
});

describe("DC-COPY-3: Shows checkmark icon after clicking", () => {
  it("shows checkmark icon after clicking copy URL", async () => {
    const dataset = makeDataset();

    const user = userEvent.setup();
    renderWithProviders(<DatasetCard dataset={dataset} />);

    const copyBtn = screen.getByTestId("copy-url-button");

    // Before clicking: should have link icon (two paths)
    const svgBefore = copyBtn.querySelector("svg")!;
    expect(svgBefore.querySelectorAll("path")).toHaveLength(2);

    await user.click(copyBtn);

    // After clicking: should show checkmark (polyline, no paths)
    const svgAfter = copyBtn.querySelector("svg")!;
    expect(svgAfter.querySelector("polyline")).toBeTruthy();
    expect(svgAfter.querySelectorAll("path")).toHaveLength(0);
  });

  it("updates aria-label to 'URL copied' after clicking", async () => {
    const dataset = makeDataset();

    const user = userEvent.setup();
    renderWithProviders(<DatasetCard dataset={dataset} />);

    const copyBtn = screen.getByTestId("copy-url-button");
    expect(copyBtn).toHaveAttribute("aria-label", "Copy dataset URL");

    await user.click(copyBtn);

    expect(copyBtn).toHaveAttribute("aria-label", "URL copied");
  });

  it("becomes fully opaque after clicking (copied state)", async () => {
    const dataset = makeDataset();

    const user = userEvent.setup();
    renderWithProviders(<DatasetCard dataset={dataset} />);

    const copyBtn = screen.getByTestId("copy-url-button");

    // Before clicking: hidden (opacity-0)
    expect(copyBtn.className).toContain("opacity-0");

    await user.click(copyBtn);

    // After clicking: visible (opacity-100, no opacity-0)
    expect(copyBtn.className).toContain("opacity-100");
    expect(copyBtn.className).not.toContain("opacity-0");
  });

  it("reverts to link icon after 1.5 seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const dataset = makeDataset();

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithProviders(<DatasetCard dataset={dataset} />);

    const copyBtn = screen.getByTestId("copy-url-button");
    await user.click(copyBtn);

    // Should show checkmark now
    expect(copyBtn.querySelector("svg polyline")).toBeTruthy();

    // Advance past the 1500ms timeout
    await act(() => {
      vi.advanceTimersByTime(1500);
    });

    // Should revert to link icon
    expect(copyBtn.querySelector("svg polyline")).toBeNull();
    expect(copyBtn.querySelector("svg")!.querySelectorAll("path")).toHaveLength(2);
  });
});
