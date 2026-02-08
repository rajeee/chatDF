import { describe, it, expect, beforeEach } from "vitest";
import { useChatStore } from "@/stores/chatStore";

describe("chatStore isLoadingMessages", () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it("starts with isLoadingMessages false", () => {
    expect(useChatStore.getState().isLoadingMessages).toBe(false);
  });

  it("sets isLoadingMessages true when switching to a conversation", () => {
    useChatStore.getState().setActiveConversation("conv-1");
    expect(useChatStore.getState().isLoadingMessages).toBe(true);
  });

  it("sets isLoadingMessages false when switching to null", () => {
    useChatStore.getState().setActiveConversation("conv-1");
    useChatStore.getState().setActiveConversation(null);
    expect(useChatStore.getState().isLoadingMessages).toBe(false);
  });

  it("can manually set isLoadingMessages", () => {
    useChatStore.getState().setLoadingMessages(true);
    expect(useChatStore.getState().isLoadingMessages).toBe(true);
    useChatStore.getState().setLoadingMessages(false);
    expect(useChatStore.getState().isLoadingMessages).toBe(false);
  });

  it("resets isLoadingMessages on store reset", () => {
    useChatStore.getState().setLoadingMessages(true);
    useChatStore.getState().reset();
    expect(useChatStore.getState().isLoadingMessages).toBe(false);
  });
});
