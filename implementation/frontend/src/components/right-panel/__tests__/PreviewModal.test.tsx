import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PreviewModal } from "../PreviewModal";

// Mock the API client
const mockPreviewDataset = vi.fn();
vi.mock("@/api/client", () => ({
  previewDataset: (...args: unknown[]) => mockPreviewDataset(...args),
}));

// Mock stores
let mockPreviewModalDatasetId: string | null = "ds-1";
const mockClosePreviewModal = vi.fn();

vi.mock("@/stores/uiStore", () => ({
  useUiStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) => {
    const state = {
      previewModalDatasetId: mockPreviewModalDatasetId,
      closePreviewModal: mockClosePreviewModal,
    };
    return selector(state);
  }),
}));

const mockDataset = {
  id: "ds-1",
  conversation_id: "conv-1",
  url: "https://example.com/data.parquet",
  name: "test_data",
  row_count: 1000,
  column_count: 3,
  schema_json: JSON.stringify([
    { name: "id", type: "INTEGER" },
    { name: "value", type: "TEXT" },
    { name: "category", type: "TEXT" },
  ]),
  status: "ready",
  error_message: null,
  file_size_bytes: null,
};

vi.mock("@/stores/datasetStore", () => ({
  useDatasetStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) => {
    const state = {
      datasets: [mockDataset],
    };
    return selector(state);
  }),
}));

vi.mock("@/stores/chatStore", () => ({
  useChatStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) => {
    const state = {
      activeConversationId: "conv-1",
    };
    return selector(state);
  }),
}));

// Mock useFocusTrap to be a no-op
vi.mock("@/hooks/useFocusTrap", () => ({
  useFocusTrap: vi.fn(),
}));

// Mock DataGrid to simplify testing
vi.mock("@/components/chat-area/DataGrid", () => ({
  DataGrid: ({ columns, rows }: { columns: string[]; rows: Record<string, unknown>[] }) => (
    <div data-testid="mock-data-grid">
      <span data-testid="grid-columns">{columns.join(",")}</span>
      <span data-testid="grid-row-count">{rows.length}</span>
    </div>
  ),
}));

