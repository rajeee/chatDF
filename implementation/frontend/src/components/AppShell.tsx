// Implements: spec/frontend/plan.md#layout-implementation
//
// AppShell: Top-level layout component.
// CSS Grid three-panel layout: left 260px/0px, center 1fr, right 300px.
// Transition on grid-template-columns (~200ms).
// Contains Header + main grid with LeftPanel, ChatArea, RightPanel.
// Below 1024px: left panel as fixed overlay with backdrop.

import { useUiStore } from "@/stores/uiStore";
import { useAuth } from "@/hooks/useAuth";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useConversation } from "@/hooks/useConversation";
import { Header } from "@/components/Header";
import { LeftPanel } from "@/components/left-panel/LeftPanel";
import { ChatArea } from "@/components/chat-area/ChatArea";
import { RightPanel } from "@/components/right-panel/RightPanel";

export function AppShell() {
  const leftPanelOpen = useUiStore((s) => s.leftPanelOpen);
  const toggleLeftPanel = useUiStore((s) => s.toggleLeftPanel);

  const { isAuthenticated } = useAuth();

  // Establish WebSocket connection when authenticated
  useWebSocket(isAuthenticated);

  // Load conversation data when active conversation changes
  useConversation();

  return (
    <div
      data-testid="app-shell"
      className="flex flex-col h-screen"
      style={{ backgroundColor: "var(--color-bg)", color: "var(--color-text)" }}
    >
      <Header />

      {/* Backdrop for mobile overlay when left panel is open */}
      {leftPanelOpen && (
        <div
          data-testid="left-panel-backdrop"
          className="fixed inset-0 z-30 bg-black bg-opacity-50 lg:hidden"
          onClick={toggleLeftPanel}
        />
      )}

      <main
        data-testid="main-grid"
        className="flex flex-1 overflow-hidden"
      >
        <LeftPanel />
        <ChatArea />
        <RightPanel />
      </main>
    </div>
  );
}
