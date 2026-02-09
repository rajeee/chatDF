// Dataset discovery store -- manages NL dataset search state.
//
// Provides state and actions for the DatasetDiscoveryPanel:
// - Searching datasets by natural language query
// - Filtering by category
// - Loading discovered datasets into a conversation

import { create } from "zustand";
import {
  discoverDatasets,
  apiPost,
  type DatasetDiscoveryResult,
} from "@/api/client";
import { useDatasetStore } from "@/stores/datasetStore";
import { useChatStore } from "@/stores/chatStore";

export const DISCOVERY_CATEGORIES = [
  "Climate",
  "Finance",
  "Health",
  "Census",
  "Education",
  "Transportation",
  "Energy",
  "Agriculture",
] as const;

export type DiscoveryCategory = (typeof DISCOVERY_CATEGORIES)[number];

interface DatasetDiscoveryState {
  results: DatasetDiscoveryResult[];
  loading: boolean;
  query: string;
  selectedCategory: string | null;
  error: string | null;
  keywords: string[];
  matchedCategories: string[];
  loadingDatasetId: string | null;
}

interface DatasetDiscoveryActions {
  search: (query: string) => Promise<void>;
  searchByCategory: (category: string) => Promise<void>;
  clearCategory: () => void;
  setQuery: (query: string) => void;
  loadDataset: (
    result: DatasetDiscoveryResult,
    conversationId: string | null
  ) => Promise<void>;
  reset: () => void;
}

const initialState: DatasetDiscoveryState = {
  results: [],
  loading: false,
  query: "",
  selectedCategory: null,
  error: null,
  keywords: [],
  matchedCategories: [],
  loadingDatasetId: null,
};

export const useDatasetDiscoveryStore = create<
  DatasetDiscoveryState & DatasetDiscoveryActions
>()((set) => ({
  ...initialState,

  search: async (query: string) => {
    if (!query.trim()) {
      set({ results: [], error: null, keywords: [], matchedCategories: [] });
      return;
    }
    set({ loading: true, error: null, query });
    try {
      const response = await discoverDatasets(query.trim(), 10);
      set({
        results: response.results,
        loading: false,
        keywords: response.keywords,
        matchedCategories: response.matched_categories,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Discovery search failed";
      set({ error: message, loading: false, results: [] });
    }
  },

  searchByCategory: async (category: string) => {
    const categoryLower = category.toLowerCase();
    set({ loading: true, error: null, selectedCategory: category });
    try {
      const response = await discoverDatasets(
        `${categoryLower} datasets`,
        10
      );
      set({
        results: response.results,
        loading: false,
        query: "",
        keywords: response.keywords,
        matchedCategories: response.matched_categories,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Category search failed";
      set({ error: message, loading: false, results: [] });
    }
  },

  clearCategory: () => {
    set({ selectedCategory: null, results: [], error: null });
  },

  setQuery: (query: string) => {
    set({ query, selectedCategory: null });
  },

  loadDataset: async (
    result: DatasetDiscoveryResult,
    conversationId: string | null
  ) => {
    set({ loadingDatasetId: result.id });
    try {
      let convId = conversationId;
      if (!convId) {
        const newConv = await apiPost<{ id: string }>("/conversations");
        convId = newConv.id;
        useChatStore.getState().setActiveConversation(convId);
      }

      const response = await apiPost<{ dataset_id: string; status: string }>(
        `/conversations/${convId}/datasets`,
        { url: result.parquet_url }
      );

      const alreadyExists = useDatasetStore
        .getState()
        .datasets.some((d) => d.id === response.dataset_id);
      if (!alreadyExists) {
        useDatasetStore.getState().addDataset({
          id: response.dataset_id,
          conversation_id: convId!,
          url: result.parquet_url,
          name: "",
          row_count: 0,
          column_count: 0,
          schema_json: "{}",
          status: "loading",
          error_message: null,
        });
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load dataset";
      throw new Error(message);
    } finally {
      set({ loadingDatasetId: null });
    }
  },

  reset: () => set(initialState),
}));
