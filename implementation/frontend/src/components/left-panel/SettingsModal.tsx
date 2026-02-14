import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPut } from "@/api/client";
import { useChatStore } from "@/stores/chatStore";
import { useUiStore } from "@/stores/uiStore";
import { useTheme, type ThemeMode } from "@/hooks/useTheme";
import { useToastStore } from "@/stores/toastStore";
import { useDevModeStore, AVAILABLE_MODELS } from "@/stores/devModeStore";

export function SettingsModal() {
  const isOpen = useUiStore((s) => s.settingsModalOpen);
  const overlayRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    useUiStore.getState().closeSettingsModal();
  }, []);

  const queryClient = useQueryClient();
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const { success, error: showError } = useToastStore();

  // Dev Mode
  const devMode = useDevModeStore((s) => s.devMode);
  const setDevMode = useDevModeStore((s) => s.setDevMode);
  const selectedModel = useDevModeStore((s) => s.selectedModel);
  const setSelectedModel = useDevModeStore((s) => s.setSelectedModel);

  // Sync settings from backend on mount
  useEffect(() => {
    apiGet<{ dev_mode: boolean; selected_model: string }>("/settings")
      .then((settings) => {
        setDevMode(settings.dev_mode);
        setSelectedModel(settings.selected_model);
      })
      .catch(() => {
        // Failed to fetch settings, use defaults from localStorage
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Message Density
  const messageDensity = useUiStore((s) => s.messageDensity);
  const setMessageDensity = useUiStore((s) => s.setMessageDensity);

  // Theme
  const theme = useTheme();
  const [currentTheme, setCurrentTheme] = useState<ThemeMode>("system");

  useEffect(() => {
    try {
      theme.init();
      setCurrentTheme(theme.current());
    } catch {
      // In test environments, localStorage may not be available as a function.
      // Fall back to "system" default.
    }
    return () => {
      theme.destroy();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleThemeChange(mode: ThemeMode) {
    try {
      theme.setTheme(mode);
    } catch {
      // localStorage may not be available in some environments
    }
    setCurrentTheme(mode);
  }

  // Clear all conversations
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const clearAllMutation = useMutation({
    mutationFn: () => apiDelete("/conversations"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setActiveConversation(null);
      setShowClearConfirm(false);
      success("All conversations deleted");
    },
    onError: (err: unknown) => {
      const message =
        err instanceof Error ? err.message : "Failed to delete conversations";
      showError(message);
    },
  });

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, close]);

  if (!isOpen) return null;

  return createPortal(
    <div
      data-testid="settings-modal"
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in"
      onClick={(e) => {
        if (e.target === overlayRef.current) close();
      }}
    >
      <div
        className="rounded-lg shadow-xl p-6 max-w-md w-full mx-4 modal-scale-enter"
        style={{
          backgroundColor: "var(--color-surface)",
          color: "var(--color-text)",
          border: "1px solid var(--color-border)",
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button
            data-testid="close-settings-modal"
            onClick={close}
            className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="space-y-5">
          {/* APPEARANCE Section */}
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider opacity-40">Appearance</div>

            {/* Theme Toggle */}
            <div>
              <div className="text-xs opacity-50 mb-1">Theme</div>
              <div className="flex rounded overflow-hidden border border-border">
                <button
                  data-testid="theme-light"
                  onClick={() => handleThemeChange("light")}
                  className={`flex-1 px-2 py-1 text-xs transition-colors flex items-center justify-center gap-1 ${
                    currentTheme === "light"
                      ? "bg-accent text-white"
                      : "hover:bg-black/5 dark:hover:bg-white/10"
                  }`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                  Light
                </button>
                <button
                  data-testid="theme-dark"
                  onClick={() => handleThemeChange("dark")}
                  className={`flex-1 px-2 py-1 text-xs transition-colors flex items-center justify-center gap-1 ${
                    currentTheme === "dark"
                      ? "bg-accent text-white"
                      : "hover:bg-black/5 dark:hover:bg-white/10"
                  }`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                  Dark
                </button>
                <button
                  data-testid="theme-system"
                  onClick={() => handleThemeChange("system")}
                  className={`flex-1 px-2 py-1 text-xs transition-colors flex items-center justify-center gap-1 ${
                    currentTheme === "system"
                      ? "bg-accent text-white"
                      : "hover:bg-black/5 dark:hover:bg-white/10"
                  }`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                  System
                </button>
              </div>
            </div>

            {/* Message Density */}
            <div>
              <div className="text-xs opacity-50 mb-1">Message Density</div>
              <div className="flex rounded overflow-hidden border border-border">
                <button
                  data-testid="density-compact"
                  onClick={() => setMessageDensity("compact")}
                  className={`flex-1 px-2 py-1 text-xs transition-colors flex items-center justify-center gap-1 ${
                    messageDensity === "compact"
                      ? "bg-accent text-white"
                      : "hover:bg-black/5 dark:hover:bg-white/10"
                  }`}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <line x1="2" y1="2" x2="10" y2="2" />
                    <line x1="2" y1="4.5" x2="10" y2="4.5" />
                    <line x1="2" y1="7" x2="10" y2="7" />
                    <line x1="2" y1="9.5" x2="10" y2="9.5" />
                  </svg>
                  Compact
                </button>
                <button
                  data-testid="density-normal"
                  onClick={() => setMessageDensity("normal")}
                  className={`flex-1 px-2 py-1 text-xs transition-colors flex items-center justify-center gap-1 ${
                    messageDensity === "normal"
                      ? "bg-accent text-white"
                      : "hover:bg-black/5 dark:hover:bg-white/10"
                  }`}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <line x1="2" y1="2.5" x2="10" y2="2.5" />
                    <line x1="2" y1="6" x2="10" y2="6" />
                    <line x1="2" y1="9.5" x2="10" y2="9.5" />
                  </svg>
                  Normal
                </button>
                <button
                  data-testid="density-spacious"
                  onClick={() => setMessageDensity("spacious")}
                  className={`flex-1 px-2 py-1 text-xs transition-colors flex items-center justify-center gap-1 ${
                    messageDensity === "spacious"
                      ? "bg-accent text-white"
                      : "hover:bg-black/5 dark:hover:bg-white/10"
                  }`}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <line x1="2" y1="3.5" x2="10" y2="3.5" />
                    <line x1="2" y1="8.5" x2="10" y2="8.5" />
                  </svg>
                  Spacious
                </button>
              </div>
            </div>
          </div>

          {/* DEVELOPER Section */}
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider opacity-40">Developer</div>

            {/* Dev Mode Toggle */}
            <button
              data-testid="dev-mode-toggle"
              onClick={() => {
                const newVal = !devMode;
                setDevMode(newVal);
                apiPut("/settings", { dev_mode: newVal }).catch(() => {});
              }}
              className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors ${
                devMode ? "bg-accent/10 text-accent" : "hover:bg-black/5 dark:hover:bg-white/10"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 18 22 12 16 6" />
                  <polyline points="8 6 2 12 8 18" />
                </svg>
                Dev Mode
              </span>
              <span className={`w-8 h-4 rounded-full transition-colors relative ${devMode ? "bg-accent" : "bg-gray-400"}`}>
                <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${devMode ? "translate-x-4" : "translate-x-0.5"}`} />
              </span>
            </button>

            {/* Model Selector (only when dev mode is on) */}
            {devMode && (
              <div>
                <div className="text-xs opacity-50 mb-1">Model</div>
                <select
                  data-testid="model-selector"
                  value={selectedModel}
                  onChange={(e) => {
                    setSelectedModel(e.target.value);
                    apiPut("/settings", { selected_model: e.target.value }).catch(() => {});
                  }}
                  className="w-full px-2 py-1.5 rounded border text-xs"
                  style={{
                    borderColor: "var(--color-border)",
                    backgroundColor: "var(--color-bg)",
                    color: "var(--color-text)",
                  }}
                >
                  {AVAILABLE_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* DATA Section */}
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider opacity-40">Data</div>

            {showClearConfirm ? (
              <div className="p-2 border border-error/30 rounded bg-error/5 animate-fade-in">
                <p className="text-xs mb-2">
                  This will permanently delete all conversations. This action cannot
                  be undone.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowClearConfirm(false)}
                    className="flex-1 px-2 py-1 text-xs rounded border hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => clearAllMutation.mutate()}
                    className="flex-1 px-2 py-1 text-xs rounded bg-error text-white hover:opacity-90 transition-opacity duration-150"
                  >
                    Delete All
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="w-full text-left px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-error text-xs"
              >
                Clear all conversations
              </button>
            )}
          </div>

          {/* ABOUT Section */}
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider opacity-40">About</div>
            <p className="text-xs opacity-70">
              ChatDF — Conversational data analysis powered by AI. Upload datasets and
              ask questions in natural language.
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
