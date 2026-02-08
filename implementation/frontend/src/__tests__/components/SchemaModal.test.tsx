import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SchemaModal } from "@/components/right-panel/SchemaModal";
import { useUiStore } from "@/stores/uiStore";
import { useDatasetStore } from "@/stores/datasetStore";
import { useChatStore } from "@/stores/chatStore";

vi.mock("@/stores/uiStore");
vi.mock("@/stores/datasetStore");
vi.mock("@/stores/chatStore");
vi.mock("@/hooks/useFocusTrap", () => ({ useFocusTrap: vi.fn() }));

const mockDataset = {
  id: "ds-1",
  name: "test_table",
  url: "https://example.com/data.parquet",
  status: "ready",
  row_count: 1000,
  column_count: 3,
  schema_json: JSON.stringify([
    { name: "id", type: "Int64" },
    { name: "name", type: "String" },
    { name: "amount", type: "Float64" },
    { name: "created_at", type: "DateTime" },
    { name: "is_active", type: "Boolean" },
  ]),
};

describe("SchemaModal column type icons", () => {
  beforeEach(() => {
    vi.mocked(useUiStore).mockImplementation((selector: any) => {
      const state = {
        schemaModalDatasetId: "ds-1",
        closeSchemaModal: vi.fn(),
      };
      return selector(state);
    });

    vi.mocked(useDatasetStore).mockImplementation((selector: any) => {
      const state = {
        datasets: [mockDataset],
        renameDataset: vi.fn(),
        updateDataset: vi.fn(),
      };
      return selector(state);
    });

    vi.mocked(useChatStore).mockImplementation((selector: any) => {
      const state = { activeConversationId: "conv-1" };
      return selector(state);
    });
  });

  it("renders type icons for each column type", () => {
    render(<SchemaModal />);

    // Check that all type labels are present
    expect(screen.getByText("Integer")).toBeInTheDocument();
    expect(screen.getByText("Text")).toBeInTheDocument();
    expect(screen.getByText("Decimal")).toBeInTheDocument();
    expect(screen.getByText("Date")).toBeInTheDocument();
    expect(screen.getByText("Boolean")).toBeInTheDocument();
  });

  it("renders SVG icons alongside type labels", () => {
    const { container } = render(<SchemaModal />);

    // Each type cell should contain an SVG icon
    const typeCells = container.querySelectorAll("td.opacity-70");
    typeCells.forEach((cell) => {
      const svg = cell.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });
  });

  it("renders column names correctly", () => {
    render(<SchemaModal />);
    expect(screen.getByText("id")).toBeInTheDocument();
    expect(screen.getByText("name")).toBeInTheDocument();
    expect(screen.getByText("amount")).toBeInTheDocument();
    expect(screen.getByText("created_at")).toBeInTheDocument();
    expect(screen.getByText("is_active")).toBeInTheDocument();
  });
});
