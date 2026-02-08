import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

describe("MessageBubble retry on send failure", () => {
  it("shows retry button on failed user message", () => {
    const msg = {
      id: "msg-fail-1",
      role: "user" as const,
      content: "Show me the data",
      sql_query: null,
      sql_executions: [],
      reasoning: null,
      created_at: new Date().toISOString(),
      sendFailed: true,
    };
    const onRetry = vi.fn();
    render(
      <MessageBubble
        message={msg}
        isCurrentlyStreaming={false}
        onShowSQL={noopFn}
        onShowReasoning={noopFn}
        onCopy={noopFn}
        onVisualize={noopFn}
        onRetry={onRetry}
      />
    );
    expect(screen.getByTestId("retry-send-msg-fail-1")).toBeInTheDocument();
    expect(screen.getByText("Failed to send")).toBeInTheDocument();
    expect(screen.getByTestId("retry-btn-msg-fail-1")).toBeInTheDocument();
  });

  it("calls onRetry with message id and content on click", () => {
    const msg = {
      id: "msg-fail-2",
      role: "user" as const,
      content: "Show me the data",
      sql_query: null,
      sql_executions: [],
      reasoning: null,
      created_at: new Date().toISOString(),
      sendFailed: true,
    };
    const onRetry = vi.fn();
    render(
      <MessageBubble
        message={msg}
        isCurrentlyStreaming={false}
        onShowSQL={noopFn}
        onShowReasoning={noopFn}
        onCopy={noopFn}
        onVisualize={noopFn}
        onRetry={onRetry}
      />
    );
    fireEvent.click(screen.getByTestId("retry-btn-msg-fail-2"));
    expect(onRetry).toHaveBeenCalledWith("msg-fail-2", "Show me the data");
  });

  it("does not show retry for non-failed messages", () => {
    const msg = {
      id: "msg-ok-1",
      role: "user" as const,
      content: "Hello",
      sql_query: null,
      sql_executions: [],
      reasoning: null,
      created_at: new Date().toISOString(),
    };
    render(
      <MessageBubble
        message={msg}
        isCurrentlyStreaming={false}
        onShowSQL={noopFn}
        onShowReasoning={noopFn}
        onCopy={noopFn}
        onVisualize={noopFn}
        onRetry={noopFn}
      />
    );
    expect(screen.queryByTestId("retry-send-msg-ok-1")).not.toBeInTheDocument();
  });

  it("does not show retry for assistant messages even if failed", () => {
    const msg = {
      id: "msg-asst-1",
      role: "assistant" as const,
      content: "Hello",
      sql_query: null,
      sql_executions: [],
      reasoning: null,
      created_at: new Date().toISOString(),
      sendFailed: true,
    };
    render(
      <MessageBubble
        message={msg}
        isCurrentlyStreaming={false}
        onShowSQL={noopFn}
        onShowReasoning={noopFn}
        onCopy={noopFn}
        onVisualize={noopFn}
        onRetry={noopFn}
      />
    );
    expect(screen.queryByTestId("retry-send-msg-asst-1")).not.toBeInTheDocument();
  });
});
