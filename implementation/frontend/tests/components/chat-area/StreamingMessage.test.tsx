import { render, screen, fireEvent } from "@testing-library/react";
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

  it("shows pulsing cursor when streaming without reasoning", () => {
    useChatStore.setState({
      isStreaming: true,
      streamingMessageId: "msg-1",
      streamingTokens: "Test",
      isReasoning: false,
    });

    render(<StreamingMessage messageId="msg-1" />);
    const cursor = screen.getByTestId("streaming-cursor");
    expect(cursor).toBeInTheDocument();
    expect(cursor).toHaveClass("streaming-cursor");
    expect(cursor).toHaveAttribute("aria-hidden", "true");
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
    expect(screen.getByTestId("reasoning-toggle")).toBeInTheDocument();
    expect(screen.getByText("Thinking...")).toBeInTheDocument();
    expect(screen.getByText("Let me think about this...")).toBeInTheDocument();
  });

  it("hides streaming cursor when reasoning is active", () => {
    useChatStore.setState({
      isStreaming: true,
      streamingMessageId: "msg-1",
      streamingTokens: "Answer...",
      isReasoning: true,
      streamingReasoning: "Thinking...",
    });

    render(<StreamingMessage messageId="msg-1" />);
    expect(screen.queryByTestId("streaming-cursor")).not.toBeInTheDocument();
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

  describe("collapsible reasoning", () => {
    it("shows reasoning section when streaming reasoning exists", () => {
      useChatStore.setState({
        isStreaming: true,
        streamingMessageId: "msg-1",
        streamingTokens: "Hello world",
        isReasoning: true,
        streamingReasoning: "Let me think about this...",
      });

      render(<StreamingMessage messageId="msg-1" />);
      expect(screen.getByTestId("reasoning-toggle")).toBeInTheDocument();
      expect(screen.getByText("Thinking...")).toBeInTheDocument();
      expect(screen.getByText("Let me think about this...")).toBeInTheDocument();
    });

    it("collapses reasoning content when toggle is clicked", () => {
      useChatStore.setState({
        isStreaming: true,
        streamingMessageId: "msg-1",
        streamingTokens: "Hello world",
        isReasoning: true,
        streamingReasoning: "Let me think about this...",
      });

      render(<StreamingMessage messageId="msg-1" />);
      const toggle = screen.getByTestId("reasoning-toggle");
      expect(screen.getByText("Let me think about this...")).toBeInTheDocument();

      fireEvent.click(toggle);
      expect(screen.queryByText("Let me think about this...")).not.toBeInTheDocument();
    });

    it("expands reasoning content when toggle is clicked again", () => {
      useChatStore.setState({
        isStreaming: true,
        streamingMessageId: "msg-1",
        streamingTokens: "Hello world",
        isReasoning: true,
        streamingReasoning: "Let me think about this...",
      });

      render(<StreamingMessage messageId="msg-1" />);
      const toggle = screen.getByTestId("reasoning-toggle");

      fireEvent.click(toggle); // collapse
      fireEvent.click(toggle); // expand
      expect(screen.getByText("Let me think about this...")).toBeInTheDocument();
    });

    it("shows 'Reasoning' label when not actively reasoning", () => {
      useChatStore.setState({
        isStreaming: true,
        streamingMessageId: "msg-1",
        streamingTokens: "Response text",
        isReasoning: false,
        streamingReasoning: "Previous reasoning content",
      });

      render(<StreamingMessage messageId="msg-1" />);
      expect(screen.getByText("Reasoning")).toBeInTheDocument();
      expect(screen.queryByText("Thinking...")).not.toBeInTheDocument();
    });

    it("has correct aria-expanded attribute", () => {
      useChatStore.setState({
        isStreaming: true,
        streamingMessageId: "msg-1",
        streamingTokens: "Hello world",
        isReasoning: true,
        streamingReasoning: "Let me think about this...",
      });

      render(<StreamingMessage messageId="msg-1" />);
      const toggle = screen.getByTestId("reasoning-toggle");
      expect(toggle).toHaveAttribute("aria-expanded", "true");

      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute("aria-expanded", "false");
    });

    it("keeps reasoning section visible after reasoning phase ends", () => {
      useChatStore.setState({
        isStreaming: true,
        streamingMessageId: "msg-1",
        streamingTokens: "Here is my answer",
        isReasoning: false,
        streamingReasoning: "I thought about the problem carefully",
      });

      render(<StreamingMessage messageId="msg-1" />);
      expect(screen.getByTestId("reasoning-toggle")).toBeInTheDocument();
      expect(screen.getByText("I thought about the problem carefully")).toBeInTheDocument();
    });

    it("does not show bouncing dots when reasoning is complete", () => {
      useChatStore.setState({
        isStreaming: true,
        streamingMessageId: "msg-1",
        streamingTokens: "Response text",
        isReasoning: false,
        streamingReasoning: "Previous reasoning content",
      });

      render(<StreamingMessage messageId="msg-1" />);
      // The bouncing dots should not be present when isReasoning is false
      const dots = screen.queryAllByText(".");
      // When not reasoning, the bounce dots should not appear
      dots.forEach((dot) => {
        expect(dot).not.toHaveClass("animate-bounce");
      });
    });
  });
});
