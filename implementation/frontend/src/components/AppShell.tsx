// Implements: spec/frontend/plan.md#layout-implementation
//
// AppShell: Top-level layout component.
// CSS Grid three-panel layout: left 260px/0px, center 1fr, right 300px.
// Transition on grid-template-columns (~200ms).
// Contains Header + main grid with LeftPanel, ChatArea, RightPanel.
// Below 1024px: left and right panels as fixed overlays with backdrop.

import { useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useUiStore } from "@/stores/uiStore";
import { useAuth } from "@/hooks/useAuth";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useConversation } from "@/hooks/useConversation";
import { Header } from "@/components/Header";
import { LeftPanel } from "@/components/left-panel/LeftPanel";
import { ChatArea } from "@/components/chat-area/ChatArea";
import { RightPanel } from "@/components/right-panel/RightPanel";
import { ConnectionBanner } from "@/components/ConnectionBanner";

export function AppShell() {
  const leftPanelOpen = useUiStore((s) => s.leftPanelOpen);
  const toggleLeftPanel = useUiStore((s) => s.toggleLeftPanel);
  const rightPanelOpen = useUiStore((s) => s.rightPanelOpen);
  const toggleRightPanel = useUiStore((s) => s.toggleRightPanel);

  const { isAuthenticated } = useAuth();
  const { conversationId: urlConversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();

  // Establish WebSocket connection when authenticated
  useWebSocket(isAuthenticated);

  // Load conversation data when active conversation changes
  const { activeConversationId, switchConversation } = useConversation();

  // On mount: if URL has a conversationId, switch to it
  const initialSyncDone = useRef(false);
  useEffect(() => {
    if (initialSyncDone.current) return;
    initialSyncDone.current = true;
    if (urlConversationId && urlConversationId !== activeConversationId) {
      switchConversation(urlConversationId);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync URL when activeConversationId changes (user clicks sidebar, creates conversation, etc.)
  useEffect(() => {
    const currentUrlId = urlConversationId ?? null;
    if (activeConversationId && activeConversationId !== currentUrlId) {
      navigate(`/c/${activeConversationId}`, { replace: true });
    } else if (!activeConversationId && currentUrlId) {
      navigate("/", { replace: true });
    }
  }, [activeConversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      data-testid="app-shell"
      className="flex flex-col safe-area-top safe-area-left safe-area-right overflow-x-hidden"
      style={{
        backgroundColor: "var(--color-bg)",
        color: "var(--color-text)",
        minHeight: "var(--app-height, 100vh)",
      }}
    >
      {/* Skip-to-content link for keyboard/screen-reader users */}
      <a
        href="#main-content"
        className="skip-to-content"
        data-testid="skip-to-content"
      >
        Skip to main content
      </a>

      <Header />
      <ConnectionBanner />

      {/* Backdrop for mobile overlay when left panel is open */}
      {leftPanelOpen && (
        <div
          data-testid="left-panel-backdrop"
          className="fixed inset-0 z-30 lg:hidden animate-fade-in"
          style={{ backgroundColor: "var(--color-backdrop)" }}
          onClick={toggleLeftPanel}
        />
      )}

      {/* Backdrop for mobile overlay when right panel is open */}
      {rightPanelOpen && (
        <div
          data-testid="right-panel-backdrop"
          className="fixed inset-0 z-30 lg:hidden animate-fade-in"
          style={{ backgroundColor: "var(--color-backdrop)" }}
          onClick={toggleRightPanel}
        />
      )}

      <main
        data-testid="main-grid"
        className="flex flex-1"
      >
        <LeftPanel />
        <ChatArea />
        <RightPanel />
      </main>
    </div>
  );
}
