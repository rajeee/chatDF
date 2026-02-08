import { describe, it, expect } from "vitest";
import { generateTitle } from "@/utils/generateTitle";

describe("generateTitle", () => {
  it("returns the message as-is when shorter than 50 characters", () => {
    expect(generateTitle("Hello world")).toBe("Hello world");
  });

  it("returns the message as-is when exactly 50 characters", () => {
    const msg = "a".repeat(50);
    expect(generateTitle(msg)).toBe(msg);
  });

  it('truncates to 50 characters and appends "..." when longer', () => {
    const msg = "a".repeat(60);
    expect(generateTitle(msg)).toBe("a".repeat(50) + "...");
  });

  it("strips leading and trailing whitespace", () => {
    expect(generateTitle("  hello  ")).toBe("hello");
  });

  it("replaces line breaks with spaces", () => {
    expect(generateTitle("line one\nline two")).toBe("line one line two");
  });

  it("replaces carriage return + newline with a space", () => {
    expect(generateTitle("line one\r\nline two")).toBe("line one line two");
  });

  it("collapses multiple consecutive line breaks into a single space", () => {
    expect(generateTitle("a\n\n\nb")).toBe("a b");
  });

  it("handles combined whitespace: leading, trailing, and newlines with truncation", () => {
    const msg = "  " + "x".repeat(60) + "\n\n  ";
    const result = generateTitle(msg);
    // After collapsing newlines and trimming: "xxx...xxx" (60 x's + space)
    // Trimmed: 60 x's (newlines at end become space, then trimmed)
    expect(result).toBe("x".repeat(50) + "...");
  });

  it("respects a custom maxLength parameter", () => {
    expect(generateTitle("Hello world", 5)).toBe("Hello...");
  });

  it("returns empty string for empty input", () => {
    expect(generateTitle("")).toBe("");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(generateTitle("   ")).toBe("");
  });
});
