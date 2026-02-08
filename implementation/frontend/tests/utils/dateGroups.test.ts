import { describe, it, expect, vi, afterEach } from "vitest";
import { getDateGroup } from "@/utils/dateGroups";

describe("getDateGroup", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return "Today" for a date from today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 5, 15, 14, 30, 0)); // June 15, 2025 2:30 PM

    expect(getDateGroup("2025-06-15T10:00:00Z")).toBe("Today");
    expect(getDateGroup("2025-06-15T00:00:01Z")).toBe("Today");
  });

  it('should return "Yesterday" for a date from yesterday', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 5, 15, 14, 30, 0)); // June 15, 2025

    expect(getDateGroup("2025-06-14T23:59:59Z")).toBe("Yesterday");
    expect(getDateGroup("2025-06-14T08:00:00Z")).toBe("Yesterday");
  });

  it('should return "This Week" for a date 3 days ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 5, 15, 14, 30, 0)); // June 15, 2025

    expect(getDateGroup("2025-06-12T12:00:00Z")).toBe("This Week"); // 3 days ago
    expect(getDateGroup("2025-06-10T12:00:00Z")).toBe("This Week"); // 5 days ago
  });

  it('should return "This Month" for a date 15 days ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 5, 15, 14, 30, 0)); // June 15, 2025

    expect(getDateGroup("2025-05-31T12:00:00Z")).toBe("This Month"); // 15 days ago
    expect(getDateGroup("2025-05-25T12:00:00Z")).toBe("This Month"); // 21 days ago
  });

  it('should return "Older" for a date 60 days ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 5, 15, 14, 30, 0)); // June 15, 2025

    expect(getDateGroup("2025-04-16T12:00:00Z")).toBe("Older"); // 60 days ago
    expect(getDateGroup("2025-01-01T12:00:00Z")).toBe("Older");
  });

  it("should handle midnight boundary correctly", () => {
    vi.useFakeTimers();
    // Set to just after midnight
    vi.setSystemTime(new Date(2025, 5, 15, 0, 0, 1)); // June 15, 2025 00:00:01

    // A date from just before midnight yesterday (local) should be "Yesterday"
    expect(getDateGroup("2025-06-14T23:59:59")).toBe("Yesterday");

    // A date from start of today should be "Today"
    expect(getDateGroup("2025-06-15T00:00:00")).toBe("Today");
  });

  it("should handle different years correctly", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 2, 12, 0, 0)); // Jan 2, 2025

    // Yesterday (Jan 1, 2025) is "Yesterday"
    expect(getDateGroup("2025-01-01T12:00:00")).toBe("Yesterday");

    // Dec 31, 2024 is 2 days ago -> "This Week"
    expect(getDateGroup("2024-12-31T12:00:00")).toBe("This Week");

    // Dec 27, 2024 is 6 days ago -> "This Week"
    expect(getDateGroup("2024-12-27T12:00:00")).toBe("This Week");

    // Dec 20, 2024 is 13 days ago -> "This Month"
    expect(getDateGroup("2024-12-20T12:00:00")).toBe("This Month");

    // Nov 2024 is >30 days ago -> "Older"
    expect(getDateGroup("2024-11-15T12:00:00")).toBe("Older");
  });

  it('should treat exactly 7 days ago as "This Month" (not "This Week")', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 5, 15, 12, 0, 0)); // June 15, 2025

    // 7 days ago = June 8 -> diffDays === 7, which is NOT < 7, so "This Month"
    expect(getDateGroup("2025-06-08T12:00:00")).toBe("This Month");

    // 6 days ago = June 9 -> diffDays === 6, which IS < 7, so "This Week"
    expect(getDateGroup("2025-06-09T12:00:00")).toBe("This Week");
  });

  it('should treat exactly 30 days ago as "Older" (not "This Month")', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 5, 15, 12, 0, 0)); // June 15, 2025

    // 30 days ago = May 16 -> diffDays === 30, which is NOT < 30, so "Older"
    expect(getDateGroup("2025-05-16T12:00:00")).toBe("Older");

    // 29 days ago = May 17 -> diffDays === 29, which IS < 30, so "This Month"
    expect(getDateGroup("2025-05-17T12:00:00")).toBe("This Month");
  });
});
