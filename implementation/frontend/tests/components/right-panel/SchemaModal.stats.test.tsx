// Tests for SchemaModal Statistics tab and visual column profiling dashboard.
//
// SM-STATS-TAB-1:  Tab switching between Schema and Statistics
// SM-STATS-TAB-2:  Statistics tab auto-triggers profiling
// SM-STATS-BAR-1:  Stat bars render with correct widths
// SM-STATS-NULL-1: Null percentage bar displays correctly
// SM-STATS-NUM-1:  Numeric column range (min/mean/max) displays correctly
// SM-STATS-STR-1:  String column length stats display correctly
// SM-STATS-EMPTY-1: Empty state shows Profile Columns button

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  renderWithProviders,
  screen,
  waitFor,
  userEvent,
} from "../../helpers/render";
import {
  resetAllStores,
  setChatIdle,
  setDatasetsLoaded,
  setUiState,
  type Dataset,
} from "../../helpers/stores";
import { useDatasetStore } from "@/stores/datasetStore";
import { SchemaModal } from "@/components/right-panel/SchemaModal";
import type { ColumnProfile } from "@/stores/datasetStore";

function makeDataset(overrides: Partial<Dataset> = {}): Dataset {
  return {
    id: "ds-1",
    conversation_id: "conv-1",
    url: "https://example.com/data.parquet",
    name: "test_data",
    row_count: 1000,
    column_count: 3,
    schema_json: JSON.stringify([
      { name: "id", type: "Int64" },
      { name: "name", type: "Utf8" },
      { name: "score", type: "Float64" },
    ]),
    status: "ready",
    error_message: null,
    ...overrides,
  };
}

const sampleProfiles: ColumnProfile[] = [
  {
    name: "id",
    null_count: 0,
    null_percent: 0,
    unique_count: 1000,
    min: 1,
    max: 1000,
    mean: 500.5,
  },
  {
    name: "name",
    null_count: 50,
    null_percent: 5,
    unique_count: 800,
    min_length: 3,
    max_length: 50,
  },
  {
    name: "score",
    null_count: 100,
    null_percent: 10,
    unique_count: 500,
    min: 0,
    max: 100,
    mean: 72.3,
  },
];

beforeEach(() => {
  resetAllStores();
  setChatIdle("conv-1");
  // Mock profileDataset to prevent real API calls that hang in test environment
  useDatasetStore.setState({ profileDataset: vi.fn() });
});

describe("SM-STATS-TAB-1: Tab switching between Schema and Statistics", () => {
  it("renders Schema and Statistics tab buttons", () => {
    const dataset = makeDataset();
    setDatasetsLoaded([dataset]);
    setUiState({ schemaModalDatasetId: "ds-1" });

    renderWithProviders(<SchemaModal />);

    expect(screen.getByTestId("schema-tab-schema")).toBeInTheDocument();
    expect(screen.getByTestId("schema-tab-stats")).toBeInTheDocument();
  });

  it("defaults to Schema tab", () => {
    const dataset = makeDataset();
    setDatasetsLoaded([dataset]);
    setUiState({ schemaModalDatasetId: "ds-1" });

    renderWithProviders(<SchemaModal />);

    // Schema tab should be active (fully opaque)
    const schemaTab = screen.getByTestId("schema-tab-schema");
    expect(schemaTab.className).toContain("opacity-100");

    // Stats tab should be inactive (dimmed)
    const statsTab = screen.getByTestId("schema-tab-stats");
    expect(statsTab.className).toContain("opacity-50");

    // Column table should be visible
    expect(screen.getByTestId("schema-column-table-container")).toBeInTheDocument();
    // Stats content should not be visible
    expect(screen.queryByTestId("stats-tab-content")).not.toBeInTheDocument();
  });

  it("switches to Statistics tab on click", async () => {
    const dataset = makeDataset();
    setDatasetsLoaded([dataset]);
    setUiState({ schemaModalDatasetId: "ds-1" });

    const user = userEvent.setup();
    renderWithProviders(<SchemaModal />);

    await user.click(screen.getByTestId("schema-tab-stats"));

    // Stats content should now be visible
    expect(screen.getByTestId("stats-tab-content")).toBeInTheDocument();
    // Schema column table should be hidden
    expect(screen.queryByTestId("schema-column-table-container")).not.toBeInTheDocument();
  });

  it("switches back to Schema tab from Statistics", async () => {
    const dataset = makeDataset();
    setDatasetsLoaded([dataset]);
    setUiState({ schemaModalDatasetId: "ds-1" });

    const user = userEvent.setup();
    renderWithProviders(<SchemaModal />);

    // Switch to stats
    await user.click(screen.getByTestId("schema-tab-stats"));
    expect(screen.getByTestId("stats-tab-content")).toBeInTheDocument();

    // Switch back to schema
    await user.click(screen.getByTestId("schema-tab-schema"));
    expect(screen.getByTestId("schema-column-table-container")).toBeInTheDocument();
    expect(screen.queryByTestId("stats-tab-content")).not.toBeInTheDocument();
  });
});

