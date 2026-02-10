// Tests for datasetDiscoveryStore Zustand store
// Covers: NL dataset discovery search, category filtering, dataset loading

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { DatasetDiscoveryResult } from "@/api/client";

vi.mock("@/api/client", () => ({
  discoverDatasets: vi.fn(),
  apiPost: vi.fn(),
}));

vi.mock("@/stores/datasetStore", () => ({
  useDatasetStore: { getState: vi.fn(() => ({ datasets: [], addDataset: vi.fn() })) },
}));

vi.mock("@/stores/chatStore", () => ({
  useChatStore: { getState: vi.fn(() => ({ setActiveConversation: vi.fn() })) },
}));

import {
  useDatasetDiscoveryStore,
  DISCOVERY_CATEGORIES,
} from "@/stores/datasetDiscoveryStore";
import { discoverDatasets, apiPost } from "@/api/client";
import { useDatasetStore } from "@/stores/datasetStore";
import { useChatStore } from "@/stores/chatStore";

const mockDiscoverDatasets = discoverDatasets as ReturnType<typeof vi.fn>;
const mockApiPost = apiPost as ReturnType<typeof vi.fn>;

function makeResult(overrides: Partial<DatasetDiscoveryResult> = {}): DatasetDiscoveryResult {
  return {
    id: "test-dataset-1",
    description: "A test dataset",
    downloads: 500,
    likes: 10,
    tags: ["test", "csv"],
    last_modified: "2025-01-01T00:00:00Z",
    parquet_url: "https://example.com/data.parquet",
    relevance_score: 0.95,
    ...overrides,
  };
}

