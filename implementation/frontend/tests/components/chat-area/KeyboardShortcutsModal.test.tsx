import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KeyboardShortcutsModal } from "@/components/chat-area/KeyboardShortcutsModal";
import { useUiStore } from "@/stores/uiStore";

// Don't mock uiStore - use real store for integration test
describe("KeyboardShortcutsModal", () => {
  beforeEach(() => {
    useUiStore.setState({ shortcutsModalOpen: false });
  });

  it("DEBUG: store has closeShortcutsModal", () => {
    const state = useUiStore.getState();
    console.log("Store keys:", Object.keys(state));
    console.log("closeShortcutsModal:", typeof state.closeShortcutsModal);
    console.log("openShortcutsModal:", typeof state.openShortcutsModal);
    console.log("shortcutsModalOpen:", state.shortcutsModalOpen);
    expect(state.closeShortcutsModal).toBeDefined();
  });

  it("does not render when closed", () => {
    render(<KeyboardShortcutsModal />);
    expect(screen.queryByTestId("keyboard-shortcuts-modal")).not.toBeInTheDocument();
  });

  it("renders when open", () => {
    useUiStore.setState({ shortcutsModalOpen: true });
    render(<KeyboardShortcutsModal />);
    expect(screen.getByTestId("keyboard-shortcuts-modal")).toBeInTheDocument();
    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
  });

  it("shows all shortcut rows", () => {
    useUiStore.setState({ shortcutsModalOpen: true });
    render(<KeyboardShortcutsModal />);
    const rows = screen.getAllByTestId("shortcut-row");
    expect(rows.length).toBeGreaterThanOrEqual(5);
  });

  it("closes when close button is clicked", async () => {
    const user = userEvent.setup();
    useUiStore.setState({ shortcutsModalOpen: true });
    render(<KeyboardShortcutsModal />);

    const closeBtn = screen.getByLabelText("Close");
    await user.click(closeBtn);

    expect(useUiStore.getState().shortcutsModalOpen).toBe(false);
  });

  it("closes when Escape key is pressed", async () => {
    const user = userEvent.setup();
    useUiStore.setState({ shortcutsModalOpen: true });
    render(<KeyboardShortcutsModal />);

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(useUiStore.getState().shortcutsModalOpen).toBe(false);
    });
  });

  it("closes when overlay is clicked", async () => {
    const user = userEvent.setup();
    useUiStore.setState({ shortcutsModalOpen: true });
    render(<KeyboardShortcutsModal />);

    const overlay = screen.getByTestId("keyboard-shortcuts-modal");
    await user.click(overlay);

    expect(useUiStore.getState().shortcutsModalOpen).toBe(false);
  });
});