describe("SM-STATS-TAB-2: Statistics tab auto-triggers profiling", () => {
  it("calls profileDataset when switching to Statistics tab without existing profiles", async () => {
    const dataset = makeDataset();
    setDatasetsLoaded([dataset]);
    setUiState({ schemaModalDatasetId: "ds-1" });

    // Mock profileDataset to track calls without actually doing the API call
    const profileSpy = vi.fn().mockImplementation(async () => {
      // Simulate setting profiles in store
      useDatasetStore.setState((state) => ({
        columnProfiles: { ...state.columnProfiles, "ds-1": sampleProfiles },
      }));
    });
    useDatasetStore.setState({ profileDataset: profileSpy });

    const user = userEvent.setup();
    renderWithProviders(<SchemaModal />);

    await user.click(screen.getByTestId("schema-tab-stats"));

    await waitFor(() => {
      expect(profileSpy).toHaveBeenCalledWith("conv-1", "ds-1");
    });
  });

  it("does not re-trigger profiling when profiles already exist", async () => {
    const dataset = makeDataset();
    setDatasetsLoaded([dataset]);
    useDatasetStore.setState({
      columnProfiles: { "ds-1": sampleProfiles },
    });
    setUiState({ schemaModalDatasetId: "ds-1" });

    const profileSpy = vi.fn();
    useDatasetStore.setState({ profileDataset: profileSpy });

    const user = userEvent.setup();
    renderWithProviders(<SchemaModal />);

    await user.click(screen.getByTestId("schema-tab-stats"));

    // Should NOT call profileDataset again
    expect(profileSpy).not.toHaveBeenCalled();
  });
});

describe("SM-STATS-EMPTY-1: Empty state shows Profile Columns button", () => {
  it("shows 'No statistics available' and Profile Columns button when no profiles exist", async () => {
    const dataset = makeDataset();
    setDatasetsLoaded([dataset]);
    setUiState({ schemaModalDatasetId: "ds-1" });

    // Prevent auto-profiling from actually running
    useDatasetStore.setState({ profileDataset: vi.fn() });

    const user = userEvent.setup();
    renderWithProviders(<SchemaModal />);

    await user.click(screen.getByTestId("schema-tab-stats"));

    expect(screen.getByTestId("stats-empty")).toBeInTheDocument();
    expect(screen.getByText("No statistics available")).toBeInTheDocument();
    expect(screen.getByTestId("stats-profile-btn")).toBeInTheDocument();
  });

  it("shows loading spinner when profiling is in progress", async () => {
    const dataset = makeDataset();
    setDatasetsLoaded([dataset]);
    useDatasetStore.setState({
      isProfiling: { "ds-1": true },
      profileDataset: vi.fn(),
    });
    setUiState({ schemaModalDatasetId: "ds-1" });

    const user = userEvent.setup();
    renderWithProviders(<SchemaModal />);

    await user.click(screen.getByTestId("schema-tab-stats"));

    expect(screen.getByTestId("stats-loading")).toBeInTheDocument();
    expect(screen.getByText("Profiling columns...")).toBeInTheDocument();
  });
});