describe("PreviewModal sampling controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPreviewModalDatasetId = "ds-1";
    mockPreviewDataset.mockResolvedValue({
      columns: ["id", "value", "category"],
      rows: [[1, "a", "x"]],
      total_rows: 1000,
      sample_method: "head",
    });
  });

  it("renders all sample method options in the dropdown", async () => {
    render(<PreviewModal />);

    await waitFor(() => {
      expect(screen.getByTestId("preview-sample-method")).toBeInTheDocument();
    });

    const select = screen.getByTestId("preview-sample-method") as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);

    expect(options).toEqual(["head", "tail", "random", "stratified", "percentage"]);
  });

  it("renders all sample method labels correctly", async () => {
    render(<PreviewModal />);

    await waitFor(() => {
      expect(screen.getByTestId("preview-sample-method")).toBeInTheDocument();
    });

    const select = screen.getByTestId("preview-sample-method") as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.text);

    expect(labels).toEqual(["Head", "Tail", "Random", "Stratified", "Percentage"]);
  });

  it("shows sample size selector by default (head method)", async () => {
    render(<PreviewModal />);

    await waitFor(() => {
      expect(screen.getByTestId("preview-sample-size")).toBeInTheDocument();
    });
  });

  it("shows column selector when stratified is selected", async () => {
    render(<PreviewModal />);

    await waitFor(() => {
      expect(screen.getByTestId("preview-sample-method")).toBeInTheDocument();
    });

    // Change to stratified
    fireEvent.change(screen.getByTestId("preview-sample-method"), {
      target: { value: "stratified" },
    });

    expect(screen.getByTestId("preview-stratify-column")).toBeInTheDocument();
  });

  it("populates column selector with schema columns for stratified", async () => {
    render(<PreviewModal />);

    await waitFor(() => {
      expect(screen.getByTestId("preview-sample-method")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId("preview-sample-method"), {
      target: { value: "stratified" },
    });

    const colSelect = screen.getByTestId("preview-stratify-column") as HTMLSelectElement;
    const options = Array.from(colSelect.options).map((o) => o.value);

    // First option is the placeholder ""
    expect(options).toEqual(["", "id", "value", "category"]);
  });

  it("does not show column selector when head is selected", async () => {
    render(<PreviewModal />);

    await waitFor(() => {
      expect(screen.getByTestId("preview-sample-method")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("preview-stratify-column")).not.toBeInTheDocument();
  });

  it("shows percentage input when percentage is selected", async () => {
    render(<PreviewModal />);

    await waitFor(() => {
      expect(screen.getByTestId("preview-sample-method")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId("preview-sample-method"), {
      target: { value: "percentage" },
    });

    expect(screen.getByTestId("preview-sample-percentage")).toBeInTheDocument();
  });

  it("hides sample size selector when percentage is selected", async () => {
    render(<PreviewModal />);

    await waitFor(() => {
      expect(screen.getByTestId("preview-sample-method")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId("preview-sample-method"), {
      target: { value: "percentage" },
    });

    expect(screen.queryByTestId("preview-sample-size")).not.toBeInTheDocument();
  });

  it("does not show percentage input for non-percentage methods", async () => {
    render(<PreviewModal />);

    await waitFor(() => {
      expect(screen.getByTestId("preview-sample-method")).toBeInTheDocument();
    });

    // Check each non-percentage method
    for (const method of ["head", "tail", "random"]) {
      fireEvent.change(screen.getByTestId("preview-sample-method"), {
        target: { value: method },
      });
      expect(screen.queryByTestId("preview-sample-percentage")).not.toBeInTheDocument();
    }
  });

  it("calls API with head method by default on initial load", async () => {
    render(<PreviewModal />);

    await waitFor(() => {
      expect(mockPreviewDataset).toHaveBeenCalled();
    });

    const callArgs = mockPreviewDataset.mock.calls[0];
    expect(callArgs[0]).toBe("conv-1");
    expect(callArgs[1]).toBe("ds-1");
    expect(callArgs[2]).toMatchObject({
      sampleSize: 10,
      sampleMethod: "head",
    });
  });

  it("calls API with correct parameters when refresh is clicked for random", async () => {
    render(<PreviewModal />);

    await waitFor(() => {
      expect(screen.getByTestId("preview-sample-method")).toBeInTheDocument();
    });

    // Change to random
    fireEvent.change(screen.getByTestId("preview-sample-method"), {
      target: { value: "random" },
    });

    // Change sample size
    fireEvent.change(screen.getByTestId("preview-sample-size"), {
      target: { value: "50" },
    });

    // Click refresh
    mockPreviewDataset.mockResolvedValue({
      columns: ["id", "value", "category"],
      rows: [[1, "a", "x"]],
      total_rows: 1000,
      sample_method: "random",
    });

    fireEvent.click(screen.getByTestId("preview-refresh"));

    await waitFor(() => {
      const lastCall = mockPreviewDataset.mock.calls[mockPreviewDataset.mock.calls.length - 1];
      expect(lastCall[2]).toMatchObject({
        sampleSize: 50,
        sampleMethod: "random",
      });
    });
  });

  it("calls API with stratified parameters when refresh is clicked", async () => {
    render(<PreviewModal />);

    await waitFor(() => {
      expect(screen.getByTestId("preview-sample-method")).toBeInTheDocument();
    });

    // Change to stratified
    fireEvent.change(screen.getByTestId("preview-sample-method"), {
      target: { value: "stratified" },
    });

    // Select a column
    fireEvent.change(screen.getByTestId("preview-stratify-column"), {
      target: { value: "category" },
    });

    mockPreviewDataset.mockResolvedValue({
      columns: ["id", "value", "category"],
      rows: [[1, "a", "x"]],
      total_rows: 1000,
      sample_method: "stratified",
    });

    fireEvent.click(screen.getByTestId("preview-refresh"));

    await waitFor(() => {
      const lastCall = mockPreviewDataset.mock.calls[mockPreviewDataset.mock.calls.length - 1];
      expect(lastCall[2]).toMatchObject({
        sampleMethod: "stratified",
        sampleColumn: "category",
      });
    });
  });

  it("calls API with percentage parameters when refresh is clicked", async () => {
    render(<PreviewModal />);

    await waitFor(() => {
      expect(screen.getByTestId("preview-sample-method")).toBeInTheDocument();
    });

    // Change to percentage
    fireEvent.change(screen.getByTestId("preview-sample-method"), {
      target: { value: "percentage" },
    });

    mockPreviewDataset.mockResolvedValue({
      columns: ["id", "value", "category"],
      rows: [[1, "a", "x"]],
      total_rows: 1000,
      sample_method: "percentage",
    });

    fireEvent.click(screen.getByTestId("preview-refresh"));

    await waitFor(() => {
      const lastCall = mockPreviewDataset.mock.calls[mockPreviewDataset.mock.calls.length - 1];
      expect(lastCall[2]).toMatchObject({
        sampleMethod: "percentage",
        samplePercentage: 1.0,
      });
    });
  });

  it("shows sample size for head, tail, random, stratified methods", async () => {
    render(<PreviewModal />);

    await waitFor(() => {
      expect(screen.getByTestId("preview-sample-method")).toBeInTheDocument();
    });

    for (const method of ["head", "tail", "random", "stratified"]) {
      fireEvent.change(screen.getByTestId("preview-sample-method"), {
        target: { value: method },
      });
      expect(screen.getByTestId("preview-sample-size")).toBeInTheDocument();
    }
  });

  it("returns null when no dataset is selected", () => {
    mockPreviewModalDatasetId = null;
    const { container } = render(<PreviewModal />);
    expect(container.innerHTML).toBe("");
  });
});
