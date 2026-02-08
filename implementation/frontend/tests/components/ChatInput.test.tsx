import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen, userEvent } from "../helpers/render";
import { createRef } from "react";
import { ChatInput, type ChatInputHandle } from "@/components/chat-area/ChatInput";

describe("ChatInput", () => {
  it("exposes focus method via ref", () => {
    const ref = createRef<ChatInputHandle>();
    const onSend = vi.fn();
    const onStop = vi.fn();

    renderWithProviders(<ChatInput ref={ref} onSend={onSend} onStop={onStop} />);

    expect(ref.current).toBeDefined();
    expect(ref.current?.focus).toBeInstanceOf(Function);

    // Call focus to verify it works
    ref.current?.focus();

    const textarea = screen.getByRole("textbox");
    expect(textarea).toHaveFocus();
  });

  it("exposes sendMessage method via ref", () => {
    const ref = createRef<ChatInputHandle>();
    const onSend = vi.fn();
    const onStop = vi.fn();

    renderWithProviders(<ChatInput ref={ref} onSend={onSend} onStop={onStop} />);

    expect(ref.current).toBeDefined();
    expect(ref.current?.sendMessage).toBeInstanceOf(Function);
  });

  it("sendMessage calls onSend with trimmed value", async () => {
    const ref = createRef<ChatInputHandle>();
    const onSend = vi.fn();
    const onStop = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<ChatInput ref={ref} onSend={onSend} onStop={onStop} />);

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

    // Use user.type to properly update component state
    await user.type(textarea, "  test message  ");

    ref.current?.sendMessage();

    expect(onSend).toHaveBeenCalledWith("test message");
  });

  it("sendMessage does not call onSend when input is empty", () => {
    const ref = createRef<ChatInputHandle>();
    const onSend = vi.fn();
    const onStop = vi.fn();

    renderWithProviders(<ChatInput ref={ref} onSend={onSend} onStop={onStop} />);

    ref.current?.sendMessage();

    expect(onSend).not.toHaveBeenCalled();
  });

  it("exposes setInputValue method via ref", () => {
    const ref = createRef<ChatInputHandle>();
    const onSend = vi.fn();
    const onStop = vi.fn();

    renderWithProviders(<ChatInput ref={ref} onSend={onSend} onStop={onStop} />);

    expect(ref.current).toBeDefined();
    expect(ref.current?.setInputValue).toBeInstanceOf(Function);

    // Set input value
    ref.current?.setInputValue("SELECT * FROM users");

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea.value).toBe("SELECT * FROM users");
  });
});
