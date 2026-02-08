import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { StreamingMessage } from "@/components/chat-area/StreamingMessage";
import { useChatStore } from "@/stores/chatStore";

describe("StreamingMessage", () => {
  beforeEach(() => {
    useChatStore.setState({
      isStreaming: false,
      streamingMessageId: null,
      streamingTokens: "",
      isReasoning: false,
      streamingReasoning: "",
    });
  });

  it("renders nothing when not streaming", () => {
    const { container } = render(<StreamingMessage messageId="msg-1" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when streaming a different message", () => {
    useChatStore.setState({
      isStreaming: true,
      streamingMessageId: "msg-2",
      streamingTokens: "Hello world",
    });

    const { container } = render(<StreamingMessage messageId="msg-1" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders streaming tokens when this message is streaming", () => {
    useChatStore.setState({
      isStreaming: true,
      streamingMessageId: "msg-1",
      streamingTokens: "Hello streaming world",
    });

    render(<StreamingMessage messageId="msg-1" />);
    expect(screen.getByText("Hello streaming world")).toBeInTheDocument();
  });

  it("shows streaming indicator when streaming without reasoning", () => {
    useChatStore.setState({
      isStreaming: true,
      streamingMessageId: "msg-1",
      streamingTokens: "Test",
      isReasoning: false,
    });

    render(<StreamingMessage messageId="msg-1" />);
    expect(screen.getByTestId("streaming-indicator")).toBeInTheDocument();
  });

  it("shows reasoning section when reasoning is active", () => {
    useChatStore.setState({
      isStreaming: true,
      streamingMessageId: "msg-1",
      streamingTokens: "Answer...",
      isReasoning: true,
      streamingReasoning: "Let me think about this...",
    });

    render(<StreamingMessage messageId="msg-1" />);
    expect(screen.getByText("Thinking...")).toBeInTheDocument();
    expect(screen.getByText("Let me think about this...")).toBeInTheDocument();
  });

  it("hides streaming indicator when reasoning is active", () => {
    useChatStore.setState({
      isStreaming: true,
      streamingMessageId: "msg-1",
      streamingTokens: "Answer...",
      isReasoning: true,
      streamingReasoning: "Thinking...",
    });

    render(<StreamingMessage messageId="msg-1" />);
    expect(screen.queryByTestId("streaming-indicator")).not.toBeInTheDocument();
  });

  it("renders markdown in streaming tokens", () => {
    useChatStore.setState({
      isStreaming: true,
      streamingMessageId: "msg-1",
      streamingTokens: "# Heading\n\nSome **bold** text",
    });

    render(<StreamingMessage messageId="msg-1" />);
    expect(screen.getByText("Heading")).toBeInTheDocument();
    expect(screen.getByText("bold")).toBeInTheDocument();
  });
});
