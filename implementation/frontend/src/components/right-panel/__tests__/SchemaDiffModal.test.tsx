import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SchemaDiffModal } from "../SchemaDiffModal";
import { computeSchemaDiff } from "@/utils/schemaUtils";

// Mock state
let mockSchemaDiffDatasetIds: [string, string] | null = null;
const mockCloseSchemaDiffModal = vi.fn();

vi.mock("@/stores/uiStore", () => ({
  useUiStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) => {
    const state = {
      schemaDiffDatasetIds: mockSchemaDiffDatasetIds,
      closeSchemaDiffModal: mockCloseSchemaDiffModal,
    };
    return selector(state);
  }),
}));

const mockDatasets = [
  {
    id: "ds-1",
    conversation_id: "conv-1",
    url: "https://example.com/a.parquet",
    name: "users",
    row_count: 100,
    column_count: 3,
    schema_json: JSON.stringify([
      { name: "id", type: "Int64" },
      { name: "name", type: "Utf8" },
      { name: "age", type: "Int32" },
    ]),
    status: "ready" as const,
    error_message: null,
  },
  {
    id: "ds-2",
    conversation_id: "conv-1",
    url: "https://example.com/b.parquet",
    name: "orders",
    row_count: 200,
    column_count: 4,
    schema_json: JSON.stringify([
      { name: "id", type: "Utf8" },
      { name: "product", type: "Utf8" },
      { name: "amount", type: "Float64" },
      { name: "age", type: "Int32" },
    ]),
    status: "ready" as const,
    error_message: null,
  },
];

vi.mock("@/stores/datasetStore", () => ({
  useDatasetStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) => {
    const state = {
      datasets: mockDatasets,
    };
    return selector(state);
  }),
}));

vi.mock("@/hooks/useFocusTrap", () => ({
  useFocusTrap: vi.fn(),
}));

