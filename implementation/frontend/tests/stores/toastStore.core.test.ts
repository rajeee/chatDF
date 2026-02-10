// Core tests for toastStore Zustand store
// Covers: toast creation, convenience methods, dismiss/remove, auto-dismiss timers,
// action callbacks, ID uniqueness, rapid additions, and timer cleanup.
// NOTE: Stacking/limit tests live in toastStore.stacking.test.ts — not duplicated here.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useToastStore } from "@/stores/toastStore";

describe("toastStore - core", () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── 1. addToast creates a toast with correct structure ────────────────

  describe("addToast structure", () => {
    it("creates a toast with id, type, message, and dismissing=undefined", () => {
      useToastStore.getState().addToast("Hello world", "info");
      const { toasts } = useToastStore.getState();

      expect(toasts).toHaveLength(1);
      const toast = toasts[0];
      expect(toast.id).toMatch(/^toast-/);
      expect(toast.message).toBe("Hello world");
      expect(toast.type).toBe("info");
      expect(toast.dismissing).toBeUndefined();
    });

    it("stores the provided duration on the toast object", () => {
      useToastStore.getState().addToast("With duration", "success", 3000);
      const toast = useToastStore.getState().toasts[0];
      expect(toast.duration).toBe(3000);
    });

    it("defaults duration to 5000 when not provided", () => {
      useToastStore.getState().addToast("Default duration", "info");
      const toast = useToastStore.getState().toasts[0];
      expect(toast.duration).toBe(5000);
    });

    it("appends new toasts to the end of the list", () => {
      const { addToast } = useToastStore.getState();
      addToast("First", "info");
      addToast("Second", "success");
      addToast("Third", "error");

      const messages = useToastStore.getState().toasts.map((t) => t.message);
      expect(messages).toEqual(["First", "Second", "Third"]);
    });
  });

  // ── 2. Convenience methods: success(), error(), info() ────────────────

  describe("convenience methods", () => {
    it("success() creates a toast with type 'success'", () => {
      useToastStore.getState().success("Saved!");
      const toast = useToastStore.getState().toasts[0];
      expect(toast.type).toBe("success");
      expect(toast.message).toBe("Saved!");
    });

    it("success() passes custom duration to addToast", () => {
      useToastStore.getState().success("Quick save", 2000);
      const toast = useToastStore.getState().toasts[0];
      expect(toast.duration).toBe(2000);
    });

    it("error() creates a toast with type 'error'", () => {
      useToastStore.getState().error("Something failed");
      const toast = useToastStore.getState().toasts[0];
      expect(toast.type).toBe("error");
      expect(toast.message).toBe("Something failed");
    });

    it("error() passes custom duration to addToast", () => {
      useToastStore.getState().error("Failure", 8000);
      const toast = useToastStore.getState().toasts[0];
      expect(toast.duration).toBe(8000);
    });

    it("error() passes action callback to addToast", () => {
      const onClick = vi.fn();
      useToastStore.getState().error("Retry?", undefined, {
        label: "Retry",
        onClick,
      });
      const toast = useToastStore.getState().toasts[0];
      expect(toast.action).toBeDefined();
      expect(toast.action!.label).toBe("Retry");
      toast.action!.onClick();
      expect(onClick).toHaveBeenCalledOnce();
    });

    it("info() creates a toast with type 'info'", () => {
      useToastStore.getState().info("FYI");
      const toast = useToastStore.getState().toasts[0];
      expect(toast.type).toBe("info");
      expect(toast.message).toBe("FYI");
    });

    it("info() passes custom duration to addToast", () => {
      useToastStore.getState().info("Note", 1000);
      const toast = useToastStore.getState().toasts[0];
      expect(toast.duration).toBe(1000);
    });
  });

  // ── 3. dismissToast sets the dismissing flag ──────────────────────────

  describe("dismissToast", () => {
    it("sets dismissing to true on the targeted toast", () => {
      useToastStore.getState().addToast("Dismiss me", "info");
      const id = useToastStore.getState().toasts[0].id;

      useToastStore.getState().dismissToast(id);

      const toast = useToastStore.getState().toasts.find((t) => t.id === id);
      expect(toast).toBeDefined();
      expect(toast!.dismissing).toBe(true);
    });

    it("does not affect other toasts when dismissing one", () => {
      const { addToast } = useToastStore.getState();
      addToast("Stay", "info");
      addToast("Dismiss me", "error");
      const toasts = useToastStore.getState().toasts;
      const stayId = toasts[0].id;
      const dismissId = toasts[1].id;

      useToastStore.getState().dismissToast(dismissId);

      const stayToast = useToastStore.getState().toasts.find((t) => t.id === stayId);
      expect(stayToast!.dismissing).toBeUndefined();
    });

    it("removes the toast after the 200ms fade-out animation completes", () => {
      useToastStore.getState().addToast("Fading", "info");
      const id = useToastStore.getState().toasts[0].id;

      useToastStore.getState().dismissToast(id);

      // Still present during animation
      expect(useToastStore.getState().toasts).toHaveLength(1);

      // Advance past the 200ms FADE_OUT_DURATION
      vi.advanceTimersByTime(200);

      expect(useToastStore.getState().toasts).toHaveLength(0);
    });

    it("handles dismissing a non-existent toast ID gracefully", () => {
      useToastStore.getState().addToast("Existing", "info");
      useToastStore.getState().dismissToast("non-existent-id");

      // Original toast should remain untouched
      const { toasts } = useToastStore.getState();
      expect(toasts).toHaveLength(1);
      expect(toasts[0].dismissing).toBeUndefined();
    });
  });

  // ── 4. removeToast removes a toast immediately ────────────────────────

  describe("removeToast", () => {
    it("removes a toast from the list immediately", () => {
      useToastStore.getState().addToast("Remove me", "error");
      const id = useToastStore.getState().toasts[0].id;

      useToastStore.getState().removeToast(id);

      expect(useToastStore.getState().toasts).toHaveLength(0);
    });

    it("only removes the targeted toast, leaving others intact", () => {
      const { addToast } = useToastStore.getState();
      addToast("Keep", "info");
      addToast("Remove", "error");
      addToast("Also keep", "success");

      const removeId = useToastStore.getState().toasts[1].id;
      useToastStore.getState().removeToast(removeId);

      const messages = useToastStore.getState().toasts.map((t) => t.message);
      expect(messages).toEqual(["Keep", "Also keep"]);
    });

    it("handles removing a non-existent toast ID gracefully", () => {
      useToastStore.getState().addToast("Existing", "info");
      useToastStore.getState().removeToast("bogus-id");

      expect(useToastStore.getState().toasts).toHaveLength(1);
    });
  });

  // ── 5. Auto-dismiss timer behavior ────────────────────────────────────

  describe("auto-dismiss timer", () => {
    it("auto-dismisses after the default 5000ms duration", () => {
      useToastStore.getState().addToast("Auto dismiss", "info");
      const id = useToastStore.getState().toasts[0].id;

      // Not yet dismissed at 4999ms
      vi.advanceTimersByTime(4999);
      expect(useToastStore.getState().toasts[0].dismissing).toBeUndefined();

      // Dismissed at 5000ms (sets dismissing flag)
      vi.advanceTimersByTime(1);
      expect(useToastStore.getState().toasts[0].dismissing).toBe(true);

      // Removed after fade-out animation (200ms)
      vi.advanceTimersByTime(200);
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });

    it("auto-dismisses after a custom duration", () => {
      useToastStore.getState().addToast("Quick", "success", 1000);

      vi.advanceTimersByTime(999);
      expect(useToastStore.getState().toasts[0].dismissing).toBeUndefined();

      vi.advanceTimersByTime(1);
      expect(useToastStore.getState().toasts[0].dismissing).toBe(true);

      vi.advanceTimersByTime(200);
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });

    it("does not auto-dismiss when duration is 0", () => {
      useToastStore.getState().addToast("Persistent", "error", 0);

      vi.advanceTimersByTime(60000); // Advance a full minute

      const { toasts } = useToastStore.getState();
      expect(toasts).toHaveLength(1);
      expect(toasts[0].dismissing).toBeUndefined();
    });

    it("full lifecycle: add -> auto-dismiss -> fade-out -> removed", () => {
      useToastStore.getState().addToast("Lifecycle", "info", 2000);

      // Phase 1: visible
      expect(useToastStore.getState().toasts).toHaveLength(1);
      expect(useToastStore.getState().toasts[0].dismissing).toBeUndefined();

      // Phase 2: dismissing (fade-out animation)
      vi.advanceTimersByTime(2000);
      expect(useToastStore.getState().toasts).toHaveLength(1);
      expect(useToastStore.getState().toasts[0].dismissing).toBe(true);

      // Phase 3: removed from store
      vi.advanceTimersByTime(200);
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });
  });

  // ── 6. Toast limit enforcement (max 10 toasts) ───────────────────────
  // NOTE: Basic cap tests are in toastStore.stacking.test.ts.
  // These test limit enforcement from a different angle.

  describe("toast limit enforcement", () => {
    it("exactly 10 toasts are retained when adding the 10th", () => {
      for (let i = 0; i < 10; i++) {
        useToastStore.getState().addToast(`Toast ${i}`, "info");
      }
      expect(useToastStore.getState().toasts).toHaveLength(10);
    });

    it("11th toast evicts the oldest toast", () => {
      for (let i = 0; i < 11; i++) {
        useToastStore.getState().addToast(`Toast ${i}`, "info");
      }
      const { toasts } = useToastStore.getState();
      expect(toasts).toHaveLength(10);
      // First toast evicted, second toast is now the oldest
      expect(toasts[0].message).toBe("Toast 1");
      expect(toasts[9].message).toBe("Toast 10");
    });
  });

  // ── 7. Toast with action callback ─────────────────────────────────────

  describe("toast with action", () => {
    it("stores an action with label and onClick on the toast", () => {
      const onClick = vi.fn();
      useToastStore.getState().addToast("With action", "error", 5000, {
        label: "Undo",
        onClick,
      });

      const toast = useToastStore.getState().toasts[0];
      expect(toast.action).toBeDefined();
      expect(toast.action!.label).toBe("Undo");
    });

    it("action onClick is callable and invokes the provided function", () => {
      const onClick = vi.fn();
      useToastStore.getState().addToast("Clickable", "error", 5000, {
        label: "Retry",
        onClick,
      });

      const toast = useToastStore.getState().toasts[0];
      toast.action!.onClick();
      toast.action!.onClick();

      expect(onClick).toHaveBeenCalledTimes(2);
    });

    it("toast without action has action as undefined", () => {
      useToastStore.getState().addToast("No action", "info");
      const toast = useToastStore.getState().toasts[0];
      expect(toast.action).toBeUndefined();
    });
  });

  // ── 8. Toast ID uniqueness ────────────────────────────────────────────

  describe("toast ID uniqueness", () => {
    it("each toast receives a unique ID", () => {
      const { addToast } = useToastStore.getState();
      for (let i = 0; i < 20; i++) {
        addToast(`Toast ${i}`, "info");
      }

      const ids = useToastStore.getState().toasts.map((t) => t.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it("IDs follow the toast- prefix convention", () => {
      useToastStore.getState().addToast("Check prefix", "success");
      const toast = useToastStore.getState().toasts[0];
      expect(toast.id).toMatch(/^toast-\d+-/);
    });
  });

  // ── 9. Multiple rapid toasts ──────────────────────────────────────────

  describe("multiple rapid toasts", () => {
    it("handles adding many toasts in rapid succession", () => {
      const { addToast } = useToastStore.getState();
      for (let i = 0; i < 10; i++) {
        addToast(`Rapid ${i}`, "info", 3000);
      }
      expect(useToastStore.getState().toasts).toHaveLength(10);
    });

    it("each rapid toast gets its own auto-dismiss timer", () => {
      useToastStore.getState().addToast("Early", "info", 1000);
      useToastStore.getState().addToast("Late", "info", 3000);

      // After 1000ms, first toast should be dismissing, second should not
      vi.advanceTimersByTime(1000);
      const toasts = useToastStore.getState().toasts;
      const early = toasts.find((t) => t.message === "Early");
      const late = toasts.find((t) => t.message === "Late");
      expect(early?.dismissing).toBe(true);
      expect(late?.dismissing).toBeUndefined();

      // After fade-out, first toast removed, second still present
      vi.advanceTimersByTime(200);
      expect(useToastStore.getState().toasts).toHaveLength(1);
      expect(useToastStore.getState().toasts[0].message).toBe("Late");
    });

    it("toasts with different types coexist correctly", () => {
      useToastStore.getState().success("Good");
      useToastStore.getState().error("Bad");
      useToastStore.getState().info("Neutral");

      const types = useToastStore.getState().toasts.map((t) => t.type);
      expect(types).toEqual(["success", "error", "info"]);
    });
  });

  // ── 10. Cleanup behavior - verify no timer leaks ──────────────────────

  describe("cleanup and timer behavior", () => {
    it("removeToast before auto-dismiss timer fires does not cause errors", () => {
      useToastStore.getState().addToast("Removed early", "info", 5000);
      const id = useToastStore.getState().toasts[0].id;

      // Remove immediately
      useToastStore.getState().removeToast(id);
      expect(useToastStore.getState().toasts).toHaveLength(0);

      // Let all timers fire - should not throw or re-add the toast
      vi.advanceTimersByTime(10000);
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });

    it("dismissToast called manually before auto-dismiss does not cause double removal", () => {
      useToastStore.getState().addToast("Manual dismiss", "info", 5000);
      const id = useToastStore.getState().toasts[0].id;

      // Manually dismiss at 1000ms
      vi.advanceTimersByTime(1000);
      useToastStore.getState().dismissToast(id);
      expect(useToastStore.getState().toasts[0].dismissing).toBe(true);

      // Fade-out completes, toast removed
      vi.advanceTimersByTime(200);
      expect(useToastStore.getState().toasts).toHaveLength(0);

      // Auto-dismiss timer fires at 5000ms - should not throw
      vi.advanceTimersByTime(5000);
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });

    it("all timers can be flushed without errors after store is cleared", () => {
      for (let i = 0; i < 5; i++) {
        useToastStore.getState().addToast(`Timer ${i}`, "info", 1000 * (i + 1));
      }

      // Clear all toasts manually
      useToastStore.setState({ toasts: [] });

      // Flush all pending timers - should not throw or re-add toasts
      vi.runAllTimers();
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });

    it("dismiss timers from multiple toasts all resolve cleanly", () => {
      for (let i = 0; i < 5; i++) {
        useToastStore.getState().addToast(`Toast ${i}`, "info", 2000);
      }
      expect(useToastStore.getState().toasts).toHaveLength(5);

      // All dismiss at 2000ms
      vi.advanceTimersByTime(2000);
      const allDismissing = useToastStore.getState().toasts.every((t) => t.dismissing);
      expect(allDismissing).toBe(true);

      // All removed after fade-out
      vi.advanceTimersByTime(200);
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });
  });

  // ── Initial state ─────────────────────────────────────────────────────

  describe("initial state", () => {
    it("starts with an empty toasts array", () => {
      useToastStore.setState({ toasts: [] });
      expect(useToastStore.getState().toasts).toEqual([]);
    });
  });
});
