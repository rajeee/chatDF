// Tests: U122 Message Density Toggle
//
// DENSITY-1: Density toggle buttons render in Settings
// DENSITY-2: Clicking "Compact" calls setMessageDensity("compact")
// DENSITY-3: Clicking "Spacious" calls setMessageDensity("spacious")
// DENSITY-4: Active density button has accent background class
// DENSITY-5: Density state persists in uiStore

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  renderWithProviders,
  screen,
  userEvent,
} from "../../helpers/render";
import { resetAllStores } from "../../helpers/stores";
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
  const mql: MediaQueryList = {
    matches: prefersDark,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: vi.fn(),
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

beforeEach(async () => {
  resetAllStores();
  // Ensure messageDensity is reset and modal is open for testing
  const { useUiStore } = await import("@/stores/uiStore");
  useUiStore.setState({ messageDensity: "normal", settingsModalOpen: true });

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

describe("DENSITY-1: Density toggle buttons render in Settings", () => {
  it("renders all three density toggle buttons", () => {
    renderWithProviders(<SettingsModal />);

    expect(screen.getByTestId("density-compact")).toBeInTheDocument();
    expect(screen.getByTestId("density-normal")).toBeInTheDocument();
    expect(screen.getByTestId("density-spacious")).toBeInTheDocument();
  });

  it("renders Message Density label", () => {
    renderWithProviders(<SettingsModal />);

    expect(screen.getByText("Message Density")).toBeInTheDocument();
  });
});

describe("DENSITY-2: Clicking Compact calls setMessageDensity('compact')", () => {
  it("sets messageDensity to compact when Compact button is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsModal />);

    await user.click(screen.getByTestId("density-compact"));

    const { useUiStore } = await import("@/stores/uiStore");
    expect(useUiStore.getState().messageDensity).toBe("compact");
  });
});

describe("DENSITY-3: Clicking Spacious calls setMessageDensity('spacious')", () => {
  it("sets messageDensity to spacious when Spacious button is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsModal />);

    await user.click(screen.getByTestId("density-spacious"));

    const { useUiStore } = await import("@/stores/uiStore");
    expect(useUiStore.getState().messageDensity).toBe("spacious");
  });
});

describe("DENSITY-4: Active density button has accent background class", () => {
  it("Normal button has bg-accent class by default", () => {
    renderWithProviders(<SettingsModal />);

    const normalBtn = screen.getByTestId("density-normal");
    expect(normalBtn.className).toContain("bg-accent");
  });

  it("Compact button gets bg-accent class when selected", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsModal />);

    await user.click(screen.getByTestId("density-compact"));

    const compactBtn = screen.getByTestId("density-compact");
    const normalBtn = screen.getByTestId("density-normal");
    expect(compactBtn.className).toContain("bg-accent");
    expect(normalBtn.className).not.toContain("bg-accent");
  });

  it("Spacious button gets bg-accent class when selected", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsModal />);

    await user.click(screen.getByTestId("density-spacious"));

    const spaciousBtn = screen.getByTestId("density-spacious");
    const normalBtn = screen.getByTestId("density-normal");
    expect(spaciousBtn.className).toContain("bg-accent");
    expect(normalBtn.className).not.toContain("bg-accent");
  });
});

describe("DENSITY-5: Density state persists in uiStore", () => {
  it("stores density value in uiStore state", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsModal />);

    // Default should be "normal"
    const { useUiStore } = await import("@/stores/uiStore");
    expect(useUiStore.getState().messageDensity).toBe("normal");

    // Click compact
    await user.click(screen.getByTestId("density-compact"));
    expect(useUiStore.getState().messageDensity).toBe("compact");

    // Click spacious
    await user.click(screen.getByTestId("density-spacious"));
    expect(useUiStore.getState().messageDensity).toBe("spacious");

    // Click normal again
    await user.click(screen.getByTestId("density-normal"));
    expect(useUiStore.getState().messageDensity).toBe("normal");
  });
});
