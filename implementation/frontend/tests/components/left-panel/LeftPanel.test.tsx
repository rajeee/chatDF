// Tests for LeftPanel component
//
// LP-1: Renders collapsed state when leftPanelOpen is false
// LP-2: Renders expanded state when leftPanelOpen is true
// LP-3: Shows hamburger button in collapsed state
// LP-4: Shows Chats and Bookmarks tabs in expanded state
// LP-5: Default view is conversations (ChatHistory visible)
// LP-6: Clicking Bookmarks tab switches to BookmarkPanel
// LP-7: Clicking Chats tab switches back to ChatHistory
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

vi.mock("@/components/left-panel/BookmarkPanel", () => ({
  BookmarkPanel: () => <div data-testid="mock-bookmark-panel">BookmarkPanel</div>,
}));

vi.mock("@/components/left-panel/Settings", () => ({
  Settings: () => <div data-testid="mock-settings">Settings</div>,
}));

vi.mock("@/components/left-panel/UsageStats", () => ({
  UsageStats: () => <div data-testid="mock-usage-stats">UsageStats</div>,
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
    expect(screen.queryByTestId("mock-bookmark-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mock-settings")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mock-usage-stats")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mock-account")).not.toBeInTheDocument();
  });

  it("does not render tabs in collapsed state", () => {
    setUiState({ leftPanelOpen: false });

    render(<LeftPanel />);

    expect(screen.queryByTestId("left-panel-tab-conversations")).not.toBeInTheDocument();
    expect(screen.queryByTestId("left-panel-tab-bookmarks")).not.toBeInTheDocument();
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
    expect(screen.getByTestId("mock-usage-stats")).toBeInTheDocument();
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

describe("LP-4: Shows Chats and Bookmarks tabs in expanded state", () => {
  it("renders Chats tab", () => {
    setUiState({ leftPanelOpen: true });

    render(<LeftPanel />);

    const chatsTab = screen.getByTestId("left-panel-tab-conversations");
    expect(chatsTab).toBeInTheDocument();
    expect(chatsTab).toHaveTextContent("Chats");
  });

  it("renders Bookmarks tab", () => {
    setUiState({ leftPanelOpen: true });

    render(<LeftPanel />);

    const bookmarksTab = screen.getByTestId("left-panel-tab-bookmarks");
    expect(bookmarksTab).toBeInTheDocument();
    expect(bookmarksTab).toHaveTextContent("Bookmarks");
  });
});

describe("LP-5: Default view is conversations (ChatHistory visible)", () => {
  it("shows ChatHistory by default", () => {
    setUiState({ leftPanelOpen: true });

    render(<LeftPanel />);

    expect(screen.getByTestId("mock-chat-history")).toBeInTheDocument();
    expect(screen.queryByTestId("mock-bookmark-panel")).not.toBeInTheDocument();
  });

  it("Chats tab has active styling by default", () => {
    setUiState({ leftPanelOpen: true });

    render(<LeftPanel />);

    const chatsTab = screen.getByTestId("left-panel-tab-conversations");
    // Active tab has accent background color and opacity 1
    expect(chatsTab.style.backgroundColor).toBe("var(--color-accent)");
    expect(chatsTab.style.opacity).toBe("1");
  });
});

describe("LP-6: Clicking Bookmarks tab switches to BookmarkPanel", () => {
  it("shows BookmarkPanel after clicking Bookmarks tab", () => {
    setUiState({ leftPanelOpen: true });

    render(<LeftPanel />);

    const bookmarksTab = screen.getByTestId("left-panel-tab-bookmarks");
    fireEvent.click(bookmarksTab);

    expect(screen.getByTestId("mock-bookmark-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("mock-chat-history")).not.toBeInTheDocument();
  });

  it("Bookmarks tab gets active styling after click", () => {
    setUiState({ leftPanelOpen: true });

    render(<LeftPanel />);

    const bookmarksTab = screen.getByTestId("left-panel-tab-bookmarks");
    fireEvent.click(bookmarksTab);

    expect(bookmarksTab.style.backgroundColor).toBe("var(--color-accent)");
    expect(bookmarksTab.style.opacity).toBe("1");
  });

  it("Chats tab loses active styling after switching to Bookmarks", () => {
    setUiState({ leftPanelOpen: true });

    render(<LeftPanel />);

    const bookmarksTab = screen.getByTestId("left-panel-tab-bookmarks");
    fireEvent.click(bookmarksTab);

    const chatsTab = screen.getByTestId("left-panel-tab-conversations");
    expect(chatsTab.style.backgroundColor).toBe("transparent");
    expect(chatsTab.style.opacity).toBe("0.6");
  });
});

describe("LP-7: Clicking Chats tab switches back to ChatHistory", () => {
  it("shows ChatHistory again after switching back from Bookmarks", () => {
    setUiState({ leftPanelOpen: true });

    render(<LeftPanel />);

    // Switch to bookmarks first
    const bookmarksTab = screen.getByTestId("left-panel-tab-bookmarks");
    fireEvent.click(bookmarksTab);
    expect(screen.getByTestId("mock-bookmark-panel")).toBeInTheDocument();

    // Switch back to chats
    const chatsTab = screen.getByTestId("left-panel-tab-conversations");
    fireEvent.click(chatsTab);

    expect(screen.getByTestId("mock-chat-history")).toBeInTheDocument();
    expect(screen.queryByTestId("mock-bookmark-panel")).not.toBeInTheDocument();
  });

  it("Chats tab gets active styling after switching back", () => {
    setUiState({ leftPanelOpen: true });

    render(<LeftPanel />);

    // Switch to bookmarks, then back to chats
    fireEvent.click(screen.getByTestId("left-panel-tab-bookmarks"));
    fireEvent.click(screen.getByTestId("left-panel-tab-conversations"));

    const chatsTab = screen.getByTestId("left-panel-tab-conversations");
    expect(chatsTab.style.backgroundColor).toBe("var(--color-accent)");
    expect(chatsTab.style.opacity).toBe("1");
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
