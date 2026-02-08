// Tests: Right panel component with dataset list and empty state
//
// RP-EMPTY-1: Shows empty state when no datasets
// RP-LIST-1: Shows dataset cards when datasets exist

import { describe, it, expect, beforeEach } from "vitest";
import { renderWithProviders, screen } from "../../helpers/render";
import { resetAllStores, type Dataset } from "../../helpers/stores";
import { useDatasetStore } from "@/stores/datasetStore";
import { useUiStore } from "@/stores/uiStore";
import { RightPanel } from "@/components/right-panel/RightPanel";

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
});

describe("RP-EMPTY-1: Shows empty state when no datasets", () => {
  it("shows empty state with icon and message when no datasets", () => {
    useDatasetStore.setState({ datasets: [] });

    renderWithProviders(<RightPanel />);

    const emptyState = screen.getByTestId("datasets-empty-state");
    expect(emptyState).toBeInTheDocument();
    expect(screen.getByText("No datasets yet")).toBeInTheDocument();
    expect(screen.getByText("Add a dataset to get started")).toBeInTheDocument();
  });

  it("shows SVG icon in empty state", () => {
    useDatasetStore.setState({ datasets: [] });

    const { container } = renderWithProviders(<RightPanel />);

    const emptyStateSvg = container.querySelector('[data-testid="datasets-empty-state"] svg');
    expect(emptyStateSvg).toBeInTheDocument();
    expect(emptyStateSvg).toHaveClass("w-16", "h-16", "opacity-20");
  });

  it("empty state icon has floating animation class", () => {
    useDatasetStore.setState({ datasets: [] });

    const { container } = renderWithProviders(<RightPanel />);

    const emptyStateSvg = container.querySelector('[data-testid="datasets-empty-state"] svg');
    expect(emptyStateSvg).toHaveClass("empty-state-float");
  });
});

describe("RP-MOBILE-1: Mobile responsive behavior", () => {
  it("has lg:flex desktop override class", () => {
    useDatasetStore.setState({ datasets: [] });

    renderWithProviders(<RightPanel />);

    const panel = screen.getByTestId("right-panel");
    expect(panel.className).toContain("lg:flex");
    expect(panel.className).toContain("lg:relative");
    expect(panel.className).toContain("lg:sticky");
  });

  it("applies fixed overlay classes when rightPanelOpen is true", () => {
    useDatasetStore.setState({ datasets: [] });
    useUiStore.setState({ rightPanelOpen: true });

    renderWithProviders(<RightPanel />);

    const panel = screen.getByTestId("right-panel");
    expect(panel.className).toContain("fixed");
    expect(panel.className).toContain("animate-slide-in-right");
    expect(panel.className).not.toContain("hidden");
  });

  it("applies hidden class when rightPanelOpen is false", () => {
    useDatasetStore.setState({ datasets: [] });
    useUiStore.setState({ rightPanelOpen: false });

    renderWithProviders(<RightPanel />);

    const panel = screen.getByTestId("right-panel");
    expect(panel.className).toContain("hidden");
    expect(panel.className).not.toContain("fixed");
  });

  it("renders close button with proper aria-label", () => {
    useDatasetStore.setState({ datasets: [] });
    useUiStore.setState({ rightPanelOpen: true });

    renderWithProviders(<RightPanel />);

    const closeBtn = screen.getByTestId("close-right-panel");
    expect(closeBtn).toBeInTheDocument();
    expect(closeBtn).toHaveAttribute("aria-label", "Close datasets panel");
  });

  it("shows Datasets title in mobile header", () => {
    useDatasetStore.setState({ datasets: [] });
    useUiStore.setState({ rightPanelOpen: true });

    renderWithProviders(<RightPanel />);

    expect(screen.getByText("Datasets")).toBeInTheDocument();
  });
});

describe("RP-LIST-1: Shows dataset cards when datasets exist", () => {
  it("does not show empty state when datasets exist", () => {
    const dataset = makeDataset();
    useDatasetStore.setState({ datasets: [dataset] });

    renderWithProviders(<RightPanel />);

    expect(screen.queryByTestId("datasets-empty-state")).not.toBeInTheDocument();
  });

  it("shows dataset cards for each dataset", () => {
    const datasets = [
      makeDataset({ id: "ds-1", name: "sales" }),
      makeDataset({ id: "ds-2", name: "users" }),
    ];
    useDatasetStore.setState({ datasets });

    renderWithProviders(<RightPanel />);

    expect(screen.getByText("sales")).toBeInTheDocument();
    expect(screen.getByText("users")).toBeInTheDocument();
  });
});
