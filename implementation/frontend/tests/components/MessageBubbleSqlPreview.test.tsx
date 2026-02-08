import { describe, it, expect, beforeEach } from "vitest";
import { renderWithProviders, screen, userEvent } from "../helpers/render";
import { resetAllStores } from "../helpers/stores";
import { MessageBubble } from "@/components/chat-area/MessageBubble";
import type { Message } from "@/stores/chatStore";

const mockMessage: Message = {
  id: "msg-1",
  role: "assistant",
  content: "Here are the results",
  created_at: new Date().toISOString(),
  sql_executions: [
    {
      query: "SELECT * FROM table",
      columns: [],
      rows: [],
      error: null,
      execution_time_ms: 100,
    },
  ],
  reasoning: null,
  sendFailed: false,
};

beforeEach(() => {
  resetAllStores();
});

describe("MessageBubble SQL Preview Animation", () => {
  it("renders SQL preview toggle with chevron that has transition-transform class", () => {
    renderWithProviders(
      <MessageBubble
        message={mockMessage}
        isCurrentlyStreaming={false}
        onShowSQL={() => {}}
        onShowReasoning={() => {}}
        onCopy={() => {}}
        onVisualize={() => {}}
      />
    );

    const toggleButton = screen.getByTestId(`sql-preview-toggle-${mockMessage.id}`);
    expect(toggleButton).toBeInTheDocument();

    // Find the chevron SVG element
    const chevron = toggleButton.querySelector("svg");
    expect(chevron).toBeInTheDocument();
    expect(chevron?.classList.contains("transition-transform")).toBe(true);
    expect(chevron?.classList.contains("duration-200")).toBe(true);
  });

  it("starts with expand container at maxHeight 0px (collapsed)", () => {
    renderWithProviders(
      <MessageBubble
        message={mockMessage}
        isCurrentlyStreaming={false}
        onShowSQL={() => {}}
        onShowReasoning={() => {}}
        onCopy={() => {}}
        onVisualize={() => {}}
      />
    );

    const contentContainer = screen.getByTestId(`sql-preview-content-${mockMessage.id}`);
    expect(contentContainer).toBeInTheDocument();
    expect(contentContainer).toHaveStyle({
      maxHeight: "0px",
      opacity: "0",
      overflow: "hidden",
    });
  });

  it("expands to maxHeight 200px when toggle button is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <MessageBubble
        message={mockMessage}
        isCurrentlyStreaming={false}
        onShowSQL={() => {}}
        onShowReasoning={() => {}}
        onCopy={() => {}}
        onVisualize={() => {}}
      />
    );

    const toggleButton = screen.getByTestId(`sql-preview-toggle-${mockMessage.id}`);
    const contentContainer = screen.getByTestId(`sql-preview-content-${mockMessage.id}`);

    // Initially collapsed
    expect(contentContainer).toHaveStyle({ maxHeight: "0px", opacity: "0" });

    // Click to expand
    await user.click(toggleButton);

    // Should be expanded
    expect(contentContainer).toHaveStyle({
      maxHeight: "200px",
      opacity: "1",
      overflow: "hidden",
    });
  });

  it("has transition properties on the expand container", () => {
    renderWithProviders(
      <MessageBubble
        message={mockMessage}
        isCurrentlyStreaming={false}
        onShowSQL={() => {}}
        onShowReasoning={() => {}}
        onCopy={() => {}}
        onVisualize={() => {}}
      />
    );

    const contentContainer = screen.getByTestId(`sql-preview-content-${mockMessage.id}`);
    expect(contentContainer).toHaveStyle({
      transition: "max-height 200ms ease, opacity 150ms ease",
    });
  });

  it("rotates chevron when expanded", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <MessageBubble
        message={mockMessage}
        isCurrentlyStreaming={false}
        onShowSQL={() => {}}
        onShowReasoning={() => {}}
        onCopy={() => {}}
        onVisualize={() => {}}
      />
    );

    const toggleButton = screen.getByTestId(`sql-preview-toggle-${mockMessage.id}`);
    const chevron = toggleButton.querySelector("svg");

    // Initially not rotated
    expect(chevron?.classList.contains("rotate-90")).toBe(false);

    // Click to expand
    await user.click(toggleButton);

    // Should be rotated
    expect(chevron?.classList.contains("rotate-90")).toBe(true);
  });

  it("collapses back to 0px when toggle button is clicked again", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <MessageBubble
        message={mockMessage}
        isCurrentlyStreaming={false}
        onShowSQL={() => {}}
        onShowReasoning={() => {}}
        onCopy={() => {}}
        onVisualize={() => {}}
      />
    );

    const toggleButton = screen.getByTestId(`sql-preview-toggle-${mockMessage.id}`);
    const contentContainer = screen.getByTestId(`sql-preview-content-${mockMessage.id}`);

    // Expand
    await user.click(toggleButton);
    expect(contentContainer).toHaveStyle({ maxHeight: "200px", opacity: "1" });

    // Collapse
    await user.click(toggleButton);
    expect(contentContainer).toHaveStyle({ maxHeight: "0px", opacity: "0" });
  });
});
