// Tests: spec/frontend/test_plan.md#layout-tests
// Verifies: spec/frontend/plan.md#layout-implementation
//
// FE-L-1: Three panels render
// FE-L-2: Left panel collapse/expand via uiStore toggle
// FE-L-3: Responsive overlay below 1024px
// ChatArea conditional rendering based on datasets + messages

import { describe, it, expect, beforeEach } from "vitest";
import { renderWithProviders, screen, userEvent } from "../helpers/render";
import { resetAllStores, setDatasetsLoaded, setChatIdle } from "../helpers/stores";
import { useConnectionStore } from "@/stores/connectionStore";
import { useUiStore } from "@/stores/uiStore";
import { AppShell } from "@/components/AppShell";

beforeEach(() => {
  resetAllStores();
  useConnectionStore.setState({ status: "disconnected" });
  // Reset window.innerWidth to desktop default
  Object.defineProperty(window, "innerWidth", {
    writable: true,
    configurable: true,
    value: 1280,
  });
});

describe("FE-L-1: Three-panel layout", () => {
  it("renders left panel, chat area, and right panel", () => {
    renderWithProviders(<AppShell />);

    expect(screen.getByTestId("left-panel")).toBeInTheDocument();
    expect(screen.getByTestId("chat-area")).toBeInTheDocument();
    expect(screen.getByTestId("right-panel")).toBeInTheDocument();
  });

  it("renders the header with app title", () => {
    renderWithProviders(<AppShell />);

    expect(screen.getByTestId("header")).toBeInTheDocument();
    const header = screen.getByTestId("header");
    expect(header.textContent).toContain("ChatDF");
  });

  it("renders panels in correct DOM order: left, chat, right", () => {
    renderWithProviders(<AppShell />);

    const main = screen.getByTestId("main-grid");
    const children = Array.from(main.children);
    const leftIdx = children.findIndex(
      (el) => (el as HTMLElement).dataset.testid === "left-panel"
    );
    const chatIdx = children.findIndex(
      (el) => (el as HTMLElement).dataset.testid === "chat-area"
    );
    const rightIdx = children.findIndex(
      (el) => (el as HTMLElement).dataset.testid === "right-panel"
    );

    expect(leftIdx).toBeLessThan(chatIdx);
    expect(chatIdx).toBeLessThan(rightIdx);
  });

  it("right panel has transition classes for smooth resize", () => {
    renderWithProviders(<AppShell />);

    const rightPanel = screen.getByTestId("right-panel");
    expect(rightPanel.className).toContain("transition-all");
    expect(rightPanel.className).toContain("duration-300");
    expect(rightPanel.className).toContain("ease-in-out");
  });
});

describe("FE-L-2: Left panel collapse/expand", () => {
  it("left panel is expanded by default (leftPanelOpen = true)", () => {
    renderWithProviders(<AppShell />);

    const leftPanel = screen.getByTestId("left-panel");
    // When open, panel should have 260px width
    expect(leftPanel).toBeVisible();
  });

  it("clicking hamburger button toggles left panel", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppShell />);

    // Initially open
    expect(useUiStore.getState().leftPanelOpen).toBe(true);

    // Click to close
    await user.click(screen.getByTestId("toggle-left-panel"));
    expect(useUiStore.getState().leftPanelOpen).toBe(false);

    // Click to reopen (re-query since component re-renders)
    await user.click(screen.getByTestId("toggle-left-panel"));
    expect(useUiStore.getState().leftPanelOpen).toBe(true);
  });

  it("collapsed left panel renders as narrow strip", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppShell />);

    const toggleBtn = screen.getByTestId("toggle-left-panel");
    await user.click(toggleBtn);

    const leftPanel = screen.getByTestId("left-panel");
    expect(leftPanel.style.width).toBe("48px");
  });

  it("left panel has transition classes for smooth open/close", () => {
    renderWithProviders(<AppShell />);

    const leftPanel = screen.getByTestId("left-panel");
    expect(leftPanel.className).toContain("transition-all");
    expect(leftPanel.className).toContain("duration-300");
    expect(leftPanel.className).toContain("ease-in-out");
  });

  it("panel content has fade-in animation when expanded", () => {
    renderWithProviders(<AppShell />);

    const leftPanel = screen.getByTestId("left-panel");
    const content = leftPanel.querySelector(".animate-panel-content-fade-in");
    expect(content).toBeInTheDocument();
  });
});

describe("FE-L-3: Responsive behavior below 1024px", () => {
  it("renders backdrop overlay when left panel open on narrow viewport", () => {
    // Simulate narrow viewport
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 900,
    });

    // Panel starts open
    useUiStore.setState({ leftPanelOpen: true });
    renderWithProviders(<AppShell />);

    // On narrow viewports with panel open, a backdrop should be present
    const backdrop = screen.queryByTestId("left-panel-backdrop");
    // The backdrop uses lg: breakpoint. We test via CSS class presence.
    // Since jsdom doesn't truly support media queries, we check structural
    // elements exist. The backdrop element should always render when panel is open,
    // and its visibility is controlled via lg:hidden Tailwind class.
    expect(backdrop).toBeInTheDocument();
  });

  it("backdrop disappears when left panel is closed", () => {
    useUiStore.setState({ leftPanelOpen: false });
    renderWithProviders(<AppShell />);

    const backdrop = screen.queryByTestId("left-panel-backdrop");
    expect(backdrop).not.toBeInTheDocument();
  });

  it("backdrop has fade-in animation when rendered", () => {
    useUiStore.setState({ leftPanelOpen: true });
    renderWithProviders(<AppShell />);

    const backdrop = screen.getByTestId("left-panel-backdrop");
    expect(backdrop.className).toContain("animate-fade-in");
  });
});

