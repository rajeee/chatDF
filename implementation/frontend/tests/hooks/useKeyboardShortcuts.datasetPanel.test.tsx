import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useUiStore } from "@/stores/uiStore";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { resetAllStores } from "../helpers/stores";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

// Mock matchMedia for theme controller support
const originalMatchMedia = window.matchMedia;

function installMatchMediaMock() {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn((_query: string) => ({
      matches: false,
      media: _query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("useKeyboardShortcuts - Ctrl/Cmd+E dataset panel toggle", () => {
  beforeEach(() => {
    installMatchMediaMock();
    resetAllStores();
    // Ensure right panel starts open (default)
    useUiStore.setState({ rightPanelOpen: true });
    localStorage.removeItem("theme");
  });

  afterEach(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: originalMatchMedia,
    });
    document.documentElement.classList.remove("dark", "theme-transitioning");
  });

  it("toggles right panel closed when Ctrl+E is pressed", () => {
    renderHook(() => useKeyboardShortcuts(), { wrapper });

    expect(useUiStore.getState().rightPanelOpen).toBe(true);

    const event = new KeyboardEvent("keydown", { key: "e", ctrlKey: true });
    document.dispatchEvent(event);

    expect(useUiStore.getState().rightPanelOpen).toBe(false);
  });

  it("toggles right panel back open when Ctrl+E is pressed again", () => {
    renderHook(() => useKeyboardShortcuts(), { wrapper });

    // First press: close
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "e", ctrlKey: true }));
    expect(useUiStore.getState().rightPanelOpen).toBe(false);

    // Second press: open
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "e", ctrlKey: true }));
    expect(useUiStore.getState().rightPanelOpen).toBe(true);
  });

  it("toggles right panel when Cmd+E is pressed (Mac)", () => {
    renderHook(() => useKeyboardShortcuts(), { wrapper });

    expect(useUiStore.getState().rightPanelOpen).toBe(true);

    const event = new KeyboardEvent("keydown", { key: "e", metaKey: true });
    document.dispatchEvent(event);

    expect(useUiStore.getState().rightPanelOpen).toBe(false);
  });
});
