// Comprehensive tests for the useTheme hook.
// Covers: current() default, init() with localStorage, init() with invalid values,
// init() dark/light class application, init() matchMedia listener, setTheme()
// persistence and class toggling, theme-transitioning class, toggleTheme() cycling,
// destroy() cleanup of listener and timeout.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useTheme, type ThemeController } from "@/hooks/useTheme";

// --- Mock helpers ---

let mockAddEventListener: ReturnType<typeof vi.fn>;
let mockRemoveEventListener: ReturnType<typeof vi.fn>;
let mockMatchMediaResult: {
  matches: boolean;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
};
let mockMatchMedia: ReturnType<typeof vi.fn>;

function setupMatchMedia(prefersDark: boolean) {
  mockAddEventListener = vi.fn();
  mockRemoveEventListener = vi.fn();
  mockMatchMediaResult = {
    matches: prefersDark,
    addEventListener: mockAddEventListener,
    removeEventListener: mockRemoveEventListener,
  };
  mockMatchMedia = vi.fn().mockReturnValue(mockMatchMediaResult);
  Object.defineProperty(window, "matchMedia", {
    value: mockMatchMedia,
    writable: true,
  });
}

// --- Test suite ---

describe("useTheme", () => {
  let theme: ThemeController;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    document.documentElement.classList.remove("dark", "theme-transitioning");
    setupMatchMedia(false);
  });

  afterEach(() => {
    if (theme) {
      theme.destroy();
    }
    vi.useRealTimers();
    document.documentElement.classList.remove("dark", "theme-transitioning");
  });

  // --- 1. current() defaults to "system" before init ---

  it('current() returns "system" before init is called', () => {
    theme = useTheme();

    expect(theme.current()).toBe("system");
  });

  // --- 2. init() reads from localStorage and sets mode ---

  it("init() reads stored theme from localStorage and applies it", () => {
    localStorage.setItem("theme", "dark");
    theme = useTheme();
    theme.init();

    expect(theme.current()).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it('init() reads "light" from localStorage and applies it', () => {
    localStorage.setItem("theme", "light");
    theme = useTheme();
    theme.init();

    expect(theme.current()).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it('init() reads "system" from localStorage and uses system preference', () => {
    localStorage.setItem("theme", "system");
    setupMatchMedia(true); // system prefers dark
    theme = useTheme();
    theme.init();

    expect(theme.current()).toBe("system");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  // --- 3. init() defaults to "system" for invalid stored values ---

  it('init() defaults to "system" when localStorage has an invalid value', () => {
    localStorage.setItem("theme", "purple");
    theme = useTheme();
    theme.init();

    expect(theme.current()).toBe("system");
  });

  it('init() defaults to "system" when localStorage has no stored value', () => {
    theme = useTheme();
    theme.init();

    expect(theme.current()).toBe("system");
  });

  // --- 4. init() adds "dark" class when mode is "dark" ---

  it('init() adds "dark" class to documentElement when stored mode is "dark"', () => {
    localStorage.setItem("theme", "dark");
    theme = useTheme();
    theme.init();

    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it('init() adds "dark" class when mode is "system" and system prefers dark', () => {
    setupMatchMedia(true);
    theme = useTheme();
    theme.init();

    expect(theme.current()).toBe("system");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  // --- 5. init() removes "dark" class when mode is "light" ---

  it('init() removes "dark" class when stored mode is "light"', () => {
    // Pre-add dark class to verify it gets removed
    document.documentElement.classList.add("dark");
    localStorage.setItem("theme", "light");
    theme = useTheme();
    theme.init();

    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  // --- 6. init() listens to matchMedia changes ---

  it("init() registers a change listener on matchMedia", () => {
    theme = useTheme();
    theme.init();

    expect(mockMatchMedia).toHaveBeenCalledWith("(prefers-color-scheme: dark)");
    expect(mockAddEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function)
    );
  });

  it("reacts to system preference change when in system mode", () => {
    theme = useTheme();
    theme.init();

    expect(document.documentElement.classList.contains("dark")).toBe(false);

    // Simulate OS switching to dark
    const changeCallback = mockAddEventListener.mock.calls[0][1];
    changeCallback({ matches: true } as MediaQueryListEvent);

    expect(document.documentElement.classList.contains("dark")).toBe(true);

    // Simulate OS switching back to light
    changeCallback({ matches: false } as MediaQueryListEvent);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("ignores system preference change when in explicit dark mode", () => {
    theme = useTheme();
    theme.init();
    theme.setTheme("dark");

    expect(document.documentElement.classList.contains("dark")).toBe(true);

    // Simulate OS switching to light -- should be ignored
    const changeCallback = mockAddEventListener.mock.calls[0][1];
    changeCallback({ matches: false } as MediaQueryListEvent);

    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("ignores system preference change when in explicit light mode", () => {
    theme = useTheme();
    theme.init();
    theme.setTheme("light");

    expect(document.documentElement.classList.contains("dark")).toBe(false);

    // Simulate OS switching to dark -- should be ignored
    const changeCallback = mockAddEventListener.mock.calls[0][1];
    changeCallback({ matches: true } as MediaQueryListEvent);

    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  // --- 7. setTheme("dark") adds dark class and persists ---

  it('setTheme("dark") adds "dark" class and persists to localStorage', () => {
    theme = useTheme();
    theme.init();
    theme.setTheme("dark");

    expect(theme.current()).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("theme")).toBe("dark");
  });

  // --- 8. setTheme("light") removes dark class and persists ---

  it('setTheme("light") removes "dark" class and persists to localStorage', () => {
    theme = useTheme();
    theme.init();
    theme.setTheme("dark"); // first go dark
    theme.setTheme("light"); // then switch to light

    expect(theme.current()).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("theme")).toBe("light");
  });

  // --- 9. setTheme() adds "theme-transitioning" class temporarily ---

  it('setTheme() adds "theme-transitioning" class and removes it after 250ms', () => {
    theme = useTheme();
    theme.init();
    theme.setTheme("dark");

    expect(
      document.documentElement.classList.contains("theme-transitioning")
    ).toBe(true);

    vi.advanceTimersByTime(250);

    expect(
      document.documentElement.classList.contains("theme-transitioning")
    ).toBe(false);
  });

  it("setTheme() called rapidly clears previous transition timeout", () => {
    theme = useTheme();
    theme.init();

    theme.setTheme("dark");
    expect(
      document.documentElement.classList.contains("theme-transitioning")
    ).toBe(true);

    // Call setTheme again before the 250ms elapses
    vi.advanceTimersByTime(100);
    theme.setTheme("light");

    // Still transitioning from the second call
    expect(
      document.documentElement.classList.contains("theme-transitioning")
    ).toBe(true);

    // Advance past the original 250ms from the first call -- should still be transitioning
    // because the second call reset the timer
    vi.advanceTimersByTime(150);
    expect(
      document.documentElement.classList.contains("theme-transitioning")
    ).toBe(true);

    // Now advance the remaining 100ms for the second call's timeout
    vi.advanceTimersByTime(100);
    expect(
      document.documentElement.classList.contains("theme-transitioning")
    ).toBe(false);
  });

  // --- 10. toggleTheme() cycles light -> dark -> system -> light ---

  it("toggleTheme() cycles through light -> dark -> system -> light", () => {
    theme = useTheme();
    theme.init();
    theme.setTheme("light"); // start at light

    // light -> dark
    theme.toggleTheme();
    expect(theme.current()).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    // dark -> system
    theme.toggleTheme();
    expect(theme.current()).toBe("system");
    // system resolves to light (mockMatchMedia matches: false)
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    // system -> light
    theme.toggleTheme();
    expect(theme.current()).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    // light -> dark (full cycle)
    theme.toggleTheme();
    expect(theme.current()).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("toggleTheme() persists each mode to localStorage", () => {
    theme = useTheme();
    theme.init();
    theme.setTheme("light");

    theme.toggleTheme(); // -> dark
    expect(localStorage.getItem("theme")).toBe("dark");

    theme.toggleTheme(); // -> system
    expect(localStorage.getItem("theme")).toBe("system");

    theme.toggleTheme(); // -> light
    expect(localStorage.getItem("theme")).toBe("light");
  });

  // --- 11. destroy() removes event listener ---

  it("destroy() removes the matchMedia change listener", () => {
    theme = useTheme();
    theme.init();

    theme.destroy();

    expect(mockRemoveEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function)
    );
  });

  it("destroy() prevents system preference changes from having effect", () => {
    theme = useTheme();
    theme.init();

    // Grab the callback before destroy removes it
    const changeCallback = mockAddEventListener.mock.calls[0][1];

    theme.destroy();

    // Even if we manually invoke the callback, mode is still "system"
    // but the listener was removed from the MediaQueryList, so in real
    // usage no further events would fire. We verify removal was called.
    expect(mockRemoveEventListener).toHaveBeenCalledTimes(1);
    const removedCallback = mockRemoveEventListener.mock.calls[0][1];
    expect(removedCallback).toBe(changeCallback);
  });

  // --- 12. destroy() clears transition timeout ---

  it("destroy() clears the pending transition timeout", () => {
    theme = useTheme();
    theme.init();
    theme.setTheme("dark");

    // theme-transitioning is set
    expect(
      document.documentElement.classList.contains("theme-transitioning")
    ).toBe(true);

    theme.destroy();

    // Advance past 250ms -- the timeout should have been cleared, so
    // theme-transitioning remains (no cleanup fires)
    vi.advanceTimersByTime(300);

    // The class stays because clearTimeout prevented the removal callback
    expect(
      document.documentElement.classList.contains("theme-transitioning")
    ).toBe(true);
  });

  it("destroy() is safe to call multiple times", () => {
    theme = useTheme();
    theme.init();

    theme.destroy();
    // Second destroy should not throw
    expect(() => theme.destroy()).not.toThrow();
  });
});
