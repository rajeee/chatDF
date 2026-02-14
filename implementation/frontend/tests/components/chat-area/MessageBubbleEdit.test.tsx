import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MessageBubble } from "@/components/chat-area/MessageBubble";
import type { Message } from "@/stores/chatStore";

function makeUserMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg-user-1",
    role: "user",
    content: "What is the average temperature?",
    sql_query: null,
    sql_executions: [],
    reasoning: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeAssistantMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg-asst-1",
    role: "assistant",
    content: "The average temperature is 72F.",
    sql_query: null,
    sql_executions: [],
    reasoning: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

const noop = () => {};

describe("MessageBubble Edit", () => {
  const defaultProps = {
    isCurrentlyStreaming: false,
    onShowSQL: noop,
    onShowReasoning: noop,
    onVisualize: noop,
  };

  it("shows Edit button on user messages when onEdit is provided", () => {
    render(
      <MessageBubble
        {...defaultProps}
        message={makeUserMessage()}
        onEdit={noop}
      />
    );
    expect(screen.getByTestId("edit-btn-msg-user-1")).toBeInTheDocument();
  });

  it("does not show Edit button on assistant messages", () => {
    render(
      <MessageBubble
        {...defaultProps}
        message={makeAssistantMessage()}
        onEdit={noop}
      />
    );
    expect(screen.queryByTestId("edit-btn-msg-asst-1")).not.toBeInTheDocument();
  });

  it("does not show Edit button when onEdit is not provided", () => {
    render(
      <MessageBubble
        {...defaultProps}
        message={makeUserMessage()}
      />
    );
    expect(screen.queryByTestId("edit-btn-msg-user-1")).not.toBeInTheDocument();
  });

  it("does not show Edit button during streaming", () => {
    render(
      <MessageBubble
        {...defaultProps}
        isCurrentlyStreaming={true}
        message={makeUserMessage()}
        onEdit={noop}
      />
    );
    expect(screen.queryByTestId("edit-btn-msg-user-1")).not.toBeInTheDocument();
  });

  it("does not show Edit button on failed messages", () => {
    render(
      <MessageBubble
        {...defaultProps}
        message={makeUserMessage({ sendFailed: true })}
        onEdit={noop}
      />
    );
    expect(screen.queryByTestId("edit-btn-msg-user-1")).not.toBeInTheDocument();
  });

  it("opens edit mode with textarea when Edit button is clicked", () => {
    render(
      <MessageBubble
        {...defaultProps}
        message={makeUserMessage()}
        onEdit={noop}
      />
    );
    fireEvent.click(screen.getByTestId("edit-btn-msg-user-1"));
    expect(screen.getByTestId("edit-textarea-msg-user-1")).toBeInTheDocument();
    expect(screen.getByTestId("edit-textarea-msg-user-1")).toHaveValue("What is the average temperature?");
  });

  it("hides Edit button while in edit mode", () => {
    render(
      <MessageBubble
        {...defaultProps}
        message={makeUserMessage()}
        onEdit={noop}
      />
    );
    fireEvent.click(screen.getByTestId("edit-btn-msg-user-1"));
    expect(screen.queryByTestId("edit-btn-msg-user-1")).not.toBeInTheDocument();
  });

  it("cancels edit mode when Cancel is clicked", () => {
    render(
      <MessageBubble
        {...defaultProps}
        message={makeUserMessage()}
        onEdit={noop}
      />
    );
    fireEvent.click(screen.getByTestId("edit-btn-msg-user-1"));
    fireEvent.click(screen.getByTestId("edit-cancel-msg-user-1"));
    // Back to normal view
    expect(screen.queryByTestId("edit-textarea-msg-user-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("edit-btn-msg-user-1")).toBeInTheDocument();
  });

  it("cancels edit mode when Escape is pressed", () => {
    render(
      <MessageBubble
        {...defaultProps}
        message={makeUserMessage()}
        onEdit={noop}
      />
    );
    fireEvent.click(screen.getByTestId("edit-btn-msg-user-1"));
    fireEvent.keyDown(screen.getByTestId("edit-textarea-msg-user-1"), { key: "Escape" });
    expect(screen.queryByTestId("edit-textarea-msg-user-1")).not.toBeInTheDocument();
  });

  it("calls onEdit with new content when Save & Resend is clicked", () => {
    const onEdit = vi.fn();
    render(
      <MessageBubble
        {...defaultProps}
        message={makeUserMessage()}
        onEdit={onEdit}
      />
    );
    fireEvent.click(screen.getByTestId("edit-btn-msg-user-1"));
    const textarea = screen.getByTestId("edit-textarea-msg-user-1");
    fireEvent.change(textarea, { target: { value: "What is the max temperature?" } });
    fireEvent.click(screen.getByTestId("edit-save-msg-user-1"));
    expect(onEdit).toHaveBeenCalledWith("msg-user-1", "What is the max temperature?");
  });

  it("calls onEdit on Enter key (without Shift)", () => {
    const onEdit = vi.fn();
    render(
      <MessageBubble
        {...defaultProps}
        message={makeUserMessage()}
        onEdit={onEdit}
      />
    );
    fireEvent.click(screen.getByTestId("edit-btn-msg-user-1"));
    const textarea = screen.getByTestId("edit-textarea-msg-user-1");
    fireEvent.change(textarea, { target: { value: "New content" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    expect(onEdit).toHaveBeenCalledWith("msg-user-1", "New content");
  });

  it("does not submit on Shift+Enter (allows multiline)", () => {
    const onEdit = vi.fn();
    render(
      <MessageBubble
        {...defaultProps}
        message={makeUserMessage()}
        onEdit={onEdit}
      />
    );
    fireEvent.click(screen.getByTestId("edit-btn-msg-user-1"));
    const textarea = screen.getByTestId("edit-textarea-msg-user-1");
    fireEvent.change(textarea, { target: { value: "New content" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("disables Save button when content is unchanged", () => {
    render(
      <MessageBubble
        {...defaultProps}
        message={makeUserMessage()}
        onEdit={noop}
      />
    );
    fireEvent.click(screen.getByTestId("edit-btn-msg-user-1"));
    expect(screen.getByTestId("edit-save-msg-user-1")).toBeDisabled();
  });

  it("disables Save button when content is empty", () => {
    render(
      <MessageBubble
        {...defaultProps}
        message={makeUserMessage()}
        onEdit={noop}
      />
    );
    fireEvent.click(screen.getByTestId("edit-btn-msg-user-1"));
    const textarea = screen.getByTestId("edit-textarea-msg-user-1");
    fireEvent.change(textarea, { target: { value: "   " } });
    expect(screen.getByTestId("edit-save-msg-user-1")).toBeDisabled();
  });
});
