// Tests: Right panel component with dataset list and empty state
//
// RP-EMPTY-1: Shows empty state when no datasets
// RP-LIST-1: Shows dataset cards when datasets exist

import { describe, it, expect, beforeEach } from "vitest";
import { renderWithProviders, screen } from "../../helpers/render";
import { resetAllStores, type Dataset } from "../../helpers/stores";
import { useDatasetStore } from "@/stores/datasetStore";
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

    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveClass("w-16", "h-16", "opacity-20");
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
