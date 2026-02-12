// Tests: Custom tooltip on message bubble timestamps
// Verifies that the timestamp shows a styled custom tooltip with the full date/time
// instead of a native title attribute.

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

describe("Timestamp custom tooltip shows exact date/time", () => {
  it("renders a tooltip element with the formatted full date including weekday", () => {
    renderWithProviders(
      <MessageBubble
        message={testMessage}
        isCurrentlyStreaming={false}
        onShowSQL={noop}
        onShowReasoning={noop}
        onVisualize={noop}
      />
    );

    const tooltipEl = screen.getByTestId("timestamp-tooltip-msg-1");
    expect(tooltipEl).toBeInTheDocument();

    // The tooltip should contain the formatted date from the created_at value,
    // now including the weekday.
    const expectedDate = new Date("2026-02-05T15:30:00Z");
    const expectedFormatted = expectedDate.toLocaleString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });

    expect(tooltipEl.textContent).toBe(expectedFormatted);
  });

  it("does NOT use a native title attribute on the timestamp", () => {
    renderWithProviders(
      <MessageBubble
        message={testMessage}
        isCurrentlyStreaming={false}
        onShowSQL={noop}
        onShowReasoning={noop}
        onVisualize={noop}
      />
    );

    const timestampEl = screen.getByTestId("timestamp-msg-1");
    expect(timestampEl.getAttribute("title")).toBeNull();
  });

  it("tooltip contains the year, weekday, month, and time from the message timestamp", () => {
    renderWithProviders(
      <MessageBubble
        message={testMessage}
        isCurrentlyStreaming={false}
        onShowSQL={noop}
        onShowReasoning={noop}
        onVisualize={noop}
      />
    );

    const tooltipEl = screen.getByTestId("timestamp-tooltip-msg-1");
    const tooltipText = tooltipEl.textContent!;

    // Verify key date components are present regardless of locale formatting
    expect(tooltipText).toContain("2026");
    expect(tooltipText).toContain("February");
    expect(tooltipText).toContain("5");
    expect(tooltipText).toContain("Thursday");
  });

  it("user messages also have the custom tooltip", () => {
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
        onVisualize={noop}
      />
    );

    const tooltipEl = screen.getByTestId("timestamp-tooltip-msg-user-1");
    expect(tooltipEl).toBeInTheDocument();

    const tooltipText = tooltipEl.textContent!;
    expect(tooltipText).toContain("2026");
    expect(tooltipText).toContain("January");
    expect(tooltipText).toContain("Thursday");

    // Verify no title attribute on the timestamp itself
    const timestampEl = screen.getByTestId("timestamp-msg-user-1");
    expect(timestampEl.getAttribute("title")).toBeNull();
  });

  it("tooltip has pointer-events-none class to avoid click interference", () => {
    renderWithProviders(
      <MessageBubble
        message={testMessage}
        isCurrentlyStreaming={false}
        onShowSQL={noop}
        onShowReasoning={noop}
        onVisualize={noop}
      />
    );

    const tooltipEl = screen.getByTestId("timestamp-tooltip-msg-1");
    expect(tooltipEl.className).toContain("pointer-events-none");
  });
});
