// Tests: Settings Modal
// Verifies settings controls work correctly inside the modal
//
// ST-1: Theme toggle cycles through light/dark/system
// ST-2: Clear all conversations with confirmation
// ST-3: About section is visible in modal

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, waitFor, userEvent } from "../../helpers/render";
import { resetAllStores } from "../../helpers/stores";
import { server } from "../../helpers/mocks/server";
import { useChatStore } from "@/stores/chatStore";
import { useUiStore } from "@/stores/uiStore";
import { SettingsModal } from "@/components/left-panel/SettingsModal";

// In-memory localStorage stub (jsdom localStorage is unreliable)
function createMockLocalStorage() {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      Object.keys(store).forEach((k) => delete store[k]);
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((_index: number) => null),
    _store: store,
  };
}

function createMockMatchMedia(prefersDark: boolean) {
  const listeners: Array<(e: MediaQueryListEvent) => void> = [];

  const mql: MediaQueryList = {
    matches: prefersDark,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: vi.fn(
      (_event: string, cb: (e: MediaQueryListEvent) => void) => {
        listeners.push(cb);
      }
    ),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };

  return vi.fn((_query: string) => mql);
}

let mockStorage: ReturnType<typeof createMockLocalStorage>;
let originalMatchMedia: typeof window.matchMedia;
let originalLocalStorage: Storage;

beforeEach(() => {
  resetAllStores();
  // Open the settings modal for tests
  useUiStore.setState({ settingsModalOpen: true });

  originalMatchMedia = window.matchMedia;
  originalLocalStorage = window.localStorage;

  mockStorage = createMockLocalStorage();
  const mockMM = createMockMatchMedia(false);

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: mockMM,
  });
  Object.defineProperty(window, "localStorage", {
    writable: true,
    configurable: true,
    value: mockStorage,
  });

  document.documentElement.classList.remove("dark");
});

afterEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: originalMatchMedia,
  });
  Object.defineProperty(window, "localStorage", {
    writable: true,
    configurable: true,
    value: originalLocalStorage,
  });
  document.documentElement.classList.remove("dark");
});

describe("Settings modal renders when open", () => {
  it("renders settings modal when settingsModalOpen is true", () => {
    renderWithProviders(<SettingsModal />);
    expect(screen.getByTestId("settings-modal")).toBeInTheDocument();
  });

  it("does not render when settingsModalOpen is false", () => {
    useUiStore.setState({ settingsModalOpen: false });
    renderWithProviders(<SettingsModal />);
    expect(screen.queryByTestId("settings-modal")).not.toBeInTheDocument();
  });

  it("closes when close button is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsModal />);

    await user.click(screen.getByTestId("close-settings-modal"));
    expect(useUiStore.getState().settingsModalOpen).toBe(false);
  });
});

describe("ST-1: Theme toggle", () => {
  it("renders theme toggle with three options", () => {
    renderWithProviders(<SettingsModal />);

    expect(screen.getByTestId("theme-light")).toBeInTheDocument();
    expect(screen.getByTestId("theme-dark")).toBeInTheDocument();
    expect(screen.getByTestId("theme-system")).toBeInTheDocument();
  });

  it("clicking dark adds dark class to document", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsModal />);

    await user.click(screen.getByTestId("theme-dark"));

    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("clicking light removes dark class from document", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsModal />);

    // First set dark, then switch to light
    await user.click(screen.getByTestId("theme-dark"));
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    await user.click(screen.getByTestId("theme-light"));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("persists theme choice to localStorage", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsModal />);

    await user.click(screen.getByTestId("theme-dark"));

    expect(mockStorage.setItem).toHaveBeenCalledWith("theme", "dark");
  });
});

describe("ST-2: Clear all conversations", () => {
  it("renders clear all conversations button", () => {
    renderWithProviders(<SettingsModal />);

    expect(screen.getByText("Clear all conversations")).toBeInTheDocument();
  });

  it("clicking clear shows confirmation dialog", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsModal />);

    await user.click(screen.getByText("Clear all conversations"));

    expect(screen.getByText("Delete All")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("confirming delete calls DELETE /conversations and resets state", async () => {
    let deleteCalled = false;

    server.use(
      http.delete("/conversations", () => {
        deleteCalled = true;
        return HttpResponse.json({ success: true });
      })
    );

    useChatStore.setState({ activeConversationId: "conv-1" });

    const user = userEvent.setup();
    renderWithProviders(<SettingsModal />);

    await user.click(screen.getByText("Clear all conversations"));
    await user.click(screen.getByText("Delete All"));

    await waitFor(() => {
      expect(deleteCalled).toBe(true);
    });
    expect(useChatStore.getState().activeConversationId).toBeNull();
  });

  it("cancelling confirmation closes the dialog", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsModal />);

    await user.click(screen.getByText("Clear all conversations"));
    expect(screen.getByText("Delete All")).toBeInTheDocument();

    await user.click(screen.getByText("Cancel"));

    expect(screen.queryByText("Delete All")).not.toBeInTheDocument();
  });
});

describe("ST-3: About section", () => {
  it("shows about text inline in the modal", () => {
    renderWithProviders(<SettingsModal />);

    expect(screen.getByText(/Conversational data analysis/)).toBeInTheDocument();
  });
});
