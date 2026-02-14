// Implements: spec/frontend/plan.md#component-hierarchy (Header)
//
// Header bar with app title, theme toggle, and connection status indicator.
// On mobile (<lg): shows datasets toggle button on the right.

import { useState, useEffect, useRef } from "react";
import { useConnectionStore, type ConnectionStatus } from "@/stores/connectionStore";
import { useUiStore } from "@/stores/uiStore";
import { useDatasetStore, filterDatasetsByConversation } from "@/stores/datasetStore";
import { useChatStore } from "@/stores/chatStore";
import { useTheme, type ThemeMode } from "@/hooks/useTheme";

const statusConfig: Record<ConnectionStatus, { color: string; label: string }> = {
  connected: { color: "var(--color-success)", label: "Connected" },
  disconnected: { color: "var(--color-error)", label: "Disconnected" },
  reconnecting: { color: "var(--color-warning)", label: "Reconnecting" },
};

const themeIcons: Record<ThemeMode, { icon: JSX.Element; next: ThemeMode; label: string }> = {
  light: {
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
    ),
    next: "dark",
    label: "Light mode — click for dark",
  },
  dark: {
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    ),
    next: "system",
    label: "Dark mode — click for system",
  },
  system: {
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
    next: "light",
    label: "System theme — click for light",
  },
};

export function Header() {
  const toggleLeftPanel = useUiStore((s) => s.toggleLeftPanel);
  const toggleRightPanel = useUiStore((s) => s.toggleRightPanel);
  const connectionStatus = useConnectionStore((s) => s.status);
  const { color, label } = statusConfig[connectionStatus];
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const allDatasets = useDatasetStore((s) => s.datasets);
  const readyDatasetCount = filterDatasetsByConversation(allDatasets, activeConversationId)
    .filter(d => d.status === "ready").length;

  // Theme toggle
  const themeRef = useRef(useTheme());
  const [currentTheme, setCurrentTheme] = useState<ThemeMode>("system");

  useEffect(() => {
    const controller = themeRef.current;
    try {
      controller.init();
      setCurrentTheme(controller.current());
    } catch {
      // matchMedia/localStorage may not be available in tests
    }
    // Sync when another instance (keyboard shortcut, settings modal) changes theme
    const onThemeChange = (e: Event) => {
      const mode = (e as CustomEvent<ThemeMode>).detail;
      setCurrentTheme(mode);
    };
    window.addEventListener("theme-change", onThemeChange);
    return () => {
      controller.destroy();
      window.removeEventListener("theme-change", onThemeChange);
    };
  }, []);

  function handleThemeToggle() {
    try {
      themeRef.current.toggleTheme();
      setCurrentTheme(themeRef.current.current());
    } catch {
      // localStorage may not be available
    }
  }

  const themeInfo = themeIcons[currentTheme];

  return (
    <header
      data-testid="header"
      className="flex items-center justify-between h-12 px-4 border-b sticky top-0 z-20"
      style={{
        backgroundColor: "var(--color-surface)",
        borderColor: "var(--color-border)",
        boxShadow: "0 1px 2px var(--color-shadow)",
      }}
    >
      <div className="flex items-center gap-2">
        {/* Sidebar toggle — mobile only (on desktop the sidebar has its own toggle) */}
        <button
          data-testid="toggle-left-panel-mobile"
          onClick={toggleLeftPanel}
          className="lg:hidden p-1.5 rounded hover:bg-opacity-10 hover:bg-gray-500 transition-colors"
          aria-label="Toggle sidebar"
          title="Toggle sidebar"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <span className="text-lg font-semibold tracking-tight" style={{ color: "var(--color-text)" }}>
          ChatDF
        </span>
        <span
          data-testid="connection-status"
          className="flex items-center gap-1.5 text-xs select-none"
          style={{ color: "var(--color-text-secondary)" }}
          role="status"
          aria-live="polite"
          aria-label={`Connection status: ${label}`}
          title={label}
        >
          <span
            className={`inline-block w-2 h-2 rounded-full${connectionStatus === "reconnecting" ? " animate-pulse" : ""}`}
            style={{ backgroundColor: color }}
            aria-hidden="true"
          />
          {connectionStatus !== "connected" && (
            <span className="hidden sm:inline">{label}</span>
          )}
        </span>
      </div>

      <div className="flex items-center gap-1">
        {/* Theme toggle */}
        <button
          data-testid="theme-toggle"
          onClick={handleThemeToggle}
          className="p-1.5 rounded hover:bg-opacity-10 hover:bg-gray-500 transition-colors"
          style={{ color: "var(--color-text-secondary)" }}
          aria-label={themeInfo.label}
          title={themeInfo.label}
        >
          {themeInfo.icon}
        </button>

      {/* Datasets toggle button — mobile only */}
      <button
        data-testid="toggle-right-panel"
        onClick={toggleRightPanel}
        className="lg:hidden relative p-1.5 rounded hover:bg-opacity-10 hover:bg-gray-500 transition-colors"
        aria-label="Toggle datasets panel"
        title="Datasets"
      >
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
          <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        {readyDatasetCount > 0 && (
          <span
            data-testid="dataset-count-badge"
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold text-white"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            {readyDatasetCount}
          </span>
        )}
      </button>
      </div>
    </header>
  );
}
