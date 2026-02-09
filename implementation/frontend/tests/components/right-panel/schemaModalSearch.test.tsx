// Tests for SchemaModal column search/filter feature.
// SM-SEARCH-1: Shows search input when >5 columns
// SM-SEARCH-2: Hides search input when <=5 columns
// SM-SEARCH-3: Filters columns by name
// SM-SEARCH-4: Shows no-results message
// SM-SEARCH-5: Clear button resets search
// SM-SEARCH-6: Shows filtered count label
// SM-SEARCH-7: Search is case-insensitive
// SM-SEARCH-8: Search resets when modal reopens

import { describe, it, expect, beforeEach } from "vitest";
import {
  renderWithProviders,
  screen,
  userEvent,
  act,
} from "../../helpers/render";
import {
  resetAllStores,
  setChatIdle,
  setDatasetsLoaded,
  setUiState,
  type Dataset,
} from "../../helpers/stores";
import { useUiStore } from "@/stores/uiStore";
import { SchemaModal } from "@/components/right-panel/SchemaModal";

function makeDataset(overrides: Partial<Dataset> = {}): Dataset {
  return {
    id: "ds-1",
    conversation_id: "conv-1",
    url: "https://example.com/data.parquet",
    name: "test_table",
    row_count: 100,
    column_count: 6,
    schema_json: JSON.stringify([
      { name: "user_id", type: "Int64" },
      { name: "user_name", type: "Utf8" },
      { name: "email", type: "Utf8" },
      { name: "age", type: "Int32" },
      { name: "created_at", type: "DateTime" },
      { name: "is_active", type: "Boolean" },
    ]),
    status: "ready",
    error_message: null,
    ...overrides,
  };
}

function makeSmallDataset(): Dataset {
  return makeDataset({
    column_count: 3,
    schema_json: JSON.stringify([
      { name: "id", type: "Int64" },
      { name: "name", type: "Utf8" },
      { name: "value", type: "Float64" },
    ]),
  });
}

beforeEach(() => {
  resetAllStores();
  setChatIdle("conv-1");
});

describe("SM-SEARCH-1: Shows search input when >5 columns", () => {
  it("renders search input when there are more than 5 columns", () => {
    const dataset = makeDataset();
    setDatasetsLoaded([dataset]);
    setUiState({ schemaModalDatasetId: "ds-1" });

    renderWithProviders(<SchemaModal />);

    expect(screen.getByTestId("schema-column-search")).toBeInTheDocument();
  });
});

describe("SM-SEARCH-2: Hides search input when <=5 columns", () => {
  it("does not render search input when there are 5 or fewer columns", () => {
    const dataset = makeSmallDataset();
    setDatasetsLoaded([dataset]);
    setUiState({ schemaModalDatasetId: "ds-1" });

    renderWithProviders(<SchemaModal />);

    expect(screen.queryByTestId("schema-column-search")).not.toBeInTheDocument();
  });
});

describe("SM-SEARCH-3: Filters columns by name", () => {
  it("filters columns when search term is entered", async () => {
    const user = userEvent.setup();
    const dataset = makeDataset();
    setDatasetsLoaded([dataset]);
    setUiState({ schemaModalDatasetId: "ds-1" });

    renderWithProviders(<SchemaModal />);

    const searchInput = screen.getByTestId("schema-column-search");
    await user.type(searchInput, "user");

    // Should show user_id and user_name, but not email, age, etc.
    expect(screen.getByText("user_id")).toBeInTheDocument();
    expect(screen.getByText("user_name")).toBeInTheDocument();
    expect(screen.queryByText("email")).not.toBeInTheDocument();
    expect(screen.queryByText("age")).not.toBeInTheDocument();
    expect(screen.queryByText("created_at")).not.toBeInTheDocument();
    expect(screen.queryByText("is_active")).not.toBeInTheDocument();
  });
});

describe("SM-SEARCH-4: Shows no-results message", () => {
  it("shows no results message when search has no matches", async () => {
    const user = userEvent.setup();
    const dataset = makeDataset();
    setDatasetsLoaded([dataset]);
    setUiState({ schemaModalDatasetId: "ds-1" });

    renderWithProviders(<SchemaModal />);

    const searchInput = screen.getByTestId("schema-column-search");
    await user.type(searchInput, "nonexistent");

    expect(screen.getByText(/No columns match/)).toBeInTheDocument();
  });
});

