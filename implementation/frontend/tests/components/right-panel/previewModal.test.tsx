// Tests for PreviewModal component and Preview button on DatasetCard.
//
// PREVIEW-1: Preview button renders on ready dataset cards
// PREVIEW-2: Clicking preview button opens preview modal
// PREVIEW-3: Preview modal shows dataset name and close button
// PREVIEW-4: Preview modal shows loading state
// PREVIEW-5: Preview modal shows data grid on success
// PREVIEW-6: Preview modal closes on close button click
// PREVIEW-7: Preview button does not render on loading/error cards

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "../../helpers/render";
import { resetAllStores, type Dataset } from "../../helpers/stores";
import { useUiStore } from "@/stores/uiStore";
import { useDatasetStore } from "@/stores/datasetStore";
import { DatasetCard } from "@/components/right-panel/DatasetCard";
import { PreviewModal } from "@/components/right-panel/PreviewModal";
import { useChatStore } from "@/stores/chatStore";

// Mock the previewDataset API call
const previewDatasetMock = vi.fn();
vi.mock("@/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/client")>();
  return {
    ...actual,
    previewDataset: (...args: unknown[]) => previewDatasetMock(...args),
  };
});

// Mock the DataGrid component to avoid TanStack table complexity in tests
vi.mock("@/components/chat-area/DataGrid", () => ({
  DataGrid: ({ columns, rows, totalRows }: { columns: string[]; rows: Record<string, unknown>[]; totalRows: number }) => (
    <div data-testid="data-grid">
      <span data-testid="grid-columns">{columns.join(",")}</span>
      <span data-testid="grid-row-count">{rows.length}</span>
      <span data-testid="grid-total-rows">{totalRows}</span>
    </div>
  ),
}));

function makeDataset(overrides: Partial<Dataset> = {}): Dataset {
  return {
    id: "ds-1",
    conversation_id: "conv-1",
    url: "https://data.example.com/sales.parquet",
    name: "sales",
    row_count: 1000,
    column_count: 5,
    schema_json: "{}",
    status: "ready",
    error_message: null,
    ...overrides,
  };
}

beforeEach(() => {
  resetAllStores();
  previewDatasetMock.mockReset();
  vi.restoreAllMocks();
});

describe("PREVIEW-1: Preview button renders on ready dataset cards", () => {
  it("shows a preview button with eye icon on ready cards", () => {
    const dataset = makeDataset();
    renderWithProviders(<DatasetCard dataset={dataset} />);

    const btn = screen.getByTestId("preview-button");
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("aria-label", "Preview dataset");

    // Has an SVG (eye icon)
    const svg = btn.querySelector("svg");
    expect(svg).not.toBeNull();
  });
});

describe("PREVIEW-2: Clicking preview button opens preview modal", () => {
  it("sets previewModalDatasetId in uiStore when preview button is clicked", async () => {
    const dataset = makeDataset();
    const user = userEvent.setup();
    renderWithProviders(<DatasetCard dataset={dataset} />);

    const btn = screen.getByTestId("preview-button");
    await user.click(btn);

    expect(useUiStore.getState().previewModalDatasetId).toBe("ds-1");
  });

  it("does not open schema modal when preview button is clicked", async () => {
    const dataset = makeDataset();
    const user = userEvent.setup();
    renderWithProviders(<DatasetCard dataset={dataset} />);

    const btn = screen.getByTestId("preview-button");
    await user.click(btn);

    // Preview modal should be open but schema modal should not
    expect(useUiStore.getState().previewModalDatasetId).toBe("ds-1");
    expect(useUiStore.getState().schemaModalDatasetId).toBeNull();
  });
});

describe("PREVIEW-3: Preview modal shows dataset name and close button", () => {
  it("renders dataset name and close button when open", async () => {
    const dataset = makeDataset();
    useDatasetStore.setState({ datasets: [dataset] });
    useChatStore.setState({ activeConversationId: "conv-1" });
    useUiStore.setState({ previewModalDatasetId: "ds-1" });

    previewDatasetMock.mockResolvedValue({
      columns: ["id", "value"],
      rows: [[1, "a"]],
      total_rows: 1000,
    });

    renderWithProviders(<PreviewModal />);

    expect(screen.getByText("sales")).toBeInTheDocument();
    expect(screen.getByTestId("preview-modal-close")).toBeInTheDocument();
  });
});

