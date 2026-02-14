// Implements: spec/frontend/plan.md#layout-implementation (LeftPanel container)
//
// Container for ChatHistory, Settings, UsageStats, Account sections.
// Controlled by uiStore.leftPanelOpen.
// Resizable via drag handle on right edge. Collapsible to 48px strip.

import { useCallback, useRef, useState } from "react";
import { useUiStore } from "@/stores/uiStore";
import { useSwipeToDismiss } from "@/hooks/useSwipeToDismiss";
import { ChatHistory } from "./ChatHistory";
import { BookmarkPanel } from "./BookmarkPanel";
import { SettingsModal } from "./SettingsModal";
import { UsageStats } from "./UsageStats";
import { Account } from "./Account";

type LeftPanelView = "conversations" | "bookmarks";

function GearIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function HamburgerIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

export function LeftPanel() {
  const leftPanelOpen = useUiStore((s) => s.leftPanelOpen);
  const leftPanelWidth = useUiStore((s) => s.leftPanelWidth);
  const toggleLeftPanel = useUiStore((s) => s.toggleLeftPanel);
  const setLeftPanelWidth = useUiStore((s) => s.setLeftPanelWidth);
  const openSettingsModal = useUiStore((s) => s.openSettingsModal);
  const isDragging = useRef(false);
  const [activeView, setActiveView] = useState<LeftPanelView>("conversations");

  const swipeRef = useSwipeToDismiss({
    direction: "left",
    onDismiss: toggleLeftPanel,
    enabled: leftPanelOpen,
  });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      const startX = e.clientX;
      const startWidth = leftPanelWidth;

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const handleMouseMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX;
        setLeftPanelWidth(startWidth + delta);
      };

      const handleMouseUp = () => {
        isDragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [leftPanelWidth, setLeftPanelWidth]
  );

  // Collapsed state: 48px strip with hamburger only (hidden on mobile)
  if (!leftPanelOpen) {
    return (
      <aside
        data-testid="left-panel"
        className="hidden lg:flex flex-col items-center pt-3 sticky top-12 self-start border-r transition-all duration-300 ease-in-out"
        style={{
          width: 48,
          minWidth: 48,
          height: "calc(100vh - 3rem)",
          backgroundColor: "var(--color-surface)",
          borderColor: "var(--color-border)",
        }}
      >
        <button
          data-testid="toggle-left-panel"
          onClick={toggleLeftPanel}
          className="p-1 rounded hover:bg-opacity-10 hover:bg-gray-500 transition-colors"
          aria-label="Toggle left panel"
          title="Toggle sidebar (⌘/Ctrl+B)"
        >
          <HamburgerIcon />
        </button>
        <button
          data-testid="open-settings"
          onClick={openSettingsModal}
          className="p-1 mt-2 rounded hover:bg-opacity-10 hover:bg-gray-500 transition-colors opacity-60 hover:opacity-100"
          aria-label="Open settings"
          title="Settings"
        >
          <GearIcon />
        </button>
        <SettingsModal />
      </aside>
    );
  }

  // Expanded state: full sidebar with hamburger + content + resize handle
  // On mobile: fixed overlay from left side with slide animation
  // On desktop (lg+): inline sticky panel
  const mobileClasses = "fixed top-12 left-0 bottom-0 z-40 animate-slide-in-left";
  const desktopClasses = "lg:relative lg:sticky lg:top-12 lg:self-start lg:z-auto lg:animate-none";

  return (
    <aside
      ref={swipeRef as React.RefObject<HTMLElement>}
      data-testid="left-panel"
      className={`flex flex-col border-r transition-all duration-300 ease-in-out ${mobileClasses} ${desktopClasses}`}
      style={{
        width: leftPanelWidth,
        minWidth: leftPanelWidth,
        height: "calc(100vh - 3rem)",
        backgroundColor: "var(--color-surface)",
        borderColor: "var(--color-border)",
      }}
    >
      <div className="flex flex-col h-full p-4 overflow-y-auto animate-panel-content-fade-in">
        <div className="flex items-center gap-2 mb-3">
          <button
            data-testid="toggle-left-panel"
            onClick={toggleLeftPanel}
            className="p-1 rounded hover:bg-opacity-10 hover:bg-gray-500 transition-colors"
            aria-label="Toggle left panel"
            title="Toggle sidebar (⌘/Ctrl+B)"
          >
            <HamburgerIcon />
          </button>
          <div className="flex flex-1 rounded overflow-hidden border" style={{ borderColor: "var(--color-border)" }}>
            <button
              data-testid="left-panel-tab-conversations"
              className="flex-1 px-2 py-1 text-xs font-medium transition-colors"
              style={{
                backgroundColor: activeView === "conversations" ? "var(--color-accent)" : "transparent",
                color: activeView === "conversations" ? "white" : "var(--color-text)",
                opacity: activeView === "conversations" ? 1 : 0.6,
              }}
              onClick={() => setActiveView("conversations")}
            >
              Chats
            </button>
            <button
              data-testid="left-panel-tab-bookmarks"
              className="flex-1 px-2 py-1 text-xs font-medium transition-colors flex items-center justify-center gap-1"
              style={{
                backgroundColor: activeView === "bookmarks" ? "var(--color-accent)" : "transparent",
                color: activeView === "bookmarks" ? "white" : "var(--color-text)",
                opacity: activeView === "bookmarks" ? 1 : 0.6,
              }}
              onClick={() => setActiveView("bookmarks")}
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
              Bookmarks
            </button>
          </div>
        </div>
        {activeView === "conversations" ? <ChatHistory /> : <BookmarkPanel />}
        <div className="mt-4">
          <UsageStats />
        </div>
        <div className="mt-auto flex items-center justify-between">
          <Account />
          <button
            data-testid="open-settings"
            onClick={openSettingsModal}
            className="p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors opacity-60 hover:opacity-100"
            aria-label="Open settings"
            title="Settings"
          >
            <GearIcon />
          </button>
        </div>
        <SettingsModal />
      </div>
      {/* Resize handle — wider hit area with visible feedback line */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute top-0 -right-1 w-3 h-full cursor-col-resize group transition-colors"
        style={{ zIndex: 10 }}
      >
        <div className="absolute right-1 top-0 w-[2px] h-full transition-all duration-150 opacity-0 group-hover:opacity-100 bg-[var(--color-accent)] shadow-[0_0_6px_var(--color-accent)]" />
      </div>
    </aside>
  );
}
