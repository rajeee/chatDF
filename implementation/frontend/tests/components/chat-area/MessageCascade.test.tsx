import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
  id: "msg-1",
  role: "assistant" as const,
  content: "Hello world",
  sql_query: null,
  sql_executions: [],
  reasoning: null,
  created_at: new Date().toISOString(),
};

describe("Message cascade animation", () => {
  it("applies message-cascade class when staggerIndex is provided", () => {
    render(
      <MessageBubble
        message={baseMessage}
        isCurrentlyStreaming={false}
        staggerIndex={2}
        onShowSQL={noopFn}
        onShowReasoning={noopFn}
        onVisualize={noopFn}
      />
    );
    const row = screen.getByTestId("message-row-msg-1");
    expect(row.className).toContain("message-cascade");
    expect(row.className).not.toContain("message-appear");
  });

  it("applies message-appear class when staggerIndex is undefined", () => {
    render(
      <MessageBubble
        message={baseMessage}
        isCurrentlyStreaming={false}
        onShowSQL={noopFn}
        onShowReasoning={noopFn}
        onVisualize={noopFn}
      />
    );
    const row = screen.getByTestId("message-row-msg-1");
    expect(row.className).toContain("message-appear");
    expect(row.className).not.toContain("message-cascade");
  });

  it("sets --stagger-index CSS custom property", () => {
    render(
      <MessageBubble
        message={baseMessage}
        isCurrentlyStreaming={false}
        staggerIndex={3}
        onShowSQL={noopFn}
        onShowReasoning={noopFn}
        onVisualize={noopFn}
      />
    );
    const row = screen.getByTestId("message-row-msg-1");
    expect(row.style.getPropertyValue("--stagger-index")).toBe("3");
  });

  it("does not set --stagger-index when staggerIndex is undefined", () => {
    render(
      <MessageBubble
        message={baseMessage}
        isCurrentlyStreaming={false}
        onShowSQL={noopFn}
        onShowReasoning={noopFn}
        onVisualize={noopFn}
      />
    );
    const row = screen.getByTestId("message-row-msg-1");
    expect(row.style.getPropertyValue("--stagger-index")).toBe("");
  });

  it("applies staggerIndex 0 correctly (no delay for first message)", () => {
    render(
      <MessageBubble
        message={baseMessage}
        isCurrentlyStreaming={false}
        staggerIndex={0}
        onShowSQL={noopFn}
        onShowReasoning={noopFn}
        onVisualize={noopFn}
      />
    );
    const row = screen.getByTestId("message-row-msg-1");
    expect(row.className).toContain("message-cascade");
    expect(row.style.getPropertyValue("--stagger-index")).toBe("0");
  });
});
