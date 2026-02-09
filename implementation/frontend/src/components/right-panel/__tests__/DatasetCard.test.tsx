import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { DatasetCard } from "../DatasetCard";
import type { Dataset } from "@/stores/datasetStore";

vi.mock("@/stores/datasetStore", () => ({
  useDatasetStore: vi.fn((selector) => {
    const state = { removeDataset: vi.fn(), refreshSchema: vi.fn() };
    return selector(state);
  }),
}));

vi.mock("@/stores/uiStore", () => ({
  useUiStore: vi.fn((selector) => {
    const state = { openSchemaModal: vi.fn(), openPreviewModal: vi.fn() };
    return selector(state);
  }),
}));

function makeDataset(overrides: Partial<Dataset> = {}): Dataset {
  return {
    id: "ds-1",
    conversation_id: "conv-1",
    url: "https://example.com/data.csv",
    name: "test_data",
    row_count: 1000,
    column_count: 5,
    schema_json: '{"id":"Integer","name":"Text"}',
    status: "ready",
    error_message: null,
    file_size_bytes: null,
    ...overrides,
  };
}

describe("DatasetCard file size display", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows file size in the stats line when file_size_bytes is set", () => {
    const dataset = makeDataset({ file_size_bytes: 2516582 }); // ~2.4 MB
    render(<DatasetCard dataset={dataset} />);

    // File size appears in both stats line and tooltip, so use getAllByText
    const matches = screen.getAllByText(/2\.4 MB/);
    expect(matches.length).toBeGreaterThanOrEqual(1);

    // Verify the stats line specifically contains the separator dot and file size
    const card = screen.getByTestId("dataset-card");
    expect(card).toHaveTextContent("1,000 rows x 5 cols · 2.4 MB");
  });

  it("shows file size in the tooltip when file_size_bytes is set", () => {
    const dataset = makeDataset({ file_size_bytes: 2516582 });
    render(<DatasetCard dataset={dataset} />);

    const tooltip = screen.getByTestId("dataset-stats-tooltip");
    expect(tooltip).toHaveTextContent("Size: 2.4 MB");
  });

  it("does not show file size when file_size_bytes is null", () => {
    const dataset = makeDataset({ file_size_bytes: null });
    render(<DatasetCard dataset={dataset} />);

    const tooltip = screen.getByTestId("dataset-stats-tooltip");
    expect(tooltip).not.toHaveTextContent("Size:");

    // Stats line should not have the separator dot
    const card = screen.getByTestId("dataset-card");
    expect(card.textContent).not.toContain(" · ");
  });

  it("does not show file size when file_size_bytes is 0", () => {
    const dataset = makeDataset({ file_size_bytes: 0 });
    render(<DatasetCard dataset={dataset} />);

    const tooltip = screen.getByTestId("dataset-stats-tooltip");
    expect(tooltip).not.toHaveTextContent("Size:");
  });

  it("formats KB-sized files correctly", () => {
    const dataset = makeDataset({ file_size_bytes: 512000 }); // ~500 KB
    render(<DatasetCard dataset={dataset} />);

    const tooltip = screen.getByTestId("dataset-stats-tooltip");
    expect(tooltip).toHaveTextContent("Size: 500.0 KB");
  });

  it("formats GB-sized files correctly", () => {
    const dataset = makeDataset({ file_size_bytes: 2_684_354_560 }); // ~2.5 GB
    render(<DatasetCard dataset={dataset} />);

    const tooltip = screen.getByTestId("dataset-stats-tooltip");
    expect(tooltip).toHaveTextContent("Size: 2.5 GB");
  });
});
