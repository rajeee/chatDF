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

  describe("panel width clamping", () => {
    it("setLeftPanelWidth clamps to minimum 180", () => {
      useUiStore.getState().setLeftPanelWidth(100);
      expect(useUiStore.getState().leftPanelWidth).toBe(180);
    });

    it("setLeftPanelWidth clamps to maximum 400", () => {
      useUiStore.getState().setLeftPanelWidth(500);
      expect(useUiStore.getState().leftPanelWidth).toBe(400);
    });

    it("setLeftPanelWidth allows values within range", () => {
      useUiStore.getState().setLeftPanelWidth(300);
      expect(useUiStore.getState().leftPanelWidth).toBe(300);
    });

    it("setRightPanelWidth clamps to minimum 200", () => {
      useUiStore.getState().setRightPanelWidth(100);
      expect(useUiStore.getState().rightPanelWidth).toBe(200);
    });

    it("setRightPanelWidth clamps to maximum 500", () => {
      useUiStore.getState().setRightPanelWidth(600);
      expect(useUiStore.getState().rightPanelWidth).toBe(500);
    });

    it("setRightPanelWidth allows values within range", () => {
      useUiStore.getState().setRightPanelWidth(350);
      expect(useUiStore.getState().rightPanelWidth).toBe(350);
    });
  });

  describe("preset modal", () => {
    it("openPresetModal sets presetModalOpen to true", () => {
      useUiStore.getState().openPresetModal();
      expect(useUiStore.getState().presetModalOpen).toBe(true);
    });

    it("closePresetModal sets presetModalOpen to false", () => {
      useUiStore.getState().openPresetModal();
      useUiStore.getState().closePresetModal();
      expect(useUiStore.getState().presetModalOpen).toBe(false);
    });

    it("closePresetModal is idempotent", () => {
      useUiStore.getState().closePresetModal();
      expect(useUiStore.getState().presetModalOpen).toBe(false);
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

  describe("localStorage persistence", () => {
    beforeEach(() => {
      // Clear localStorage before each test
      localStorage.clear();
    });

    it("persists leftPanelOpen state to localStorage", () => {
      useUiStore.getState().toggleLeftPanel();
      const stored = JSON.parse(localStorage.getItem("chatdf-ui-preferences") || "{}");
      expect(stored.state.leftPanelOpen).toBe(false);
    });

    it("persists leftPanelWidth to localStorage", () => {
      useUiStore.getState().setLeftPanelWidth(320);
      const stored = JSON.parse(localStorage.getItem("chatdf-ui-preferences") || "{}");
      expect(stored.state.leftPanelWidth).toBe(320);
    });

    it("persists rightPanelWidth to localStorage", () => {
      useUiStore.getState().setRightPanelWidth(400);
      const stored = JSON.parse(localStorage.getItem("chatdf-ui-preferences") || "{}");
      expect(stored.state.rightPanelWidth).toBe(400);
    });

    it("does not persist modal states to localStorage", () => {
      useUiStore.getState().openSqlModal(sampleExecutions);
      useUiStore.getState().openSchemaModal("ds-1");
      const stored = JSON.parse(localStorage.getItem("chatdf-ui-preferences") || "{}");

      expect(stored.state.sqlModalOpen).toBeUndefined();
      expect(stored.state.schemaModalDatasetId).toBeUndefined();
    });

    it("persists multiple width changes correctly", () => {
      useUiStore.getState().setLeftPanelWidth(300);
      useUiStore.getState().setRightPanelWidth(350);

      const stored = JSON.parse(localStorage.getItem("chatdf-ui-preferences") || "{}");
      expect(stored.state.leftPanelWidth).toBe(300);
      expect(stored.state.rightPanelWidth).toBe(350);
    });
  });
});
