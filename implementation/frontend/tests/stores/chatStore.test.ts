// Tests for chatStore Zustand store
// Covers: FE-S-01 (conversation switch resets state), FE-S-02 (streaming state reset)
// Also covers: message streaming (append tokens, complete streaming), loading phases, daily limit

import { describe, it, expect, beforeEach } from "vitest";
import { useChatStore } from "@/stores/chatStore";

describe("chatStore", () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  describe("initial state", () => {
    it("has null activeConversationId", () => {
      expect(useChatStore.getState().activeConversationId).toBeNull();
    });

    it("has empty messages array", () => {
      expect(useChatStore.getState().messages).toEqual([]);
    });

    it("has empty streamingTokens", () => {
      expect(useChatStore.getState().streamingTokens).toBe("");
    });

    it("is not streaming", () => {
      expect(useChatStore.getState().isStreaming).toBe(false);
    });

    it("has null streamingMessageId", () => {
      expect(useChatStore.getState().streamingMessageId).toBeNull();
    });

    it("has idle loadingPhase", () => {
      expect(useChatStore.getState().loadingPhase).toBe("idle");
    });

    it("has dailyLimitReached as false", () => {
      expect(useChatStore.getState().dailyLimitReached).toBe(false);
    });
  });

  describe("setActiveConversation", () => {
    it("sets the active conversation id", () => {
      useChatStore.getState().setActiveConversation("conv-1");
      expect(useChatStore.getState().activeConversationId).toBe("conv-1");
    });

    it("resets messages when switching conversations (FE-S-01)", () => {
      useChatStore.getState().addMessage({
        id: "msg-1",
        role: "user",
        content: "Hello",
        sql_query: null,
        created_at: new Date().toISOString(),
      });
      expect(useChatStore.getState().messages).toHaveLength(1);

      useChatStore.getState().setActiveConversation("conv-2");
      expect(useChatStore.getState().messages).toEqual([]);
    });

    it("resets streaming state when switching conversations (FE-S-02)", () => {
      useChatStore.getState().setStreaming(true, "msg-1");
      useChatStore.getState().appendStreamToken("Hello ");
      useChatStore.getState().appendStreamToken("world");

      expect(useChatStore.getState().isStreaming).toBe(true);
      expect(useChatStore.getState().streamingTokens).toBe("Hello world");
      expect(useChatStore.getState().streamingMessageId).toBe("msg-1");

      useChatStore.getState().setActiveConversation("conv-2");
      expect(useChatStore.getState().isStreaming).toBe(false);
      expect(useChatStore.getState().streamingTokens).toBe("");
      expect(useChatStore.getState().streamingMessageId).toBeNull();
    });

    it("resets loadingPhase when switching conversations", () => {
      useChatStore.getState().setLoadingPhase("thinking");
      useChatStore.getState().setActiveConversation("conv-2");
      expect(useChatStore.getState().loadingPhase).toBe("idle");
    });

    it("can set conversation to null", () => {
      useChatStore.getState().setActiveConversation("conv-1");
      useChatStore.getState().setActiveConversation(null);
      expect(useChatStore.getState().activeConversationId).toBeNull();
    });
  });

  describe("addMessage", () => {
    it("adds a message to the array", () => {
      useChatStore.getState().addMessage({
        id: "msg-1",
        role: "user",
        content: "Hello",
        sql_query: null,
        created_at: "2026-02-05T00:00:00Z",
      });

      const messages = useChatStore.getState().messages;
      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBe("msg-1");
      expect(messages[0].role).toBe("user");
      expect(messages[0].content).toBe("Hello");
    });

    it("appends multiple messages in order", () => {
      useChatStore.getState().addMessage({
        id: "msg-1",
        role: "user",
        content: "Question",
        sql_query: null,
        created_at: "2026-02-05T00:00:00Z",
      });
      useChatStore.getState().addMessage({
        id: "msg-2",
        role: "assistant",
        content: "Answer",
        sql_query: "SELECT * FROM data",
        created_at: "2026-02-05T00:00:01Z",
      });

      const messages = useChatStore.getState().messages;
      expect(messages).toHaveLength(2);
      expect(messages[0].id).toBe("msg-1");
      expect(messages[1].id).toBe("msg-2");
      expect(messages[1].sql_query).toBe("SELECT * FROM data");
    });
  });

  describe("message streaming (FE-S-01)", () => {
    it("appendStreamToken accumulates tokens", () => {
      useChatStore.getState().setStreaming(true, "msg-1");
      useChatStore.getState().appendStreamToken("Hello");
      expect(useChatStore.getState().streamingTokens).toBe("Hello");

      useChatStore.getState().appendStreamToken(" world");
      expect(useChatStore.getState().streamingTokens).toBe("Hello world");

      useChatStore.getState().appendStreamToken("!");
      expect(useChatStore.getState().streamingTokens).toBe("Hello world!");
    });

    it("setStreaming(true) starts streaming with messageId", () => {
      useChatStore.getState().setStreaming(true, "msg-42");
      expect(useChatStore.getState().isStreaming).toBe(true);
      expect(useChatStore.getState().streamingMessageId).toBe("msg-42");
    });

    it("setStreaming(false) stops streaming and clears streamingTokens", () => {
      useChatStore.getState().setStreaming(true, "msg-1");
      useChatStore.getState().appendStreamToken("partial content");
      useChatStore.getState().setStreaming(false);

      expect(useChatStore.getState().isStreaming).toBe(false);
      expect(useChatStore.getState().streamingMessageId).toBeNull();
      expect(useChatStore.getState().streamingTokens).toBe("");
    });

    it("full streaming lifecycle: start, accumulate, complete", () => {
      // Start streaming
      useChatStore.getState().setStreaming(true, "msg-1");
      expect(useChatStore.getState().isStreaming).toBe(true);

      // Accumulate tokens
      useChatStore.getState().appendStreamToken("The ");
      useChatStore.getState().appendStreamToken("answer ");
      useChatStore.getState().appendStreamToken("is 42.");
      expect(useChatStore.getState().streamingTokens).toBe("The answer is 42.");

      // Complete streaming - add the final message
      useChatStore.getState().addMessage({
        id: "msg-1",
        role: "assistant",
        content: "The answer is 42.",
        sql_query: null,
        created_at: "2026-02-05T00:00:00Z",
      });
      useChatStore.getState().setStreaming(false);

      // Verify final state
      expect(useChatStore.getState().isStreaming).toBe(false);
      expect(useChatStore.getState().streamingTokens).toBe("");
      expect(useChatStore.getState().messages).toHaveLength(1);
      expect(useChatStore.getState().messages[0].content).toBe("The answer is 42.");
    });
  });

  describe("setLoadingPhase", () => {
    it("sets loadingPhase to thinking", () => {
      useChatStore.getState().setLoadingPhase("thinking");
      expect(useChatStore.getState().loadingPhase).toBe("thinking");
    });

    it("sets loadingPhase to executing", () => {
      useChatStore.getState().setLoadingPhase("executing");
      expect(useChatStore.getState().loadingPhase).toBe("executing");
    });

    it("sets loadingPhase to formatting", () => {
      useChatStore.getState().setLoadingPhase("formatting");
      expect(useChatStore.getState().loadingPhase).toBe("formatting");
    });

    it("sets loadingPhase to idle", () => {
      useChatStore.getState().setLoadingPhase("thinking");
      useChatStore.getState().setLoadingPhase("idle");
      expect(useChatStore.getState().loadingPhase).toBe("idle");
    });

    it("sets loadingPhase to null", () => {
      useChatStore.getState().setLoadingPhase(null);
      expect(useChatStore.getState().loadingPhase).toBeNull();
    });
  });

  describe("setDailyLimitReached", () => {
    it("sets daily limit flag to true", () => {
      useChatStore.getState().setDailyLimitReached(true);
      expect(useChatStore.getState().dailyLimitReached).toBe(true);
    });

    it("sets daily limit flag to false", () => {
      useChatStore.getState().setDailyLimitReached(true);
      useChatStore.getState().setDailyLimitReached(false);
      expect(useChatStore.getState().dailyLimitReached).toBe(false);
    });
  });

  describe("reset", () => {
    it("resets all state to defaults", () => {
      // Set up some state
      useChatStore.getState().setActiveConversation("conv-1");
      useChatStore.getState().addMessage({
        id: "msg-1",
        role: "user",
        content: "Hello",
        sql_query: null,
        created_at: "2026-02-05T00:00:00Z",
      });
      useChatStore.getState().setStreaming(true, "msg-2");
      useChatStore.getState().appendStreamToken("partial");
      useChatStore.getState().setLoadingPhase("thinking");
      useChatStore.getState().setDailyLimitReached(true);

      // Reset
      useChatStore.getState().reset();

      // Verify all defaults
      const state = useChatStore.getState();
      expect(state.activeConversationId).toBeNull();
      expect(state.messages).toEqual([]);
      expect(state.streamingTokens).toBe("");
      expect(state.isStreaming).toBe(false);
      expect(state.streamingMessageId).toBeNull();
      expect(state.loadingPhase).toBe("idle");
      expect(state.dailyLimitReached).toBe(false);
    });
  });
});
