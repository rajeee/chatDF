// Tests for DatasetCatalog component.
//
// DC-CAT-1: Renders collapsed by default
// DC-CAT-2: Clicking toggle expands the catalog section
// DC-CAT-3: Shows category filter chips when expanded
// DC-CAT-4: Shows dataset catalog items when expanded
// DC-CAT-5: Clicking a category chip filters datasets
// DC-CAT-6: Clicking "Load" button calls onLoad with the correct URL
// DC-CAT-7: Load buttons disabled when loading=true
// DC-CAT-8: Shows "All" category chip as active by default

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, userEvent, within } from "../../helpers/render";
import { resetAllStores } from "../../helpers/stores";
import { DatasetCatalog, CATALOG_DATASETS } from "@/components/right-panel/DatasetCatalog";

beforeEach(() => {
  resetAllStores();
});

// ---------------------------------------------------------------------------
// DC-CAT-1: Renders collapsed by default
// ---------------------------------------------------------------------------

describe("DC-CAT-1: Renders collapsed by default", () => {
  it("does not show dataset items when first rendered", () => {
    const onLoad = vi.fn();
    renderWithProviders(<DatasetCatalog onLoad={onLoad} />);

    expect(screen.getByTestId("dataset-catalog")).toBeInTheDocument();
    expect(screen.getByTestId("dataset-catalog-toggle")).toBeInTheDocument();
    expect(screen.queryAllByTestId("dataset-catalog-item")).toHaveLength(0);
  });

  it("does not show category chips when collapsed", () => {
    const onLoad = vi.fn();
    renderWithProviders(<DatasetCatalog onLoad={onLoad} />);

    expect(screen.queryByTestId("dataset-catalog-categories")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// DC-CAT-2: Clicking toggle expands the catalog section
// ---------------------------------------------------------------------------

describe("DC-CAT-2: Clicking toggle expands the catalog section", () => {
  it("shows catalog content after clicking toggle", async () => {
    const onLoad = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<DatasetCatalog onLoad={onLoad} />);

    await user.click(screen.getByTestId("dataset-catalog-toggle"));

    expect(screen.getByTestId("dataset-catalog-categories")).toBeInTheDocument();
    expect(screen.getByTestId("dataset-catalog-results")).toBeInTheDocument();
  });

  it("collapses catalog when clicking toggle again", async () => {
    const onLoad = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<DatasetCatalog onLoad={onLoad} />);

    // Expand
    await user.click(screen.getByTestId("dataset-catalog-toggle"));
    expect(screen.getByTestId("dataset-catalog-categories")).toBeInTheDocument();

    // Collapse
    await user.click(screen.getByTestId("dataset-catalog-toggle"));
    expect(screen.queryByTestId("dataset-catalog-categories")).not.toBeInTheDocument();
    expect(screen.queryAllByTestId("dataset-catalog-item")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// DC-CAT-3: Shows category filter chips when expanded
// ---------------------------------------------------------------------------

describe("DC-CAT-3: Shows category filter chips when expanded", () => {
  it("renders category chip buttons inside categories container", async () => {
    const onLoad = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<DatasetCatalog onLoad={onLoad} />);

    await user.click(screen.getByTestId("dataset-catalog-toggle"));

    const categoriesContainer = screen.getByTestId("dataset-catalog-categories");
    const chips = within(categoriesContainer).getAllByRole("button");

    // Should have "All" + unique categories from CATALOG_DATASETS
    const uniqueCategories = new Set(CATALOG_DATASETS.map((d) => d.category));
    expect(chips).toHaveLength(uniqueCategories.size + 1); // +1 for "All"
  });

  it("renders 'All' chip", async () => {
    const onLoad = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<DatasetCatalog onLoad={onLoad} />);

    await user.click(screen.getByTestId("dataset-catalog-toggle"));

    expect(screen.getByTestId("dataset-catalog-category-All")).toBeInTheDocument();
    expect(screen.getByTestId("dataset-catalog-category-All")).toHaveTextContent("All");
  });
});

// ---------------------------------------------------------------------------
// DC-CAT-4: Shows dataset catalog items when expanded
// ---------------------------------------------------------------------------

describe("DC-CAT-4: Shows dataset catalog items when expanded", () => {
  it("shows all datasets when expanded with 'All' category selected", async () => {
    const onLoad = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<DatasetCatalog onLoad={onLoad} />);

    await user.click(screen.getByTestId("dataset-catalog-toggle"));

    const items = screen.getAllByTestId("dataset-catalog-item");
    expect(items).toHaveLength(CATALOG_DATASETS.length);
  });

  it("shows dataset names in the catalog items", async () => {
    const onLoad = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<DatasetCatalog onLoad={onLoad} />);

    await user.click(screen.getByTestId("dataset-catalog-toggle"));

    for (const dataset of CATALOG_DATASETS) {
      expect(screen.getByText(dataset.name)).toBeInTheDocument();
    }
  });

  it("shows a Load button for each catalog item", async () => {
    const onLoad = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<DatasetCatalog onLoad={onLoad} />);

    await user.click(screen.getByTestId("dataset-catalog-toggle"));

    const loadButtons = screen.getAllByTestId("dataset-catalog-load");
    expect(loadButtons).toHaveLength(CATALOG_DATASETS.length);
  });
});

// ---------------------------------------------------------------------------
// DC-CAT-5: Clicking a category chip filters datasets
// ---------------------------------------------------------------------------

describe("DC-CAT-5: Clicking a category chip filters datasets", () => {
  it("filters to only Finance datasets when Finance chip is clicked", async () => {
    const onLoad = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<DatasetCatalog onLoad={onLoad} />);

    await user.click(screen.getByTestId("dataset-catalog-toggle"));

    // Click the Finance category chip
    await user.click(screen.getByTestId("dataset-catalog-category-Finance"));

    const items = screen.getAllByTestId("dataset-catalog-item");
    const financeDatasets = CATALOG_DATASETS.filter((d) => d.category === "Finance");
    expect(items).toHaveLength(financeDatasets.length);

    // Verify that only finance dataset names appear
    for (const ds of financeDatasets) {
      expect(screen.getByText(ds.name)).toBeInTheDocument();
    }
  });

  it("filters to only Science datasets when Science chip is clicked", async () => {
    const onLoad = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<DatasetCatalog onLoad={onLoad} />);

    await user.click(screen.getByTestId("dataset-catalog-toggle"));

    await user.click(screen.getByTestId("dataset-catalog-category-Science"));

    const items = screen.getAllByTestId("dataset-catalog-item");
    const scienceDatasets = CATALOG_DATASETS.filter((d) => d.category === "Science");
    expect(items).toHaveLength(scienceDatasets.length);
  });

  it("shows all datasets again when 'All' chip is re-selected", async () => {
    const onLoad = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<DatasetCatalog onLoad={onLoad} />);

    await user.click(screen.getByTestId("dataset-catalog-toggle"));

    // Filter to Finance
    await user.click(screen.getByTestId("dataset-catalog-category-Finance"));
    const financeDatasets = CATALOG_DATASETS.filter((d) => d.category === "Finance");
    expect(screen.getAllByTestId("dataset-catalog-item")).toHaveLength(financeDatasets.length);

    // Back to All
    await user.click(screen.getByTestId("dataset-catalog-category-All"));
    expect(screen.getAllByTestId("dataset-catalog-item")).toHaveLength(CATALOG_DATASETS.length);
  });
});

