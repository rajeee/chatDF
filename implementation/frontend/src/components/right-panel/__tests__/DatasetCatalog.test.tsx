import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DatasetCatalog, CATALOG_DATASETS } from "../DatasetCatalog";

describe("DatasetCatalog", () => {
  it("renders collapsed by default", () => {
    render(<DatasetCatalog onLoad={vi.fn()} />);

    expect(screen.getByTestId("dataset-catalog")).toBeInTheDocument();
    expect(screen.getByTestId("dataset-catalog-toggle")).toBeInTheDocument();
    expect(screen.queryByTestId("dataset-catalog-categories")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dataset-catalog-results")).not.toBeInTheDocument();
  });

  it("toggles open and closed", () => {
    render(<DatasetCatalog onLoad={vi.fn()} />);

    const toggle = screen.getByTestId("dataset-catalog-toggle");

    // Open
    fireEvent.click(toggle);
    expect(screen.getByTestId("dataset-catalog-categories")).toBeInTheDocument();
    expect(screen.getByTestId("dataset-catalog-results")).toBeInTheDocument();

    // Close
    fireEvent.click(toggle);
    expect(screen.queryByTestId("dataset-catalog-categories")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dataset-catalog-results")).not.toBeInTheDocument();
  });

  it("displays all expected categories", () => {
    render(<DatasetCatalog onLoad={vi.fn()} />);
    fireEvent.click(screen.getByTestId("dataset-catalog-toggle"));

    const expectedCategories = [
      "All",
      ...Array.from(new Set(CATALOG_DATASETS.map((d) => d.category))).sort(),
    ];

    for (const cat of expectedCategories) {
      expect(
        screen.getByTestId(`dataset-catalog-category-${cat}`)
      ).toBeInTheDocument();
    }
  });

  it("shows all datasets when 'All' category is selected", () => {
    render(<DatasetCatalog onLoad={vi.fn()} />);
    fireEvent.click(screen.getByTestId("dataset-catalog-toggle"));

    const items = screen.getAllByTestId("dataset-catalog-item");
    expect(items).toHaveLength(CATALOG_DATASETS.length);
  });

  it("filters datasets by category", () => {
    render(<DatasetCatalog onLoad={vi.fn()} />);
    fireEvent.click(screen.getByTestId("dataset-catalog-toggle"));

    // Get unique categories from catalog
    const categories = Array.from(
      new Set(CATALOG_DATASETS.map((d) => d.category))
    );

    for (const cat of categories) {
      fireEvent.click(screen.getByTestId(`dataset-catalog-category-${cat}`));
      const expectedCount = CATALOG_DATASETS.filter(
        (d) => d.category === cat
      ).length;
      const items = screen.getAllByTestId("dataset-catalog-item");
      expect(items).toHaveLength(expectedCount);
    }
  });

  it("returns to showing all datasets when 'All' is clicked after filtering", () => {
    render(<DatasetCatalog onLoad={vi.fn()} />);
    fireEvent.click(screen.getByTestId("dataset-catalog-toggle"));

    // Filter to a specific category first
    fireEvent.click(screen.getByTestId("dataset-catalog-category-Science"));
    const scienceCount = CATALOG_DATASETS.filter(
      (d) => d.category === "Science"
    ).length;
    expect(screen.getAllByTestId("dataset-catalog-item")).toHaveLength(
      scienceCount
    );

    // Switch back to All
    fireEvent.click(screen.getByTestId("dataset-catalog-category-All"));
    expect(screen.getAllByTestId("dataset-catalog-item")).toHaveLength(
      CATALOG_DATASETS.length
    );
  });

  it("calls onLoad with the correct parquet URL when Load is clicked", () => {
    const onLoad = vi.fn();
    render(<DatasetCatalog onLoad={onLoad} />);
    fireEvent.click(screen.getByTestId("dataset-catalog-toggle"));

    const loadButtons = screen.getAllByTestId("dataset-catalog-load");
    // Click the first Load button
    fireEvent.click(loadButtons[0]);

    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(onLoad).toHaveBeenCalledWith(CATALOG_DATASETS[0].parquet_url);
  });

  it("disables Load buttons when loading prop is true", () => {
    render(<DatasetCatalog onLoad={vi.fn()} loading={true} />);
    fireEvent.click(screen.getByTestId("dataset-catalog-toggle"));

    const loadButtons = screen.getAllByTestId("dataset-catalog-load");
    for (const btn of loadButtons) {
      expect(btn).toBeDisabled();
    }
  });

  it("enables Load buttons when loading prop is false", () => {
    render(<DatasetCatalog onLoad={vi.fn()} loading={false} />);
    fireEvent.click(screen.getByTestId("dataset-catalog-toggle"));

    const loadButtons = screen.getAllByTestId("dataset-catalog-load");
    for (const btn of loadButtons) {
      expect(btn).not.toBeDisabled();
    }
  });

  it("shows correct number of datasets for each category", () => {
    render(<DatasetCatalog onLoad={vi.fn()} />);
    fireEvent.click(screen.getByTestId("dataset-catalog-toggle"));

    const categoryCounts: Record<string, number> = {};
    for (const d of CATALOG_DATASETS) {
      categoryCounts[d.category] = (categoryCounts[d.category] || 0) + 1;
    }

    for (const [cat, expectedCount] of Object.entries(categoryCounts)) {
      fireEvent.click(screen.getByTestId(`dataset-catalog-category-${cat}`));
      const items = screen.getAllByTestId("dataset-catalog-item");
      expect(items).toHaveLength(expectedCount);
    }
  });

  it("displays dataset name, description, and category for each item", () => {
    render(<DatasetCatalog onLoad={vi.fn()} />);
    fireEvent.click(screen.getByTestId("dataset-catalog-toggle"));

    // Check the first dataset
    const firstDataset = CATALOG_DATASETS[0];
    expect(screen.getByText(firstDataset.name)).toBeInTheDocument();
    expect(screen.getByText(firstDataset.description)).toBeInTheDocument();
  });
});
