import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen } from "../helpers/render";
import { MessageBubble } from "@/components/chat-area/MessageBubble";
import type { Message } from "@/stores/chatStore";

describe("MessageBubble word wrapping", () => {
  const defaultProps = {
    isCurrentlyStreaming: false,
    onShowSQL: vi.fn(),
    onShowReasoning: vi.fn(),
    onVisualize: vi.fn(),
  };

  it("applies break-words class to user message bubble", () => {
    const message: Message = {
      id: "msg-1",
      role: "user",
      content: "https://very-long-url-that-should-wrap.example.com/path/to/some/deeply/nested/resource/with/many/segments",
      sql_query: null,
      sql_executions: [],
      reasoning: null,
      created_at: new Date().toISOString(),
    };

    renderWithProviders(
      <MessageBubble message={message} {...defaultProps} />
    );

    const bubble = screen.getByTestId("message-bubble-msg-1");
    expect(bubble.className).toContain("break-words");
  });

  it("applies break-words class to assistant message bubble", () => {
    const message: Message = {
      id: "msg-2",
      role: "assistant",
      content: "Check this URL: https://very-long-url-that-should-wrap.example.com/path/to/resource",
      sql_query: null,
      sql_executions: [],
      reasoning: null,
      created_at: new Date().toISOString(),
    };

    renderWithProviders(
      <MessageBubble message={message} {...defaultProps} />
    );

    const bubble = screen.getByTestId("message-bubble-msg-2");
    expect(bubble.className).toContain("break-words");
  });

  it("applies break-words to prose container for markdown content", () => {
    const message: Message = {
      id: "msg-3",
      role: "assistant",
      content: "Here is some content with a long URL",
      sql_query: null,
      sql_executions: [],
      reasoning: null,
      created_at: new Date().toISOString(),
    };

    renderWithProviders(
      <MessageBubble message={message} {...defaultProps} />
    );

    const bubble = screen.getByTestId("message-bubble-msg-3");
    const proseDiv = bubble.querySelector(".prose");
    expect(proseDiv?.className).toContain("break-words");
  });

  it("applies break-words to user message span", () => {
    const message: Message = {
      id: "msg-4",
      role: "user",
      content: "A long unbroken string: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      sql_query: null,
      sql_executions: [],
      reasoning: null,
      created_at: new Date().toISOString(),
    };

    renderWithProviders(
      <MessageBubble message={message} {...defaultProps} />
    );

    const bubble = screen.getByTestId("message-bubble-msg-4");
    const span = bubble.querySelector("span.break-words");
    expect(span).not.toBeNull();
  });
});
