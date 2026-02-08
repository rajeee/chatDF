// Tests: spec/frontend/chat_area/chat_input/spec.md
// Verifies: spec/frontend/chat_area/chat_input/plan.md
//
// CI-SEND-1: Enter key sends message (onSend called with text, textarea cleared)
// CI-SEND-2: Empty text not sent (onSend not called)
// CI-SEND-3: Shift+Enter adds newline instead of sending
// CI-CHAR-1: Character limit enforced at 2000
// CI-CHAR-2: Counter shown at 1800+ chars
// CI-STOP-1: Stop button shown during streaming, calls onStop
// CI-DISABLE-1: Input disabled when rate limit reached

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderWithProviders, screen, userEvent } from "../../helpers/render";
import { resetAllStores } from "../../helpers/stores";
import { useChatStore } from "@/stores/chatStore";
import { ChatInput } from "@/components/chat-area/ChatInput";

beforeEach(() => {
  resetAllStores();
});

describe("CI-SEND-1: Enter key sends message", () => {
  it("calls onSend with trimmed text when Enter is pressed", async () => {
    const onSend = vi.fn();
    const onStop = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<ChatInput onSend={onSend} onStop={onStop} />);

    const textarea = screen.getByRole("textbox", { name: /message input/i });
    await user.type(textarea, "Hello world");
    await user.keyboard("{Enter}");

    expect(onSend).toHaveBeenCalledOnce();
    expect(onSend).toHaveBeenCalledWith("Hello world");
  });

  it("clears textarea after successful send", async () => {
    const onSend = vi.fn();
    const onStop = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<ChatInput onSend={onSend} onStop={onStop} />);

    const textarea = screen.getByRole("textbox", { name: /message input/i });
    await user.type(textarea, "Hello world");
    await user.keyboard("{Enter}");

    expect(textarea).toHaveValue("");
  });

  it("sends message when clicking the send button", async () => {
    const onSend = vi.fn();
    const onStop = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<ChatInput onSend={onSend} onStop={onStop} />);

    const textarea = screen.getByRole("textbox", { name: /message input/i });
    await user.type(textarea, "Click send test");

    const sendButton = screen.getByRole("button", { name: /send message/i });
    await user.click(sendButton);

    expect(onSend).toHaveBeenCalledWith("Click send test");
    expect(textarea).toHaveValue("");
  });

  it("trims leading and trailing whitespace before sending", async () => {
    const onSend = vi.fn();
    const onStop = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<ChatInput onSend={onSend} onStop={onStop} />);

    const textarea = screen.getByRole("textbox", { name: /message input/i });
    await user.type(textarea, "  hello  ");
    await user.keyboard("{Enter}");

    expect(onSend).toHaveBeenCalledWith("hello");
  });
});

describe("CI-SEND-2: Empty text not sent", () => {
  it("does not call onSend when textarea is empty and Enter is pressed", async () => {
    const onSend = vi.fn();
    const onStop = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<ChatInput onSend={onSend} onStop={onStop} />);

    const textarea = screen.getByRole("textbox", { name: /message input/i });
    await user.click(textarea);
    await user.keyboard("{Enter}");

    expect(onSend).not.toHaveBeenCalled();
  });

  it("does not call onSend when textarea contains only whitespace", async () => {
    const onSend = vi.fn();
    const onStop = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<ChatInput onSend={onSend} onStop={onStop} />);

    const textarea = screen.getByRole("textbox", { name: /message input/i });
    await user.type(textarea, "   ");
    await user.keyboard("{Enter}");

    expect(onSend).not.toHaveBeenCalled();
  });

  it("disables send button when textarea is empty", () => {
    const onSend = vi.fn();
    const onStop = vi.fn();

    renderWithProviders(<ChatInput onSend={onSend} onStop={onStop} />);

    const sendButton = screen.getByRole("button", { name: /send message/i });
    expect(sendButton).toBeDisabled();
  });
});

describe("CI-SEND-3: Shift+Enter adds newline", () => {
  it("inserts a newline instead of sending when Shift+Enter is pressed", async () => {
    const onSend = vi.fn();
    const onStop = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<ChatInput onSend={onSend} onStop={onStop} />);

    const textarea = screen.getByRole("textbox", { name: /message input/i });
    await user.type(textarea, "line one");
    await user.keyboard("{Shift>}{Enter}{/Shift}");

    expect(onSend).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("line one\n");
  });
});

