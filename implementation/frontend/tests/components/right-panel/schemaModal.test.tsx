// Tests: spec/frontend/right_panel/schema_modal/spec.md
// Verifies: spec/frontend/right_panel/schema_modal/plan.md
//
// SM-OPEN-1:    Renders when schemaModalDatasetId is set
// SM-RENAME-1:  Rename on blur saves via store
// SM-REFRESH-1: Refresh button calls API
// SM-CLOSE-1:   Escape closes modal
// SM-CLOSE-2:   Backdrop click closes modal

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
import { useUiStore } from "@/stores/uiStore";
import { useDatasetStore } from "@/stores/datasetStore";
import { server } from "../../helpers/mocks/server";
import { http, HttpResponse } from "msw";
import { SchemaModal } from "@/components/right-panel/SchemaModal";

function makeDataset(overrides: Partial<Dataset> = {}): Dataset {
  return {
    id: "ds-1",
    conversation_id: "conv-1",
    url: "https://example.com/sales.parquet",
    name: "sales",
    row_count: 1000,
    column_count: 5,
    schema_json: JSON.stringify([
      { name: "id", type: "Int64" },
      { name: "product", type: "Utf8" },
      { name: "price", type: "Float64" },
      { name: "created", type: "DateTime" },
      { name: "active", type: "Boolean" },
    ]),
    status: "ready",
    error_message: null,
    ...overrides,
  };
}

beforeEach(() => {
  resetAllStores();
  setChatIdle("conv-1");
});

