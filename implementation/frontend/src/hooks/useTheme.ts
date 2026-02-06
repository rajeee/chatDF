// Implements: spec/frontend/plan.md#theme-implementation
// Three-way theme state: light | dark | system
// Standalone function (no React context required).

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "theme";
const CYCLE_ORDER: ThemeMode[] = ["light", "dark", "system"];
const MEDIA_QUERY = "(prefers-color-scheme: dark)";

export interface ThemeController {
  /** Read the current theme mode (light | dark | system). */
  current(): ThemeMode;
  /** Initialize: read persisted preference, apply class, start listeners. */
  init(): void;
  /** Set a specific theme mode. */
  setTheme(mode: ThemeMode): void;
  /** Cycle: light -> dark -> system -> light ... */
  toggleTheme(): void;
  /** Tear down listeners. */
  destroy(): void;
}

export function useTheme(): ThemeController {
  let mode: ThemeMode = "system";
  let mediaQuery: MediaQueryList | null = null;

  // The listener we attach to matchMedia. Kept as a stable reference for removal.
  const onSystemChange = (e: MediaQueryListEvent) => {
    if (mode === "system") {
      applyClass(e.matches);
    }
  };

  function applyClass(dark: boolean) {
    if (dark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }

  function resolveEffectiveDark(): boolean {
    if (mode === "dark") return true;
    if (mode === "light") return false;
    // system — delegate to OS preference
    return window.matchMedia(MEDIA_QUERY).matches;
  }

  function applyTheme() {
    applyClass(resolveEffectiveDark());
  }

  function persist(m: ThemeMode) {
    localStorage.setItem(STORAGE_KEY, m);
  }

  // --- public API ---

  function current(): ThemeMode {
    return mode;
  }

  function init() {
    // Read persisted preference
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    if (stored === "light" || stored === "dark" || stored === "system") {
      mode = stored;
    } else {
      mode = "system";
    }

    // Listen for OS preference changes
    mediaQuery = window.matchMedia(MEDIA_QUERY);
    mediaQuery.addEventListener("change", onSystemChange);

    applyTheme();
  }

  function setTheme(m: ThemeMode) {
    mode = m;
    persist(m);
    applyTheme();
  }

  function toggleTheme() {
    const idx = CYCLE_ORDER.indexOf(mode);
    const next = CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length];
    setTheme(next);
  }

  function destroy() {
    if (mediaQuery) {
      mediaQuery.removeEventListener("change", onSystemChange);
      mediaQuery = null;
    }
  }

  return { current, init, setTheme, toggleTheme, destroy };
}