describe("CI-CHAR-1: Character limit enforced at 2000", () => {
  it("truncates input to 2000 characters when more text is entered via change", async () => {
    const onSend = vi.fn();
    const onStop = vi.fn();
    const { fireEvent } = await import("@testing-library/react");

    renderWithProviders(<ChatInput onSend={onSend} onStop={onStop} />);

    const textarea = screen.getByRole("textbox", { name: /message input/i });

    // Simulate entering 2050 characters via onChange -- component should truncate to 2000
    fireEvent.change(textarea, { target: { value: "a".repeat(2050) } });

    expect(textarea.value.length).toBe(2000);
  });

  it("allows exactly 2000 characters", async () => {
    const onSend = vi.fn();
    const onStop = vi.fn();
    const { fireEvent } = await import("@testing-library/react");

    renderWithProviders(<ChatInput onSend={onSend} onStop={onStop} />);

    const textarea = screen.getByRole("textbox", { name: /message input/i });

    fireEvent.change(textarea, { target: { value: "b".repeat(2000) } });

    expect(textarea.value.length).toBe(2000);
  });

  it("does not grow beyond 2000 when typing one more character after limit", async () => {
    const onSend = vi.fn();
    const onStop = vi.fn();
    const user = userEvent.setup();
    const { fireEvent } = await import("@testing-library/react");

    renderWithProviders(<ChatInput onSend={onSend} onStop={onStop} />);

    const textarea = screen.getByRole("textbox", { name: /message input/i });

    // Set to exactly 2000 chars
    fireEvent.change(textarea, { target: { value: "c".repeat(2000) } });
    expect(textarea.value.length).toBe(2000);

    // Attempt to type one more character
    await user.type(textarea, "x");
    expect(textarea.value.length).toBeLessThanOrEqual(2000);
  });
});

describe("CI-CHAR-2: Counter shown at 1800+ chars", () => {
  it("does not show character counter below 1800 characters", async () => {
    const onSend = vi.fn();
    const onStop = vi.fn();

    renderWithProviders(<ChatInput onSend={onSend} onStop={onStop} />);

    // Counter should not be visible initially
    expect(screen.queryByTestId("char-counter")).not.toBeInTheDocument();
  });

  it("shows character counter when text exceeds 1800 characters", async () => {
    const onSend = vi.fn();
    const onStop = vi.fn();
    const { fireEvent } = await import("@testing-library/react");

    renderWithProviders(<ChatInput onSend={onSend} onStop={onStop} />);

    const textarea = screen.getByRole("textbox", { name: /message input/i });
    const text1850 = "a".repeat(1850);
    fireEvent.change(textarea, { target: { value: text1850 } });

    const counter = screen.getByTestId("char-counter");
    expect(counter).toBeInTheDocument();
    expect(counter).toHaveTextContent("1,850 / 2,000");
  });

  it("shows counter with warning style at 2000 characters", async () => {
    const onSend = vi.fn();
    const onStop = vi.fn();
    const { fireEvent } = await import("@testing-library/react");

    renderWithProviders(<ChatInput onSend={onSend} onStop={onStop} />);

    const textarea = screen.getByRole("textbox", { name: /message input/i });
    const text2000 = "a".repeat(2000);
    fireEvent.change(textarea, { target: { value: text2000 } });

    const counter = screen.getByTestId("char-counter");
    expect(counter).toHaveTextContent("2,000 / 2,000");
    expect(counter).toHaveClass("text-red-500");
  });
});

describe("CI-STOP-1: Stop button during streaming", () => {
  it("shows stop button instead of send button when streaming", () => {
    const onSend = vi.fn();
    const onStop = vi.fn();

    useChatStore.setState({ isStreaming: true });
    renderWithProviders(<ChatInput onSend={onSend} onStop={onStop} />);

    expect(
      screen.queryByRole("button", { name: /send message/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /stop generating/i })
    ).toBeInTheDocument();
  });

  it("calls onStop when stop button is clicked", async () => {
    const onSend = vi.fn();
    const onStop = vi.fn();
    const user = userEvent.setup();

    useChatStore.setState({ isStreaming: true });
    renderWithProviders(<ChatInput onSend={onSend} onStop={onStop} />);

    const stopButton = screen.getByRole("button", { name: /stop generating/i });
    await user.click(stopButton);

    expect(onStop).toHaveBeenCalledOnce();
  });

  it("shows send button when not streaming", () => {
    const onSend = vi.fn();
    const onStop = vi.fn();

    useChatStore.setState({ isStreaming: false });
    renderWithProviders(<ChatInput onSend={onSend} onStop={onStop} />);

    expect(
      screen.getByRole("button", { name: /send message/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /stop generating/i })
    ).not.toBeInTheDocument();
  });
});

