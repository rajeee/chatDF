import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen } from "../helpers/render";
import { fireEvent } from "@testing-library/react";
import { resetAllStores } from "../helpers/stores";
import { useUiStore } from "@/stores/uiStore";

// Mock child components
vi.mock("@/components/Header", () => ({
  Header: () => <div data-testid="header">Header</div>,
}));
vi.mock("@/components/left-panel/LeftPanel", () => ({
  LeftPanel: () => <div data-testid="left-panel">LeftPanel</div>,
}));
vi.mock("@/components/chat-area/ChatArea", () => ({
  ChatArea: () => <div data-testid="chat-area">ChatArea</div>,
}));
vi.mock("@/components/right-panel/RightPanel", () => ({
  RightPanel: () => <div data-testid="right-panel">RightPanel</div>,
}));
vi.mock("@/components/ConnectionBanner", () => ({
  ConnectionBanner: () => (
    <div data-testid="connection-banner">ConnectionBanner</div>
  ),
}));

// Mock hooks
const mockNavigate = vi.fn();
const mockSwitchConversation = vi.fn();
let mockUrlConversationId: string | undefined = undefined;
let mockActiveConversationId: string | null = null;
let mockIsAuthenticated = false;

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ conversationId: mockUrlConversationId }),
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: mockIsAuthenticated }),
}));

vi.mock("@/hooks/useWebSocket", () => ({
  useWebSocket: vi.fn(),
}));

vi.mock("@/hooks/useConversation", () => ({
  useConversation: () => ({
    activeConversationId: mockActiveConversationId,
    switchConversation: mockSwitchConversation,
  }),
}));

import { AppShell } from "@/components/AppShell";
import { useWebSocket } from "@/hooks/useWebSocket";