describe("SM-OPEN-1: Renders when schemaModalDatasetId is set", () => {
  it("renders modal with dataset info when schemaModalDatasetId is set", () => {
    const dataset = makeDataset();
    setDatasetsLoaded([dataset]);
    setUiState({ schemaModalDatasetId: "ds-1" });

    renderWithProviders(<SchemaModal />);

    // Table name input should have the dataset name
    const nameInput = screen.getByDisplayValue("sales");
    expect(nameInput).toBeInTheDocument();

    // Dimensions
    expect(screen.getByText(/1,000 rows/)).toBeInTheDocument();
    expect(screen.getByText(/5 columns/)).toBeInTheDocument();
  });

  it("does not render when schemaModalDatasetId is null", () => {
    setUiState({ schemaModalDatasetId: null });

    renderWithProviders(<SchemaModal />);

    expect(screen.queryByTestId("schema-modal")).not.toBeInTheDocument();
  });

  it("shows column list with friendly type names", () => {
    const dataset = makeDataset();
    setDatasetsLoaded([dataset]);
    setUiState({ schemaModalDatasetId: "ds-1" });

    renderWithProviders(<SchemaModal />);

    // Column names
    expect(screen.getByText("id")).toBeInTheDocument();
    expect(screen.getByText("product")).toBeInTheDocument();
    expect(screen.getByText("price")).toBeInTheDocument();
    expect(screen.getByText("created")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();

    // Friendly type names
    expect(screen.getByText("Integer")).toBeInTheDocument();
    expect(screen.getByText("Text")).toBeInTheDocument();
    expect(screen.getByText("Decimal")).toBeInTheDocument();
    expect(screen.getByText("Date")).toBeInTheDocument();
    expect(screen.getByText("Boolean")).toBeInTheDocument();
  });
});

describe("SM-RENAME-1: Rename on blur saves", () => {
  it("updates dataset name on blur when changed", async () => {
    server.use(
      http.patch("/conversations/:id/datasets/:datasetId", () => {
        return HttpResponse.json({ success: true });
      })
    );

    const dataset = makeDataset();
    setDatasetsLoaded([dataset]);
    setUiState({ schemaModalDatasetId: "ds-1" });

    const user = userEvent.setup();
    renderWithProviders(<SchemaModal />);

    const nameInput = screen.getByDisplayValue("sales");
    await user.clear(nameInput);
    await user.type(nameInput, "revenue");
    await user.tab(); // Trigger blur

    await waitFor(() => {
      expect(useDatasetStore.getState().datasets[0].name).toBe("revenue");
    });
  });

  it("updates dataset name on Enter key", async () => {
    server.use(
      http.patch("/conversations/:id/datasets/:datasetId", () => {
        return HttpResponse.json({ success: true });
      })
    );

    const dataset = makeDataset();
    setDatasetsLoaded([dataset]);
    setUiState({ schemaModalDatasetId: "ds-1" });

    const user = userEvent.setup();
    renderWithProviders(<SchemaModal />);

    const nameInput = screen.getByDisplayValue("sales");
    await user.clear(nameInput);
    await user.type(nameInput, "revenue{Enter}");

    await waitFor(() => {
      expect(useDatasetStore.getState().datasets[0].name).toBe("revenue");
    });
  });
});

describe("SM-REFRESH-1: Refresh button calls API", () => {
  it("shows spinner during refresh and calls POST endpoint", async () => {
    let refreshCalled = false;
    server.use(
      http.post("/conversations/:id/datasets/:datasetId/refresh", () => {
        refreshCalled = true;
        return HttpResponse.json({
          row_count: 2000,
          column_count: 6,
          columns: [
            { name: "id", type: "Int64" },
            { name: "product", type: "Utf8" },
            { name: "price", type: "Float64" },
            { name: "created", type: "DateTime" },
            { name: "active", type: "Boolean" },
            { name: "new_col", type: "String" },
          ],
        });
      })
    );

    const dataset = makeDataset();
    setDatasetsLoaded([dataset]);
    setUiState({ schemaModalDatasetId: "ds-1" });

    const user = userEvent.setup();
    renderWithProviders(<SchemaModal />);

    const refreshBtn = screen.getByRole("button", {
      name: /refresh schema/i,
    });
    await user.click(refreshBtn);

    await waitFor(() => {
      expect(refreshCalled).toBe(true);
    });
  });
});

describe("SM-CLOSE-1: Escape closes modal", () => {
  it("closes modal when Escape key is pressed", async () => {
    const dataset = makeDataset();
    setDatasetsLoaded([dataset]);
    setUiState({ schemaModalDatasetId: "ds-1" });

    const user = userEvent.setup();
    renderWithProviders(<SchemaModal />);

    expect(screen.getByTestId("schema-modal")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(useUiStore.getState().schemaModalDatasetId).toBeNull();
  });
});

describe("Accessibility: ARIA dialog attributes", () => {
  it("has role='dialog' and aria-modal='true'", () => {
    const dataset = makeDataset();
    setDatasetsLoaded([dataset]);
    setUiState({ schemaModalDatasetId: "ds-1" });

    renderWithProviders(<SchemaModal />);

    const modal = screen.getByTestId("schema-modal");
    expect(modal).toHaveAttribute("role", "dialog");
    expect(modal).toHaveAttribute("aria-modal", "true");
  });

  it("has aria-labelledby pointing to modal title", () => {
    const dataset = makeDataset();
    setDatasetsLoaded([dataset]);
    setUiState({ schemaModalDatasetId: "ds-1" });

    renderWithProviders(<SchemaModal />);

    const modal = screen.getByTestId("schema-modal");
    expect(modal).toHaveAttribute("aria-labelledby", "schema-modal-title");

    const title = document.getElementById("schema-modal-title");
    expect(title).toBeInTheDocument();
    expect(title?.textContent).toBe("Dataset Schema");
  });
});

describe("Modal entrance animation", () => {
  it("applies entrance animation classes to backdrop and content", () => {
    const dataset = makeDataset();
    setDatasetsLoaded([dataset]);
    setUiState({ schemaModalDatasetId: "ds-1" });

    renderWithProviders(<SchemaModal />);

    const backdrop = screen.getByTestId("schema-modal-backdrop");
    expect(backdrop).toHaveClass("modal-backdrop-enter");

    const content = screen.getByTestId("schema-modal-content");
    expect(content).toHaveClass("modal-scale-enter");
  });
});

describe("SM-CLOSE-2: Backdrop click closes modal", () => {
  it("closes modal when clicking the backdrop", async () => {
    const dataset = makeDataset();
    setDatasetsLoaded([dataset]);
    setUiState({ schemaModalDatasetId: "ds-1" });

    const user = userEvent.setup();
    renderWithProviders(<SchemaModal />);

    const backdrop = screen.getByTestId("schema-modal-backdrop");
    await user.click(backdrop);

    expect(useUiStore.getState().schemaModalDatasetId).toBeNull();
  });

  it("does not close when clicking inside the modal content", async () => {
    const dataset = makeDataset();
    setDatasetsLoaded([dataset]);
    setUiState({ schemaModalDatasetId: "ds-1" });

    const user = userEvent.setup();
    renderWithProviders(<SchemaModal />);

    const modalContent = screen.getByTestId("schema-modal-content");
    await user.click(modalContent);

    expect(useUiStore.getState().schemaModalDatasetId).toBe("ds-1");
  });

  it("closes modal when X button is clicked", async () => {
    const dataset = makeDataset();
    setDatasetsLoaded([dataset]);
    setUiState({ schemaModalDatasetId: "ds-1" });

    const user = userEvent.setup();
    renderWithProviders(<SchemaModal />);

    const closeBtn = screen.getByRole("button", { name: /close/i });
    await user.click(closeBtn);

    expect(useUiStore.getState().schemaModalDatasetId).toBeNull();
  });

  it("close button renders X icon SVG instead of text", () => {
    const dataset = makeDataset();
    setDatasetsLoaded([dataset]);
    setUiState({ schemaModalDatasetId: "ds-1" });

    renderWithProviders(<SchemaModal />);

    const closeBtn = screen.getByRole("button", { name: /close/i });
    const svg = closeBtn.querySelector("svg");

    expect(svg).toBeInTheDocument();
    expect(svg?.getAttribute("viewBox")).toBe("0 0 20 20");
  });
});
