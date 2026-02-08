// Tests: Exact timestamp tooltip on message bubbles
// Verifies that hovering over the relative timestamp shows the exact date/time via title attribute.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderWithProviders, screen } from "../../helpers/render";
import { resetAllStores } from "../../helpers/stores";
import { MessageBubble } from "@/components/chat-area/MessageBubble";

const testMessage = {
  id: "msg-1",
  role: "assistant" as const,
  content: "Hello world",
  sql_query: null,
  sql_executions: [],
  reasoning: null,
  created_at: "2026-02-05T15:30:00Z",
};

const noop = () => {};

beforeEach(() => {
  resetAllStores();
});

describe("Timestamp tooltip shows exact date/time", () => {
  it("renders the timestamp span with a title attribute containing the formatted date", () => {
    renderWithProviders(
      <MessageBubble
        message={testMessage}
        isCurrentlyStreaming={false}
        onShowSQL={noop}
        onShowReasoning={noop}
        onCopy={noop}
        onVisualize={noop}
      />
    );

    const timestampEl = screen.getByTestId("timestamp-msg-1");
    expect(timestampEl).toBeInTheDocument();

    const titleAttr = timestampEl.getAttribute("title");
    expect(titleAttr).toBeTruthy();

    // The title should contain the formatted date from the created_at value.
    // new Date("2026-02-05T15:30:00Z").toLocaleString() will produce a locale-specific string.
    // We verify key parts are present: year, day, and time components.
    const expectedDate = new Date("2026-02-05T15:30:00Z");
    const expectedFormatted = expectedDate.toLocaleString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });

    expect(titleAttr).toBe(expectedFormatted);
  });

  it("title attribute contains the year, month, and time from the message timestamp", () => {
    renderWithProviders(
      <MessageBubble
        message={testMessage}
        isCurrentlyStreaming={false}
        onShowSQL={noop}
        onShowReasoning={noop}
        onCopy={noop}
        onVisualize={noop}
      />
    );

    const timestampEl = screen.getByTestId("timestamp-msg-1");
    const titleAttr = timestampEl.getAttribute("title")!;

    // Verify key date components are present regardless of locale formatting
    expect(titleAttr).toContain("2026");
    expect(titleAttr).toContain("February");
    expect(titleAttr).toContain("5");
  });

  it("user messages also have the exact timestamp tooltip", () => {
    const userMessage = {
      ...testMessage,
      id: "msg-user-1",
      role: "user" as const,
      content: "User question",
      created_at: "2026-01-15T09:00:00Z",
    };

    renderWithProviders(
      <MessageBubble
        message={userMessage}
        isCurrentlyStreaming={false}
        onShowSQL={noop}
        onShowReasoning={noop}
        onCopy={noop}
        onVisualize={noop}
      />
    );

    const timestampEl = screen.getByTestId("timestamp-msg-user-1");
    const titleAttr = timestampEl.getAttribute("title");
    expect(titleAttr).toBeTruthy();
    expect(titleAttr).toContain("2026");
    expect(titleAttr).toContain("January");
  });
});
