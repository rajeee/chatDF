import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MessageBubble } from "@/components/chat-area/MessageBubble";

// Mock dependencies
vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}));
vi.mock("@/components/chat-area/StreamingMessage", () => ({
  StreamingMessage: () => <div>streaming</div>,
}));
vi.mock("@/components/chat-area/CodeBlock", () => ({
  CodeBlock: ({ children }: { children: string }) => <code>{children}</code>,
}));
vi.mock("@/utils/chartDetection", () => ({
  detectChartTypes: () => [],
}));

const noopFn = vi.fn();

const baseMessage = {
  id: "msg-copy-1",
  role: "user" as const,
  content: "Hello world",
  sql_query: null,
  sql_executions: [],
  reasoning: null,
  created_at: new Date().toISOString(),
};

describe("MessageBubble copy feedback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows Copied! text after clicking copy", () => {
    render(
      <MessageBubble
        message={baseMessage}
        isCurrentlyStreaming={false}
        onShowSQL={noopFn}
        onShowReasoning={noopFn}
        onCopy={noopFn}
        onVisualize={noopFn}
      />
    );
    const copyBtn = screen.getByTestId("copy-btn-msg-copy-1");
    fireEvent.click(copyBtn);
    expect(screen.getByText("Copied!")).toBeInTheDocument();
  });

  it("reverts from Copied! after 1.5 seconds", () => {
    render(
      <MessageBubble
        message={baseMessage}
        isCurrentlyStreaming={false}
        onShowSQL={noopFn}
        onShowReasoning={noopFn}
        onCopy={noopFn}
        onVisualize={noopFn}
      />
    );
    const copyBtn = screen.getByTestId("copy-btn-msg-copy-1");
    fireEvent.click(copyBtn);
    expect(screen.getByText("Copied!")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.queryByText("Copied!")).not.toBeInTheDocument();
  });

  it("calls onCopy callback when clicking copy button", () => {
    const onCopy = vi.fn();
    render(
      <MessageBubble
        message={baseMessage}
        isCurrentlyStreaming={false}
        onShowSQL={noopFn}
        onShowReasoning={noopFn}
        onCopy={onCopy}
        onVisualize={noopFn}
      />
    );
    fireEvent.click(screen.getByTestId("copy-btn-msg-copy-1"));
    expect(onCopy).toHaveBeenCalledWith("Hello world");
  });
});
