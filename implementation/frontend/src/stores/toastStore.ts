// Toast notification store for user-facing success/error messages
import { create } from "zustand";

export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number; // ms, defaults to 5000
  dismissing?: boolean; // true when fade-out animation is playing
}

interface ToastState {
  toasts: Toast[];
  addToast: (message: string, type: ToastType, duration?: number) => void;
  dismissToast: (id: string) => void;
  removeToast: (id: string) => void;
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
}

const FADE_OUT_DURATION = 200; // ms, must match tailwind animation duration
const MAX_TOTAL_TOASTS = 10; // Cap total stored toasts to prevent memory leaks

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (message, type, duration = 5000) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    const toast: Toast = { id, message, type, duration };

    set((state) => {
      const updated = [...state.toasts, toast];
      return {
        toasts:
          updated.length > MAX_TOTAL_TOASTS
            ? updated.slice(-MAX_TOTAL_TOASTS)
            : updated,
      };
    });

    // Auto-dismiss after duration (triggers fade-out animation)
    if (duration > 0) {
      setTimeout(() => {
        useToastStore.getState().dismissToast(id);
      }, duration);
    }
  },

  dismissToast: (id) => {
    // Mark as dismissing to trigger fade-out animation
    set((state) => ({
      toasts: state.toasts.map((t) => (t.id === id ? { ...t, dismissing: true } : t)),
    }));

    // Remove from store after animation completes
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, FADE_OUT_DURATION);
  },

  removeToast: (id) => {
    // Immediate removal (no animation) - kept for backwards compatibility
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  success: (message, duration) => {
    useToastStore.getState().addToast(message, "success", duration);
  },

  error: (message, duration) => {
    useToastStore.getState().addToast(message, "error", duration);
  },

  info: (message, duration) => {
    useToastStore.getState().addToast(message, "info", duration);
  },
}));
