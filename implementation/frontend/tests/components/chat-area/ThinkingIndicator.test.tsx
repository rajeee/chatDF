import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { StreamingMessage } from "@/components/chat-area/StreamingMessage";
import { useChatStore } from "@/stores/chatStore";

describe("ThinkingIndicator", () => {
  beforeEach(() => {
    useChatStore.setState({
      isStreaming: false,
      streamingMessageId: null,
      streamingTokens: "",
      isReasoning: false,
      streamingReasoning: "",
    });
  });

  it("shows thinking indicator when streaming but no tokens yet", () => {
    useChatStore.setState({
      isStreaming: true,
      streamingMessageId: "msg-1",
      streamingTokens: "",
      isReasoning: false,
      streamingReasoning: "",
    });

    render(<StreamingMessage messageId="msg-1" />);
    expect(screen.getByTestId("thinking-indicator")).toBeInTheDocument();
    expect(screen.getByText("Analyzing your question...")).toBeInTheDocument();
  });

  it("hides thinking indicator when tokens arrive", () => {
    useChatStore.setState({
      isStreaming: true,
      streamingMessageId: "msg-1",
      streamingTokens: "Hello world",
      isReasoning: false,
      streamingReasoning: "",
    });

    render(<StreamingMessage messageId="msg-1" />);
    expect(screen.queryByTestId("thinking-indicator")).not.toBeInTheDocument();
  });

  it("hides thinking indicator when reasoning starts", () => {
    useChatStore.setState({
      isStreaming: true,
      streamingMessageId: "msg-1",
      streamingTokens: "",
      isReasoning: true,
      streamingReasoning: "Let me think...",
    });

    render(<StreamingMessage messageId="msg-1" />);
    expect(screen.queryByTestId("thinking-indicator")).not.toBeInTheDocument();
  });

  it("has the correct test ID", () => {
    useChatStore.setState({
      isStreaming: true,
      streamingMessageId: "msg-1",
      streamingTokens: "",
      isReasoning: false,
      streamingReasoning: "",
    });

    render(<StreamingMessage messageId="msg-1" />);
    const indicator = screen.getByTestId("thinking-indicator");
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveClass("thinking-indicator");
  });

  it("does not show when not streaming", () => {
    useChatStore.setState({
      isStreaming: false,
      streamingMessageId: null,
      streamingTokens: "",
    });

    const { container } = render(<StreamingMessage messageId="msg-1" />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("thinking-indicator")).not.toBeInTheDocument();
  });
});
