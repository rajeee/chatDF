// Tests for new keyboard shortcut entries in KeyboardShortcutsModal
// Verifies:
// - Escape shortcut is listed
// - Arrow navigation shortcut is listed

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { useUiStore } from "@/stores/uiStore";
import { KeyboardShortcutsModal } from "@/components/chat-area/KeyboardShortcutsModal";

beforeEach(() => {
  useUiStore.setState({ shortcutsModalOpen: false });
});

describe("KeyboardShortcutsModal new entries", () => {
  it("shows Escape shortcut entry", () => {
    useUiStore.setState({ shortcutsModalOpen: true });
    render(<KeyboardShortcutsModal />);

    expect(screen.getByText(/Unfocus chat input \/ Close modal/i)).toBeInTheDocument();
  });

  it("shows arrow navigation shortcut entry", () => {
    useUiStore.setState({ shortcutsModalOpen: true });
    render(<KeyboardShortcutsModal />);

    expect(screen.getByText(/Navigate conversations/i)).toBeInTheDocument();
  });

  it("displays Esc key in shortcut list", () => {
    useUiStore.setState({ shortcutsModalOpen: true });
    render(<KeyboardShortcutsModal />);

    const rows = screen.getAllByTestId("shortcut-row");
    const escRow = rows.find(row => row.textContent?.includes("Unfocus chat input"));
    expect(escRow).toBeDefined();
    expect(escRow?.textContent).toMatch(/Esc/);
  });

  it("displays arrow keys in shortcut list", () => {
    useUiStore.setState({ shortcutsModalOpen: true });
    render(<KeyboardShortcutsModal />);

    const rows = screen.getAllByTestId("shortcut-row");
    const arrowRow = rows.find(row => row.textContent?.includes("Navigate conversations"));
    expect(arrowRow).toBeDefined();
    // The arrows are rendered as unicode characters
    expect(arrowRow?.textContent).toMatch(/[↑↓]/);
  });

  it("shows Toggle theme shortcut entry", () => {
    useUiStore.setState({ shortcutsModalOpen: true });
    render(<KeyboardShortcutsModal />);

    expect(screen.getByText(/Toggle theme/i)).toBeInTheDocument();
  });

  it("displays Ctrl+Shift+L keys in Toggle theme shortcut row", () => {
    useUiStore.setState({ shortcutsModalOpen: true });
    render(<KeyboardShortcutsModal />);

    const rows = screen.getAllByTestId("shortcut-row");
    const themeRow = rows.find(row => row.textContent?.includes("Toggle theme"));
    expect(themeRow).toBeDefined();
    expect(themeRow?.textContent).toMatch(/Shift/);
    expect(themeRow?.textContent).toMatch(/L/);
  });
});
