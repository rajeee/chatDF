import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderWithProviders, screen, act } from "../../helpers/render";
import { fireEvent } from "@testing-library/react";
import { resetAllStores, setChatIdle } from "../../helpers/stores";
import { type Message } from "@/stores/chatStore";
import { MessageList } from "@/components/chat-area/MessageList";

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg-1",
    role: "user",
    content: "Hello world",
    sql_query: null,
    sql_executions: [],
    reasoning: null,
    created_at: "2026-02-05T12:00:00Z",
    ...overrides,
  };
}

describe("MessageList scroll-to-top button", () => {
  beforeEach(() => {
    resetAllStores();
    // Reset scrollY to 0 (near top)
    Object.defineProperty(window, "scrollY", { value: 0, writable: true, configurable: true });
  });

  it("does not show scroll-to-top button when near top", () => {
    setChatIdle("conv-1", [makeMessage()]);
    renderWithProviders(<MessageList />);

    expect(screen.queryByTestId("scroll-to-top-btn")).not.toBeInTheDocument();
  });

  it("shows scroll-to-top button when scrolled past threshold", async () => {
    setChatIdle("conv-1", [makeMessage()]);
    renderWithProviders(<MessageList />);

    await act(async () => {
      Object.defineProperty(window, "scrollY", { value: 200, writable: true, configurable: true });
      fireEvent.scroll(window);
      // Flush rAF-throttled scroll handler
      await new Promise((r) => requestAnimationFrame(r));
    });

    expect(screen.getByTestId("scroll-to-top-btn")).toBeInTheDocument();
  });

  it("clicking scroll-to-top calls window.scrollTo", async () => {
    setChatIdle("conv-1", [makeMessage()]);
    renderWithProviders(<MessageList />);

    const scrollToSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});

    // Scroll down to make the button appear
    await act(async () => {
      Object.defineProperty(window, "scrollY", { value: 200, writable: true, configurable: true });
      fireEvent.scroll(window);
      // Flush rAF-throttled scroll handler
      await new Promise((r) => requestAnimationFrame(r));
    });

    const btn = screen.getByTestId("scroll-to-top-btn");
    fireEvent.click(btn);

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
    scrollToSpy.mockRestore();
  });
});
