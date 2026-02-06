// Tests for useTheme hook
// Tests: spec/frontend/test_plan.md#FE-T-1 through FE-T-4
// Implements: spec/frontend/plan.md#theme-implementation

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// --- Mock helpers ---

/** Creates a mock matchMedia that reports a given preference. */
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
    removeEventListener: vi.fn(
      (_event: string, cb: (e: MediaQueryListEvent) => void) => {
        const idx = listeners.indexOf(cb);
        if (idx !== -1) listeners.splice(idx, 1);
      }
    ),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };

  const matchMedia = vi.fn((_query: string) => mql);

  /** Simulate the OS preference changing at runtime. */
  function simulateChange(nowDark: boolean) {
    (mql as { matches: boolean }).matches = nowDark;
    const event = { matches: nowDark, media: mql.media } as MediaQueryListEvent;
    listeners.forEach((cb) => cb(event));
  }

  return { matchMedia, mql, simulateChange };
}

/** In-memory localStorage stub. */
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
    /** Peek at raw store for assertions. */
    _store: store,
  };
}

// We'll dynamically import the hook after mocks are in place.
let useTheme: typeof import("@/hooks/useTheme").useTheme;

describe("useTheme hook", () => {
  let mockStorage: ReturnType<typeof createMockLocalStorage>;
  let mockMM: ReturnType<typeof createMockMatchMedia>;
  let originalMatchMedia: typeof window.matchMedia;
  let originalLocalStorage: Storage;

  beforeEach(async () => {
    // Save originals
    originalMatchMedia = window.matchMedia;
    originalLocalStorage = window.localStorage;

    // Install mocks — default: system prefers light
    mockStorage = createMockLocalStorage();
    mockMM = createMockMatchMedia(false);

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: mockMM.matchMedia,
    });
    Object.defineProperty(window, "localStorage", {
      writable: true,
      configurable: true,
      value: mockStorage,
    });

    // Remove "dark" class that may linger from previous test
    document.documentElement.classList.remove("dark");

    // Fresh import each test to reset module-level state
    vi.resetModules();
    const mod = await import("@/hooks/useTheme");
    useTheme = mod.useTheme;
  });

  afterEach(() => {
    // Restore originals
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

  // FE-T-1: Default from system preference (matchMedia mock)
  describe("FE-T-1: Default from system preference", () => {
    it("applies dark class when system prefers dark and no localStorage value", async () => {
      // Re-setup with dark preference
      mockMM = createMockMatchMedia(true);
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: mockMM.matchMedia,
      });

      vi.resetModules();
      const mod = await import("@/hooks/useTheme");
      const theme = mod.useTheme();

      // init() applies the theme
      theme.init();

      expect(document.documentElement.classList.contains("dark")).toBe(true);
      expect(theme.current()).toBe("system");
    });

    it("does not apply dark class when system prefers light and no localStorage value", () => {
      const theme = useTheme();
      theme.init();

      expect(document.documentElement.classList.contains("dark")).toBe(false);
      expect(theme.current()).toBe("system");
    });

    it("respects explicit localStorage value over system preference", async () => {
      // System prefers dark, but localStorage says light
      mockMM = createMockMatchMedia(true);
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: mockMM.matchMedia,
      });
      mockStorage.setItem("theme", "light");

      vi.resetModules();
      const mod = await import("@/hooks/useTheme");
      const theme = mod.useTheme();
      theme.init();

      expect(document.documentElement.classList.contains("dark")).toBe(false);
      expect(theme.current()).toBe("light");
    });
  });

  // FE-T-2: Toggle cycles light -> dark -> system
  describe("FE-T-2: Toggle cycles light -> dark -> system", () => {
    it("cycles through light -> dark -> system on repeated toggles", () => {
      const theme = useTheme();
      theme.init(); // starts as system (light)

      // Set to light first
      theme.setTheme("light");
      expect(theme.current()).toBe("light");
      expect(document.documentElement.classList.contains("dark")).toBe(false);

      // Toggle: light -> dark
      theme.toggleTheme();
      expect(theme.current()).toBe("dark");
      expect(document.documentElement.classList.contains("dark")).toBe(true);

      // Toggle: dark -> system
      theme.toggleTheme();
      expect(theme.current()).toBe("system");
      // system resolves to light (mockMM default is false)
      expect(document.documentElement.classList.contains("dark")).toBe(false);

      // Toggle: system -> light
      theme.toggleTheme();
      expect(theme.current()).toBe("light");
    });
  });

  // FE-T-3: Persists to localStorage
  describe("FE-T-3: Persists to localStorage", () => {
    it("stores chosen theme in localStorage when setTheme is called", () => {
      const theme = useTheme();
      theme.init();

      theme.setTheme("dark");
      expect(mockStorage.setItem).toHaveBeenCalledWith("theme", "dark");
      expect(mockStorage._store["theme"]).toBe("dark");

      theme.setTheme("light");
      expect(mockStorage.setItem).toHaveBeenCalledWith("theme", "light");
      expect(mockStorage._store["theme"]).toBe("light");

      theme.setTheme("system");
      expect(mockStorage.setItem).toHaveBeenCalledWith("theme", "system");
      expect(mockStorage._store["theme"]).toBe("system");
    });

    it("stores chosen theme in localStorage when toggleTheme is called", () => {
      const theme = useTheme();
      theme.init();
      theme.setTheme("light");

      theme.toggleTheme(); // light -> dark
      expect(mockStorage._store["theme"]).toBe("dark");

      theme.toggleTheme(); // dark -> system
      expect(mockStorage._store["theme"]).toBe("system");
    });
  });

  // FE-T-4: System preference change updates theme
  describe("FE-T-4: System preference change updates theme", () => {
    it("updates dark class when system preference changes while in system mode", () => {
      const theme = useTheme();
      theme.init(); // system mode, light preference

      expect(document.documentElement.classList.contains("dark")).toBe(false);

      // OS switches to dark
      mockMM.simulateChange(true);
      expect(document.documentElement.classList.contains("dark")).toBe(true);

      // OS switches back to light
      mockMM.simulateChange(false);
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });

    it("ignores system preference changes when in explicit light mode", () => {
      const theme = useTheme();
      theme.init();
      theme.setTheme("light");

      expect(document.documentElement.classList.contains("dark")).toBe(false);

      // OS switches to dark — should be ignored
      mockMM.simulateChange(true);
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });

    it("ignores system preference changes when in explicit dark mode", () => {
      const theme = useTheme();
      theme.init();
      theme.setTheme("dark");

      expect(document.documentElement.classList.contains("dark")).toBe(true);

      // OS switches to light — should be ignored
      mockMM.simulateChange(false);
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
  });

  // Cleanup: listener is removed on destroy
  describe("Cleanup", () => {
    it("removes matchMedia listener on destroy", () => {
      const theme = useTheme();
      theme.init();

      theme.destroy();

      expect(mockMM.mql.removeEventListener).toHaveBeenCalledWith(
        "change",
        expect.any(Function)
      );
    });
  });
});
