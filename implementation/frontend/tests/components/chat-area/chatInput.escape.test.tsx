// Tests for Escape key keyboard enhancement in ChatInput
// Verifies:
// - Escape key unfocuses the textarea
// - Stop button shows "(Esc)" in title when streaming

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderWithProviders, screen, userEvent } from "../../helpers/render";
import { resetAllStores } from "../../helpers/stores";
import { useChatStore } from "@/stores/chatStore";
import { ChatInput } from "@/components/chat-area/ChatInput";

beforeEach(() => {
  resetAllStores();
});

describe("ChatInput Escape key enhancement", () => {
  it("blurs textarea when Escape is pressed", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    const onStop = vi.fn();

    renderWithProviders(<ChatInput onSend={onSend} onStop={onStop} />);

    const textarea = screen.getByRole("textbox", { name: /message input/i });

    // Focus the textarea
    await user.click(textarea);
    expect(document.activeElement).toBe(textarea);

    // Press Escape
    await user.keyboard("{Escape}");

    // Textarea should now be blurred
    expect(document.activeElement).not.toBe(textarea);
  });

  it("shows Esc shortcut in stop button title when streaming", () => {
    const onSend = vi.fn();
    const onStop = vi.fn();

    // Set streaming state
    useChatStore.setState({ isStreaming: true });

    renderWithProviders(<ChatInput onSend={onSend} onStop={onStop} />);

    const stopBtn = screen.getByLabelText("Stop generating");
    expect(stopBtn).toHaveAttribute("title", "Stop generating (Esc)");
  });

  it("shows standard send button title when not streaming", () => {
    const onSend = vi.fn();
    const onStop = vi.fn();

    // Ensure not streaming
    useChatStore.setState({ isStreaming: false });

    renderWithProviders(<ChatInput onSend={onSend} onStop={onStop} />);

    const sendBtn = screen.getByLabelText("Send message");
    expect(sendBtn).toHaveAttribute("title", "Send message (⏎)");
  });
});
