import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useKeyboardShortcuts, type ChatInputHandle } from "@/hooks/useKeyboardShortcuts";
import { useUiStore } from "@/stores/uiStore";
import { createRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

// Mock matchMedia for theme controller support
const originalMatchMedia = window.matchMedia;

function installMatchMediaMock() {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn((_query: string) => ({
      matches: false,
      media: _query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("useKeyboardShortcuts", () => {
  let mockChatInputRef: React.RefObject<ChatInputHandle>;
  let mockFocus: ReturnType<typeof vi.fn>;
  let mockSendMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    installMatchMediaMock();
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
    // Clear theme localStorage
    localStorage.removeItem("theme");
  });

  afterEach(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: originalMatchMedia,
    });
    document.documentElement.classList.remove("dark", "theme-transitioning");
  });

  it("focuses chat input when / is pressed (not in an input)", () => {
    renderHook(() => useKeyboardShortcuts({ chatInputRef: mockChatInputRef }), { wrapper });

    const event = new KeyboardEvent("keydown", { key: "/" });
    document.dispatchEvent(event);

    expect(mockFocus).toHaveBeenCalledOnce();
  });

  it("does not focus chat input when / is pressed while in an input", () => {
    renderHook(() => useKeyboardShortcuts({ chatInputRef: mockChatInputRef }), { wrapper });

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

  it("focuses chat input when Ctrl+K is pressed", () => {
    renderHook(() => useKeyboardShortcuts({ chatInputRef: mockChatInputRef }), { wrapper });

    const event = new KeyboardEvent("keydown", { key: "k", ctrlKey: true });
    document.dispatchEvent(event);

    expect(mockFocus).toHaveBeenCalledOnce();
  });

  it("focuses chat input when Cmd+K is pressed (Mac)", () => {
    renderHook(() => useKeyboardShortcuts({ chatInputRef: mockChatInputRef }), { wrapper });

    const event = new KeyboardEvent("keydown", { key: "k", metaKey: true });
    document.dispatchEvent(event);

    expect(mockFocus).toHaveBeenCalledOnce();
  });

  it("focuses chat input with Ctrl+K even when already in an input", () => {
    renderHook(() => useKeyboardShortcuts({ chatInputRef: mockChatInputRef }), { wrapper });

    // Create a fake input and dispatch from it
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    const event = new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true });
    Object.defineProperty(event, "target", { value: input, enumerable: true });
    document.dispatchEvent(event);

    expect(mockFocus).toHaveBeenCalledOnce();
    document.body.removeChild(input);
  });

  it("toggles left panel when Ctrl+B is pressed", () => {
    renderHook(() => useKeyboardShortcuts({ chatInputRef: mockChatInputRef }), { wrapper });

    const initialState = useUiStore.getState().leftPanelOpen;

    const event = new KeyboardEvent("keydown", { key: "b", ctrlKey: true });
    document.dispatchEvent(event);

    expect(useUiStore.getState().leftPanelOpen).toBe(!initialState);
  });

  it("toggles left panel when Cmd+B is pressed (Mac)", () => {
    renderHook(() => useKeyboardShortcuts({ chatInputRef: mockChatInputRef }), { wrapper });

    const initialState = useUiStore.getState().leftPanelOpen;

    const event = new KeyboardEvent("keydown", { key: "b", metaKey: true });
    document.dispatchEvent(event);

    expect(useUiStore.getState().leftPanelOpen).toBe(!initialState);
  });

  it("sends message when Ctrl+Enter is pressed in chat input", () => {
    renderHook(() => useKeyboardShortcuts({ chatInputRef: mockChatInputRef }), { wrapper });

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
    renderHook(() => useKeyboardShortcuts({ chatInputRef: mockChatInputRef }), { wrapper });

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
    renderHook(() => useKeyboardShortcuts({}), { wrapper });

    const event = new KeyboardEvent("keydown", { key: "/" });
    document.dispatchEvent(event);

    // Should not throw, just do nothing
    expect(mockFocus).not.toHaveBeenCalled();
  });

  it("toggles theme when Ctrl+Shift+L is pressed", () => {
    // Start with "system" (default)
    localStorage.removeItem("theme");
    renderHook(() => useKeyboardShortcuts({ chatInputRef: mockChatInputRef }), { wrapper });

    const event = new KeyboardEvent("keydown", { key: "L", ctrlKey: true, shiftKey: true });
    document.dispatchEvent(event);

    // system -> light (next in cycle: light -> dark -> system)
    // Actually system is index 2, next is index 0 = light
    expect(localStorage.getItem("theme")).toBe("light");
  });

  it("toggles theme when Cmd+Shift+L is pressed (Mac)", () => {
    localStorage.removeItem("theme");
    renderHook(() => useKeyboardShortcuts({ chatInputRef: mockChatInputRef }), { wrapper });

    const event = new KeyboardEvent("keydown", { key: "L", metaKey: true, shiftKey: true });
    document.dispatchEvent(event);

    expect(localStorage.getItem("theme")).toBe("light");
  });

  it("cycles theme through light -> dark -> system on repeated Ctrl+Shift+L", () => {
    localStorage.removeItem("theme");
    renderHook(() => useKeyboardShortcuts({ chatInputRef: mockChatInputRef }), { wrapper });

    // system -> light
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "L", ctrlKey: true, shiftKey: true }));
    expect(localStorage.getItem("theme")).toBe("light");

    // light -> dark
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "L", ctrlKey: true, shiftKey: true }));
    expect(localStorage.getItem("theme")).toBe("dark");

    // dark -> system
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "L", ctrlKey: true, shiftKey: true }));
    expect(localStorage.getItem("theme")).toBe("system");
  });
});
