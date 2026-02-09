// Draft message persistence store.
// Saves in-progress chat input text per conversation to localStorage,
// so drafts survive navigation, tab close, and page refresh.

import { create } from "zustand";

const STORAGE_KEY = "chatdf-drafts";

interface DraftState {
  drafts: Record<string, string>; // conversationId -> draft text
  setDraft: (conversationId: string, text: string) => void;
  getDraft: (conversationId: string) => string;
  clearDraft: (conversationId: string) => void;
}

export const useDraftStore = create<DraftState>()((set, get) => ({
  drafts: loadDraftsFromStorage(),
  setDraft: (conversationId, text) => {
    set((state) => {
      const newDrafts = { ...state.drafts };
      if (text.trim()) {
        newDrafts[conversationId] = text;
      } else {
        delete newDrafts[conversationId];
      }
      saveDraftsToStorage(newDrafts);
      return { drafts: newDrafts };
    });
  },
  getDraft: (conversationId) => get().drafts[conversationId] || "",
  clearDraft: (conversationId) => {
    set((state) => {
      const newDrafts = { ...state.drafts };
      delete newDrafts[conversationId];
      saveDraftsToStorage(newDrafts);
      return { drafts: newDrafts };
    });
  },
}));

function loadDraftsFromStorage(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveDraftsToStorage(drafts: Record<string, string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  } catch {
    // quota exceeded or unavailable
  }
}
