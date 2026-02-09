import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Mock all dependencies needed by AppShell
vi.mock("@/stores/uiStore", () => ({
  useUiStore: (sel: (s: any) => any) => sel({ leftPanelOpen: false, rightPanelOpen: false, toggleLeftPanel: vi.fn(), toggleRightPanel: vi.fn() }),
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));
vi.mock("@/hooks/useWebSocket", () => ({
  useWebSocket: vi.fn(),
}));
vi.mock("@/hooks/useConversation", () => ({
  useConversation: () => ({ activeConversationId: null, switchConversation: vi.fn() }),
}));
vi.mock("@/components/Header", () => ({
  Header: () => <div data-testid="header">Header</div>,
}));
vi.mock("@/components/left-panel/LeftPanel", () => ({
  LeftPanel: () => <div>Left</div>,
}));
vi.mock("@/components/chat-area/ChatArea", () => ({
  ChatArea: () => <div>Chat</div>,
}));
vi.mock("@/components/right-panel/RightPanel", () => ({
  RightPanel: () => <div>Right</div>,
}));

import { AppShell } from "@/components/AppShell";

describe("Safe-area insets", () => {
  it("applies safe-area classes to AppShell", () => {
    render(<MemoryRouter><AppShell /></MemoryRouter>);
    const shell = screen.getByTestId("app-shell");
    expect(shell.className).toContain("safe-area-top");
    expect(shell.className).toContain("safe-area-left");
    expect(shell.className).toContain("safe-area-right");
  });
});
