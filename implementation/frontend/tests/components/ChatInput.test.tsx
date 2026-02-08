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

  it("shows character counter with gray color when approaching limit (1800-1899)", () => {
    const ref = createRef<ChatInputHandle>();
    const onSend = vi.fn();
    const onStop = vi.fn();

    renderWithProviders(<ChatInput ref={ref} onSend={onSend} onStop={onStop} />);

    // Set input to 1850 characters (above threshold, below warning)
    const text = "a".repeat(1850);
    ref.current?.setInputValue(text);

    const counter = screen.getByTestId("char-counter");
    expect(counter).toBeInTheDocument();
    expect(counter.className).toContain("text-gray-500");
    expect(counter.textContent).toContain("1,850");
  });

  it("shows character counter with orange color in warning zone (1900-1949)", () => {
    const ref = createRef<ChatInputHandle>();
    const onSend = vi.fn();
    const onStop = vi.fn();

    renderWithProviders(<ChatInput ref={ref} onSend={onSend} onStop={onStop} />);

    // Set input to 1920 characters (warning zone)
    const text = "a".repeat(1920);
    ref.current?.setInputValue(text);

    const counter = screen.getByTestId("char-counter");
    expect(counter).toBeInTheDocument();
    expect(counter.className).toContain("text-orange-500");
    expect(counter.textContent).toContain("1,920");
  });

  it("shows character counter with red color when very close to limit (1950-2000)", () => {
    const ref = createRef<ChatInputHandle>();
    const onSend = vi.fn();
    const onStop = vi.fn();

    renderWithProviders(<ChatInput ref={ref} onSend={onSend} onStop={onStop} />);

    // Set input to 1980 characters (danger zone)
    const text = "a".repeat(1980);
    ref.current?.setInputValue(text);

    const counter = screen.getByTestId("char-counter");
    expect(counter).toBeInTheDocument();
    expect(counter.className).toContain("text-red-500");
    expect(counter.textContent).toContain("1,980");
  });

  it("character counter has smooth color transition animation", () => {
    const ref = createRef<ChatInputHandle>();
    const onSend = vi.fn();
    const onStop = vi.fn();

    renderWithProviders(<ChatInput ref={ref} onSend={onSend} onStop={onStop} />);

    // Set input above threshold to make counter visible
    const text = "a".repeat(1850);
    ref.current?.setInputValue(text);

    const counter = screen.getByTestId("char-counter");
    expect(counter.className).toContain("transition-colors");
    expect(counter.className).toContain("duration-300");
  });
});
