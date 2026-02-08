import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, userEvent } from "../helpers/render";
import { createRef } from "react";
import { ChatInput, type ChatInputHandle } from "@/components/chat-area/ChatInput";
import { useChatStore } from "@/stores/chatStore";

describe("ChatInput auto-focus after send", () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it("re-focuses textarea after sending a message via Enter key", async () => {
    const onSend = vi.fn();
    const onStop = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<ChatInput onSend={onSend} onStop={onStop} />);

    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "Hello world");
    await user.keyboard("{Enter}");

    expect(onSend).toHaveBeenCalledWith("Hello world");
    // After send, textarea should be re-focused (may need small wait for rAF)
    // The focus call is inside requestAnimationFrame, but in test env it executes synchronously
    expect(textarea).toHaveFocus();
  });

  it("re-focuses textarea after sending a message via sendMessage ref", async () => {
    const ref = createRef<ChatInputHandle>();
    const onSend = vi.fn();
    const onStop = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<ChatInput ref={ref} onSend={onSend} onStop={onStop} />);

    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "Test query");

    ref.current?.sendMessage();

    expect(onSend).toHaveBeenCalledWith("Test query");
    // Focus should be restored
    expect(textarea).toHaveFocus();
  });

  it("clears input value after sending", async () => {
    const onSend = vi.fn();
    const onStop = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<ChatInput onSend={onSend} onStop={onStop} />);

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    await user.type(textarea, "Hello world");
    await user.keyboard("{Enter}");

    expect(textarea.value).toBe("");
  });
});