describe("CI-DISABLE-1: Input disabled when rate limit reached", () => {
  it("disables textarea when daily limit is reached", () => {
    const onSend = vi.fn();
    const onStop = vi.fn();

    useChatStore.setState({ dailyLimitReached: true });
    renderWithProviders(<ChatInput onSend={onSend} onStop={onStop} />);

    const textarea = screen.getByRole("textbox", { name: /message input/i });
    expect(textarea).toBeDisabled();
  });

  it("shows 'Daily limit reached' placeholder when limit reached", () => {
    const onSend = vi.fn();
    const onStop = vi.fn();

    useChatStore.setState({ dailyLimitReached: true });
    renderWithProviders(<ChatInput onSend={onSend} onStop={onStop} />);

    const textarea = screen.getByRole("textbox", { name: /message input/i });
    expect(textarea).toHaveAttribute("placeholder", "Daily limit reached");
  });

  it("disables send button when daily limit is reached", () => {
    const onSend = vi.fn();
    const onStop = vi.fn();

    useChatStore.setState({ dailyLimitReached: true });
    renderWithProviders(<ChatInput onSend={onSend} onStop={onStop} />);

    // When daily limit reached and not streaming, send button should be present but disabled
    const sendButton = screen.getByRole("button", { name: /send message/i });
    expect(sendButton).toBeDisabled();
  });
});

describe("ChatInput accessibility and focus", () => {
  it("auto-focuses the textarea on mount", () => {
    const onSend = vi.fn();
    const onStop = vi.fn();

    renderWithProviders(<ChatInput onSend={onSend} onStop={onStop} />);

    const textarea = screen.getByRole("textbox", { name: /message input/i });
    expect(textarea).toHaveFocus();
  });

  it("has correct default placeholder text", () => {
    const onSend = vi.fn();
    const onStop = vi.fn();

    renderWithProviders(<ChatInput onSend={onSend} onStop={onStop} />);

    const textarea = screen.getByRole("textbox", { name: /message input/i });
    expect(textarea).toHaveAttribute(
      "placeholder",
      "Ask a question about your data... (⏎ to send • ⇧⏎ for new line)"
    );
  });
});

describe("ChatInput focus-visible (global CSS)", () => {
  it("textarea relies on global focus-visible styles, not inline overrides", () => {
    const onSend = vi.fn();
    const onStop = vi.fn();

    renderWithProviders(<ChatInput onSend={onSend} onStop={onStop} />);

    const textarea = screen.getByRole("textbox", { name: /message input/i });
    // focus:outline-none and focus:ring-* are handled globally via CSS focus-visible
    expect(textarea.className).not.toContain("focus:outline-none");
    expect(textarea.className).not.toContain("focus:ring-");
  });

  it("send button relies on global focus-visible styles", () => {
    const onSend = vi.fn();
    const onStop = vi.fn();

    renderWithProviders(<ChatInput onSend={onSend} onStop={onStop} />);

    const sendButton = screen.getByRole("button", { name: /send message/i });
    expect(sendButton.className).not.toContain("focus:outline-none");
    expect(sendButton.className).not.toContain("focus:ring-");
  });
});

describe("ChatInput responsive layout", () => {
  it("textarea has responsive padding classes", () => {
    const onSend = vi.fn();
    const onStop = vi.fn();

    renderWithProviders(<ChatInput onSend={onSend} onStop={onStop} />);

    const textarea = screen.getByRole("textbox", { name: /message input/i });
    // Mobile-first: tighter padding on small screens, larger on sm+
    expect(textarea.className).toContain("px-2");
    expect(textarea.className).toContain("py-1.5");
    expect(textarea.className).toContain("sm:px-3");
    expect(textarea.className).toContain("sm:py-2");
  });
});