describe("datasetDiscoveryStore", () => {
  beforeEach(() => {
    useDatasetDiscoveryStore.getState().reset();
    vi.clearAllMocks();
    // Reset datasetStore mock to default
    (useDatasetStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
      datasets: [],
      addDataset: vi.fn(),
    });
    (useChatStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
      setActiveConversation: vi.fn(),
    });
  });

  describe("initial state", () => {
    it("has empty results array", () => {
      expect(useDatasetDiscoveryStore.getState().results).toEqual([]);
    });

    it("has loading set to false", () => {
      expect(useDatasetDiscoveryStore.getState().loading).toBe(false);
    });

    it("has empty query string", () => {
      expect(useDatasetDiscoveryStore.getState().query).toBe("");
    });

    it("has null selectedCategory", () => {
      expect(useDatasetDiscoveryStore.getState().selectedCategory).toBeNull();
    });

    it("has null error", () => {
      expect(useDatasetDiscoveryStore.getState().error).toBeNull();
    });

    it("has empty keywords array", () => {
      expect(useDatasetDiscoveryStore.getState().keywords).toEqual([]);
    });

    it("has empty matchedCategories array", () => {
      expect(useDatasetDiscoveryStore.getState().matchedCategories).toEqual([]);
    });

    it("has null loadingDatasetId", () => {
      expect(useDatasetDiscoveryStore.getState().loadingDatasetId).toBeNull();
    });
  });

  describe("search()", () => {
    it("populates results, keywords, and matchedCategories on success", async () => {
      const result = makeResult();
      mockDiscoverDatasets.mockResolvedValueOnce({
        results: [result],
        total: 1,
        keywords: ["climate", "temperature"],
        matched_categories: ["Climate"],
      });

      await useDatasetDiscoveryStore.getState().search("climate data");

      const state = useDatasetDiscoveryStore.getState();
      expect(state.results).toEqual([result]);
      expect(state.keywords).toEqual(["climate", "temperature"]);
      expect(state.matchedCategories).toEqual(["Climate"]);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.query).toBe("climate data");
      expect(mockDiscoverDatasets).toHaveBeenCalledWith("climate data", 10);
    });

    it("trims whitespace from query before calling API", async () => {
      mockDiscoverDatasets.mockResolvedValueOnce({
        results: [],
        total: 0,
        keywords: [],
        matched_categories: [],
      });

      await useDatasetDiscoveryStore.getState().search("  weather data  ");

      expect(mockDiscoverDatasets).toHaveBeenCalledWith("weather data", 10);
    });

    it("clears results when given an empty query", async () => {
      // First populate some results
      mockDiscoverDatasets.mockResolvedValueOnce({
        results: [makeResult()],
        total: 1,
        keywords: ["test"],
        matched_categories: ["Health"],
      });
      await useDatasetDiscoveryStore.getState().search("test");

      // Now search with empty query
      await useDatasetDiscoveryStore.getState().search("");

      const state = useDatasetDiscoveryStore.getState();
      expect(state.results).toEqual([]);
      expect(state.keywords).toEqual([]);
      expect(state.matchedCategories).toEqual([]);
      expect(state.error).toBeNull();
      expect(mockDiscoverDatasets).toHaveBeenCalledTimes(1); // Not called for empty query
    });

    it("clears results when given a whitespace-only query", async () => {
      await useDatasetDiscoveryStore.getState().search("   ");

      const state = useDatasetDiscoveryStore.getState();
      expect(state.results).toEqual([]);
      expect(state.error).toBeNull();
      expect(mockDiscoverDatasets).not.toHaveBeenCalled();
    });

    it("sets error on API failure with Error instance", async () => {
      mockDiscoverDatasets.mockRejectedValueOnce(new Error("Network error"));

      await useDatasetDiscoveryStore.getState().search("broken query");

      const state = useDatasetDiscoveryStore.getState();
      expect(state.error).toBe("Network error");
      expect(state.loading).toBe(false);
      expect(state.results).toEqual([]);
    });

    it("sets generic error message for non-Error throws", async () => {
      mockDiscoverDatasets.mockRejectedValueOnce("some string error");

      await useDatasetDiscoveryStore.getState().search("broken query");

      const state = useDatasetDiscoveryStore.getState();
      expect(state.error).toBe("Discovery search failed");
      expect(state.loading).toBe(false);
      expect(state.results).toEqual([]);
    });
  });

  describe("searchByCategory()", () => {
    it("calls discoverDatasets with lowercased category and ' datasets' suffix", async () => {
      mockDiscoverDatasets.mockResolvedValueOnce({
        results: [makeResult()],
        total: 1,
        keywords: ["climate"],
        matched_categories: ["Climate"],
      });

      await useDatasetDiscoveryStore.getState().searchByCategory("Climate");

      expect(mockDiscoverDatasets).toHaveBeenCalledWith("climate datasets", 10);
    });

    it("sets selectedCategory and clears query on success", async () => {
      // First set a query
      useDatasetDiscoveryStore.getState().setQuery("some query");

      mockDiscoverDatasets.mockResolvedValueOnce({
        results: [makeResult()],
        total: 1,
        keywords: ["finance"],
        matched_categories: ["Finance"],
      });

      await useDatasetDiscoveryStore.getState().searchByCategory("Finance");

      const state = useDatasetDiscoveryStore.getState();
      expect(state.selectedCategory).toBe("Finance");
      expect(state.query).toBe("");
      expect(state.results).toHaveLength(1);
      expect(state.loading).toBe(false);
    });

    it("populates keywords and matchedCategories from response", async () => {
      mockDiscoverDatasets.mockResolvedValueOnce({
        results: [],
        total: 0,
        keywords: ["health", "medical"],
        matched_categories: ["Health"],
      });

      await useDatasetDiscoveryStore.getState().searchByCategory("Health");

      const state = useDatasetDiscoveryStore.getState();
      expect(state.keywords).toEqual(["health", "medical"]);
      expect(state.matchedCategories).toEqual(["Health"]);
    });

    it("sets error on API failure", async () => {
      mockDiscoverDatasets.mockRejectedValueOnce(new Error("Timeout"));

      await useDatasetDiscoveryStore.getState().searchByCategory("Energy");

      const state = useDatasetDiscoveryStore.getState();
      expect(state.error).toBe("Timeout");
      expect(state.loading).toBe(false);
      expect(state.results).toEqual([]);
    });

    it("sets generic error message for non-Error throws", async () => {
      mockDiscoverDatasets.mockRejectedValueOnce(42);

      await useDatasetDiscoveryStore.getState().searchByCategory("Energy");

      expect(useDatasetDiscoveryStore.getState().error).toBe("Category search failed");
    });
  });

  describe("clearCategory()", () => {
    it("resets selectedCategory, results, and error", async () => {
      // Set up state with category and results
      mockDiscoverDatasets.mockResolvedValueOnce({
        results: [makeResult()],
        total: 1,
        keywords: ["census"],
        matched_categories: ["Census"],
      });
      await useDatasetDiscoveryStore.getState().searchByCategory("Census");

      useDatasetDiscoveryStore.getState().clearCategory();

      const state = useDatasetDiscoveryStore.getState();
      expect(state.selectedCategory).toBeNull();
      expect(state.results).toEqual([]);
      expect(state.error).toBeNull();
    });

    it("clears error when present", () => {
      // Manually set error state via a failed search
      useDatasetDiscoveryStore.setState({ error: "some error", selectedCategory: "Test", results: [makeResult()] });

      useDatasetDiscoveryStore.getState().clearCategory();

      const state = useDatasetDiscoveryStore.getState();
      expect(state.error).toBeNull();
      expect(state.selectedCategory).toBeNull();
      expect(state.results).toEqual([]);
    });
  });

  describe("setQuery()", () => {
    it("sets the query string", () => {
      useDatasetDiscoveryStore.getState().setQuery("new query");
      expect(useDatasetDiscoveryStore.getState().query).toBe("new query");
    });

    it("clears selectedCategory when setting query", async () => {
      // First set a category
      mockDiscoverDatasets.mockResolvedValueOnce({
        results: [],
        total: 0,
        keywords: [],
        matched_categories: [],
      });
      await useDatasetDiscoveryStore.getState().searchByCategory("Finance");
      expect(useDatasetDiscoveryStore.getState().selectedCategory).toBe("Finance");

      useDatasetDiscoveryStore.getState().setQuery("custom search");

      const state = useDatasetDiscoveryStore.getState();
      expect(state.query).toBe("custom search");
      expect(state.selectedCategory).toBeNull();
    });
  });

  describe("loadDataset()", () => {
    const mockResult = makeResult({ id: "ds-load-1", parquet_url: "https://example.com/load.parquet" });

    it("loads dataset with existing conversation", async () => {
      const addDataset = vi.fn();
      (useDatasetStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
        datasets: [],
        addDataset,
      });

      mockApiPost.mockResolvedValueOnce({ dataset_id: "new-ds-id", status: "loading" });

      await useDatasetDiscoveryStore.getState().loadDataset(mockResult, "conv-123");

      expect(mockApiPost).toHaveBeenCalledWith("/conversations/conv-123/datasets", {
        url: "https://example.com/load.parquet",
      });
      expect(addDataset).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "new-ds-id",
          conversation_id: "conv-123",
          url: "https://example.com/load.parquet",
          status: "loading",
        })
      );
      // Should not create a new conversation
      expect(mockApiPost).toHaveBeenCalledTimes(1);
      expect(useDatasetDiscoveryStore.getState().loadingDatasetId).toBeNull();
    });

    it("creates new conversation when conversationId is null", async () => {
      const setActiveConversation = vi.fn();
      const addDataset = vi.fn();
      (useChatStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
        setActiveConversation,
      });
      (useDatasetStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
        datasets: [],
        addDataset,
      });

      // First call creates conversation, second posts dataset
      mockApiPost
        .mockResolvedValueOnce({ id: "new-conv-id" })
        .mockResolvedValueOnce({ dataset_id: "new-ds-id", status: "loading" });

      await useDatasetDiscoveryStore.getState().loadDataset(mockResult, null);

      expect(mockApiPost).toHaveBeenCalledWith("/conversations");
      expect(setActiveConversation).toHaveBeenCalledWith("new-conv-id");
      expect(mockApiPost).toHaveBeenCalledWith("/conversations/new-conv-id/datasets", {
        url: "https://example.com/load.parquet",
      });
      expect(addDataset).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "new-ds-id",
          conversation_id: "new-conv-id",
        })
      );
    });

    it("does not add dataset if it already exists in store", async () => {
      const addDataset = vi.fn();
      (useDatasetStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
        datasets: [{ id: "existing-ds-id" }],
        addDataset,
      });

      mockApiPost.mockResolvedValueOnce({ dataset_id: "existing-ds-id", status: "ready" });

      await useDatasetDiscoveryStore.getState().loadDataset(mockResult, "conv-123");

      expect(addDataset).not.toHaveBeenCalled();
    });

    it("sets loadingDatasetId during load and clears it after", async () => {
      const addDataset = vi.fn();
      (useDatasetStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
        datasets: [],
        addDataset,
      });

      let capturedLoadingId: string | null = null;
      mockApiPost.mockImplementationOnce(async () => {
        capturedLoadingId = useDatasetDiscoveryStore.getState().loadingDatasetId;
        return { dataset_id: "new-ds-id", status: "loading" };
      });

      await useDatasetDiscoveryStore.getState().loadDataset(mockResult, "conv-123");

      expect(capturedLoadingId).toBe("ds-load-1");
      expect(useDatasetDiscoveryStore.getState().loadingDatasetId).toBeNull();
    });

    it("throws error and clears loadingDatasetId on failure", async () => {
      mockApiPost.mockRejectedValueOnce(new Error("Server error"));

      await expect(
        useDatasetDiscoveryStore.getState().loadDataset(mockResult, "conv-123")
      ).rejects.toThrow("Server error");

      expect(useDatasetDiscoveryStore.getState().loadingDatasetId).toBeNull();
    });

    it("throws generic error message for non-Error throws", async () => {
      mockApiPost.mockRejectedValueOnce("string error");

      await expect(
        useDatasetDiscoveryStore.getState().loadDataset(mockResult, "conv-123")
      ).rejects.toThrow("Failed to load dataset");

      expect(useDatasetDiscoveryStore.getState().loadingDatasetId).toBeNull();
    });
  });

  describe("reset()", () => {
    it("returns to initial state after modifications", async () => {
      // Modify state
      mockDiscoverDatasets.mockResolvedValueOnce({
        results: [makeResult()],
        total: 1,
        keywords: ["test"],
        matched_categories: ["Health"],
      });
      await useDatasetDiscoveryStore.getState().search("test query");

      // Verify state was modified
      expect(useDatasetDiscoveryStore.getState().results).toHaveLength(1);
      expect(useDatasetDiscoveryStore.getState().query).toBe("test query");

      // Reset
      useDatasetDiscoveryStore.getState().reset();

      const state = useDatasetDiscoveryStore.getState();
      expect(state.results).toEqual([]);
      expect(state.loading).toBe(false);
      expect(state.query).toBe("");
      expect(state.selectedCategory).toBeNull();
      expect(state.error).toBeNull();
      expect(state.keywords).toEqual([]);
      expect(state.matchedCategories).toEqual([]);
      expect(state.loadingDatasetId).toBeNull();
    });
  });

  describe("DISCOVERY_CATEGORIES", () => {
    it("exports the correct category values", () => {
      expect(DISCOVERY_CATEGORIES).toEqual([
        "Climate",
        "Finance",
        "Health",
        "Census",
        "Education",
        "Transportation",
        "Energy",
        "Agriculture",
      ]);
    });

    it("has exactly 8 categories", () => {
      expect(DISCOVERY_CATEGORIES).toHaveLength(8);
    });
  });
});
