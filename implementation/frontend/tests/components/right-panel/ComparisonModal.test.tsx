// Tests for ComparisonModal
//
// CM-NULL-1:    Renders nothing when comparisonDatasetIds is null
// CM-OPEN-1:    Shows two dataset schemas side-by-side when opened
// CM-COLS-1:    Highlights shared and unique columns correctly
// CM-CLOSE-1:   Closes on X button click
// CM-CLOSE-2:   Closes on Escape key
// CM-CLOSE-3:   Closes on backdrop click
// CM-SUMMARY-1: Shows summary count of shared/unique columns
// CM-SELECT-1:  Dataset selector dropdowns work (switch datasets)

import { describe, it, expect, beforeEach } from "vitest";
import {
  renderWithProviders,
  screen,
  userEvent,
} from "../../helpers/render";
import {
  resetAllStores,
  setChatIdle,
  setDatasetsLoaded,
  setUiState,
  type Dataset,
} from "../../helpers/stores";
import { useUiStore } from "@/stores/uiStore";
import { ComparisonModal } from "@/components/right-panel/ComparisonModal";

const mockDatasets: Dataset[] = [
  {
    id: "ds1",
    conversation_id: "conv1",
    name: "table1",
    url: "https://example.com/data1.parquet",
    row_count: 1000,
    column_count: 3,
    schema_json: JSON.stringify([
      { name: "id", type: "Int64" },
      { name: "name", type: "String" },
      { name: "value", type: "Float64" },
    ]),
    status: "ready" as const,
    error_message: null,
  },
  {
    id: "ds2",
    conversation_id: "conv1",
    name: "table2",
    url: "https://example.com/data2.parquet",
    row_count: 2000,
    column_count: 4,
    schema_json: JSON.stringify([
      { name: "id", type: "Int64" },
      { name: "category", type: "String" },
      { name: "value", type: "Float64" },
      { name: "date", type: "Date" },
    ]),
    status: "ready" as const,
    error_message: null,
  },
  {
    id: "ds3",
    conversation_id: "conv1",
    name: "table3",
    url: "https://example.com/data3.parquet",
    row_count: 500,
    column_count: 2,
    schema_json: JSON.stringify([
      { name: "code", type: "String" },
      { name: "amount", type: "Float64" },
    ]),
    status: "ready" as const,
    error_message: null,
  },
];

beforeEach(() => {
  resetAllStores();
  setChatIdle("conv1");
});

describe("CM-NULL-1: Renders nothing when comparisonDatasetIds is null", () => {
  it("does not render when comparisonDatasetIds is null", () => {
    setUiState({ comparisonDatasetIds: null });

    renderWithProviders(<ComparisonModal />);

    expect(screen.queryByTestId("comparison-modal")).not.toBeInTheDocument();
  });
});

describe("CM-OPEN-1: Shows two dataset schemas side-by-side when opened", () => {
  it("renders modal with both dataset columns when opened", () => {
    setDatasetsLoaded(mockDatasets);
    setUiState({ comparisonDatasetIds: ["ds1", "ds2"] });

    renderWithProviders(<ComparisonModal />);

    expect(screen.getByTestId("comparison-modal")).toBeInTheDocument();
    expect(screen.getByText("Compare Datasets")).toBeInTheDocument();

    // Left dataset dimensions
    expect(screen.getByTestId("comparison-left-dimensions")).toHaveTextContent(
      "1,000 rows x 3 cols"
    );

    // Right dataset dimensions
    expect(screen.getByTestId("comparison-right-dimensions")).toHaveTextContent(
      "2,000 rows x 4 cols"
    );
  });

  it("shows column names from both datasets", () => {
    setDatasetsLoaded(mockDatasets);
    setUiState({ comparisonDatasetIds: ["ds1", "ds2"] });

    renderWithProviders(<ComparisonModal />);

    // Left columns: id, name, value
    const leftCols = screen.getByTestId("comparison-left-columns");
    expect(leftCols).toHaveTextContent("id");
    expect(leftCols).toHaveTextContent("name");
    expect(leftCols).toHaveTextContent("value");

    // Right columns: id, category, value, date
    const rightCols = screen.getByTestId("comparison-right-columns");
    expect(rightCols).toHaveTextContent("id");
    expect(rightCols).toHaveTextContent("category");
    expect(rightCols).toHaveTextContent("value");
    expect(rightCols).toHaveTextContent("date");
  });

  it("shows friendly type names", () => {
    setDatasetsLoaded(mockDatasets);
    setUiState({ comparisonDatasetIds: ["ds1", "ds2"] });

    renderWithProviders(<ComparisonModal />);

    // Type badges should show mapped types
    const leftCols = screen.getByTestId("comparison-left-columns");
    expect(leftCols).toHaveTextContent("Integer");
    expect(leftCols).toHaveTextContent("Text");
    expect(leftCols).toHaveTextContent("Decimal");

    const rightCols = screen.getByTestId("comparison-right-columns");
    expect(rightCols).toHaveTextContent("Date");
  });
});

