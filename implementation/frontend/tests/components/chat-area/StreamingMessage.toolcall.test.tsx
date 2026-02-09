// Tests for NL-to-SQL live preview in StreamingMessage.
// TC-1: pendingToolCall with execute_sql shows SQL preview
// TC-2: pendingToolCall with load_dataset shows loading message
// TC-3: pendingToolCall with create_chart shows chart message
// TC-4: pendingToolCall is null — no preview shown
// TC-5: pendingToolCall clears when streaming stops
// TC-6: tcs WS event sets pendingToolCall in chatStore

import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { StreamingMessage } from "@/components/chat-area/StreamingMessage";
import { useChatStore } from "@/stores/chatStore";

/** Helper to put chatStore into a streaming state with an optional pendingToolCall */
function setStreamingState(overrides: Partial<ReturnType<typeof useChatStore.getState>> = {}) {
  useChatStore.setState({
    isStreaming: true,
    streamingMessageId: "msg-1",
    streamingTokens: "",
    isReasoning: false,
    streamingReasoning: "",
    pendingToolCall: null,
    queryProgress: null,
    ...overrides,
  });
}

describe("StreamingMessage tool call preview", () => {
  beforeEach(() => {
    useChatStore.setState({
      isStreaming: false,
      streamingMessageId: null,
      streamingTokens: "",
      isReasoning: false,
      streamingReasoning: "",
      pendingToolCall: null,
      queryProgress: null,
    });
  });

  describe("TC-1: execute_sql shows SQL preview", () => {
    it("renders tool call preview container", () => {
      setStreamingState({
        pendingToolCall: {
          tool: "execute_sql",
          args: { query: "SELECT * FROM users LIMIT 10" },
        },
      });

      render(<StreamingMessage messageId="msg-1" />);
      expect(screen.getByTestId("tool-call-preview")).toBeInTheDocument();
    });

    it("shows 'Executing SQL...' label", () => {
      setStreamingState({
        pendingToolCall: {
          tool: "execute_sql",
          args: { query: "SELECT COUNT(*) FROM orders" },
        },
      });

      render(<StreamingMessage messageId="msg-1" />);
      expect(screen.getByTestId("tool-call-label")).toHaveTextContent("Executing SQL...");
    });

    it("displays the SQL query in a code block", () => {
      const sql = "SELECT name, age FROM users WHERE age > 21 ORDER BY name";
      setStreamingState({
        pendingToolCall: {
          tool: "execute_sql",
          args: { query: sql },
        },
      });

      render(<StreamingMessage messageId="msg-1" />);
      const sqlBlock = screen.getByTestId("tool-call-sql");
      expect(sqlBlock).toBeInTheDocument();
      expect(sqlBlock).toHaveTextContent(sql);
    });

    it("handles sql arg key as well as query key", () => {
      const sql = "SELECT 1";
      setStreamingState({
        pendingToolCall: {
          tool: "execute_sql",
          args: { sql },
        },
      });

      render(<StreamingMessage messageId="msg-1" />);
      const sqlBlock = screen.getByTestId("tool-call-sql");
      expect(sqlBlock).toHaveTextContent(sql);
    });

    it("renders the SQL in a monospace pre tag", () => {
      setStreamingState({
        pendingToolCall: {
          tool: "execute_sql",
          args: { query: "SELECT 1" },
        },
      });

      render(<StreamingMessage messageId="msg-1" />);
      const pre = screen.getByTestId("tool-call-sql").querySelector("pre");
      expect(pre).not.toBeNull();
      expect(pre).toHaveClass("font-mono");
    });
  });

  describe("TC-2: load_dataset shows loading message", () => {
    it("shows 'Loading dataset...' label for load_dataset tool", () => {
      setStreamingState({
        pendingToolCall: {
          tool: "load_dataset",
          args: { url: "https://example.com/data.csv" },
        },
      });

      render(<StreamingMessage messageId="msg-1" />);
      expect(screen.getByTestId("tool-call-label")).toHaveTextContent("Loading dataset...");
    });

    it("does not show SQL code block for load_dataset", () => {
      setStreamingState({
        pendingToolCall: {
          tool: "load_dataset",
          args: { url: "https://example.com/data.csv" },
        },
      });

      render(<StreamingMessage messageId="msg-1" />);
      expect(screen.queryByTestId("tool-call-sql")).not.toBeInTheDocument();
    });
  });

  describe("TC-3: create_chart shows chart message", () => {
    it("shows 'Creating chart...' label for create_chart tool", () => {
      setStreamingState({
        pendingToolCall: {
          tool: "create_chart",
          args: { chart_type: "bar", title: "Sales" },
        },
      });

      render(<StreamingMessage messageId="msg-1" />);
      expect(screen.getByTestId("tool-call-label")).toHaveTextContent("Creating chart...");
    });
  });

  describe("TC-4: no preview when pendingToolCall is null", () => {
    it("does not render tool call preview when pendingToolCall is null", () => {
      setStreamingState({ pendingToolCall: null });

      render(<StreamingMessage messageId="msg-1" />);
      expect(screen.queryByTestId("tool-call-preview")).not.toBeInTheDocument();
    });
  });

  describe("TC-5: pendingToolCall clears when streaming stops", () => {
    it("clears pendingToolCall when setStreaming(false) is called", () => {
      const store = useChatStore.getState();
      // Simulate a tool call during streaming
      useChatStore.setState({
        isStreaming: true,
        streamingMessageId: "msg-1",
        pendingToolCall: {
          tool: "execute_sql",
          args: { query: "SELECT 1" },
        },
      });

      // Verify it's set
      expect(useChatStore.getState().pendingToolCall).not.toBeNull();

      // Stop streaming (as chat_complete handler does)
      useChatStore.getState().setStreaming(false);

      // Verify it's cleared
      expect(useChatStore.getState().pendingToolCall).toBeNull();
    });

    it("does not render preview after streaming stops", () => {
      // Start with streaming + tool call
      setStreamingState({
        pendingToolCall: {
          tool: "execute_sql",
          args: { query: "SELECT 1" },
        },
      });

      const { rerender } = render(<StreamingMessage messageId="msg-1" />);
      expect(screen.getByTestId("tool-call-preview")).toBeInTheDocument();

      // Stop streaming
      act(() => {
        useChatStore.getState().setStreaming(false);
      });
      rerender(<StreamingMessage messageId="msg-1" />);

      // Component renders nothing when not streaming
      expect(screen.queryByTestId("tool-call-preview")).not.toBeInTheDocument();
    });
  });

  describe("TC-6: tcs WS event sets pendingToolCall in chatStore", () => {
    it("setPendingToolCall sets the state correctly", () => {
      const toolCall = { tool: "execute_sql", args: { query: "SELECT 1" } };
      useChatStore.getState().setPendingToolCall(toolCall);
      expect(useChatStore.getState().pendingToolCall).toEqual(toolCall);
    });

    it("setPendingToolCall(null) clears the state", () => {
      useChatStore.getState().setPendingToolCall({ tool: "execute_sql", args: { query: "SELECT 1" } });
      useChatStore.getState().setPendingToolCall(null);
      expect(useChatStore.getState().pendingToolCall).toBeNull();
    });

    it("reset() clears pendingToolCall", () => {
      useChatStore.getState().setPendingToolCall({ tool: "execute_sql", args: { query: "SELECT 1" } });
      useChatStore.getState().reset();
      expect(useChatStore.getState().pendingToolCall).toBeNull();
    });
  });

  describe("unknown tool shows generic label", () => {
    it("shows 'Running <tool>...' for unknown tool names", () => {
      setStreamingState({
        pendingToolCall: {
          tool: "some_custom_tool",
          args: {},
        },
      });

      render(<StreamingMessage messageId="msg-1" />);
      expect(screen.getByTestId("tool-call-label")).toHaveTextContent("Running some_custom_tool...");
    });
  });
});