describe("SM-SEARCH-5: Clear button resets search", () => {
  it("clears search when clear button is clicked", async () => {
    const user = userEvent.setup();
    const dataset = makeDataset();
    setDatasetsLoaded([dataset]);
    setUiState({ schemaModalDatasetId: "ds-1" });

    renderWithProviders(<SchemaModal />);

    const searchInput = screen.getByTestId("schema-column-search");
    await user.type(searchInput, "user");

    // Verify filtering is active
    expect(screen.queryByText("email")).not.toBeInTheDocument();

    // Click clear button
    const clearBtn = screen.getByLabelText("Clear search");
    await user.click(clearBtn);

    // All columns should be visible again
    expect(screen.getByText("email")).toBeInTheDocument();
    expect(screen.getByText("age")).toBeInTheDocument();
    expect(screen.getByText("user_id")).toBeInTheDocument();
    expect(screen.getByText("user_name")).toBeInTheDocument();
    expect(screen.getByText("created_at")).toBeInTheDocument();
    expect(screen.getByText("is_active")).toBeInTheDocument();
  });
});

describe("SM-SEARCH-6: Shows filtered count label", () => {
  it("shows filtered/total count when filtering is active", async () => {
    const user = userEvent.setup();
    const dataset = makeDataset();
    setDatasetsLoaded([dataset]);
    setUiState({ schemaModalDatasetId: "ds-1" });

    renderWithProviders(<SchemaModal />);

    const searchInput = screen.getByTestId("schema-column-search");
    await user.type(searchInput, "user");

    const countLabel = screen.getByTestId("schema-column-count");
    expect(countLabel).toBeInTheDocument();
    expect(countLabel.textContent).toBe("(2/6)");
  });

  it("does not show count label when search is empty", () => {
    const dataset = makeDataset();
    setDatasetsLoaded([dataset]);
    setUiState({ schemaModalDatasetId: "ds-1" });

    renderWithProviders(<SchemaModal />);

    expect(screen.queryByTestId("schema-column-count")).not.toBeInTheDocument();
  });
});

describe("SM-SEARCH-7: Search is case-insensitive", () => {
  it("filters columns case-insensitively", async () => {
    const user = userEvent.setup();
    const dataset = makeDataset();
    setDatasetsLoaded([dataset]);
    setUiState({ schemaModalDatasetId: "ds-1" });

    renderWithProviders(<SchemaModal />);

    const searchInput = screen.getByTestId("schema-column-search");
    await user.type(searchInput, "USER");

    // Should still match user_id and user_name
    expect(screen.getByText("user_id")).toBeInTheDocument();
    expect(screen.getByText("user_name")).toBeInTheDocument();
    expect(screen.queryByText("email")).not.toBeInTheDocument();
  });
});

describe("SM-SEARCH-8: Search resets when modal reopens", () => {
  it("resets search term when dataset changes", async () => {
    const user = userEvent.setup();
    const dataset = makeDataset();
    setDatasetsLoaded([dataset]);
    setUiState({ schemaModalDatasetId: "ds-1" });

    const { rerender } = renderWithProviders(<SchemaModal />);

    // Type a search term
    const searchInput = screen.getByTestId("schema-column-search");
    await user.type(searchInput, "user");

    // Verify filtering
    expect(screen.queryByText("email")).not.toBeInTheDocument();

    // Close and reopen the modal by changing the dataset ID
    await act(() => {
      setUiState({ schemaModalDatasetId: null });
    });
    rerender(<SchemaModal />);

    await act(() => {
      setUiState({ schemaModalDatasetId: "ds-1" });
    });
    rerender(<SchemaModal />);

    // Search input should be empty and all columns visible
    const newSearchInput = screen.getByTestId("schema-column-search");
    expect(newSearchInput).toHaveValue("");
    expect(screen.getByText("email")).toBeInTheDocument();
    expect(screen.getByText("user_id")).toBeInTheDocument();
  });
});