describe("CM-COLS-1: Highlights shared and unique columns correctly", () => {
  it("marks shared columns with data-comparison='shared'", () => {
    setDatasetsLoaded(mockDatasets);
    setUiState({ comparisonDatasetIds: ["ds1", "ds2"] });

    renderWithProviders(<ComparisonModal />);

    // 'id' and 'value' are shared between ds1 and ds2
    const leftCols = screen.getByTestId("comparison-left-columns");
    const leftRows = leftCols.querySelectorAll("[data-comparison]");

    const leftShared = Array.from(leftRows).filter(
      (r) => r.getAttribute("data-comparison") === "shared"
    );
    const leftUnique = Array.from(leftRows).filter(
      (r) => r.getAttribute("data-comparison") === "unique-left"
    );

    // id, value are shared; name is unique to left
    expect(leftShared).toHaveLength(2);
    expect(leftUnique).toHaveLength(1);
  });

  it("marks unique-right columns on right side", () => {
    setDatasetsLoaded(mockDatasets);
    setUiState({ comparisonDatasetIds: ["ds1", "ds2"] });

    renderWithProviders(<ComparisonModal />);

    const rightCols = screen.getByTestId("comparison-right-columns");
    const rightRows = rightCols.querySelectorAll("[data-comparison]");

    const rightShared = Array.from(rightRows).filter(
      (r) => r.getAttribute("data-comparison") === "shared"
    );
    const rightUnique = Array.from(rightRows).filter(
      (r) => r.getAttribute("data-comparison") === "unique-right"
    );

    // id, value are shared; category, date are unique to right
    expect(rightShared).toHaveLength(2);
    expect(rightUnique).toHaveLength(2);
  });
});

describe("CM-CLOSE-1: Closes on X button click", () => {
  it("closes modal when X button is clicked", async () => {
    setDatasetsLoaded(mockDatasets);
    setUiState({ comparisonDatasetIds: ["ds1", "ds2"] });

    const user = userEvent.setup();
    renderWithProviders(<ComparisonModal />);

    expect(screen.getByTestId("comparison-modal")).toBeInTheDocument();

    const closeBtn = screen.getByRole("button", { name: /close/i });
    await user.click(closeBtn);

    expect(useUiStore.getState().comparisonDatasetIds).toBeNull();
  });
});

