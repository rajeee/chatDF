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

describe("MessageBubble SQL error display", () => {
  it("shows inline error when sql_execution has error", () => {
    const msg = {
      id: "msg-err-1",
      role: "assistant" as const,
      content: "I tried to run the query",
      sql_query: null,
      sql_executions: [
        {
          query: "SELECT * FROM nonexistent",
          columns: null,
          rows: null,
          total_rows: null,
          error: "Table not found: nonexistent",
          execution_time_ms: null,
        },
      ],
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
      />
    );
    expect(screen.getByTestId("sql-error-msg-err-1")).toBeInTheDocument();
    expect(screen.getByText("Table not found: nonexistent")).toBeInTheDocument();
  });

  it("does not show error display when no errors", () => {
    const msg = {
      id: "msg-ok-1",
      role: "assistant" as const,
      content: "Results",
      sql_query: null,
      sql_executions: [
        {
          query: "SELECT 1",
          columns: ["1"],
          rows: [[1]],
          total_rows: 1,
          error: null,
          execution_time_ms: 5,
        },
      ],
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
      />
    );
    expect(screen.queryByTestId("sql-error-msg-ok-1")).not.toBeInTheDocument();
  });

  it("does not show error display for user messages", () => {
    const msg = {
      id: "msg-user-1",
      role: "user" as const,
      content: "hello",
      sql_query: null,
      sql_executions: [
        {
          query: "SELECT 1",
          columns: null,
          rows: null,
          total_rows: null,
          error: "some error",
          execution_time_ms: null,
        },
      ],
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
      />
    );
    expect(screen.queryByTestId("sql-error-msg-user-1")).not.toBeInTheDocument();
  });

  it("does not show error display during streaming", () => {
    const msg = {
      id: "msg-stream-1",
      role: "assistant" as const,
      content: "",
      sql_query: null,
      sql_executions: [
        {
          query: "SELECT 1",
          columns: null,
          rows: null,
          total_rows: null,
          error: "some error",
          execution_time_ms: null,
        },
      ],
      reasoning: null,
      created_at: new Date().toISOString(),
    };
    render(
      <MessageBubble
        message={msg}
        isCurrentlyStreaming={true}
        onShowSQL={noopFn}
        onShowReasoning={noopFn}
        onCopy={noopFn}
        onVisualize={noopFn}
      />
    );
    expect(screen.queryByTestId("sql-error-msg-stream-1")).not.toBeInTheDocument();
  });

  it("shows multiple errors with query numbers", () => {
    const msg = {
      id: "msg-multi-1",
      role: "assistant" as const,
      content: "Errors occurred",
      sql_query: null,
      sql_executions: [
        {
          query: "SELECT * FROM a",
          columns: null,
          rows: null,
          total_rows: null,
          error: "Table a not found",
          execution_time_ms: null,
        },
        {
          query: "SELECT * FROM b",
          columns: ["id"],
          rows: [[1]],
          total_rows: 1,
          error: null,
          execution_time_ms: 10,
        },
        {
          query: "SELECT * FROM c",
          columns: null,
          rows: null,
          total_rows: null,
          error: "Permission denied",
          execution_time_ms: null,
        },
      ],
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
      />
    );
    expect(screen.getByTestId("sql-error-msg-multi-1")).toBeInTheDocument();
    expect(screen.getByText("Table a not found")).toBeInTheDocument();
    expect(screen.getByText("Permission denied")).toBeInTheDocument();
  });
});
