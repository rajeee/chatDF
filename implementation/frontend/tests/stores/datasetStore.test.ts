// Tests for datasetStore Zustand store
// Covers: FE-S-03 (add/remove/update datasets)

import { describe, it, expect, beforeEach } from "vitest";
import { useDatasetStore, filterDatasetsByConversation } from "@/stores/datasetStore";

describe("datasetStore", () => {
  beforeEach(() => {
    useDatasetStore.getState().reset();
  });

  describe("initial state", () => {
    it("has empty datasets array", () => {
      expect(useDatasetStore.getState().datasets).toEqual([]);
    });

    it("has empty loadingDatasets set", () => {
      expect(useDatasetStore.getState().loadingDatasets).toEqual(new Set());
    });
  });

  describe("addDataset (FE-S-03)", () => {
    it("adds a dataset to the array", () => {
      useDatasetStore.getState().addDataset({
        id: "ds-1",
        conversation_id: "conv-1",
        url: "https://example.com/data.csv",
        name: "test_data",
        row_count: 100,
        column_count: 3,
        schema_json: '{"columns": []}',
        status: "ready",
        error_message: null,
      });

      const datasets = useDatasetStore.getState().datasets;
      expect(datasets).toHaveLength(1);
      expect(datasets[0].id).toBe("ds-1");
      expect(datasets[0].name).toBe("test_data");
      expect(datasets[0].status).toBe("ready");
    });

    it("adds multiple datasets", () => {
      useDatasetStore.getState().addDataset({
        id: "ds-1",
        conversation_id: "conv-1",
        url: "https://example.com/data1.csv",
        name: "dataset_one",
        row_count: 50,
        column_count: 2,
        schema_json: "{}",
        status: "ready",
        error_message: null,
      });
      useDatasetStore.getState().addDataset({
        id: "ds-2",
        conversation_id: "conv-1",
        url: "https://example.com/data2.csv",
        name: "dataset_two",
        row_count: 200,
        column_count: 5,
        schema_json: "{}",
        status: "loading",
        error_message: null,
      });

      expect(useDatasetStore.getState().datasets).toHaveLength(2);
    });
  });

  describe("removeDataset (FE-S-03)", () => {
    it("removes a dataset by id", () => {
      useDatasetStore.getState().addDataset({
        id: "ds-1",
        conversation_id: "conv-1",
        url: "https://example.com/data.csv",
        name: "dataset_one",
        row_count: 100,
        column_count: 3,
        schema_json: "{}",
        status: "ready",
        error_message: null,
      });
      useDatasetStore.getState().addDataset({
        id: "ds-2",
        conversation_id: "conv-1",
        url: "https://example.com/data2.csv",
        name: "dataset_two",
        row_count: 50,
        column_count: 2,
        schema_json: "{}",
        status: "ready",
        error_message: null,
      });

      useDatasetStore.getState().removeDataset("ds-1");

      const datasets = useDatasetStore.getState().datasets;
      expect(datasets).toHaveLength(1);
      expect(datasets[0].id).toBe("ds-2");
    });

    it("does nothing when removing non-existent id", () => {
      useDatasetStore.getState().addDataset({
        id: "ds-1",
        conversation_id: "conv-1",
        url: "https://example.com/data.csv",
        name: "dataset_one",
        row_count: 100,
        column_count: 3,
        schema_json: "{}",
        status: "ready",
        error_message: null,
      });

      useDatasetStore.getState().removeDataset("ds-999");
      expect(useDatasetStore.getState().datasets).toHaveLength(1);
    });
  });

  describe("updateDataset (FE-S-03)", () => {
    it("updates specific fields of a dataset", () => {
      useDatasetStore.getState().addDataset({
        id: "ds-1",
        conversation_id: "conv-1",
        url: "https://example.com/data.csv",
        name: "original_name",
        row_count: 0,
        column_count: 0,
        schema_json: "{}",
        status: "loading",
        error_message: null,
      });

      useDatasetStore.getState().updateDataset("ds-1", {
        row_count: 500,
        column_count: 10,
        status: "ready",
        schema_json: '{"columns": ["a","b"]}',
      });

      const dataset = useDatasetStore.getState().datasets[0];
      expect(dataset.row_count).toBe(500);
      expect(dataset.column_count).toBe(10);
      expect(dataset.status).toBe("ready");
      expect(dataset.schema_json).toBe('{"columns": ["a","b"]}');
      // Unchanged fields preserved
      expect(dataset.name).toBe("original_name");
      expect(dataset.url).toBe("https://example.com/data.csv");
    });

    it("does not modify other datasets", () => {
      useDatasetStore.getState().addDataset({
        id: "ds-1",
        conversation_id: "conv-1",
        url: "https://example.com/data1.csv",
        name: "first",
        row_count: 10,
        column_count: 2,
        schema_json: "{}",
        status: "ready",
        error_message: null,
      });
      useDatasetStore.getState().addDataset({
        id: "ds-2",
        conversation_id: "conv-1",
        url: "https://example.com/data2.csv",
        name: "second",
        row_count: 20,
        column_count: 3,
        schema_json: "{}",
        status: "ready",
        error_message: null,
      });

      useDatasetStore.getState().updateDataset("ds-1", { name: "updated_first" });

      expect(useDatasetStore.getState().datasets[0].name).toBe("updated_first");
      expect(useDatasetStore.getState().datasets[1].name).toBe("second");
    });

    it("updates error_message on dataset error", () => {
      useDatasetStore.getState().addDataset({
        id: "ds-1",
        conversation_id: "conv-1",
        url: "https://example.com/data.csv",
        name: "broken",
        row_count: 0,
        column_count: 0,
        schema_json: "{}",
        status: "loading",
        error_message: null,
      });

      useDatasetStore.getState().updateDataset("ds-1", {
        status: "error",
        error_message: "Failed to parse CSV",
      });

      const dataset = useDatasetStore.getState().datasets[0];
      expect(dataset.status).toBe("error");
      expect(dataset.error_message).toBe("Failed to parse CSV");
    });
  });

  describe("renameDataset", () => {
    it("updates the name of a dataset", () => {
      useDatasetStore.getState().addDataset({
        id: "ds-1",
        conversation_id: "conv-1",
        url: "https://example.com/data.csv",
        name: "old_name",
        row_count: 100,
        column_count: 3,
        schema_json: "{}",
        status: "ready",
        error_message: null,
      });

      useDatasetStore.getState().renameDataset("ds-1", "new_name");
      expect(useDatasetStore.getState().datasets[0].name).toBe("new_name");
    });

    it("does not affect other fields", () => {
      useDatasetStore.getState().addDataset({
        id: "ds-1",
        conversation_id: "conv-1",
        url: "https://example.com/data.csv",
        name: "old_name",
        row_count: 100,
        column_count: 3,
        schema_json: '{"test": true}',
        status: "ready",
        error_message: null,
      });

      useDatasetStore.getState().renameDataset("ds-1", "new_name");
      const dataset = useDatasetStore.getState().datasets[0];
      expect(dataset.row_count).toBe(100);
      expect(dataset.column_count).toBe(3);
      expect(dataset.schema_json).toBe('{"test": true}');
      expect(dataset.status).toBe("ready");
    });
  });

  describe("refreshSchema", () => {
    it("marks dataset id as loading", () => {
      useDatasetStore.getState().addDataset({
        id: "ds-1",
        conversation_id: "conv-1",
        url: "https://example.com/data.csv",
        name: "dataset",
        row_count: 100,
        column_count: 3,
        schema_json: "{}",
        status: "ready",
        error_message: null,
      });

      useDatasetStore.getState().refreshSchema("ds-1");
      expect(useDatasetStore.getState().loadingDatasets.has("ds-1")).toBe(true);
    });

    it("can mark multiple datasets as loading", () => {
      useDatasetStore.getState().refreshSchema("ds-1");
      useDatasetStore.getState().refreshSchema("ds-2");

      const loading = useDatasetStore.getState().loadingDatasets;
      expect(loading.has("ds-1")).toBe(true);
      expect(loading.has("ds-2")).toBe(true);
      expect(loading.size).toBe(2);
    });
  });

  describe("setConversationDatasets", () => {
    it("replaces datasets for a specific conversation", () => {
      // Add datasets for two conversations
      useDatasetStore.getState().addDataset({
        id: "ds-1",
        conversation_id: "conv-1",
        url: "https://example.com/a.csv",
        name: "a",
        row_count: 10,
        column_count: 2,
        schema_json: "{}",
        status: "ready",
        error_message: null,
      });
      useDatasetStore.getState().addDataset({
        id: "ds-2",
        conversation_id: "conv-2",
        url: "https://example.com/b.csv",
        name: "b",
        row_count: 20,
        column_count: 3,
        schema_json: "{}",
        status: "ready",
        error_message: null,
      });

      // Replace conv-1 datasets
      useDatasetStore.getState().setConversationDatasets("conv-1", [
        {
          id: "ds-3",
          conversation_id: "conv-1",
          url: "https://example.com/c.csv",
          name: "c",
          row_count: 30,
          column_count: 4,
          schema_json: "{}",
          status: "ready",
          error_message: null,
        },
      ]);

      const datasets = useDatasetStore.getState().datasets;
      expect(datasets).toHaveLength(2);
      expect(datasets.find((d) => d.id === "ds-2")).toBeDefined(); // conv-2 preserved
      expect(datasets.find((d) => d.id === "ds-3")).toBeDefined(); // conv-1 replaced
      expect(datasets.find((d) => d.id === "ds-1")).toBeUndefined(); // old conv-1 gone
    });
  });

  describe("filterDatasetsByConversation", () => {
    it("returns only datasets for the given conversation", () => {
      useDatasetStore.getState().addDataset({
        id: "ds-1",
        conversation_id: "conv-1",
        url: "https://example.com/a.csv",
        name: "a",
        row_count: 10,
        column_count: 2,
        schema_json: "{}",
        status: "ready",
        error_message: null,
      });
      useDatasetStore.getState().addDataset({
        id: "ds-2",
        conversation_id: "conv-2",
        url: "https://example.com/b.csv",
        name: "b",
        row_count: 20,
        column_count: 3,
        schema_json: "{}",
        status: "ready",
        error_message: null,
      });

      const result = filterDatasetsByConversation(useDatasetStore.getState().datasets, "conv-1");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("ds-1");
    });

    it("returns empty array for null conversationId", () => {
      useDatasetStore.getState().addDataset({
        id: "ds-1",
        conversation_id: "conv-1",
        url: "https://example.com/a.csv",
        name: "a",
        row_count: 10,
        column_count: 2,
        schema_json: "{}",
        status: "ready",
        error_message: null,
      });

      const result = filterDatasetsByConversation(useDatasetStore.getState().datasets, null);
      expect(result).toHaveLength(0);
    });
  });

  describe("reset", () => {
    it("clears all datasets and loading state", () => {
      useDatasetStore.getState().addDataset({
        id: "ds-1",
        conversation_id: "conv-1",
        url: "https://example.com/data.csv",
        name: "dataset",
        row_count: 100,
        column_count: 3,
        schema_json: "{}",
        status: "ready",
        error_message: null,
      });
      useDatasetStore.getState().refreshSchema("ds-1");

      useDatasetStore.getState().reset();

      expect(useDatasetStore.getState().datasets).toEqual([]);
      expect(useDatasetStore.getState().loadingDatasets).toEqual(new Set());
    });
  });
});