describe("CM-CLOSE-2: Closes on Escape key", () => {
  it("closes modal when Escape key is pressed", async () => {
    setDatasetsLoaded(mockDatasets);
    setUiState({ comparisonDatasetIds: ["ds1", "ds2"] });

    const user = userEvent.setup();
    renderWithProviders(<ComparisonModal />);

    expect(screen.getByTestId("comparison-modal")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(useUiStore.getState().comparisonDatasetIds).toBeNull();
  });
});

describe("CM-CLOSE-3: Closes on backdrop click", () => {
  it("closes modal when clicking the backdrop", async () => {
    setDatasetsLoaded(mockDatasets);
    setUiState({ comparisonDatasetIds: ["ds1", "ds2"] });

    const user = userEvent.setup();
    renderWithProviders(<ComparisonModal />);

    const backdrop = screen.getByTestId("comparison-modal-backdrop");
    await user.click(backdrop);

    expect(useUiStore.getState().comparisonDatasetIds).toBeNull();
  });

  it("does not close when clicking inside the modal content", async () => {
    setDatasetsLoaded(mockDatasets);
    setUiState({ comparisonDatasetIds: ["ds1", "ds2"] });

    const user = userEvent.setup();
    renderWithProviders(<ComparisonModal />);

    const modalContent = screen.getByTestId("comparison-modal-content");
    await user.click(modalContent);

    expect(useUiStore.getState().comparisonDatasetIds).toEqual(["ds1", "ds2"]);
  });
});

describe("CM-SUMMARY-1: Shows summary count of shared/unique columns", () => {
  it("shows correct summary of shared and unique columns", () => {
    setDatasetsLoaded(mockDatasets);
    setUiState({ comparisonDatasetIds: ["ds1", "ds2"] });

    renderWithProviders(<ComparisonModal />);

    const summary = screen.getByTestId("comparison-summary");
    // ds1 cols: id, name, value
    // ds2 cols: id, category, value, date
    // shared: id, value (2)
    // unique to table1: name (1)
    // unique to table2: category, date (2)
    expect(summary).toHaveTextContent("2 shared columns");
    expect(summary).toHaveTextContent("1 unique to table1");
    expect(summary).toHaveTextContent("2 unique to table2");
  });
});

describe("CM-SELECT-1: Dataset selector dropdowns work", () => {
  it("renders dropdown selectors for both sides", () => {
    setDatasetsLoaded(mockDatasets);
    setUiState({ comparisonDatasetIds: ["ds1", "ds2"] });

    renderWithProviders(<ComparisonModal />);

    const leftSelect = screen.getByTestId("comparison-left-select");
    const rightSelect = screen.getByTestId("comparison-right-select");

    expect(leftSelect).toBeInTheDocument();
    expect(rightSelect).toBeInTheDocument();
  });

  it("switches left dataset when a different option is selected", async () => {
    setDatasetsLoaded(mockDatasets);
    setUiState({ comparisonDatasetIds: ["ds1", "ds2"] });

    const user = userEvent.setup();
    renderWithProviders(<ComparisonModal />);

    // Initially left is ds1 (table1)
    expect(screen.getByTestId("comparison-left-dimensions")).toHaveTextContent(
      "1,000 rows"
    );

    // Change left to ds3 (table3)
    const leftSelect = screen.getByTestId("comparison-left-select");
    await user.selectOptions(leftSelect, "ds3");

    // Should now show table3's dimensions
    expect(screen.getByTestId("comparison-left-dimensions")).toHaveTextContent(
      "500 rows x 2 cols"
    );
  });

  it("switches right dataset when a different option is selected", async () => {
    setDatasetsLoaded(mockDatasets);
    setUiState({ comparisonDatasetIds: ["ds1", "ds2"] });

    const user = userEvent.setup();
    renderWithProviders(<ComparisonModal />);

    // Initially right is ds2 (table2)
    expect(screen.getByTestId("comparison-right-dimensions")).toHaveTextContent(
      "2,000 rows"
    );

    // Change right to ds3 (table3)
    const rightSelect = screen.getByTestId("comparison-right-select");
    await user.selectOptions(rightSelect, "ds3");

    // Should now show table3's dimensions
    expect(screen.getByTestId("comparison-right-dimensions")).toHaveTextContent(
      "500 rows x 2 cols"
    );
  });

  it("updates summary when datasets are switched", async () => {
    setDatasetsLoaded(mockDatasets);
    setUiState({ comparisonDatasetIds: ["ds1", "ds2"] });

    const user = userEvent.setup();
    renderWithProviders(<ComparisonModal />);

    // Switch left to ds3 (code, amount) vs ds2 (id, category, value, date)
    const leftSelect = screen.getByTestId("comparison-left-select");
    await user.selectOptions(leftSelect, "ds3");

    const summary = screen.getByTestId("comparison-summary");
    // ds3 cols: code, amount — ds2 cols: id, category, value, date
    // 0 shared, 2 unique to table3, 4 unique to table2
    expect(summary).toHaveTextContent("0 shared columns");
    expect(summary).toHaveTextContent("2 unique to table3");
    expect(summary).toHaveTextContent("4 unique to table2");
  });
});

describe("Accessibility", () => {
  it("has role='dialog' and aria-modal='true'", () => {
    setDatasetsLoaded(mockDatasets);
    setUiState({ comparisonDatasetIds: ["ds1", "ds2"] });

    renderWithProviders(<ComparisonModal />);

    const modal = screen.getByTestId("comparison-modal");
    expect(modal).toHaveAttribute("role", "dialog");
    expect(modal).toHaveAttribute("aria-modal", "true");
  });

  it("has aria-labelledby pointing to modal title", () => {
    setDatasetsLoaded(mockDatasets);
    setUiState({ comparisonDatasetIds: ["ds1", "ds2"] });

    renderWithProviders(<ComparisonModal />);

    const modal = screen.getByTestId("comparison-modal");
    expect(modal).toHaveAttribute("aria-labelledby", "comparison-modal-title");

    const title = document.getElementById("comparison-modal-title");
    expect(title).toBeInTheDocument();
    expect(title?.textContent).toBe("Compare Datasets");
  });
});

describe("Modal entrance animation", () => {
  it("applies entrance animation classes to backdrop and content", () => {
    setDatasetsLoaded(mockDatasets);
    setUiState({ comparisonDatasetIds: ["ds1", "ds2"] });

    renderWithProviders(<ComparisonModal />);

    const backdrop = screen.getByTestId("comparison-modal-backdrop");
    expect(backdrop).toHaveClass("modal-backdrop-enter");

    const content = screen.getByTestId("comparison-modal-content");
    expect(content).toHaveClass("modal-scale-enter");
  });
});
