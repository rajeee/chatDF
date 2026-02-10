// Extended tests for PresetSourcesModal component.
//
// PSM-RENDER-1:   Modal renders when presetModalOpen is true
// PSM-HIDDEN-1:   Modal hidden when presetModalOpen is false
// PSM-ESC-1:      Escape key closes the modal
// PSM-BACKDROP-1: Backdrop click closes the modal
// PSM-CLOSE-1:    Close button closes the modal
// PSM-SELECT-1:   Selecting a dataset updates the load button count
// PSM-LOAD-1:     Load button disabled when nothing selected
// PSM-ARIA-1:     Modal has proper ARIA attributes
// PSM-TITLE-1:    Modal title shows "Preset Sources"
// PSM-DROPDOWN-1: Data source dropdown renders with options
// PSM-TABLE-1:    Dataset table renders all 33 ResStock datasets
// PSM-ROW-1:      Each row shows name and filename
// PSM-SELECTALL-2: Footer select-all checkbox matches header behavior

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "../../helpers/render";
import { resetAllStores } from "../../helpers/stores";
import { useUiStore } from "@/stores/uiStore";
import { PresetSourcesModal } from "@/components/right-panel/PresetSourcesModal";
import { fireEvent } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetAllStores();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PSM-RENDER-1: Modal renders when open", () => {
  it("renders the modal when presetModalOpen is true", () => {
    useUiStore.setState({ presetModalOpen: true });

    renderWithProviders(<PresetSourcesModal />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows the Preset Sources title", () => {
    useUiStore.setState({ presetModalOpen: true });

    renderWithProviders(<PresetSourcesModal />);

    expect(screen.getByText("Preset Sources")).toBeInTheDocument();
  });
});

describe("PSM-HIDDEN-1: Modal hidden when closed", () => {
  it("returns null when presetModalOpen is false", () => {
    useUiStore.setState({ presetModalOpen: false });

    const { container } = renderWithProviders(<PresetSourcesModal />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(container.innerHTML).toBe("");
  });
});

describe("PSM-ESC-1: Escape key closes the modal", () => {
  it("closes the modal when Escape is pressed", async () => {
    useUiStore.setState({ presetModalOpen: true });

    renderWithProviders(<PresetSourcesModal />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(useUiStore.getState().presetModalOpen).toBe(false);
    });
  });
});

describe("PSM-BACKDROP-1: Backdrop click closes the modal", () => {
  it("closes when clicking the backdrop overlay", async () => {
    useUiStore.setState({ presetModalOpen: true });

    const user = userEvent.setup();
    renderWithProviders(<PresetSourcesModal />);

    // The backdrop is the dialog element itself (the outermost div with role="dialog")
    const backdrop = screen.getByRole("dialog");
    // Click the backdrop directly (not the inner modal content)
    await user.click(backdrop);

    expect(useUiStore.getState().presetModalOpen).toBe(false);
  });
});

describe("PSM-CLOSE-1: Close button", () => {
  it("closes modal when clicking the X close button", async () => {
    useUiStore.setState({ presetModalOpen: true });

    const user = userEvent.setup();
    renderWithProviders(<PresetSourcesModal />);

    const closeBtn = screen.getByRole("button", { name: /close/i });
    await user.click(closeBtn);

    expect(useUiStore.getState().presetModalOpen).toBe(false);
  });
});

describe("PSM-SELECT-1: Selection updates load button", () => {
  it("shows '0 selected' initially", () => {
    useUiStore.setState({ presetModalOpen: true });

    renderWithProviders(<PresetSourcesModal />);

    expect(screen.getByText("Load (0 selected)")).toBeInTheDocument();
  });

  it("updates count when datasets are selected", async () => {
    useUiStore.setState({ presetModalOpen: true });

    const user = userEvent.setup();
    renderWithProviders(<PresetSourcesModal />);

    // Click the first dataset row text to select it
    await user.click(screen.getByText("resstock_2025_upgrade0"));

    expect(screen.getByText("Load (1 selected)")).toBeInTheDocument();

    // Select another
    await user.click(screen.getByText("resstock_2025_upgrade1"));

    expect(screen.getByText("Load (2 selected)")).toBeInTheDocument();
  });
});

describe("PSM-LOAD-1: Load button disabled state", () => {
  it("load button is disabled when nothing is selected", () => {
    useUiStore.setState({ presetModalOpen: true });

    renderWithProviders(<PresetSourcesModal />);

    const loadBtn = screen.getByText("Load (0 selected)");
    expect(loadBtn).toBeDisabled();
  });

  it("load button is enabled when a dataset is selected", async () => {
    useUiStore.setState({ presetModalOpen: true });

    const user = userEvent.setup();
    renderWithProviders(<PresetSourcesModal />);

    await user.click(screen.getByText("resstock_2025_upgrade0"));

    const loadBtn = screen.getByText("Load (1 selected)");
    expect(loadBtn).not.toBeDisabled();
  });
});

