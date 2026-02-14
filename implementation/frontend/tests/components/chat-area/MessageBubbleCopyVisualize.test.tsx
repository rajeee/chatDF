import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

// Mock ChartVisualization
vi.mock("@/components/chat-area/ChartVisualization", () => ({
  ChartVisualization: () => <div data-testid="chart-viz">chart</div>,
}));

// Track detectChartTypes mock for per-test configuration
let mockDetectChartTypes = vi.fn(() => [] as string[]);
vi.mock("@/utils/chartDetection", () => ({
  detectChartTypes: (...args: unknown[]) => mockDetectChartTypes(...args),
}));

const baseMessage = {
  id: "msg-1",
  role: "assistant" as const,
  content: "Here are the results of your query.",
  sql_query: null,
  sql_executions: [],
  reasoning: null,
  created_at: new Date().toISOString(),
};

const messageWithSql = {
  ...baseMessage,
  sql_executions: [
    {
      query: "SELECT * FROM users",
      columns: ["id", "name", "age"],
      rows: [[1, "Alice", 30], [2, "Bob", 25]],
      total_rows: 2,
      error: null,
      execution_time_ms: 15,
    },
  ],
};

const noopFn = vi.fn();

describe("MessageBubble Copy Button", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDetectChartTypes = vi.fn(() => []);
    // Mock clipboard API
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("renders copy button on assistant messages", () => {
    render(
      <MessageBubble
        message={baseMessage}
        isCurrentlyStreaming={false}
        onShowSQL={noopFn}
        onShowReasoning={noopFn}
        onVisualize={noopFn}
      />
    );
    expect(screen.getByTestId("copy-msg-btn-msg-1")).toBeInTheDocument();
    expect(screen.getByText("Copy")).toBeInTheDocument();
  });

  it("does not render copy button on user messages", () => {
    const userMsg = { ...baseMessage, role: "user" as const };
    render(
      <MessageBubble
        message={userMsg}
        isCurrentlyStreaming={false}
        onShowSQL={noopFn}
        onShowReasoning={noopFn}
        onVisualize={noopFn}
      />
    );
    expect(screen.queryByTestId("copy-msg-btn-msg-1")).not.toBeInTheDocument();
  });

  it("does not render copy button during streaming", () => {
    render(
      <MessageBubble
        message={baseMessage}
        isCurrentlyStreaming={true}
        onShowSQL={noopFn}
        onShowReasoning={noopFn}
        onVisualize={noopFn}
      />
    );
    expect(screen.queryByTestId("copy-msg-btn-msg-1")).not.toBeInTheDocument();
  });

  it("copies message content to clipboard on click", async () => {
    render(
      <MessageBubble
        message={baseMessage}
        isCurrentlyStreaming={false}
        onShowSQL={noopFn}
        onShowReasoning={noopFn}
        onVisualize={noopFn}
      />
    );
    fireEvent.click(screen.getByTestId("copy-msg-btn-msg-1"));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("Here are the results of your query.");
  });

  it("shows Copied feedback after clicking", async () => {
    render(
      <MessageBubble
        message={baseMessage}
        isCurrentlyStreaming={false}
        onShowSQL={noopFn}
        onShowReasoning={noopFn}
        onVisualize={noopFn}
      />
    );
    fireEvent.click(screen.getByTestId("copy-msg-btn-msg-1"));
    await waitFor(() => {
      expect(screen.getByText("Copied")).toBeInTheDocument();
    });
  });

  it("has correct aria-label before and after copy", async () => {
    render(
      <MessageBubble
        message={baseMessage}
        isCurrentlyStreaming={false}
        onShowSQL={noopFn}
        onShowReasoning={noopFn}
        onVisualize={noopFn}
      />
    );
    const btn = screen.getByTestId("copy-msg-btn-msg-1");
    expect(btn).toHaveAttribute("aria-label", "Copy message");
    fireEvent.click(btn);
    await waitFor(() => {
      expect(btn).toHaveAttribute("aria-label", "Copied");
    });
  });
});

describe("MessageBubble Visualize Button", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not show Visualize button when data is not chartable", () => {
    mockDetectChartTypes = vi.fn(() => []);
    render(
      <MessageBubble
        message={messageWithSql}
        isCurrentlyStreaming={false}
        onShowSQL={noopFn}
        onShowReasoning={noopFn}
        onVisualize={noopFn}
      />
    );
    expect(screen.queryByTestId("visualize-btn-msg-1")).not.toBeInTheDocument();
  });

  it("shows Visualize button when data is chartable", () => {
    mockDetectChartTypes = vi.fn(() => ["bar", "line"]);
    render(
      <MessageBubble
        message={messageWithSql}
        isCurrentlyStreaming={false}
        onShowSQL={noopFn}
        onShowReasoning={noopFn}
        onVisualize={noopFn}
      />
    );
    expect(screen.getByTestId("visualize-btn-msg-1")).toBeInTheDocument();
    expect(screen.getByText("Visualize")).toBeInTheDocument();
  });

  it("calls onVisualize with correct arguments when clicked", () => {
    mockDetectChartTypes = vi.fn(() => ["bar"]);
    const onVisualize = vi.fn();
    render(
      <MessageBubble
        message={messageWithSql}
        isCurrentlyStreaming={false}
        onShowSQL={noopFn}
        onShowReasoning={noopFn}
        onVisualize={onVisualize}
      />
    );
    fireEvent.click(screen.getByTestId("visualize-btn-msg-1"));
    expect(onVisualize).toHaveBeenCalledWith(messageWithSql.sql_executions, 0);
  });

  it("does not show Visualize button during streaming", () => {
    mockDetectChartTypes = vi.fn(() => ["bar"]);
    render(
      <MessageBubble
        message={messageWithSql}
        isCurrentlyStreaming={true}
        onShowSQL={noopFn}
        onShowReasoning={noopFn}
        onVisualize={noopFn}
      />
    );
    expect(screen.queryByTestId("visualize-btn-msg-1")).not.toBeInTheDocument();
  });
});