describe("AppShell", () => {
  beforeEach(() => {
    resetAllStores();
    // Ensure rightPanelOpen is also reset (resetAllStores may not cover it)
    useUiStore.setState({ rightPanelOpen: true });
    mockUrlConversationId = undefined;
    mockActiveConversationId = null;
    mockIsAuthenticated = false;
    mockNavigate.mockClear();
    mockSwitchConversation.mockClear();
    vi.mocked(useWebSocket).mockClear();
  });

  // ─── Basic rendering ─────────────────────────────────────────────────

  describe("Basic rendering", () => {
    it("renders app-shell container", () => {
      renderWithProviders(<AppShell />);
      expect(screen.getByTestId("app-shell")).toBeInTheDocument();
    });

    it("renders skip-to-content link", () => {
      renderWithProviders(<AppShell />);
      expect(screen.getByTestId("skip-to-content")).toBeInTheDocument();
    });

    it("renders Header component", () => {
      renderWithProviders(<AppShell />);
      expect(screen.getByTestId("header")).toBeInTheDocument();
    });

    it("renders ConnectionBanner component", () => {
      renderWithProviders(<AppShell />);
      expect(screen.getByTestId("connection-banner")).toBeInTheDocument();
    });

    it("renders main-grid with LeftPanel, ChatArea, RightPanel", () => {
      renderWithProviders(<AppShell />);

      const mainGrid = screen.getByTestId("main-grid");
      expect(mainGrid).toBeInTheDocument();
      expect(screen.getByTestId("left-panel")).toBeInTheDocument();
      expect(screen.getByTestId("chat-area")).toBeInTheDocument();
      expect(screen.getByTestId("right-panel")).toBeInTheDocument();
    });

    it("app shell has correct styling (background color, text color)", () => {
      renderWithProviders(<AppShell />);

      const shell = screen.getByTestId("app-shell");
      expect(shell.style.backgroundColor).toBe("var(--color-bg)");
      expect(shell.style.color).toBe("var(--color-text)");
    });
  });

  // ─── Panel backdrops ─────────────────────────────────────────────────

  describe("Panel backdrops", () => {
    it("does not show left-panel-backdrop when left panel is closed", () => {
      useUiStore.setState({ leftPanelOpen: false });
      renderWithProviders(<AppShell />);

      expect(
        screen.queryByTestId("left-panel-backdrop")
      ).not.toBeInTheDocument();
    });

    it("shows left-panel-backdrop when left panel is open", () => {
      useUiStore.setState({ leftPanelOpen: true });
      renderWithProviders(<AppShell />);

      expect(screen.getByTestId("left-panel-backdrop")).toBeInTheDocument();
    });

    it("clicking left-panel-backdrop toggles left panel closed", () => {
      useUiStore.setState({ leftPanelOpen: true });
      renderWithProviders(<AppShell />);

      const backdrop = screen.getByTestId("left-panel-backdrop");
      fireEvent.click(backdrop);

      // After clicking, leftPanelOpen should be toggled to false
      expect(useUiStore.getState().leftPanelOpen).toBe(false);
      // Backdrop should disappear since panel is now closed
      expect(
        screen.queryByTestId("left-panel-backdrop")
      ).not.toBeInTheDocument();
    });

    it("does not show right-panel-backdrop when right panel is closed", () => {
      useUiStore.setState({ rightPanelOpen: false });
      renderWithProviders(<AppShell />);

      expect(
        screen.queryByTestId("right-panel-backdrop")
      ).not.toBeInTheDocument();
    });

    it("shows right-panel-backdrop when right panel is open", () => {
      useUiStore.setState({ rightPanelOpen: true });
      renderWithProviders(<AppShell />);

      expect(screen.getByTestId("right-panel-backdrop")).toBeInTheDocument();
    });

    it("clicking right-panel-backdrop toggles right panel closed", () => {
      useUiStore.setState({ rightPanelOpen: true });
      renderWithProviders(<AppShell />);

      const backdrop = screen.getByTestId("right-panel-backdrop");
      fireEvent.click(backdrop);

      // After clicking, rightPanelOpen should be toggled to false
      expect(useUiStore.getState().rightPanelOpen).toBe(false);
      // Backdrop should disappear since panel is now closed
      expect(
        screen.queryByTestId("right-panel-backdrop")
      ).not.toBeInTheDocument();
    });
  });

  // ─── WebSocket integration ───────────────────────────────────────────

  describe("WebSocket integration", () => {
    it("calls useWebSocket with isAuthenticated=false when not authenticated", () => {
      mockIsAuthenticated = false;
      renderWithProviders(<AppShell />);

      expect(useWebSocket).toHaveBeenCalledWith(false);
    });

    it("calls useWebSocket with isAuthenticated=true when authenticated", () => {
      mockIsAuthenticated = true;
      renderWithProviders(<AppShell />);

      expect(useWebSocket).toHaveBeenCalledWith(true);
    });
  });

  // ─── URL synchronization ─────────────────────────────────────────────

  describe("URL synchronization", () => {
    it("switches to URL conversation on mount when URL has conversationId", () => {
      mockUrlConversationId = "conv-abc-123";
      mockActiveConversationId = null;
      renderWithProviders(<AppShell />);

      expect(mockSwitchConversation).toHaveBeenCalledWith("conv-abc-123");
    });

    it("does not switch conversation when URL has no conversationId", () => {
      mockUrlConversationId = undefined;
      mockActiveConversationId = null;
      renderWithProviders(<AppShell />);

      expect(mockSwitchConversation).not.toHaveBeenCalled();
    });

    it("does not switch conversation when URL conversationId matches active", () => {
      mockUrlConversationId = "conv-abc-123";
      mockActiveConversationId = "conv-abc-123";
      renderWithProviders(<AppShell />);

      expect(mockSwitchConversation).not.toHaveBeenCalled();
    });
  });

  // ─── Skip link ───────────────────────────────────────────────────────

  describe("Skip link", () => {
    it("skip-to-content link has correct href", () => {
      renderWithProviders(<AppShell />);

      const skipLink = screen.getByTestId("skip-to-content");
      expect(skipLink).toHaveAttribute("href", "#main-content");
    });

    it("skip-to-content link has correct text", () => {
      renderWithProviders(<AppShell />);

      const skipLink = screen.getByTestId("skip-to-content");
      expect(skipLink).toHaveTextContent("Skip to main content");
    });
  });

  // ─── Layout structure ────────────────────────────────────────────────

  describe("Layout structure", () => {
    it("main grid contains all three panels as children", () => {
      renderWithProviders(<AppShell />);

      const mainGrid = screen.getByTestId("main-grid");
      const children = Array.from(mainGrid.children);

      const testIds = children.map(
        (el) => (el as HTMLElement).dataset.testid
      );
      expect(testIds).toContain("left-panel");
      expect(testIds).toContain("chat-area");
      expect(testIds).toContain("right-panel");
    });

    it("panels are in correct DOM order: left, chat, right", () => {
      renderWithProviders(<AppShell />);

      const mainGrid = screen.getByTestId("main-grid");
      const children = Array.from(mainGrid.children);

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
  });
});
