// Tests: Copy button has touch-action-btn class for mobile visibility
// Verifies that the copy button on message bubbles includes the touch-action-btn
// CSS class so it is visible at 0.5 opacity on touch devices (no hover).

import { describe, it, expect, beforeEach } from "vitest";
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
  created_at: new Date().toISOString(),
};

const noop = () => {};

beforeEach(() => {
  resetAllStores();
});

describe("MessageBubble touch-friendly buttons", () => {
  it("copy button has touch-action-btn class for mobile visibility", () => {
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

    const copyBtn = screen.getByTestId("copy-btn-msg-1");
    expect(copyBtn.className).toContain("touch-action-btn");
  });
});
