// Tests: spec/frontend/right_panel/dataset_card/spec.md
// Verifies: spec/frontend/right_panel/dataset_card/plan.md
//
// DC-LOAD-1:  Loading state shows progress bar
// DC-READY-1: Ready state shows name + dimensions
// DC-ERR-1:   Error state shows retry button
// DC-REMOVE-1: Remove with confirmation for loaded datasets
// DC-CLICK-1: Click on loaded card opens schema modal

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "../../helpers/render";
import { resetAllStores, type Dataset } from "../../helpers/stores";
import { useUiStore } from "@/stores/uiStore";
import { useDatasetStore } from "@/stores/datasetStore";
import { DatasetCard } from "@/components/right-panel/DatasetCard";

function makeDataset(overrides: Partial<Dataset> = {}): Dataset {
  return {
    id: "ds-1",
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

beforeEach(() => {
  resetAllStores();
  // Reset window.confirm mock
  vi.restoreAllMocks();
});

describe("DC-LOAD-1: Loading state shows progress bar", () => {
  it("shows hostname and progress bar when loading", () => {
    const dataset = makeDataset({
      status: "loading",
      name: "",
      row_count: 0,
      column_count: 0,
    });

    renderWithProviders(<DatasetCard dataset={dataset} />);

    expect(screen.getByText("data.example.com")).toBeInTheDocument();
    expect(screen.getByTestId("dataset-progress-bar")).toBeInTheDocument();
  });

  it("does not show remove button during loading", () => {
    const dataset = makeDataset({
      status: "loading",
      name: "",
    });

    renderWithProviders(<DatasetCard dataset={dataset} />);

    expect(
      screen.queryByRole("button", { name: /remove/i })
    ).not.toBeInTheDocument();
  });
});

describe("DC-READY-1: Ready state shows name + dimensions", () => {
  it("shows table name in bold and formatted dimensions", () => {
    const dataset = makeDataset();

    renderWithProviders(<DatasetCard dataset={dataset} />);

    const nameElement = screen.getByText("sales");
    expect(nameElement).toBeInTheDocument();
    expect(nameElement).toHaveClass("font-semibold");

    // 133,433 rows x 23 cols -- formatted with thousands separators
    expect(screen.getByText(/133,433/)).toBeInTheDocument();
    expect(screen.getByText(/23/)).toBeInTheDocument();
  });
});

describe("DC-ERR-1: Error state shows retry button", () => {
  it("shows error message and retry button", () => {
    const dataset = makeDataset({
      status: "error",
      error_message: "Could not access URL",
    });

    renderWithProviders(<DatasetCard dataset={dataset} />);

    expect(screen.getByText("Could not access URL")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /retry/i })
    ).toBeInTheDocument();
  });

  it("has red border styling on error cards", () => {
    const dataset = makeDataset({
      status: "error",
      error_message: "Network error",
    });

    renderWithProviders(<DatasetCard dataset={dataset} />);

    const card = screen.getByTestId("dataset-card");
    expect(card).toHaveClass("border-l-4");
  });
});

describe("DC-REMOVE-1: Remove with confirmation", () => {
  it("shows confirmation dialog for loaded datasets", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const dataset = makeDataset();

    useDatasetStore.setState({ datasets: [dataset] });

    const user = userEvent.setup();
    renderWithProviders(<DatasetCard dataset={dataset} />);

    const removeBtn = screen.getByRole("button", { name: /remove/i });
    await user.click(removeBtn);

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining("Remove this dataset")
    );
  });

  it("removes dataset when confirmation accepted", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const dataset = makeDataset();

    useDatasetStore.setState({ datasets: [dataset] });

    const user = userEvent.setup();
    renderWithProviders(<DatasetCard dataset={dataset} />);

    const removeBtn = screen.getByRole("button", { name: /remove/i });
    await user.click(removeBtn);

    expect(useDatasetStore.getState().datasets).toHaveLength(0);
  });

  it("does not remove dataset when confirmation rejected", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const dataset = makeDataset();

    useDatasetStore.setState({ datasets: [dataset] });

    const user = userEvent.setup();
    renderWithProviders(<DatasetCard dataset={dataset} />);

    const removeBtn = screen.getByRole("button", { name: /remove/i });
    await user.click(removeBtn);

    expect(useDatasetStore.getState().datasets).toHaveLength(1);
  });

  it("removes error dataset without confirmation", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const dataset = makeDataset({
      status: "error",
      error_message: "fail",
    });

    useDatasetStore.setState({ datasets: [dataset] });

    const user = userEvent.setup();
    renderWithProviders(<DatasetCard dataset={dataset} />);

    const removeBtn = screen.getByRole("button", { name: /remove/i });
    await user.click(removeBtn);

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(useDatasetStore.getState().datasets).toHaveLength(0);
  });
});

