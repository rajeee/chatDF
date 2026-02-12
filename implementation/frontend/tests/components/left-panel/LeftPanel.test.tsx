// Tests for LeftPanel component
//
// LP-1: Renders collapsed state when leftPanelOpen is false
// LP-2: Renders expanded state when leftPanelOpen is true
// LP-3: Shows hamburger button in collapsed state
// LP-5: Default view shows ChatHistory
// LP-8: Toggle button calls toggleLeftPanel
// LP-9: Resize handle exists in expanded state
// LP-10: Panel width matches leftPanelWidth from store

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useUiStore } from "@/stores/uiStore";

// Mock child components with simple divs
vi.mock("@/components/left-panel/ChatHistory", () => ({
  ChatHistory: () => <div data-testid="mock-chat-history">ChatHistory</div>,
}));

vi.mock("@/components/left-panel/Settings", () => ({
  Settings: () => <div data-testid="mock-settings">Settings</div>,
}));

vi.mock("@/components/left-panel/Account", () => ({
  Account: () => <div data-testid="mock-account">Account</div>,
}));

// Mock useSwipeToDismiss hook to return a simple ref
vi.mock("@/hooks/useSwipeToDismiss", () => ({
  useSwipeToDismiss: () => ({ current: null }),
}));

import { LeftPanel } from "@/components/left-panel/LeftPanel";

// Helper to set uiStore state before each test
function setUiState(overrides: Partial<{
  leftPanelOpen: boolean;
  leftPanelWidth: number;
  toggleLeftPanel: () => void;
  setLeftPanelWidth: (w: number) => void;
}>) {
  useUiStore.setState(overrides);
}

beforeEach(() => {
  // Reset to default expanded state
  useUiStore.setState({
    leftPanelOpen: true,
    leftPanelWidth: 260,
  });
});

describe("LP-1: Renders collapsed state when leftPanelOpen is false", () => {
  it("renders a narrow aside when panel is closed", () => {
    setUiState({ leftPanelOpen: false });

    render(<LeftPanel />);

    const panel = screen.getByTestId("left-panel");
    expect(panel).toBeInTheDocument();
    expect(panel.style.width).toBe("48px");
    expect(panel.style.minWidth).toBe("48px");
  });

  it("does not render child components in collapsed state", () => {
    setUiState({ leftPanelOpen: false });

    render(<LeftPanel />);

    expect(screen.queryByTestId("mock-chat-history")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mock-settings")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mock-account")).not.toBeInTheDocument();
  });
});

describe("LP-2: Renders expanded state when leftPanelOpen is true", () => {
  it("renders a wide aside when panel is open", () => {
    setUiState({ leftPanelOpen: true, leftPanelWidth: 260 });

    render(<LeftPanel />);

    const panel = screen.getByTestId("left-panel");
    expect(panel).toBeInTheDocument();
    expect(panel.style.width).toBe("260px");
    expect(panel.style.minWidth).toBe("260px");
  });

  it("renders all child components in expanded state", () => {
    setUiState({ leftPanelOpen: true });

    render(<LeftPanel />);

    expect(screen.getByTestId("mock-chat-history")).toBeInTheDocument();
    expect(screen.getByTestId("mock-settings")).toBeInTheDocument();
    expect(screen.getByTestId("mock-account")).toBeInTheDocument();
  });
});

describe("LP-3: Shows hamburger button in collapsed state", () => {
  it("renders toggle button in collapsed state", () => {
    setUiState({ leftPanelOpen: false });

    render(<LeftPanel />);

    const toggleBtn = screen.getByTestId("toggle-left-panel");
    expect(toggleBtn).toBeInTheDocument();
    expect(toggleBtn).toHaveAttribute("aria-label", "Toggle left panel");
  });

  it("toggle button contains an SVG icon (hamburger)", () => {
    setUiState({ leftPanelOpen: false });

    const { container } = render(<LeftPanel />);

    const svg = container.querySelector('[data-testid="toggle-left-panel"] svg');
    expect(svg).toBeInTheDocument();
  });
});

describe("LP-5: Default view is conversations (ChatHistory visible)", () => {
  it("shows ChatHistory by default", () => {
    setUiState({ leftPanelOpen: true });

    render(<LeftPanel />);

    expect(screen.getByTestId("mock-chat-history")).toBeInTheDocument();
  });
});

describe("LP-8: Toggle button calls toggleLeftPanel", () => {
  it("calls toggleLeftPanel when clicking toggle in collapsed state", () => {
    const mockToggle = vi.fn();
    setUiState({ leftPanelOpen: false, toggleLeftPanel: mockToggle });

    render(<LeftPanel />);

    const toggleBtn = screen.getByTestId("toggle-left-panel");
    fireEvent.click(toggleBtn);

    expect(mockToggle).toHaveBeenCalledTimes(1);
  });

  it("calls toggleLeftPanel when clicking toggle in expanded state", () => {
    const mockToggle = vi.fn();
    setUiState({ leftPanelOpen: true, toggleLeftPanel: mockToggle });

    render(<LeftPanel />);

    const toggleBtn = screen.getByTestId("toggle-left-panel");
    fireEvent.click(toggleBtn);

    expect(mockToggle).toHaveBeenCalledTimes(1);
  });

  it("toggle button has correct title for keyboard shortcut", () => {
    setUiState({ leftPanelOpen: true });

    render(<LeftPanel />);

    const toggleBtn = screen.getByTestId("toggle-left-panel");
    expect(toggleBtn).toHaveAttribute("title", "Toggle sidebar (\u2318/Ctrl+B)");
  });
});

describe("LP-9: Resize handle exists in expanded state", () => {
  it("renders resize handle with cursor-col-resize class", () => {
    setUiState({ leftPanelOpen: true });

    const { container } = render(<LeftPanel />);

    const resizeHandle = container.querySelector(".cursor-col-resize");
    expect(resizeHandle).toBeInTheDocument();
  });

  it("does not render resize handle in collapsed state", () => {
    setUiState({ leftPanelOpen: false });

    const { container } = render(<LeftPanel />);

    const resizeHandle = container.querySelector(".cursor-col-resize");
    expect(resizeHandle).not.toBeInTheDocument();
  });

  it("resize handle is positioned on the right edge", () => {
    setUiState({ leftPanelOpen: true });

    const { container } = render(<LeftPanel />);

    const resizeHandle = container.querySelector(".cursor-col-resize");
    expect(resizeHandle).toHaveClass("absolute", "top-0", "-right-1");
  });
});

describe("LP-10: Panel width matches leftPanelWidth from store", () => {
  it("uses leftPanelWidth from store for expanded width", () => {
    setUiState({ leftPanelOpen: true, leftPanelWidth: 320 });

    render(<LeftPanel />);

    const panel = screen.getByTestId("left-panel");
    expect(panel.style.width).toBe("320px");
    expect(panel.style.minWidth).toBe("320px");
  });

  it("reflects different widths from store", () => {
    setUiState({ leftPanelOpen: true, leftPanelWidth: 200 });

    render(<LeftPanel />);

    const panel = screen.getByTestId("left-panel");
    expect(panel.style.width).toBe("200px");
  });

  it("collapsed state always uses 48px regardless of leftPanelWidth", () => {
    setUiState({ leftPanelOpen: false, leftPanelWidth: 320 });

    render(<LeftPanel />);

    const panel = screen.getByTestId("left-panel");
    expect(panel.style.width).toBe("48px");
  });
});
