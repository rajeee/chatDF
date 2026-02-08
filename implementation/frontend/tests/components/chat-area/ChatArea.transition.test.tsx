// Tests: Animated transition between OnboardingGuide exit and first message entrance
//
// TRANS-1: When onboarding is visible and a message is added, the exit animation class is applied
// TRANS-2: The MessageList appears after the exit with first-message-entrance class
// TRANS-3: The onboarding-exit class uses fade+slide up+scale animation

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderWithProviders, screen, act, waitFor } from "../../helpers/render";
import { resetAllStores } from "../../helpers/stores";
import { useChatStore } from "@/stores/chatStore";
import { ChatArea } from "@/components/chat-area/ChatArea";

beforeEach(() => {
  resetAllStores();
  useChatStore.setState({ activeConversationId: "conv-1" });
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ id: "conv-1" }), { status: 200 })
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TRANS-1: Onboarding exit animation class is applied when first message is sent", () => {
  it("applies onboarding-exit class when a message appears while OnboardingGuide is visible", () => {
    renderWithProviders(<ChatArea />);

    // OnboardingGuide should be visible initially (no datasets, no messages)
    expect(screen.getByTestId("onboarding-guide")).toBeInTheDocument();

    // Simulate sending the first message
    act(() => {
      useChatStore.getState().addMessage({
        id: "msg-1",
        role: "user",
        content: "Hello world",
        sql_query: null,
        sql_executions: [],
        reasoning: null,
        created_at: new Date().toISOString(),
      });
    });

    // OnboardingGuide should still be in DOM (exit animation running)
    const guide = screen.getByTestId("onboarding-guide");
    expect(guide).toBeInTheDocument();

    // The wrapper div should have the exit animation class
    const wrapper = guide.parentElement;
    expect(wrapper).toHaveClass("onboarding-exit");
  });

  it("removes onboarding from DOM after exit animation completes", async () => {
    renderWithProviders(<ChatArea />);

    expect(screen.getByTestId("onboarding-guide")).toBeInTheDocument();

    act(() => {
      useChatStore.getState().addMessage({
        id: "msg-1",
        role: "user",
        content: "Hello",
        sql_query: null,
        sql_executions: [],
        reasoning: null,
        created_at: new Date().toISOString(),
      });
    });

    // Wait for the 300ms exit animation timeout to clear the exiting panel
    await waitFor(
      () => {
        expect(screen.queryByTestId("onboarding-guide")).not.toBeInTheDocument();
      },
      { timeout: 1000 }
    );
  });
});

describe("TRANS-2: MessageList appears with first-message-entrance class after onboarding exit", () => {
  it("applies first-message-entrance class to the message list during onboarding exit", () => {
    renderWithProviders(<ChatArea />);

    // OnboardingGuide visible
    expect(screen.getByTestId("onboarding-guide")).toBeInTheDocument();

    // Send first message
    act(() => {
      useChatStore.getState().addMessage({
        id: "msg-1",
        role: "user",
        content: "First message!",
        sql_query: null,
        sql_executions: [],
        reasoning: null,
        created_at: new Date().toISOString(),
      });
    });

    // MessageList should now be in DOM
    const messageList = screen.getByTestId("message-list-scroll");
    expect(messageList).toBeInTheDocument();

    // It should have the first-message-entrance class for a dramatic entrance
    expect(messageList).toHaveClass("first-message-entrance");
  });

  it("does not apply first-message-entrance class for subsequent messages", async () => {
    renderWithProviders(<ChatArea />);

    // Send first message to trigger exit
    act(() => {
      useChatStore.getState().addMessage({
        id: "msg-1",
        role: "user",
        content: "First",
        sql_query: null,
        sql_executions: [],
        reasoning: null,
        created_at: new Date().toISOString(),
      });
    });

    // Wait for exit animation to complete (exitingPanel goes to null)
    await waitFor(
      () => {
        expect(screen.queryByTestId("onboarding-guide")).not.toBeInTheDocument();
      },
      { timeout: 1000 }
    );

    // After exit completes, first-message-entrance class should be removed
    const messageList = screen.getByTestId("message-list-scroll");
    expect(messageList).not.toHaveClass("first-message-entrance");
  });
});

describe("TRANS-3: Exit animation uses correct visual properties", () => {
  it("onboarding-exit wrapper has pointer-events disabled during animation", () => {
    renderWithProviders(<ChatArea />);

    expect(screen.getByTestId("onboarding-guide")).toBeInTheDocument();

    act(() => {
      useChatStore.getState().addMessage({
        id: "msg-1",
        role: "user",
        content: "Test",
        sql_query: null,
        sql_executions: [],
        reasoning: null,
        created_at: new Date().toISOString(),
      });
    });

    // The exit wrapper should have the class that disables pointer events
    const wrapper = screen.getByTestId("onboarding-guide").parentElement;
    expect(wrapper).toHaveClass("onboarding-exit");
  });
});
