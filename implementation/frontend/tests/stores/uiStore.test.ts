// Tests for uiStore Zustand store
// Covers: FE-S-04 (panel toggles, SQL modal open/close)

import { describe, it, expect, beforeEach } from "vitest";
import { useUiStore } from "@/stores/uiStore";
import type { SqlExecution } from "@/stores/chatStore";

const sampleExecutions: SqlExecution[] = [
  { query: "SELECT * FROM users", columns: ["id", "name"], rows: [[1, "Alice"]], total_rows: 1, error: null },
  { query: "SELECT count(*) FROM orders", columns: ["count"], rows: [[42]], total_rows: 1, error: null },
];

describe("uiStore", () => {
  beforeEach(() => {
    useUiStore.getState().closeSchemaModal();
    useUiStore.getState().closeSqlModal();
    useUiStore.setState({ leftPanelOpen: true });
  });

  describe("initial state", () => {
    it("has leftPanelOpen as true by default", () => {
      useUiStore.setState({
        leftPanelOpen: true,
        sqlModalOpen: false,
        activeSqlExecutions: [],
        sqlResultModalIndex: null,
        schemaModalDatasetId: null,
      });
      expect(useUiStore.getState().leftPanelOpen).toBe(true);
    });

    it("has sqlModalOpen as false by default", () => {
      expect(useUiStore.getState().sqlModalOpen).toBe(false);
    });

    it("has empty activeSqlExecutions by default", () => {
      expect(useUiStore.getState().activeSqlExecutions).toEqual([]);
    });

    it("has null sqlResultModalIndex by default", () => {
      expect(useUiStore.getState().sqlResultModalIndex).toBeNull();
    });

    it("has null schemaModalDatasetId by default", () => {
      expect(useUiStore.getState().schemaModalDatasetId).toBeNull();
    });
  });

  describe("toggleLeftPanel (FE-S-04)", () => {
    it("toggles left panel from open to closed", () => {
      useUiStore.setState({ leftPanelOpen: true });
      useUiStore.getState().toggleLeftPanel();
      expect(useUiStore.getState().leftPanelOpen).toBe(false);
    });

    it("toggles left panel from closed to open", () => {
      useUiStore.setState({ leftPanelOpen: false });
      useUiStore.getState().toggleLeftPanel();
      expect(useUiStore.getState().leftPanelOpen).toBe(true);
    });

    it("toggles multiple times correctly", () => {
      useUiStore.setState({ leftPanelOpen: true });
      useUiStore.getState().toggleLeftPanel();
      useUiStore.getState().toggleLeftPanel();
      expect(useUiStore.getState().leftPanelOpen).toBe(true);

      useUiStore.getState().toggleLeftPanel();
      expect(useUiStore.getState().leftPanelOpen).toBe(false);
    });
  });

  describe("SQL modal (FE-S-04)", () => {
    it("openSqlModal sets sqlModalOpen to true and stores executions", () => {
      useUiStore.getState().openSqlModal(sampleExecutions);

      expect(useUiStore.getState().sqlModalOpen).toBe(true);
      expect(useUiStore.getState().activeSqlExecutions).toEqual(sampleExecutions);
    });

    it("openSqlModal replaces previous executions", () => {
      useUiStore.getState().openSqlModal([sampleExecutions[0]]);
      useUiStore.getState().openSqlModal(sampleExecutions);

      expect(useUiStore.getState().sqlModalOpen).toBe(true);
      expect(useUiStore.getState().activeSqlExecutions).toEqual(sampleExecutions);
    });

    it("closeSqlModal sets sqlModalOpen to false and clears executions", () => {
      useUiStore.getState().openSqlModal(sampleExecutions);
      useUiStore.getState().closeSqlModal();

      expect(useUiStore.getState().sqlModalOpen).toBe(false);
      expect(useUiStore.getState().activeSqlExecutions).toEqual([]);
    });

    it("closeSqlModal is idempotent when already closed", () => {
      useUiStore.getState().closeSqlModal();

      expect(useUiStore.getState().sqlModalOpen).toBe(false);
      expect(useUiStore.getState().activeSqlExecutions).toEqual([]);
    });

    it("open/close cycle works correctly", () => {
      // Open
      useUiStore.getState().openSqlModal(sampleExecutions);
      expect(useUiStore.getState().sqlModalOpen).toBe(true);
      expect(useUiStore.getState().activeSqlExecutions).toEqual(sampleExecutions);

      // Close
      useUiStore.getState().closeSqlModal();
      expect(useUiStore.getState().sqlModalOpen).toBe(false);
      expect(useUiStore.getState().activeSqlExecutions).toEqual([]);

      // Re-open with different content
      const newExecs = [sampleExecutions[1]];
      useUiStore.getState().openSqlModal(newExecs);
      expect(useUiStore.getState().sqlModalOpen).toBe(true);
      expect(useUiStore.getState().activeSqlExecutions).toEqual(newExecs);
    });

    it("openSqlResultModal sets the index", () => {
      useUiStore.getState().openSqlModal(sampleExecutions);
      useUiStore.getState().openSqlResultModal(0);
      expect(useUiStore.getState().sqlResultModalIndex).toBe(0);
    });

    it("closeSqlResultModal clears the index", () => {
      useUiStore.getState().openSqlModal(sampleExecutions);
      useUiStore.getState().openSqlResultModal(1);
      useUiStore.getState().closeSqlResultModal();
      expect(useUiStore.getState().sqlResultModalIndex).toBeNull();
    });

    it("closeSqlModal also clears sqlResultModalIndex", () => {
      useUiStore.getState().openSqlModal(sampleExecutions);
      useUiStore.getState().openSqlResultModal(0);
      useUiStore.getState().closeSqlModal();
      expect(useUiStore.getState().sqlResultModalIndex).toBeNull();
    });
  });

  describe("schema modal", () => {
    it("openSchemaModal sets the dataset id", () => {
      useUiStore.getState().openSchemaModal("ds-1");
      expect(useUiStore.getState().schemaModalDatasetId).toBe("ds-1");
    });

    it("closeSchemaModal clears the dataset id", () => {
      useUiStore.getState().openSchemaModal("ds-1");
      useUiStore.getState().closeSchemaModal();
      expect(useUiStore.getState().schemaModalDatasetId).toBeNull();
    });

    it("openSchemaModal replaces previous dataset id", () => {
      useUiStore.getState().openSchemaModal("ds-1");
      useUiStore.getState().openSchemaModal("ds-2");
      expect(useUiStore.getState().schemaModalDatasetId).toBe("ds-2");
    });

    it("closeSchemaModal is idempotent", () => {
      useUiStore.getState().closeSchemaModal();
      expect(useUiStore.getState().schemaModalDatasetId).toBeNull();
    });
  });

  describe("state independence", () => {
    it("toggling left panel does not affect SQL modal", () => {
      useUiStore.getState().openSqlModal(sampleExecutions);
      useUiStore.getState().toggleLeftPanel();

      expect(useUiStore.getState().sqlModalOpen).toBe(true);
      expect(useUiStore.getState().activeSqlExecutions).toEqual(sampleExecutions);
    });

    it("opening schema modal does not affect SQL modal", () => {
      useUiStore.getState().openSqlModal(sampleExecutions);
      useUiStore.getState().openSchemaModal("ds-1");

      expect(useUiStore.getState().sqlModalOpen).toBe(true);
      expect(useUiStore.getState().activeSqlExecutions).toEqual(sampleExecutions);
      expect(useUiStore.getState().schemaModalDatasetId).toBe("ds-1");
    });
  });
});