describe("SM-STATS-BAR-1: Stat bars render with correct widths", () => {
  it("renders stat cards for each profiled column", async () => {
    const dataset = makeDataset();
    setDatasetsLoaded([dataset]);
    useDatasetStore.setState({
      columnProfiles: { "ds-1": sampleProfiles },
    });
    setUiState({ schemaModalDatasetId: "ds-1" });

    const user = userEvent.setup();
    renderWithProviders(<SchemaModal />);

    await user.click(screen.getByTestId("schema-tab-stats"));

    expect(screen.getByTestId("stats-card-list")).toBeInTheDocument();
    expect(screen.getByTestId("stat-card-id")).toBeInTheDocument();
    expect(screen.getByTestId("stat-card-name")).toBeInTheDocument();
    expect(screen.getByTestId("stat-card-score")).toBeInTheDocument();
  });

  it("completeness bar has correct width percentage", async () => {
    const dataset = makeDataset();
    setDatasetsLoaded([dataset]);
    useDatasetStore.setState({
      columnProfiles: { "ds-1": sampleProfiles },
    });
    setUiState({ schemaModalDatasetId: "ds-1" });

    const user = userEvent.setup();
    renderWithProviders(<SchemaModal />);

    await user.click(screen.getByTestId("schema-tab-stats"));

    // "id" column has 0 nulls out of 1000 rows = 100% complete
    const idCard = screen.getByTestId("stat-card-id");
    const completeFills = idCard.querySelectorAll('[data-testid="stat-bar-fill-complete"]');
    expect(completeFills.length).toBe(1);
    expect(completeFills[0]).toHaveStyle({ width: "100%" });
  });

  it("null bar has correct width based on null_percent", async () => {
    const dataset = makeDataset();
    setDatasetsLoaded([dataset]);
    useDatasetStore.setState({
      columnProfiles: { "ds-1": sampleProfiles },
    });
    setUiState({ schemaModalDatasetId: "ds-1" });

    const user = userEvent.setup();
    renderWithProviders(<SchemaModal />);

    await user.click(screen.getByTestId("schema-tab-stats"));

    // "score" column has 10% nulls
    const scoreCard = screen.getByTestId("stat-card-score");
    const nullFill = scoreCard.querySelector('[data-testid="stat-bar-fill-nulls"]');
    expect(nullFill).toHaveStyle({ width: "10%" });
  });

  it("uniqueness bar has correct width based on unique/total ratio", async () => {
    const dataset = makeDataset();
    setDatasetsLoaded([dataset]);
    useDatasetStore.setState({
      columnProfiles: { "ds-1": sampleProfiles },
    });
    setUiState({ schemaModalDatasetId: "ds-1" });

    const user = userEvent.setup();
    renderWithProviders(<SchemaModal />);

    await user.click(screen.getByTestId("schema-tab-stats"));

    // "id" has 1000 unique out of 1000 rows = 100%
    const idCard = screen.getByTestId("stat-card-id");
    const uniqueFill = idCard.querySelector('[data-testid="stat-bar-fill-unique"]');
    expect(uniqueFill).toHaveStyle({ width: "100%" });

    // "score" has 500 unique out of 1000 rows = 50%
    const scoreCard = screen.getByTestId("stat-card-score");
    const scoreUniqueFill = scoreCard.querySelector('[data-testid="stat-bar-fill-unique"]');
    expect(scoreUniqueFill).toHaveStyle({ width: "50%" });
  });
});

describe("SM-STATS-NULL-1: Null percentage display", () => {
  it("displays null count and percentage in summary row", async () => {
    const dataset = makeDataset();
    setDatasetsLoaded([dataset]);
    useDatasetStore.setState({
      columnProfiles: { "ds-1": sampleProfiles },
    });
    setUiState({ schemaModalDatasetId: "ds-1" });

    const user = userEvent.setup();
    renderWithProviders(<SchemaModal />);

    await user.click(screen.getByTestId("schema-tab-stats"));

    // "name" column has 50 nulls (5%)
    const nameCard = screen.getByTestId("stat-card-name");
    expect(nameCard.textContent).toContain("50 nulls");
    expect(nameCard.textContent).toContain("5%");
  });

  it("shows 0% null bar for column with no nulls", async () => {
    const dataset = makeDataset();
    setDatasetsLoaded([dataset]);
    useDatasetStore.setState({
      columnProfiles: { "ds-1": sampleProfiles },
    });
    setUiState({ schemaModalDatasetId: "ds-1" });

    const user = userEvent.setup();
    renderWithProviders(<SchemaModal />);

    await user.click(screen.getByTestId("schema-tab-stats"));

    // "id" has 0% nulls
    const idCard = screen.getByTestId("stat-card-id");
    const nullFill = idCard.querySelector('[data-testid="stat-bar-fill-nulls"]');
    expect(nullFill).toHaveStyle({ width: "0%" });
  });
});

