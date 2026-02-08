import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useKeyboardShortcuts, type ChatInputHandle } from "@/hooks/useKeyboardShortcuts";
import { useUiStore } from "@/stores/uiStore";
import { createRef } from "react";

describe("useKeyboardShortcuts", () => {
  let mockChatInputRef: React.RefObject<ChatInputHandle>;
  let mockFocus: ReturnType<typeof vi.fn>;
  let mockSendMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFocus = vi.fn();
    mockSendMessage = vi.fn();
    mockChatInputRef = createRef<ChatInputHandle>();
    // Mock the ref's current value
    (mockChatInputRef as { current: ChatInputHandle }).current = {
      focus: mockFocus,
      sendMessage: mockSendMessage,
    };
    // Reset UI store state
    useUiStore.setState({ leftPanelOpen: true });
  });

  it("focuses chat input when / is pressed (not in an input)", () => {
    renderHook(() => useKeyboardShortcuts({ chatInputRef: mockChatInputRef }));

    const event = new KeyboardEvent("keydown", { key: "/" });
    document.dispatchEvent(event);

    expect(mockFocus).toHaveBeenCalledOnce();
  });

  it("does not focus chat input when / is pressed while in an input", () => {
    renderHook(() => useKeyboardShortcuts({ chatInputRef: mockChatInputRef }));

    // Create a fake textarea and dispatch from it
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    textarea.focus();

    const event = new KeyboardEvent("keydown", { key: "/", bubbles: true });
    Object.defineProperty(event, "target", { value: textarea, enumerable: true });
    document.dispatchEvent(event);

    expect(mockFocus).not.toHaveBeenCalled();
    document.body.removeChild(textarea);
  });

  it("toggles left panel when Ctrl+B is pressed", () => {
    renderHook(() => useKeyboardShortcuts({ chatInputRef: mockChatInputRef }));

    const initialState = useUiStore.getState().leftPanelOpen;

    const event = new KeyboardEvent("keydown", { key: "b", ctrlKey: true });
    document.dispatchEvent(event);

    expect(useUiStore.getState().leftPanelOpen).toBe(!initialState);
  });

  it("toggles left panel when Cmd+B is pressed (Mac)", () => {
    renderHook(() => useKeyboardShortcuts({ chatInputRef: mockChatInputRef }));

    const initialState = useUiStore.getState().leftPanelOpen;

    const event = new KeyboardEvent("keydown", { key: "b", metaKey: true });
    document.dispatchEvent(event);

    expect(useUiStore.getState().leftPanelOpen).toBe(!initialState);
  });

  it("sends message when Ctrl+Enter is pressed in chat input", () => {
    renderHook(() => useKeyboardShortcuts({ chatInputRef: mockChatInputRef }));

    // Create a fake textarea with correct aria-label
    const textarea = document.createElement("textarea");
    textarea.setAttribute("aria-label", "Message input");
    document.body.appendChild(textarea);
    textarea.focus();

    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      ctrlKey: true,
      bubbles: true,
    });
    Object.defineProperty(event, "target", { value: textarea, enumerable: true });
    document.dispatchEvent(event);

    expect(mockSendMessage).toHaveBeenCalledOnce();
    document.body.removeChild(textarea);
  });

  it("does not send message when Ctrl+Enter is pressed in other inputs", () => {
    renderHook(() => useKeyboardShortcuts({ chatInputRef: mockChatInputRef }));

    // Create a fake input without correct aria-label
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      ctrlKey: true,
      bubbles: true,
    });
    Object.defineProperty(event, "target", { value: input, enumerable: true });
    document.dispatchEvent(event);

    expect(mockSendMessage).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it("does nothing when ref is not provided", () => {
    renderHook(() => useKeyboardShortcuts({}));

    const event = new KeyboardEvent("keydown", { key: "/" });
    document.dispatchEvent(event);

    // Should not throw, just do nothing
    expect(mockFocus).not.toHaveBeenCalled();
  });
});
