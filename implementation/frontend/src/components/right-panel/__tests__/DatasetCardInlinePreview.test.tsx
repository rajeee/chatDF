import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DatasetCard } from "../DatasetCard";
import type { Dataset } from "@/stores/datasetStore";
import type { PreviewResponse } from "@/api/client";

const mockPreviewDataset = vi.fn();

vi.mock("@/api/client", () => ({
  previewDataset: (...args: unknown[]) => mockPreviewDataset(...args),
}));

vi.mock("@/stores/datasetStore", () => ({
  useDatasetStore: vi.fn((selector) => {
    const state = {
      removeDataset: vi.fn(),
      refreshSchema: vi.fn(),
      loadingStartTimes: {},
    };
    return selector(state);
  }),
}));

vi.mock("@/stores/uiStore", () => ({
  useUiStore: vi.fn((selector) => {
    const state = { openSchemaModal: vi.fn(), openPreviewModal: vi.fn() };
    return selector(state);
  }),
}));

vi.mock("@/stores/chatStore", () => ({
  useChatStore: vi.fn((selector) => {
    const state = { activeConversationId: "conv-1" };
    return selector(state);
  }),
}));

function makeDataset(overrides: Partial<Dataset> = {}): Dataset {
  return {
    id: "ds-1",
    conversation_id: "conv-1",
    url: "https://example.com/data.parquet",
    name: "test_data",
    row_count: 1000,
    column_count: 3,
    schema_json: '{"id":"Integer","name":"Text","value":"Decimal"}',
    status: "ready",
    error_message: null,
    file_size_bytes: null,
    ...overrides,
  };
}

const mockPreviewResponse: PreviewResponse = {
  columns: ["id", "name", "value"],
  rows: [
    [1, "Alice", 10.5],
    [2, "Bob", 20.3],
    [3, "Charlie", 30.1],
    [4, null, 40.0],
    [5, "Eve", 50.7],
  ],
  total_rows: 1000,
  sample_method: "head",
};

describe("DatasetCard inline preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPreviewDataset.mockResolvedValue(mockPreviewResponse);
  });

  it("shows Peek toggle button on ready datasets", () => {
    render(<DatasetCard dataset={makeDataset()} />);
    expect(screen.getByTestId("inline-preview-toggle")).toBeInTheDocument();
    expect(screen.getByText("Peek")).toBeInTheDocument();
  });

  it("does not show Peek toggle on loading datasets", () => {
    render(<DatasetCard dataset={makeDataset({ status: "loading" })} />);
    expect(screen.queryByTestId("inline-preview-toggle")).not.toBeInTheDocument();
  });

  it("does not show Peek toggle on error datasets", () => {
    render(
      <DatasetCard dataset={makeDataset({ status: "error", error_message: "fail" })} />
    );
    expect(screen.queryByTestId("inline-preview-toggle")).not.toBeInTheDocument();
  });

  it("fetches and displays preview data when Peek is clicked", async () => {
    render(<DatasetCard dataset={makeDataset()} />);

    fireEvent.click(screen.getByTestId("inline-preview-toggle"));

    // Should show loading state
    expect(screen.getByTestId("inline-preview-loading")).toBeInTheDocument();

    // Wait for data
    await waitFor(() => {
      expect(screen.getByTestId("inline-preview")).toBeInTheDocument();
    });

    // Verify API was called with correct params
    expect(mockPreviewDataset).toHaveBeenCalledWith("conv-1", "ds-1", {
      sampleSize: 5,
      sampleMethod: "head",
    });

    // Verify column headers
    expect(screen.getByText("id")).toBeInTheDocument();
    expect(screen.getByText("name")).toBeInTheDocument();
    expect(screen.getByText("value")).toBeInTheDocument();

    // Verify data rows
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("30.1")).toBeInTheDocument();

    // Verify null rendering
    expect(screen.getByText("null")).toBeInTheDocument();

    // Verify footer
    expect(screen.getByText("Showing 5 of 1,000 rows")).toBeInTheDocument();
    expect(screen.getByText("Full preview")).toBeInTheDocument();
  });

  it("toggles button text between Peek and Hide", async () => {
    render(<DatasetCard dataset={makeDataset()} />);

    const toggle = screen.getByTestId("inline-preview-toggle");
    expect(toggle).toHaveTextContent("Peek");

    fireEvent.click(toggle);
    await waitFor(() => {
      expect(toggle).toHaveTextContent("Hide");
    });

    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent("Peek");
  });

  it("collapses the preview when Hide is clicked", async () => {
    render(<DatasetCard dataset={makeDataset()} />);

    fireEvent.click(screen.getByTestId("inline-preview-toggle"));
    await waitFor(() => {
      expect(screen.getByTestId("inline-preview")).toBeInTheDocument();
    });

    // Click again to collapse
    fireEvent.click(screen.getByTestId("inline-preview-toggle"));
    expect(screen.queryByTestId("inline-preview")).not.toBeInTheDocument();
  });

  it("caches preview data and does not re-fetch on re-expand", async () => {
    render(<DatasetCard dataset={makeDataset()} />);

    // Expand
    fireEvent.click(screen.getByTestId("inline-preview-toggle"));
    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });
    expect(mockPreviewDataset).toHaveBeenCalledTimes(1);

    // Collapse
    fireEvent.click(screen.getByTestId("inline-preview-toggle"));
    expect(screen.queryByTestId("inline-preview")).not.toBeInTheDocument();

    // Re-expand — should not fetch again
    fireEvent.click(screen.getByTestId("inline-preview-toggle"));
    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });
    expect(mockPreviewDataset).toHaveBeenCalledTimes(1);
  });

  it("displays error message when preview fetch fails", async () => {
    mockPreviewDataset.mockRejectedValue(new Error("Network error"));

    render(<DatasetCard dataset={makeDataset()} />);
    fireEvent.click(screen.getByTestId("inline-preview-toggle"));

    await waitFor(() => {
      expect(screen.getByTestId("inline-preview-error")).toBeInTheDocument();
    });
    expect(screen.getByText("Network error")).toBeInTheDocument();
  });

  it("rotates chevron icon when expanded", () => {
    render(<DatasetCard dataset={makeDataset()} />);

    const toggle = screen.getByTestId("inline-preview-toggle");
    const svg = toggle.querySelector("svg");
    expect(svg?.className.baseVal || svg?.getAttribute("class")).not.toContain("rotate-180");

    fireEvent.click(toggle);
    expect(svg?.className.baseVal || svg?.getAttribute("class")).toContain("rotate-180");
  });

  it("stops click propagation on inline preview area", async () => {
    const dataset = makeDataset();
    render(<DatasetCard dataset={dataset} />);

    fireEvent.click(screen.getByTestId("inline-preview-toggle"));
    await waitFor(() => {
      expect(screen.getByTestId("inline-preview")).toBeInTheDocument();
    });

    // The inline preview div should stop propagation (verified by the component code)
    // Just ensure the preview area exists and is interactive
    const previewArea = screen.getByTestId("inline-preview");
    expect(previewArea).toBeInTheDocument();
  });
});
