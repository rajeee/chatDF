import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { formatRelativeTime } from "@/utils/relativeTime";

describe("formatRelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-08T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for timestamps less than 60 seconds ago', () => {
    expect(formatRelativeTime("2026-02-08T11:59:30Z")).toBe("just now");
    expect(formatRelativeTime("2026-02-08T11:59:55Z")).toBe("just now");
  });

  it("returns minutes ago for timestamps 1-59 minutes ago", () => {
    expect(formatRelativeTime("2026-02-08T11:58:00Z")).toBe("2m ago");
    expect(formatRelativeTime("2026-02-08T11:30:00Z")).toBe("30m ago");
    expect(formatRelativeTime("2026-02-08T11:01:00Z")).toBe("59m ago");
  });

  it("returns hours ago for timestamps 1-23 hours ago", () => {
    expect(formatRelativeTime("2026-02-08T10:00:00Z")).toBe("2h ago");
    expect(formatRelativeTime("2026-02-08T00:00:00Z")).toBe("12h ago");
    expect(formatRelativeTime("2026-02-07T13:00:00Z")).toBe("23h ago");
  });

  it('returns "Yesterday" for timestamps 24-47 hours ago', () => {
    expect(formatRelativeTime("2026-02-07T12:00:00Z")).toBe("Yesterday");
    expect(formatRelativeTime("2026-02-07T00:00:00Z")).toBe("Yesterday");
  });

  it("returns days ago for timestamps 2-6 days ago", () => {
    expect(formatRelativeTime("2026-02-06T12:00:00Z")).toBe("2d ago");
    expect(formatRelativeTime("2026-02-03T12:00:00Z")).toBe("5d ago");
    expect(formatRelativeTime("2026-02-02T12:00:00Z")).toBe("6d ago");
  });

  it("returns month and day for timestamps 7+ days ago in the same year", () => {
    expect(formatRelativeTime("2026-01-15T12:00:00Z")).toBe("Jan 15");
    expect(formatRelativeTime("2026-01-01T00:00:00Z")).toBe("Jan 1");
  });

  it("returns month, day, and year for timestamps in a different year", () => {
    expect(formatRelativeTime("2025-12-25T12:00:00Z")).toBe("Dec 25, 2025");
    expect(formatRelativeTime("2024-06-15T00:00:00Z")).toBe("Jun 15, 2024");
  });
});
