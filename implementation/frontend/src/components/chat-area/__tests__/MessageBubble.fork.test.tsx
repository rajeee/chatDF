import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MessageBubble } from "../MessageBubble";

const baseMessage = {
  id: "msg-1",
  conversation_id: "conv-1",
  role: "user" as const,
  content: "Hello there",
  sql_executions: [],
  created_at: new Date().toISOString(),
  sendFailed: false,
};

const assistantMessage = {
  ...baseMessage,
  id: "msg-2",
  role: "assistant" as const,
  content: "Hi! How can I help?",
};

describe("MessageBubble fork button", () => {
  const noop = () => {};

  it("shows fork button on user messages", () => {
    render(
      <MessageBubble
        message={baseMessage}
        isCurrentlyStreaming={false}
        onShowSQL={noop}
        onShowReasoning={noop}
        onCopy={noop}
        onVisualize={noop}
        onFork={noop}
      />
    );
    expect(screen.getByTestId(`fork-btn-${baseMessage.id}`)).toBeInTheDocument();
  });

  it("shows fork button on assistant messages", () => {
    render(
      <MessageBubble
        message={assistantMessage}
        isCurrentlyStreaming={false}
        onShowSQL={noop}
        onShowReasoning={noop}
        onCopy={noop}
        onVisualize={noop}
        onFork={noop}
      />
    );
    expect(screen.getByTestId(`fork-btn-${assistantMessage.id}`)).toBeInTheDocument();
  });

  it("calls onFork with message id when clicked", () => {
    const onFork = vi.fn();
    render(
      <MessageBubble
        message={baseMessage}
        isCurrentlyStreaming={false}
        onShowSQL={noop}
        onShowReasoning={noop}
        onCopy={noop}
        onVisualize={noop}
        onFork={onFork}
      />
    );
    fireEvent.click(screen.getByTestId(`fork-btn-${baseMessage.id}`));
    expect(onFork).toHaveBeenCalledWith(baseMessage.id);
  });

  it("does not show fork button when onFork is not provided", () => {
    render(
      <MessageBubble
        message={baseMessage}
        isCurrentlyStreaming={false}
        onShowSQL={noop}
        onShowReasoning={noop}
        onCopy={noop}
        onVisualize={noop}
      />
    );
    expect(screen.queryByTestId(`fork-btn-${baseMessage.id}`)).not.toBeInTheDocument();
  });

  it("does not show fork button while streaming", () => {
    render(
      <MessageBubble
        message={baseMessage}
        isCurrentlyStreaming={true}
        onShowSQL={noop}
        onShowReasoning={noop}
        onCopy={noop}
        onVisualize={noop}
        onFork={noop}
      />
    );
    expect(screen.queryByTestId(`fork-btn-${baseMessage.id}`)).not.toBeInTheDocument();
  });
});