// ---------------------------------------------------------------------------
// DC-CAT-6: Clicking "Load" button calls onLoad with the correct URL
// ---------------------------------------------------------------------------

describe("DC-CAT-6: Clicking Load button calls onLoad with correct URL", () => {
  it("calls onLoad with the parquet_url of the first dataset", async () => {
    const onLoad = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<DatasetCatalog onLoad={onLoad} />);

    await user.click(screen.getByTestId("dataset-catalog-toggle"));

    const loadButtons = screen.getAllByTestId("dataset-catalog-load");
    await user.click(loadButtons[0]);

    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(onLoad).toHaveBeenCalledWith(CATALOG_DATASETS[0].parquet_url);
  });

  it("calls onLoad with the correct URL for a different dataset", async () => {
    const onLoad = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<DatasetCatalog onLoad={onLoad} />);

    await user.click(screen.getByTestId("dataset-catalog-toggle"));

    const loadButtons = screen.getAllByTestId("dataset-catalog-load");
    // Click the last dataset's load button
    const lastIndex = CATALOG_DATASETS.length - 1;
    await user.click(loadButtons[lastIndex]);

    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(onLoad).toHaveBeenCalledWith(CATALOG_DATASETS[lastIndex].parquet_url);
  });
});

// ---------------------------------------------------------------------------
// DC-CAT-7: Load buttons disabled when loading=true
// ---------------------------------------------------------------------------