describe("PSM-ARIA-1: ARIA attributes", () => {
  it("dialog has aria-modal and aria-labelledby", () => {
    useUiStore.setState({ presetModalOpen: true });

    renderWithProviders(<PresetSourcesModal />);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "preset-sources-modal-title");
  });

  it("title element has matching id for aria-labelledby", () => {
    useUiStore.setState({ presetModalOpen: true });

    renderWithProviders(<PresetSourcesModal />);

    const title = screen.getByText("Preset Sources");
    expect(title).toHaveAttribute("id", "preset-sources-modal-title");
  });
});

describe("PSM-DROPDOWN-1: Data source dropdown", () => {
  it("renders NREL ResStock in the data source dropdown", () => {
    useUiStore.setState({ presetModalOpen: true });

    renderWithProviders(<PresetSourcesModal />);

    const sourceSelect = screen.getByDisplayValue("NREL ResStock");
    expect(sourceSelect).toBeInTheDocument();
  });

  it("renders release dropdown with ResStock 2025 Release 1", () => {
    useUiStore.setState({ presetModalOpen: true });

    renderWithProviders(<PresetSourcesModal />);

    const releaseSelect = screen.getByDisplayValue("ResStock 2025 Release 1");
    expect(releaseSelect).toBeInTheDocument();
  });
});

describe("PSM-TABLE-1: Dataset table completeness", () => {
  it("renders all 33 ResStock upgrade datasets (upgrade0 through upgrade32)", () => {
    useUiStore.setState({ presetModalOpen: true });

    renderWithProviders(<PresetSourcesModal />);

    // Check first, middle, and last datasets
    expect(screen.getByText("resstock_2025_upgrade0")).toBeInTheDocument();
    expect(screen.getByText("resstock_2025_upgrade16")).toBeInTheDocument();
    expect(screen.getByText("resstock_2025_upgrade32")).toBeInTheDocument();

    // Verify total row count (33 rows = upgrade0..upgrade32)
    const checkboxes = screen.getAllByRole("checkbox");
    // Header select-all + 33 row checkboxes + footer select-all = 35 total
    expect(checkboxes).toHaveLength(35);
  });
});

describe("PSM-ROW-1: Row content", () => {
  it("each row shows the dataset name and filename", () => {
    useUiStore.setState({ presetModalOpen: true });

    renderWithProviders(<PresetSourcesModal />);

    expect(screen.getByText("resstock_2025_upgrade0")).toBeInTheDocument();
    expect(screen.getByText("upgrade0.parquet")).toBeInTheDocument();

    expect(screen.getByText("resstock_2025_upgrade5")).toBeInTheDocument();
    expect(screen.getByText("upgrade5.parquet")).toBeInTheDocument();
  });
});

describe("PSM-SELECTALL-2: Footer select all", () => {
  it("footer select-all text shows total count", () => {
    useUiStore.setState({ presetModalOpen: true });

    renderWithProviders(<PresetSourcesModal />);

    expect(screen.getByText("Select All (33)")).toBeInTheDocument();
  });

  it("clicking footer select-all selects all datasets", async () => {
    useUiStore.setState({ presetModalOpen: true });

    const user = userEvent.setup();
    renderWithProviders(<PresetSourcesModal />);

    // The footer select-all is in a label with "Select All (33)"
    const selectAllLabel = screen.getByText("Select All (33)");
    await user.click(selectAllLabel);

    expect(screen.getByText("Load (33 selected)")).toBeInTheDocument();
  });

  it("clicking footer select-all again deselects all", async () => {
    useUiStore.setState({ presetModalOpen: true });

    const user = userEvent.setup();
    renderWithProviders(<PresetSourcesModal />);

    const selectAllLabel = screen.getByText("Select All (33)");
    // Select all
    await user.click(selectAllLabel);
    expect(screen.getByText("Load (33 selected)")).toBeInTheDocument();

    // Deselect all
    await user.click(selectAllLabel);
    expect(screen.getByText("Load (0 selected)")).toBeInTheDocument();
  });
});

describe("PSM-TABLE-HEADER: Table has proper column headers", () => {
  it("shows Name and File column headers", () => {
    useUiStore.setState({ presetModalOpen: true });

    renderWithProviders(<PresetSourcesModal />);

    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("File")).toBeInTheDocument();
  });
});
