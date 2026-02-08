import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useToastStore } from "@/stores/toastStore";

describe("toastStore - stacking limit", () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("caps total toasts to prevent memory leaks", () => {
    const { addToast } = useToastStore.getState();
    // Add 15 toasts
    for (let i = 0; i < 15; i++) {
      addToast(`Toast ${i}`, "info");
    }
    const { toasts } = useToastStore.getState();
    expect(toasts.length).toBeLessThanOrEqual(10);
  });

  it("keeps the most recent toasts when capping", () => {
    const { addToast } = useToastStore.getState();
    for (let i = 0; i < 15; i++) {
      addToast(`Toast ${i}`, "info");
    }
    const { toasts } = useToastStore.getState();
    // The last toast added should still be present
    expect(toasts[toasts.length - 1].message).toBe("Toast 14");
    // The first few should have been evicted
    expect(toasts.find((t) => t.message === "Toast 0")).toBeUndefined();
  });

  it("does not cap when under the limit", () => {
    const { addToast } = useToastStore.getState();
    for (let i = 0; i < 5; i++) {
      addToast(`Toast ${i}`, "info");
    }
    const { toasts } = useToastStore.getState();
    expect(toasts.length).toBe(5);
  });
});