describe("SM-STATS-NUM-1: Numeric column range display", () => {
  it("shows min, mean, max for numeric columns", async () => {
    const dataset = makeDataset();
    setDatasetsLoaded([dataset]);
    useDatasetStore.setState({
      columnProfiles: { "ds-1": sampleProfiles },
    });
    setUiState({ schemaModalDatasetId: "ds-1" });

    const user = userEvent.setup();
    renderWithProviders(<SchemaModal />);

    await user.click(screen.getByTestId("schema-tab-stats"));

    // "score" column: min=0, max=100, mean=72.3
    const scoreCard = screen.getByTestId("stat-card-score");
    expect(scoreCard.textContent).toContain("Min:");
    expect(scoreCard.textContent).toContain("0");
    expect(scoreCard.textContent).toContain("Max:");
    expect(scoreCard.textContent).toContain("100");
    expect(scoreCard.textContent).toContain("Mean:");
    expect(scoreCard.textContent).toContain("72.3");
  });

  it("renders a range bar with mean marker for numeric columns", async () => {
    const dataset = makeDataset();
    setDatasetsLoaded([dataset]);
    useDatasetStore.setState({
      columnProfiles: { "ds-1": sampleProfiles },
    });
    setUiState({ schemaModalDatasetId: "ds-1" });

    const user = userEvent.setup();
    renderWithProviders(<SchemaModal />);

    await user.click(screen.getByTestId("schema-tab-stats"));

    // "score" column should have a range bar
    expect(screen.getByTestId("stat-range-bar-score")).toBeInTheDocument();
    // And a mean marker
    const meanMarker = screen.getByTestId("stat-mean-marker-score");
    expect(meanMarker).toBeInTheDocument();
    // mean=72.3, range 0..100, so marker at 72.3%
    expect(meanMarker.style.left).toBe("72.3%");
  });

  it("does not show numeric range for string columns", async () => {
    const dataset = makeDataset();
    setDatasetsLoaded([dataset]);
    useDatasetStore.setState({
      columnProfiles: { "ds-1": sampleProfiles },
    });
    setUiState({ schemaModalDatasetId: "ds-1" });

    const user = userEvent.setup();
    renderWithProviders(<SchemaModal />);

    await user.click(screen.getByTestId("schema-tab-stats"));

    // "name" is a string column, should NOT have a range bar
    expect(screen.queryByTestId("stat-range-bar-name")).not.toBeInTheDocument();
  });
});

describe("SM-STATS-STR-1: String column length stats display", () => {
  it("shows min_length and max_length for string columns", async () => {
    const dataset = makeDataset();
    setDatasetsLoaded([dataset]);
    useDatasetStore.setState({
      columnProfiles: { "ds-1": sampleProfiles },
    });
    setUiState({ schemaModalDatasetId: "ds-1" });

    const user = userEvent.setup();
    renderWithProviders(<SchemaModal />);

    await user.click(screen.getByTestId("schema-tab-stats"));

    // "name" column: min_length=3, max_length=50
    const nameCard = screen.getByTestId("stat-card-name");
    expect(nameCard.textContent).toContain("Min length:");
    expect(nameCard.textContent).toContain("3");
    expect(nameCard.textContent).toContain("Max length:");
    expect(nameCard.textContent).toContain("50");
  });

  it("does not show string length stats for numeric columns", async () => {
    const dataset = makeDataset();
    setDatasetsLoaded([dataset]);
    useDatasetStore.setState({
      columnProfiles: { "ds-1": sampleProfiles },
    });
    setUiState({ schemaModalDatasetId: "ds-1" });

    const user = userEvent.setup();
    renderWithProviders(<SchemaModal />);

    await user.click(screen.getByTestId("schema-tab-stats"));

    // "id" is numeric, should not have Min length / Max length
    const idCard = screen.getByTestId("stat-card-id");
    expect(idCard.textContent).not.toContain("Min length:");
    expect(idCard.textContent).not.toContain("Max length:");
  });
});

describe("Column stat card type badge", () => {
  it("shows the friendly type name as a badge", async () => {
    const dataset = makeDataset();
    setDatasetsLoaded([dataset]);
    useDatasetStore.setState({
      columnProfiles: { "ds-1": sampleProfiles },
    });
    setUiState({ schemaModalDatasetId: "ds-1" });

    const user = userEvent.setup();
    renderWithProviders(<SchemaModal />);

    await user.click(screen.getByTestId("schema-tab-stats"));

    const idCard = screen.getByTestId("stat-card-id");
    expect(idCard.textContent).toContain("Integer");

    const nameCard = screen.getByTestId("stat-card-name");
    expect(nameCard.textContent).toContain("Text");

    const scoreCard = screen.getByTestId("stat-card-score");
    expect(scoreCard.textContent).toContain("Decimal");
  });
});
