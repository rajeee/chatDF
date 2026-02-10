// Tests: highlightText utility
//
// Verifies:
// - Empty or non-matching queries return plain text
// - Matching substrings are wrapped in <mark> elements
// - Matching is case-insensitive
// - Regex special characters in queries are escaped properly

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { highlightText } from "@/utils/highlightText";

describe("highlightText", () => {
  it("returns plain text when query is empty", () => {
    const result = highlightText("hello world", "");
    expect(result).toBe("hello world");
  });

  it("returns plain text when query is not found", () => {
    const result = highlightText("hello world", "xyz");
    expect(result).toBe("hello world");
  });

  it("wraps a single match in a mark element", () => {
    render(<span>{highlightText("hello world", "world")}</span>);

    const mark = screen.getByText("world");
    expect(mark.tagName).toBe("MARK");
    expect(mark).toHaveClass("search-highlight");
  });

  it("wraps multiple matches in mark elements", () => {
    const { container } = render(
      <span>{highlightText("foo bar foo baz foo", "foo")}</span>
    );

    const marks = container.querySelectorAll("mark");
    expect(marks).toHaveLength(3);
    marks.forEach((mark) => {
      expect(mark.textContent).toBe("foo");
      expect(mark).toHaveClass("search-highlight");
    });
  });

  it("matches case-insensitively", () => {
    const { container } = render(
      <span>{highlightText("Hello HELLO hello", "hello")}</span>
    );

    const marks = container.querySelectorAll("mark");
    expect(marks).toHaveLength(3);
    expect(marks[0].textContent).toBe("Hello");
    expect(marks[1].textContent).toBe("HELLO");
    expect(marks[2].textContent).toBe("hello");
  });

  it("preserves non-matching text around matches", () => {
    const { container } = render(
      <span data-testid="hl">{highlightText("abc def ghi", "def")}</span>
    );

    const span = screen.getByTestId("hl");
    expect(span.textContent).toBe("abc def ghi");

    const marks = container.querySelectorAll("mark");
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe("def");
  });

  it("escapes regex special character: dot", () => {
    const { container } = render(
      <span>{highlightText("file.txt is great", "file.txt")}</span>
    );

    const marks = container.querySelectorAll("mark");
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe("file.txt");
  });

  it("escapes regex special character: asterisk", () => {
    const { container } = render(
      <span>{highlightText("use a* for glob", "a*")}</span>
    );

    const marks = container.querySelectorAll("mark");
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe("a*");
  });

  it("escapes regex special characters: parentheses and plus", () => {
    const { container } = render(
      <span>{highlightText("regex (a+b) here", "(a+b)")}</span>
    );

    const marks = container.querySelectorAll("mark");
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe("(a+b)");
  });

  it("applies inline styles to mark elements", () => {
    render(<span>{highlightText("styled text", "styled")}</span>);

    const mark = screen.getByText("styled");
    expect(mark).toHaveStyle({ color: "inherit", borderRadius: "2px" });
  });
});