describe("PREVIEW-4: Preview modal shows loading state", () => {
  it("shows loading spinner while fetching data", () => {
    const dataset = makeDataset();
    useDatasetStore.setState({ datasets: [dataset] });
    useChatStore.setState({ activeConversationId: "conv-1" });
    useUiStore.setState({ previewModalDatasetId: "ds-1" });

    // Never-resolving promise to keep loading state
    previewDatasetMock.mockReturnValue(new Promise(() => {}));

    renderWithProviders(<PreviewModal />);

    expect(screen.getByTestId("preview-loading")).toBeInTheDocument();
  });
});

describe("PREVIEW-5: Preview modal shows data grid on success", () => {
  it("renders DataGrid with correct columns and rows after load", async () => {
    const dataset = makeDataset();
    useDatasetStore.setState({ datasets: [dataset] });
    useChatStore.setState({ activeConversationId: "conv-1" });
    useUiStore.setState({ previewModalDatasetId: "ds-1" });

    previewDatasetMock.mockResolvedValue({
      columns: ["id", "name"],
      rows: [[1, "Alice"], [2, "Bob"]],
      total_rows: 1000,
    });

    renderWithProviders(<PreviewModal />);

    await waitFor(() => {
      expect(screen.getByTestId("data-grid")).toBeInTheDocument();
    });

    expect(screen.getByTestId("grid-columns")).toHaveTextContent("id,name");
    expect(screen.getByTestId("grid-row-count")).toHaveTextContent("2");

    // Total rows text in the header
    expect(screen.getByText("1,000 total rows")).toBeInTheDocument();
  });

  it("calls previewDataset with correct conversationId and datasetId", async () => {
    const dataset = makeDataset();
    useDatasetStore.setState({ datasets: [dataset] });
    useChatStore.setState({ activeConversationId: "conv-1" });
    useUiStore.setState({ previewModalDatasetId: "ds-1" });

    previewDatasetMock.mockResolvedValue({
      columns: ["id"],
      rows: [[1]],
      total_rows: 1,
    });

    renderWithProviders(<PreviewModal />);

    await waitFor(() => {
      expect(previewDatasetMock).toHaveBeenCalledWith("conv-1", "ds-1");
    });
  });
});

describe("PREVIEW-6: Preview modal closes on close button click", () => {
  it("clears previewModalDatasetId when close button is clicked", async () => {
    const dataset = makeDataset();
    useDatasetStore.setState({ datasets: [dataset] });
    useChatStore.setState({ activeConversationId: "conv-1" });
    useUiStore.setState({ previewModalDatasetId: "ds-1" });

    previewDatasetMock.mockResolvedValue({
      columns: ["id"],
      rows: [[1]],
      total_rows: 1,
    });

    const user = userEvent.setup();
    renderWithProviders(<PreviewModal />);

    const closeBtn = screen.getByTestId("preview-modal-close");
    await user.click(closeBtn);

    expect(useUiStore.getState().previewModalDatasetId).toBeNull();
  });
});

describe("PREVIEW-7: Preview button does not render on loading/error cards", () => {
  it("does not show preview button on loading cards", () => {
    const dataset = makeDataset({ status: "loading", name: "", row_count: 0, column_count: 0 });
    renderWithProviders(<DatasetCard dataset={dataset} />);

    expect(screen.queryByTestId("preview-button")).not.toBeInTheDocument();
  });

  it("does not show preview button on error cards", () => {
    const dataset = makeDataset({ status: "error", error_message: "Failed" });
    renderWithProviders(<DatasetCard dataset={dataset} />);

    expect(screen.queryByTestId("preview-button")).not.toBeInTheDocument();
  });
});

describe("PREVIEW-8: Preview modal shows error state", () => {
  it("shows error message when API call fails", async () => {
    const dataset = makeDataset();
    useDatasetStore.setState({ datasets: [dataset] });
    useChatStore.setState({ activeConversationId: "conv-1" });
    useUiStore.setState({ previewModalDatasetId: "ds-1" });

    previewDatasetMock.mockRejectedValue(new Error("Network error"));

    renderWithProviders(<PreviewModal />);

    await waitFor(() => {
      expect(screen.getByTestId("preview-error")).toBeInTheDocument();
    });
    expect(screen.getByText("Network error")).toBeInTheDocument();
  });
});
