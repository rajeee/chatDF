import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DatasetCard } from "@/components/right-panel/DatasetCard";
import type { Dataset } from "@/stores/datasetStore";

// Mock stores
vi.mock("@/stores/datasetStore", () => ({
  useDatasetStore: vi.fn(() => ({
    removeDataset: vi.fn(),
  })),
}));

vi.mock("@/stores/uiStore", () => ({
  useUiStore: vi.fn(() => ({
    openSchemaModal: vi.fn(),
  })),
}));

describe("DatasetCard - Interactive States", () => {
  it("should have hover states on ready dataset card", () => {
    const dataset: Dataset = {
      id: "test-1",
      url: "https://example.com/data.parquet",
      name: "Test Dataset",
      row_count: 1000,
      column_count: 10,
      schema_json: JSON.stringify([{ name: "col1", type: "String" }]),
      status: "ready",
      error_message: null,
    };

    const { container } = render(<DatasetCard dataset={dataset} />);
    const card = container.querySelector('[data-testid="dataset-card"]');

    expect(card?.className).toContain("transition-all");
    expect(card?.className).toContain("duration-150");
    expect(card?.className).toContain("hover:shadow-md");
    expect(card?.className).toContain("hover:border-accent/50");
  });

  it("should have active states on remove button", () => {
    const dataset: Dataset = {
      id: "test-1",
      url: "https://example.com/data.parquet",
      name: "Test Dataset",
      row_count: 1000,
      column_count: 10,
      schema_json: JSON.stringify([{ name: "col1", type: "String" }]),
      status: "ready",
      error_message: null,
    };

    render(<DatasetCard dataset={dataset} />);
    const removeButton = screen.getByLabelText("Remove dataset");

    expect(removeButton.className).toContain("transition-all");
    expect(removeButton.className).toContain("duration-150");
    expect(removeButton.className).toContain("active:scale-90");
    expect(removeButton.className).toContain("hover:text-red-500");
  });

  it("should have hover states on retry button for error state", () => {
    const dataset: Dataset = {
      id: "test-1",
      url: "https://example.com/data.parquet",
      name: "Test Dataset",
      row_count: 0,
      column_count: 0,
      schema_json: "{}",
      status: "error",
      error_message: "Failed to load",
    };

    render(<DatasetCard dataset={dataset} />);
    const retryButton = screen.getByLabelText("Retry");

    expect(retryButton.className).toContain("transition-all");
    expect(retryButton.className).toContain("duration-150");
    expect(retryButton.className).toContain("active:scale-95");
    expect(retryButton.className).toContain("hover:bg-accent/10");
  });

  it("should render trash icon in remove button for ready state", () => {
    const dataset: Dataset = {
      id: "test-1",
      url: "https://example.com/data.parquet",
      name: "Test Dataset",
      row_count: 1000,
      column_count: 10,
      schema_json: JSON.stringify([{ name: "col1", type: "String" }]),
      status: "ready",
      error_message: null,
    };

    render(<DatasetCard dataset={dataset} />);
    const removeButton = screen.getByLabelText("Remove dataset");
    const svg = removeButton.querySelector("svg");

    expect(svg).toBeTruthy();
    expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
  });

  it("should render trash icon in remove button for error state", () => {
    const dataset: Dataset = {
      id: "test-1",
      url: "https://example.com/data.parquet",
      name: "Test Dataset",
      row_count: 0,
      column_count: 0,
      schema_json: "{}",
      status: "error",
      error_message: "Failed to load",
    };

    render(<DatasetCard dataset={dataset} />);
    const removeButton = screen.getByLabelText("Remove dataset");
    const svg = removeButton.querySelector("svg");

    expect(svg).toBeTruthy();
    expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
  });
});
