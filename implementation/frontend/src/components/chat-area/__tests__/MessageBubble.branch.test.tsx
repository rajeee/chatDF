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

describe("MessageBubble branch button", () => {
  const noop = () => {};

  it("shows branch button on user messages", () => {
    render(
      <MessageBubble
        message={baseMessage}
        isCurrentlyStreaming={false}
        onShowSQL={noop}
        onShowReasoning={noop}
        onCopy={noop}
        onVisualize={noop}
        onBranch={noop}
      />
    );
    expect(screen.getByTestId(`branch-btn-${baseMessage.id}`)).toBeInTheDocument();
  });

  it("shows branch button on assistant messages", () => {
    render(
      <MessageBubble
        message={assistantMessage}
        isCurrentlyStreaming={false}
        onShowSQL={noop}
        onShowReasoning={noop}
        onCopy={noop}
        onVisualize={noop}
        onBranch={noop}
      />
    );
    expect(screen.getByTestId(`branch-btn-${assistantMessage.id}`)).toBeInTheDocument();
  });

  it("calls onBranch with message id when clicked", () => {
    const onBranch = vi.fn();
    render(
      <MessageBubble
        message={baseMessage}
        isCurrentlyStreaming={false}
        onShowSQL={noop}
        onShowReasoning={noop}
        onCopy={noop}
        onVisualize={noop}
        onBranch={onBranch}
      />
    );
    fireEvent.click(screen.getByTestId(`branch-btn-${baseMessage.id}`));
    expect(onBranch).toHaveBeenCalledWith(baseMessage.id);
  });

  it("does not show branch button when onBranch is not provided", () => {
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
    expect(screen.queryByTestId(`branch-btn-${baseMessage.id}`)).not.toBeInTheDocument();
  });

  it("does not show branch button while streaming", () => {
    render(
      <MessageBubble
        message={baseMessage}
        isCurrentlyStreaming={true}
        onShowSQL={noop}
        onShowReasoning={noop}
        onCopy={noop}
        onVisualize={noop}
        onBranch={noop}
      />
    );
    expect(screen.queryByTestId(`branch-btn-${baseMessage.id}`)).not.toBeInTheDocument();
  });

  it("shows branch button alongside fork button", () => {
    render(
      <MessageBubble
        message={baseMessage}
        isCurrentlyStreaming={false}
        onShowSQL={noop}
        onShowReasoning={noop}
        onCopy={noop}
        onVisualize={noop}
        onFork={noop}
        onBranch={noop}
      />
    );
    expect(screen.getByTestId(`fork-btn-${baseMessage.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`branch-btn-${baseMessage.id}`)).toBeInTheDocument();
  });
});
