import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CodeBlock } from "@/components/chat-area/CodeBlock";

// Mock the toast store
vi.mock("@/stores/toastStore", () => ({
  useToastStore: () => ({
    success: vi.fn(),
  }),
}));

describe("CodeBlock syntax highlighting", () => {
  it("renders syntax-highlighted spans for block code with a language", () => {
    const { container } = render(
      <CodeBlock className="language-sql">
        {"SELECT name FROM users"}
      </CodeBlock>
    );

    // Should have spans with syntax-keyword class
    const keywordSpans = container.querySelectorAll(".syntax-keyword");
    expect(keywordSpans.length).toBeGreaterThan(0);

    // Check that SELECT and FROM are highlighted
    const keywordTexts = Array.from(keywordSpans).map((el) => el.textContent);
    expect(keywordTexts).toContain("SELECT");
    expect(keywordTexts).toContain("FROM");
  });

  it("renders syntax-string spans for string literals", () => {
    const { container } = render(
      <CodeBlock className="language-sql">
        {"SELECT * FROM users WHERE name = 'Alice'"}
      </CodeBlock>
    );

    const stringSpans = container.querySelectorAll(".syntax-string");
    expect(stringSpans.length).toBeGreaterThan(0);
    const stringTexts = Array.from(stringSpans).map((el) => el.textContent);
    expect(stringTexts).toContain("'Alice'");
  });

  it("renders syntax-number spans for numeric literals", () => {
    const { container } = render(
      <CodeBlock className="language-sql">
        {"SELECT * FROM users LIMIT 10"}
      </CodeBlock>
    );

    const numberSpans = container.querySelectorAll(".syntax-number");
    expect(numberSpans.length).toBeGreaterThan(0);
    const numberTexts = Array.from(numberSpans).map((el) => el.textContent);
    expect(numberTexts).toContain("10");
  });

  it("renders syntax-comment spans for comments", () => {
    const { container } = render(
      <CodeBlock className="language-sql">
        {"-- get all users\nSELECT * FROM users"}
      </CodeBlock>
    );

    const commentSpans = container.querySelectorAll(".syntax-comment");
    expect(commentSpans.length).toBeGreaterThan(0);
    expect(commentSpans[0].textContent).toBe("-- get all users");
  });

  it("highlights Python keywords", () => {
    const { container } = render(
      <CodeBlock className="language-python">
        {"def hello():\n    return 42"}
      </CodeBlock>
    );

    const keywordSpans = container.querySelectorAll(".syntax-keyword");
    const keywordTexts = Array.from(keywordSpans).map((el) => el.textContent);
    expect(keywordTexts).toContain("def");
    expect(keywordTexts).toContain("return");
  });

  it("highlights JavaScript keywords", () => {
    const { container } = render(
      <CodeBlock className="language-js">
        {"const x = 42"}
      </CodeBlock>
    );

    const keywordSpans = container.querySelectorAll(".syntax-keyword");
    const keywordTexts = Array.from(keywordSpans).map((el) => el.textContent);
    expect(keywordTexts).toContain("const");
  });

  it("does NOT add syntax highlighting to inline code", () => {
    const { container } = render(
      <CodeBlock inline className="language-sql">
        {"SELECT name FROM users"}
      </CodeBlock>
    );

    // No syntax spans should be present
    const syntaxSpans = container.querySelectorAll(
      ".syntax-keyword, .syntax-string, .syntax-number, .syntax-comment, .syntax-operator"
    );
    expect(syntaxSpans.length).toBe(0);
  });

  it("does NOT add syntax highlighting when no language is specified", () => {
    const { container } = render(
      <CodeBlock>
        {"SELECT name FROM users"}
      </CodeBlock>
    );

    // No syntax spans should be present
    const syntaxSpans = container.querySelectorAll(
      ".syntax-keyword, .syntax-string, .syntax-number, .syntax-comment, .syntax-operator"
    );
    expect(syntaxSpans.length).toBe(0);
  });

  it("preserves full code text content when highlighted", () => {
    const code = "SELECT name, age FROM users WHERE age >= 18";
    const { container } = render(
      <CodeBlock className="language-sql">
        {code}
      </CodeBlock>
    );

    const codeElement = container.querySelector("code");
    expect(codeElement?.textContent).toBe(code);
  });
});