describe("SchemaDiffModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSchemaDiffDatasetIds = null;
  });

  it("renders nothing when modal is closed", () => {
    mockSchemaDiffDatasetIds = null;
    const { container } = render(<SchemaDiffModal />);
    expect(container.innerHTML).toBe("");
  });

  it("renders column names for both datasets", () => {
    mockSchemaDiffDatasetIds = ["ds-1", "ds-2"];
    render(<SchemaDiffModal />);

    expect(screen.getByTestId("schema-diff-modal")).toBeInTheDocument();
    expect(screen.getByText("Schema Diff")).toBeInTheDocument();

    // Column names from both datasets should appear
    expect(screen.getByTestId("diff-row-id")).toBeInTheDocument();
    expect(screen.getByTestId("diff-row-name")).toBeInTheDocument();
    expect(screen.getByTestId("diff-row-age")).toBeInTheDocument();
    expect(screen.getByTestId("diff-row-product")).toBeInTheDocument();
    expect(screen.getByTestId("diff-row-amount")).toBeInTheDocument();
  });

  it("highlights unique columns correctly with left-only and right-only status", () => {
    mockSchemaDiffDatasetIds = ["ds-1", "ds-2"];
    render(<SchemaDiffModal />);

    // "name" is only in left (users), "product" and "amount" only in right (orders)
    const nameRow = screen.getByTestId("diff-row-name");
    expect(nameRow).toHaveAttribute("data-diff-status", "left-only");

    const productRow = screen.getByTestId("diff-row-product");
    expect(productRow).toHaveAttribute("data-diff-status", "right-only");

    const amountRow = screen.getByTestId("diff-row-amount");
    expect(amountRow).toHaveAttribute("data-diff-status", "right-only");
  });

  it("shows type mismatch indicator for same-name columns with different types", () => {
    mockSchemaDiffDatasetIds = ["ds-1", "ds-2"];
    render(<SchemaDiffModal />);

    // "id" is Int64 in left and Utf8 in right => type-mismatch
    const idRow = screen.getByTestId("diff-row-id");
    expect(idRow).toHaveAttribute("data-diff-status", "type-mismatch");

    // The warning icon should be present
    expect(screen.getByTestId("type-mismatch-id")).toBeInTheDocument();
  });

  it("shows matched status for columns with same name and type", () => {
    mockSchemaDiffDatasetIds = ["ds-1", "ds-2"];
    render(<SchemaDiffModal />);

    // "age" is Int32 in both datasets
    const ageRow = screen.getByTestId("diff-row-age");
    expect(ageRow).toHaveAttribute("data-diff-status", "matched");
  });

  it("closes on Escape key", () => {
    mockSchemaDiffDatasetIds = ["ds-1", "ds-2"];
    render(<SchemaDiffModal />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(mockCloseSchemaDiffModal).toHaveBeenCalledTimes(1);
  });

  it("closes on close button click", () => {
    mockSchemaDiffDatasetIds = ["ds-1", "ds-2"];
    render(<SchemaDiffModal />);

    fireEvent.click(screen.getByTestId("schema-diff-close"));
    expect(mockCloseSchemaDiffModal).toHaveBeenCalledTimes(1);
  });

  it("closes on backdrop click", () => {
    mockSchemaDiffDatasetIds = ["ds-1", "ds-2"];
    render(<SchemaDiffModal />);

    fireEvent.click(screen.getByTestId("schema-diff-backdrop"));
    expect(mockCloseSchemaDiffModal).toHaveBeenCalledTimes(1);
  });

  it("does not close when clicking inside modal content", () => {
    mockSchemaDiffDatasetIds = ["ds-1", "ds-2"];
    render(<SchemaDiffModal />);

    fireEvent.click(screen.getByTestId("schema-diff-content"));
    expect(mockCloseSchemaDiffModal).not.toHaveBeenCalled();
  });

  it("renders summary counts correctly", () => {
    mockSchemaDiffDatasetIds = ["ds-1", "ds-2"];
    render(<SchemaDiffModal />);

    // ds-1: id(Int64), name(Utf8), age(Int32)
    // ds-2: id(Utf8), product(Utf8), amount(Float64), age(Int32)
    // matched: age (1)
    // type-mismatch: id (1)
    // left-only: name (1)
    // right-only: product, amount (2)
    expect(screen.getByTestId("diff-matched-count")).toHaveTextContent("1 matched");
    expect(screen.getByTestId("diff-mismatch-count")).toHaveTextContent("1 type mismatch");
    expect(screen.getByTestId("diff-left-only-count")).toHaveTextContent("1 left only");
    expect(screen.getByTestId("diff-right-only-count")).toHaveTextContent("2 right only");
  });

  it("has correct accessibility attributes", () => {
    mockSchemaDiffDatasetIds = ["ds-1", "ds-2"];
    render(<SchemaDiffModal />);

    const modal = screen.getByTestId("schema-diff-modal");
    expect(modal).toHaveAttribute("role", "dialog");
    expect(modal).toHaveAttribute("aria-modal", "true");
    expect(modal).toHaveAttribute("aria-labelledby", "schema-diff-modal-title");
  });

  it("renders dataset selector dropdowns", () => {
    mockSchemaDiffDatasetIds = ["ds-1", "ds-2"];
    render(<SchemaDiffModal />);

    expect(screen.getByTestId("schema-diff-left-select")).toBeInTheDocument();
    expect(screen.getByTestId("schema-diff-right-select")).toBeInTheDocument();
  });
});

describe("computeSchemaDiff", () => {
  it("correctly computes diff for overlapping schemas with type differences", () => {
    const left = [
      { name: "id", type: "Int64" },
      { name: "name", type: "Utf8" },
      { name: "shared", type: "Boolean" },
    ];
    const right = [
      { name: "id", type: "Utf8" },
      { name: "shared", type: "Boolean" },
      { name: "extra", type: "Float64" },
    ];

    const diff = computeSchemaDiff(left, right);
    expect(diff).toEqual([
      { name: "id", leftType: "Int64", rightType: "Utf8", status: "type-mismatch" },
      { name: "name", leftType: "Utf8", rightType: null, status: "left-only" },
      { name: "shared", leftType: "Boolean", rightType: "Boolean", status: "matched" },
      { name: "extra", leftType: null, rightType: "Float64", status: "right-only" },
    ]);
  });

  it("returns empty array for two empty schemas", () => {
    expect(computeSchemaDiff([], [])).toEqual([]);
  });

  it("handles completely disjoint schemas", () => {
    const left = [{ name: "a", type: "Int64" }];
    const right = [{ name: "b", type: "Utf8" }];
    const diff = computeSchemaDiff(left, right);
    expect(diff).toHaveLength(2);
    expect(diff[0]).toEqual({ name: "a", leftType: "Int64", rightType: null, status: "left-only" });
    expect(diff[1]).toEqual({ name: "b", leftType: null, rightType: "Utf8", status: "right-only" });
  });
});
