import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useToastStore } from "@/stores/toastStore";

describe("toastStore", () => {
  beforeEach(() => {
    // Reset store state before each test
    useToastStore.setState({ toasts: [] });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should start with empty toasts", () => {
    const { toasts } = useToastStore.getState();
    expect(toasts).toEqual([]);
  });

  it("should add a toast", () => {
    const { addToast } = useToastStore.getState();

    addToast("Test message", "success");

    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toBe("Test message");
    expect(toasts[0].type).toBe("success");
    expect(toasts[0].id).toBeDefined();
  });

  it("should add multiple toasts", () => {
    const { addToast } = useToastStore.getState();

    addToast("Message 1", "success");
    addToast("Message 2", "error");
    addToast("Message 3", "info");

    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(3);
    expect(toasts[0].message).toBe("Message 1");
    expect(toasts[1].message).toBe("Message 2");
    expect(toasts[2].message).toBe("Message 3");
  });

  it("should remove a toast by id", () => {
    const { addToast, removeToast } = useToastStore.getState();

    addToast("Message 1", "success");
    addToast("Message 2", "error");

    const { toasts: toastsBeforeRemove } = useToastStore.getState();
    const idToRemove = toastsBeforeRemove[0].id;

    removeToast(idToRemove);

    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toBe("Message 2");
  });

  it("should auto-remove toast after duration", () => {
    const { addToast } = useToastStore.getState();

    addToast("Auto-remove", "success", 3000);

    const { toasts: toastsBeforeTimeout } = useToastStore.getState();
    expect(toastsBeforeTimeout).toHaveLength(1);

    // Fast-forward time by 3000ms
    vi.advanceTimersByTime(3000);

    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(0);
  });

  it("should use default duration of 5000ms if not specified", () => {
    const { addToast } = useToastStore.getState();

    addToast("Default duration", "success");

    const { toasts: toastsBeforeTimeout } = useToastStore.getState();
    expect(toastsBeforeTimeout).toHaveLength(1);

    // Fast-forward by 4999ms - should still exist
    vi.advanceTimersByTime(4999);
    expect(useToastStore.getState().toasts).toHaveLength(1);

    // Fast-forward by 1ms more - should be gone
    vi.advanceTimersByTime(1);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("should support success helper", () => {
    const { success } = useToastStore.getState();

    success("Success!");

    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toBe("Success!");
    expect(toasts[0].type).toBe("success");
  });

  it("should support error helper", () => {
    const { error } = useToastStore.getState();

    error("Error!");

    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toBe("Error!");
    expect(toasts[0].type).toBe("error");
  });

  it("should support info helper", () => {
    const { info } = useToastStore.getState();

    info("Info!");

    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toBe("Info!");
    expect(toasts[0].type).toBe("info");
  });

  it("should support custom duration in helpers", () => {
    const { success } = useToastStore.getState();

    success("Custom", 2000);

    const { toasts: toastsBeforeTimeout } = useToastStore.getState();
    expect(toastsBeforeTimeout).toHaveLength(1);

    vi.advanceTimersByTime(2000);

    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(0);
  });

  it("should not auto-remove if duration is 0", () => {
    const { addToast } = useToastStore.getState();

    addToast("Persistent", "info", 0);

    const { toasts: toastsBeforeTimeout } = useToastStore.getState();
    expect(toastsBeforeTimeout).toHaveLength(1);

    // Fast-forward by a long time
    vi.advanceTimersByTime(10000);

    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(1);
  });
});
