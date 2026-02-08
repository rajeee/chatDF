import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MessageBubble } from "@/components/chat-area/MessageBubble";

// Mock react-markdown
vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}));

// Mock StreamingMessage
vi.mock("@/components/chat-area/StreamingMessage", () => ({
  StreamingMessage: () => <div>streaming</div>,
}));

// Mock CodeBlock
vi.mock("@/components/chat-area/CodeBlock", () => ({
  CodeBlock: ({ children }: { children: string }) => <code>{children}</code>,
}));

// Mock chartDetection
vi.mock("@/utils/chartDetection", () => ({
  detectChartTypes: () => [],
}));

const baseMessage = {
  id: "msg-1",
  role: "assistant" as const,
  content: "Here are the results",
  sql_query: null,
  sql_executions: [
    {
      query: "SELECT * FROM users LIMIT 10",
      columns: ["id", "name"],
      rows: [[1, "Alice"]],
      total_rows: 1,
      error: null,
      execution_time_ms: 42,
    },
  ],
  reasoning: null,
  created_at: new Date().toISOString(),
};

const noopFn = vi.fn();

describe("MessageBubble SQL Preview", () => {
  it("renders collapsed SQL preview for messages with executions", () => {
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
    expect(screen.getByTestId("sql-preview-msg-1")).toBeInTheDocument();
    expect(screen.getByTestId("sql-preview-toggle-msg-1")).toBeInTheDocument();
    // Should be collapsed by default - content hidden via max-height animation
    const sqlText = screen.getByText("SELECT * FROM users LIMIT 10");
    const expandContainer = sqlText.closest("div[style]") as HTMLElement;
    expect(expandContainer?.style.maxHeight).toBe("0px");
  });

  it("expands SQL preview on toggle click", () => {
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
    fireEvent.click(screen.getByTestId("sql-preview-toggle-msg-1"));
    expect(screen.getByText("SELECT * FROM users LIMIT 10")).toBeInTheDocument();
  });

  it("does not show SQL preview for user messages", () => {
    const userMsg = { ...baseMessage, role: "user" as const };
    render(
      <MessageBubble
        message={userMsg}
        isCurrentlyStreaming={false}
        onShowSQL={noopFn}
        onShowReasoning={noopFn}
        onCopy={noopFn}
        onVisualize={noopFn}
      />
    );
    expect(screen.queryByTestId("sql-preview-msg-1")).not.toBeInTheDocument();
  });

  it("does not show SQL preview during streaming", () => {
    render(
      <MessageBubble
        message={baseMessage}
        isCurrentlyStreaming={true}
        onShowSQL={noopFn}
        onShowReasoning={noopFn}
        onCopy={noopFn}
        onVisualize={noopFn}
      />
    );
    expect(screen.queryByTestId("sql-preview-msg-1")).not.toBeInTheDocument();
  });

  it("shows query count for multiple executions", () => {
    const multiExec = {
      ...baseMessage,
      sql_executions: [
        { query: "SELECT 1", columns: null, rows: null, total_rows: null, error: null, execution_time_ms: null },
        { query: "SELECT 2", columns: null, rows: null, total_rows: null, error: null, execution_time_ms: null },
      ],
    };
    render(
      <MessageBubble
        message={multiExec}
        isCurrentlyStreaming={false}
        onShowSQL={noopFn}
        onShowReasoning={noopFn}
        onCopy={noopFn}
        onVisualize={noopFn}
      />
    );
    expect(screen.getByText("(2 queries)")).toBeInTheDocument();
  });
});