describe("DC-CLICK-1: Click opens schema modal", () => {
  it("sets schemaModalDatasetId in uiStore when loaded card is clicked", async () => {
    const dataset = makeDataset();

    const user = userEvent.setup();
    renderWithProviders(<DatasetCard dataset={dataset} />);

    const card = screen.getByTestId("dataset-card");
    await user.click(card);

    expect(useUiStore.getState().schemaModalDatasetId).toBe("ds-1");
  });

  it("does not open schema modal when clicking loading card", async () => {
    const dataset = makeDataset({
      status: "loading",
      name: "",
    });

    const user = userEvent.setup();
    renderWithProviders(<DatasetCard dataset={dataset} />);

    const card = screen.getByTestId("dataset-card");
    await user.click(card);

    expect(useUiStore.getState().schemaModalDatasetId).toBeNull();
  });
});

describe("Performance: DatasetCard memoization", () => {
  it("DatasetCard is wrapped with React.memo", () => {
    // Verify that DatasetCard has been memoized (will have $$typeof property)
    const { DatasetCard } = require("@/components/right-panel/DatasetCard");
    // Memoized components have a specific $$typeof symbol
    expect(DatasetCard.$$typeof.toString()).toContain("react.memo");
  });
});

describe("Touch-friendly: action buttons visible on touch devices", () => {
  it("ready state remove button has touch-action-btn class for touch device visibility", () => {
    const dataset = makeDataset();

    renderWithProviders(<DatasetCard dataset={dataset} />);

    const removeBtn = screen.getByRole("button", { name: /remove/i });
    expect(removeBtn.className).toContain("touch-action-btn");
    // Should still have opacity-0 for hover-capable devices
    expect(removeBtn.className).toContain("opacity-0");
    expect(removeBtn.className).toContain("group-hover:opacity-100");
  });
});

describe("DC-RETRY-LOADING: Retry button shows loading spinner", () => {
  it("shows spinner when retry button is clicked", async () => {
    const dataset = makeDataset({
      status: "error",
      error_message: "Failed to load",
    });

    const user = userEvent.setup();
    renderWithProviders(<DatasetCard dataset={dataset} />);

    const retryButton = screen.getByTestId("retry-button");

    // Before clicking, no spinner should be visible
    expect(retryButton.querySelector(".animate-spin")).toBeNull();

    // Click the retry button
    await user.click(retryButton);

    // After clicking, spinner should appear immediately
    expect(retryButton.querySelector(".animate-spin")).toBeTruthy();
    expect(retryButton).toBeDisabled();
  });

  it("disables retry button while retrying", async () => {
    const dataset = makeDataset({
      status: "error",
      error_message: "Failed to load",
    });

    const user = userEvent.setup();
    renderWithProviders(<DatasetCard dataset={dataset} />);

    const retryButton = screen.getByTestId("retry-button");

    expect(retryButton).not.toBeDisabled();

    await user.click(retryButton);

    // Button should be disabled during retry
    expect(retryButton).toBeDisabled();
    expect(retryButton.className).toContain("disabled:opacity-50");
    expect(retryButton.className).toContain("disabled:cursor-not-allowed");
  });
});