describe("DC-CAT-7: Load buttons disabled when loading=true", () => {
  it("disables all Load buttons when loading prop is true", async () => {
    const onLoad = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<DatasetCatalog onLoad={onLoad} loading={true} />);

    await user.click(screen.getByTestId("dataset-catalog-toggle"));

    const loadButtons = screen.getAllByTestId("dataset-catalog-load");
    for (const btn of loadButtons) {
      expect(btn).toBeDisabled();
    }
  });

  it("Load buttons are enabled when loading prop is false", async () => {
    const onLoad = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<DatasetCatalog onLoad={onLoad} loading={false} />);

    await user.click(screen.getByTestId("dataset-catalog-toggle"));

    const loadButtons = screen.getAllByTestId("dataset-catalog-load");
    for (const btn of loadButtons) {
      expect(btn).not.toBeDisabled();
    }
  });

  it("does not call onLoad when clicking a disabled Load button", async () => {
    const onLoad = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<DatasetCatalog onLoad={onLoad} loading={true} />);

    await user.click(screen.getByTestId("dataset-catalog-toggle"));

    const loadButtons = screen.getAllByTestId("dataset-catalog-load");
    await user.click(loadButtons[0]);

    expect(onLoad).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// DC-CAT-8: Shows "All" category chip as active by default
// ---------------------------------------------------------------------------

describe("DC-CAT-8: All category chip active by default", () => {
  it("'All' chip has accent background color by default", async () => {
    const onLoad = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<DatasetCatalog onLoad={onLoad} />);

    await user.click(screen.getByTestId("dataset-catalog-toggle"));

    const allChip = screen.getByTestId("dataset-catalog-category-All");
    expect(allChip.style.backgroundColor).toBe("var(--color-accent)");
    expect(allChip.style.color).toBe("white");
  });

  it("non-active chips have transparent background", async () => {
    const onLoad = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<DatasetCatalog onLoad={onLoad} />);

    await user.click(screen.getByTestId("dataset-catalog-toggle"));

    const financeChip = screen.getByTestId("dataset-catalog-category-Finance");
    expect(financeChip.style.backgroundColor).toBe("transparent");
    expect(financeChip.style.color).toBe("var(--color-text-secondary)");
  });

  it("clicking a category makes it active and deactivates All", async () => {
    const onLoad = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<DatasetCatalog onLoad={onLoad} />);

    await user.click(screen.getByTestId("dataset-catalog-toggle"));

    await user.click(screen.getByTestId("dataset-catalog-category-Science"));

    const scienceChip = screen.getByTestId("dataset-catalog-category-Science");
    expect(scienceChip.style.backgroundColor).toBe("var(--color-accent)");
    expect(scienceChip.style.color).toBe("white");

    const allChip = screen.getByTestId("dataset-catalog-category-All");
    expect(allChip.style.backgroundColor).toBe("transparent");
  });
});
