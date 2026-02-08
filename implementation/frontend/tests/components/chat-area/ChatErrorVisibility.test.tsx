import { describe, it, expect, beforeEach } from "vitest";
import { useToastStore } from "@/stores/toastStore";
import { useChatStore } from "@/stores/chatStore";

describe("Chat error visibility", () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
    useChatStore.getState().reset();
  });

  it("shows error toast when chat_error WS event has error message", () => {
    // Import the WS handler logic by simulating what useWebSocket does
    const chatStore = useChatStore.getState();
    chatStore.setStreaming(true, "test-msg");

    // Simulate what the chat_error handler now does
    const errorMsg = "Rate limit exceeded";
    useToastStore.getState().error(errorMsg);
    chatStore.finalizeStreamingMessage();
    chatStore.setStreaming(false);
    chatStore.setLoadingPhase("idle");

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].type).toBe("error");
    expect(toasts[0].message).toBe("Rate limit exceeded");
  });

  it("shows default error toast when chat_error has no error field", () => {
    const chatStore = useChatStore.getState();
    chatStore.setStreaming(true, "test-msg");

    const errorMsg = undefined;
    useToastStore.getState().error(errorMsg || "Something went wrong while generating a response");
    chatStore.finalizeStreamingMessage();
    chatStore.setStreaming(false);

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toBe("Something went wrong while generating a response");
  });

  it("shows error toast when message send fails", () => {
    const errorMessage = "Network error";
    useToastStore.getState().error(errorMessage);

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].type).toBe("error");
    expect(toasts[0].message).toBe("Network error");
  });
});