describe("Skip-to-content link (A3)", () => {
  it("renders a skip-to-content link as the first focusable element", () => {
    renderWithProviders(<AppShell />);

    const skipLink = screen.getByTestId("skip-to-content");
    expect(skipLink).toBeInTheDocument();
    expect(skipLink.tagName).toBe("A");
    expect(skipLink).toHaveAttribute("href", "#main-content");
    expect(skipLink).toHaveTextContent("Skip to main content");
  });

  it("skip link appears before the header in DOM order", () => {
    renderWithProviders(<AppShell />);

    const shell = screen.getByTestId("app-shell");
    const children = Array.from(shell.children);
    const skipIdx = children.findIndex(
      (el) => (el as HTMLElement).dataset.testid === "skip-to-content"
    );
    const headerIdx = children.findIndex(
      (el) => (el as HTMLElement).dataset.testid === "header"
    );

    expect(skipIdx).toBeLessThan(headerIdx);
  });

  it("chat area has matching id for skip link target", () => {
    renderWithProviders(<AppShell />);

    const chatArea = screen.getByTestId("chat-area");
    expect(chatArea).toHaveAttribute("id", "main-content");
    expect(chatArea.tabIndex).toBe(-1);
  });
});

describe("ChatArea conditional rendering", () => {
  it("shows onboarding placeholder when no datasets and no messages", () => {
    // Default state: no datasets, no messages, no active conversation
    renderWithProviders(<AppShell />);

    expect(screen.getByTestId("onboarding-guide")).toBeInTheDocument();
  });

  it("shows suggested prompts placeholder when datasets exist but no messages", () => {
    setChatIdle("conv-1");
    setDatasetsLoaded([
      {
        id: "ds-1",
        conversation_id: "conv-1",
        url: "https://example.com/data.csv",
        name: "test_data",
        row_count: 100,
        column_count: 3,
        schema_json: "{}",
        status: "ready",
        error_message: null,
      },
    ]);

    renderWithProviders(<AppShell />);

    expect(screen.getByTestId("suggested-prompts")).toBeInTheDocument();
  });

  it("shows message list placeholder when messages exist", () => {
    setChatIdle("conv-1", [
      {
        id: "msg-1",
        role: "user",
        content: "Hello",
        sql_query: null,
        sql_executions: [],
        reasoning: null,
        created_at: new Date().toISOString(),
      },
    ]);

    renderWithProviders(<AppShell />);

    expect(screen.getByTestId("message-list-scroll")).toBeInTheDocument();
  });
});

describe("Connection status indicator (U22)", () => {
  it("renders connection status indicator in the header", () => {
    renderWithProviders(<AppShell />);
    expect(screen.getByTestId("connection-status")).toBeInTheDocument();
  });

  it("shows red dot when disconnected", () => {
    useConnectionStore.setState({ status: "disconnected" });
    renderWithProviders(<AppShell />);

    const indicator = screen.getByTestId("connection-status");
    expect(indicator).toHaveAttribute("aria-label", "Connection status: Disconnected");
  });

  it("shows green dot when connected", () => {
    useConnectionStore.setState({ status: "connected" });
    renderWithProviders(<AppShell />);

    const indicator = screen.getByTestId("connection-status");
    expect(indicator).toHaveAttribute("aria-label", "Connection status: Connected");
  });

  it("shows amber pulsing dot when reconnecting", () => {
    useConnectionStore.setState({ status: "reconnecting" });
    renderWithProviders(<AppShell />);

    const indicator = screen.getByTestId("connection-status");
    expect(indicator).toHaveAttribute("aria-label", "Connection status: Reconnecting");
    // The dot should have animate-pulse class
    const dot = indicator.querySelector("span");
    expect(dot?.className).toContain("animate-pulse");
  });

  it("shows text label only when not connected", () => {
    useConnectionStore.setState({ status: "disconnected" });
    renderWithProviders(<AppShell />);

    const indicator = screen.getByTestId("connection-status");
    expect(indicator.textContent).toContain("Disconnected");
  });

  it("hides text label when connected", () => {
    useConnectionStore.setState({ status: "connected" });
    renderWithProviders(<AppShell />);

    const indicator = screen.getByTestId("connection-status");
    expect(indicator.textContent).not.toContain("Connected");
  });

  it("has role=status and aria-live for accessibility", () => {
    renderWithProviders(<AppShell />);

    const indicator = screen.getByTestId("connection-status");
    expect(indicator).toHaveAttribute("role", "status");
    expect(indicator).toHaveAttribute("aria-live", "polite");
  });
});
