import { create } from "zustand";
import { persist } from "zustand/middleware";

interface DevModeState {
  devMode: boolean;
  selectedModel: string;
  promptPreviewOpen: boolean;
  setDevMode: (enabled: boolean) => void;
  setSelectedModel: (model: string) => void;
  openPromptPreview: () => void;
  closePromptPreview: () => void;
}

export const useDevModeStore = create<DevModeState>()(
  persist(
    (set) => ({
      devMode: true, // ON by default
      selectedModel: "gemini-2.5-flash",
      promptPreviewOpen: false,
      setDevMode: (enabled) => set({ devMode: enabled }),
      setSelectedModel: (model) => set({ selectedModel: model }),
      openPromptPreview: () => set({ promptPreviewOpen: true }),
      closePromptPreview: () => set({ promptPreviewOpen: false }),
    }),
    {
      name: "chatdf-dev-mode",
      partialize: (state) => ({
        devMode: state.devMode,
        selectedModel: state.selectedModel,
      }),
    }
  )
);

export const AVAILABLE_MODELS = [
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
];
