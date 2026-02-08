import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CodeBlock } from "@/components/chat-area/CodeBlock";

// Mock the toast store
vi.mock("@/stores/toastStore", () => ({
  useToastStore: () => ({
    success: vi.fn(),
  }),
}));

describe("CodeBlock", () => {
  it("renders inline code without copy button", () => {
    const { container } = render(
      <CodeBlock inline className="language-js">
        const x = 42;
      </CodeBlock>
    );

    const code = container.querySelector("code");
    expect(code).toBeInTheDocument();
    expect(code).toHaveTextContent("const x = 42;");

    // No copy button for inline code
    expect(screen.queryByLabelText(/copy/i)).not.toBeInTheDocument();
  });

  it("renders block code with language label and copy button", () => {
    render(
      <CodeBlock className="language-python">
        {`def hello():
    print("Hello, World!")`}
      </CodeBlock>
    );

    // Language label should be displayed
    expect(screen.getByText("python")).toBeInTheDocument();

    // Copy button should be present
    const copyButton = screen.getByLabelText(/copy code/i);
    expect(copyButton).toBeInTheDocument();
    expect(copyButton).toHaveTextContent("Copy");
  });

  it("renders block code without language as 'code'", () => {
    render(
      <CodeBlock>
        {`some code without language`}
      </CodeBlock>
    );

    // Default label should be "code"
    expect(screen.getByText("code")).toBeInTheDocument();
  });

  it("renders code in pre/code elements", () => {
    const { container } = render(
      <CodeBlock className="language-js">
        const x = 42;
      </CodeBlock>
    );

    const pre = container.querySelector("pre");
    const code = container.querySelector("code");

    expect(pre).toBeInTheDocument();
    expect(code).toBeInTheDocument();
    expect(code).toHaveTextContent("const x = 42;");
  });

  it("shows language in header", () => {
    render(
      <CodeBlock className="language-typescript">
        type Foo = string;
      </CodeBlock>
    );

    expect(screen.getByText("typescript")).toBeInTheDocument();
  });

  it("defaults to 'code' when no language is provided", () => {
    render(
      <CodeBlock>
        some code
      </CodeBlock>
    );

    expect(screen.getByText("code")).toBeInTheDocument();
  });

  it("copy button has touch-action-btn class for touch device visibility", () => {
    render(
      <CodeBlock className="language-js">
        const x = 42;
      </CodeBlock>
    );

    const copyButton = screen.getByLabelText(/copy code/i);
    expect(copyButton.className).toContain("touch-action-btn");
    expect(copyButton.className).toContain("opacity-0");
  });
});
