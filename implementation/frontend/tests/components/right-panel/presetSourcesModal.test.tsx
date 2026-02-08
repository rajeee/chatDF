// Tests for PresetSourcesModal checkbox click behavior.
//
// PSM-CHECK-1: Clicking checkbox directly toggles selection
// PSM-CHECK-2: Clicking row text toggles selection
// PSM-CHECK-3: Clicking checkbox does not double-toggle (only fires once)
// PSM-SELECTALL-1: Select All checkbox toggles all rows

import { describe, it, expect, beforeEach } from "vitest";
import {
  renderWithProviders,
  screen,
  userEvent,
} from "../../helpers/render";
import { resetAllStores } from "../../helpers/stores";
import { useUiStore } from "@/stores/uiStore";
import { PresetSourcesModal } from "@/components/right-panel/PresetSourcesModal";

beforeEach(() => {
  resetAllStores();
  // Open the preset modal before each test
  useUiStore.setState({ presetModalOpen: true });
});

describe("PresetSourcesModal", () => {
  it("renders dataset rows when open", () => {
    renderWithProviders(<PresetSourcesModal />);
    // Should show at least upgrade0 row
    expect(screen.getByText("resstock_2025_upgrade0")).toBeInTheDocument();
  });

  it("PSM-CHECK-1: clicking checkbox directly toggles selection", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PresetSourcesModal />);

    // Find the first row's checkbox (skip the header "select all" checkbox)
    const checkboxes = screen.getAllByRole("checkbox");
    // checkboxes[0] = header select-all, checkboxes[1] = footer select-all, checkboxes[2+] = row checkboxes
    // Actually in table: checkboxes[0] = thead select-all, then row checkboxes, then footer select-all
    const firstRowCheckbox = checkboxes[1]; // First row checkbox after header

    expect(firstRowCheckbox).not.toBeChecked();

    // Click the checkbox directly
    await user.click(firstRowCheckbox);
    expect(firstRowCheckbox).toBeChecked();

    // Click again to uncheck
    await user.click(firstRowCheckbox);
    expect(firstRowCheckbox).not.toBeChecked();
  });

  it("PSM-CHECK-2: clicking row text toggles selection", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PresetSourcesModal />);

    const checkboxes = screen.getAllByRole("checkbox");
    const firstRowCheckbox = checkboxes[1];

    expect(firstRowCheckbox).not.toBeChecked();

    // Click the name text in the row (not the checkbox)
    await user.click(screen.getByText("resstock_2025_upgrade0"));
    expect(firstRowCheckbox).toBeChecked();
  });

  it("PSM-CHECK-3: checkbox click does not double-toggle", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PresetSourcesModal />);

    const checkboxes = screen.getAllByRole("checkbox");
    const firstRowCheckbox = checkboxes[1];

    // Single click on checkbox should check it (not double-toggle back to unchecked)
    await user.click(firstRowCheckbox);
    expect(firstRowCheckbox).toBeChecked();
  });

  it("PSM-SELECTALL-1: Select All toggles all row checkboxes", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PresetSourcesModal />);

    const checkboxes = screen.getAllByRole("checkbox");
    // Header select-all is first
    const selectAllCheckbox = checkboxes[0];

    // Click select all
    await user.click(selectAllCheckbox);

    // All row checkboxes should be checked (skip first=header, last=footer select-all)
    const rowCheckboxes = checkboxes.slice(1, -1);
    for (const cb of rowCheckboxes) {
      expect(cb).toBeChecked();
    }

    // Click again to deselect all
    await user.click(selectAllCheckbox);
    for (const cb of rowCheckboxes) {
      expect(cb).not.toBeChecked();
    }
  });

  it("shows load button with count of selected items", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PresetSourcesModal />);

    // Initially 0 selected
    expect(screen.getByText("Load (0 selected)")).toBeInTheDocument();

    // Select first row
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[1]);

    expect(screen.getByText("Load (1 selected)")).toBeInTheDocument();
  });
});
