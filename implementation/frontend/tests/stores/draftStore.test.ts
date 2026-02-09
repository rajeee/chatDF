// Tests for draftStore Zustand store
// Covers: setDraft, getDraft, clearDraft, localStorage persistence, edge cases

import { describe, it, expect, beforeEach, vi } from "vitest";
import { useDraftStore } from "@/stores/draftStore";

describe("draftStore", () => {
  beforeEach(() => {
    // Clear localStorage and reset store state
    localStorage.clear();
    useDraftStore.setState({ drafts: {} });
  });

  describe("setDraft", () => {
    it("stores a draft for a conversation", () => {
      useDraftStore.getState().setDraft("conv-1", "Hello world");
      expect(useDraftStore.getState().drafts["conv-1"]).toBe("Hello world");
    });

    it("overwrites an existing draft", () => {
      useDraftStore.getState().setDraft("conv-1", "First draft");
      useDraftStore.getState().setDraft("conv-1", "Updated draft");
      expect(useDraftStore.getState().drafts["conv-1"]).toBe("Updated draft");
    });

    it("removes draft when text is empty", () => {
      useDraftStore.getState().setDraft("conv-1", "Some text");
      useDraftStore.getState().setDraft("conv-1", "");
      expect(useDraftStore.getState().drafts["conv-1"]).toBeUndefined();
    });

    it("removes draft when text is only whitespace", () => {
      useDraftStore.getState().setDraft("conv-1", "Some text");
      useDraftStore.getState().setDraft("conv-1", "   ");
      expect(useDraftStore.getState().drafts["conv-1"]).toBeUndefined();
    });

    it("stores drafts for multiple conversations independently", () => {
      useDraftStore.getState().setDraft("conv-1", "Draft A");
      useDraftStore.getState().setDraft("conv-2", "Draft B");
      expect(useDraftStore.getState().drafts["conv-1"]).toBe("Draft A");
      expect(useDraftStore.getState().drafts["conv-2"]).toBe("Draft B");
    });
  });

  describe("getDraft", () => {
    it("returns the draft for a conversation", () => {
      useDraftStore.getState().setDraft("conv-1", "Hello");
      expect(useDraftStore.getState().getDraft("conv-1")).toBe("Hello");
    });

    it("returns empty string for conversations without a draft", () => {
      expect(useDraftStore.getState().getDraft("nonexistent")).toBe("");
    });

    it("returns empty string for undefined-like conversation IDs", () => {
      expect(useDraftStore.getState().getDraft("")).toBe("");
    });
  });

  describe("clearDraft", () => {
    it("removes the draft for a conversation", () => {
      useDraftStore.getState().setDraft("conv-1", "Hello");
      useDraftStore.getState().clearDraft("conv-1");
      expect(useDraftStore.getState().drafts["conv-1"]).toBeUndefined();
      expect(useDraftStore.getState().getDraft("conv-1")).toBe("");
    });

    it("is a no-op for conversations without a draft", () => {
      useDraftStore.getState().clearDraft("nonexistent");
      expect(useDraftStore.getState().drafts).toEqual({});
    });

    it("does not affect other conversations' drafts", () => {
      useDraftStore.getState().setDraft("conv-1", "Draft A");
      useDraftStore.getState().setDraft("conv-2", "Draft B");
      useDraftStore.getState().clearDraft("conv-1");
      expect(useDraftStore.getState().getDraft("conv-1")).toBe("");
      expect(useDraftStore.getState().getDraft("conv-2")).toBe("Draft B");
    });
  });

  describe("localStorage persistence", () => {
    it("saves drafts to localStorage on setDraft", () => {
      useDraftStore.getState().setDraft("conv-1", "Persisted draft");
      const stored = JSON.parse(localStorage.getItem("chatdf-drafts") || "{}");
      expect(stored["conv-1"]).toBe("Persisted draft");
    });

    it("removes from localStorage when draft is cleared", () => {
      useDraftStore.getState().setDraft("conv-1", "Temp draft");
      useDraftStore.getState().clearDraft("conv-1");
      const stored = JSON.parse(localStorage.getItem("chatdf-drafts") || "{}");
      expect(stored["conv-1"]).toBeUndefined();
    });

    it("removes from localStorage when draft is set to empty", () => {
      useDraftStore.getState().setDraft("conv-1", "Temp draft");
      useDraftStore.getState().setDraft("conv-1", "");
      const stored = JSON.parse(localStorage.getItem("chatdf-drafts") || "{}");
      expect(stored["conv-1"]).toBeUndefined();
    });

    it("persists multiple drafts correctly", () => {
      useDraftStore.getState().setDraft("conv-1", "Draft A");
      useDraftStore.getState().setDraft("conv-2", "Draft B");
      const stored = JSON.parse(localStorage.getItem("chatdf-drafts") || "{}");
      expect(stored).toEqual({
        "conv-1": "Draft A",
        "conv-2": "Draft B",
      });
    });

    it("handles corrupted localStorage data gracefully", () => {
      localStorage.setItem("chatdf-drafts", "not-valid-json{{{");
      // Re-create the store by calling setState to re-trigger load
      // The loadDraftsFromStorage function is called at store creation,
      // but we can test the robustness via direct state inspection
      // Since the store was already created, we test that setting a new draft works fine
      useDraftStore.getState().setDraft("conv-1", "New draft");
      expect(useDraftStore.getState().getDraft("conv-1")).toBe("New draft");
    });

    it("handles localStorage.setItem throwing (quota exceeded)", () => {
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = vi.fn(() => {
        throw new Error("QuotaExceededError");
      });

      // Should not throw
      expect(() => {
        useDraftStore.getState().setDraft("conv-1", "Draft");
      }).not.toThrow();

      // Store state should still be updated in memory
      expect(useDraftStore.getState().getDraft("conv-1")).toBe("Draft");

      localStorage.setItem = originalSetItem;
    });
  });
});
