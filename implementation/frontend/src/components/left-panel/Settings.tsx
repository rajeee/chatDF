// Implements: spec/frontend/left_panel/settings/plan.md
//
// Theme toggle (3-way: light/dark/system), Clear All Conversations with
// confirmation modal, About modal.

import { useState, useEffect, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiDelete } from "@/api/client";
import { useChatStore } from "@/stores/chatStore";
import { useUiStore } from "@/stores/uiStore";
import { useTheme, type ThemeMode } from "@/hooks/useTheme";
import { useToastStore } from "@/stores/toastStore";

export function Settings() {
  const queryClient = useQueryClient();
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const { success, error: showError } = useToastStore();

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

  // About modal
  const [showAbout, setShowAbout] = useState(false);

  const handleEscapeAbout = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && showAbout) {
        setShowAbout(false);
      }
    },
    [showAbout]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleEscapeAbout);
    return () => document.removeEventListener("keydown", handleEscapeAbout);
  }, [handleEscapeAbout]);

  return (
    <div className="space-y-3 text-sm">
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

      {/* Clear All Conversations */}
      <div>
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
            className="w-full text-left px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-error"
          >
            Clear all conversations
          </button>
        )}
      </div>

      {/* About Link */}
      <div>
        <button
          onClick={() => setShowAbout(true)}
          className="w-full text-left px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/10"
        >
          About
        </button>
      </div>

      {/* About Modal */}
      {showAbout && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-backdrop"
          onClick={() => setShowAbout(false)}
        >
          <div
            data-testid="about-modal"
            className="bg-surface rounded-lg p-6 max-w-sm mx-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">ChatDF</h2>
              <button
                data-testid="close-about-modal"
                onClick={() => setShowAbout(false)}
                className="opacity-50 hover:opacity-80"
              >
                X
              </button>
            </div>
            <p className="text-sm opacity-70">
              Conversational data analysis powered by AI. Upload datasets and
              ask questions in natural language.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
