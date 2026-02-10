// Tests for devModeStore Zustand store
// Covers: default state, setDevMode toggle, setSelectedModel,
//         AVAILABLE_MODELS export, persistence key, partialize behavior

import { describe, it, expect, beforeEach } from "vitest";
import { useDevModeStore, AVAILABLE_MODELS } from "@/stores/devModeStore";

describe("devModeStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useDevModeStore.setState({ devMode: true, selectedModel: "gemini-2.5-flash" });
  });

  describe("default state", () => {
    it("has devMode enabled by default", () => {
      expect(useDevModeStore.getState().devMode).toBe(true);
    });

    it("has selectedModel set to gemini-2.5-flash by default", () => {
      expect(useDevModeStore.getState().selectedModel).toBe("gemini-2.5-flash");
    });
  });

  describe("setDevMode", () => {
    it("disables dev mode when called with false", () => {
      useDevModeStore.getState().setDevMode(false);
      expect(useDevModeStore.getState().devMode).toBe(false);
    });

    it("enables dev mode when called with true", () => {
      useDevModeStore.getState().setDevMode(false);
      expect(useDevModeStore.getState().devMode).toBe(false);

      useDevModeStore.getState().setDevMode(true);
      expect(useDevModeStore.getState().devMode).toBe(true);
    });

    it("does not affect selectedModel when toggling devMode", () => {
      useDevModeStore.getState().setSelectedModel("gemini-2.5-pro");
      useDevModeStore.getState().setDevMode(false);
      expect(useDevModeStore.getState().selectedModel).toBe("gemini-2.5-pro");
    });
  });

  describe("setSelectedModel", () => {
    it("changes the selected model", () => {
      useDevModeStore.getState().setSelectedModel("gemini-2.5-pro");
      expect(useDevModeStore.getState().selectedModel).toBe("gemini-2.5-pro");
    });

    it("can set to any model id", () => {
      useDevModeStore.getState().setSelectedModel("gemini-2.0-flash");
      expect(useDevModeStore.getState().selectedModel).toBe("gemini-2.0-flash");
    });

    it("does not affect devMode when changing model", () => {
      useDevModeStore.getState().setDevMode(false);
      useDevModeStore.getState().setSelectedModel("gemini-2.5-pro");
      expect(useDevModeStore.getState().devMode).toBe(false);
    });
  });

  describe("AVAILABLE_MODELS", () => {
    it("exports an array with 3 models", () => {
      expect(AVAILABLE_MODELS).toHaveLength(3);
    });

    it("contains gemini-2.5-flash as the first entry", () => {
      expect(AVAILABLE_MODELS[0]).toEqual({
        id: "gemini-2.5-flash",
        label: "Gemini 2.5 Flash",
      });
    });

    it("contains gemini-2.5-pro as the second entry", () => {
      expect(AVAILABLE_MODELS[1]).toEqual({
        id: "gemini-2.5-pro",
        label: "Gemini 2.5 Pro",
      });
    });

    it("contains gemini-2.0-flash as the third entry", () => {
      expect(AVAILABLE_MODELS[2]).toEqual({
        id: "gemini-2.0-flash",
        label: "Gemini 2.0 Flash",
      });
    });

    it("each model has id and label properties", () => {
      for (const model of AVAILABLE_MODELS) {
        expect(model).toHaveProperty("id");
        expect(model).toHaveProperty("label");
        expect(typeof model.id).toBe("string");
        expect(typeof model.label).toBe("string");
      }
    });
  });

  describe("persistence", () => {
    it("uses 'chatdf-dev-mode' as the storage key", () => {
      useDevModeStore.getState().setDevMode(false);
      const stored = localStorage.getItem("chatdf-dev-mode");
      expect(stored).not.toBeNull();
    });

    it("persists devMode to localStorage", () => {
      useDevModeStore.getState().setDevMode(false);
      const stored = JSON.parse(localStorage.getItem("chatdf-dev-mode")!);
      expect(stored.state.devMode).toBe(false);
    });

    it("persists selectedModel to localStorage", () => {
      useDevModeStore.getState().setSelectedModel("gemini-2.5-pro");
      const stored = JSON.parse(localStorage.getItem("chatdf-dev-mode")!);
      expect(stored.state.selectedModel).toBe("gemini-2.5-pro");
    });

    it("does not persist function properties (partialize)", () => {
      useDevModeStore.getState().setDevMode(false);
      const stored = JSON.parse(localStorage.getItem("chatdf-dev-mode")!);
      expect(stored.state).not.toHaveProperty("setDevMode");
      expect(stored.state).not.toHaveProperty("setSelectedModel");
    });

    it("only persists devMode and selectedModel in state", () => {
      useDevModeStore.getState().setDevMode(false);
      const stored = JSON.parse(localStorage.getItem("chatdf-dev-mode")!);
      const keys = Object.keys(stored.state);
      expect(keys).toEqual(expect.arrayContaining(["devMode", "selectedModel"]));
      expect(keys).toHaveLength(2);
    });
  });
});
