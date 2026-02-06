// Tests for uiStore Zustand store
// Covers: FE-S-04 (panel toggles, SQL panel open/close)

import { describe, it, expect, beforeEach } from "vitest";
import { useUiStore } from "@/stores/uiStore";

describe("uiStore", () => {
  beforeEach(() => {
    useUiStore.getState().closeSchemaModal();
    useUiStore.getState().closeSqlPanel();
    useUiStore.setState({ leftPanelOpen: true });
  });

  describe("initial state", () => {
    it("has leftPanelOpen as true by default", () => {
      // Reset to truly initial state
      useUiStore.setState({
        leftPanelOpen: true,
        sqlPanelOpen: false,
        activeSqlContent: null,
        schemaModalDatasetId: null,
      });
      expect(useUiStore.getState().leftPanelOpen).toBe(true);
    });

    it("has sqlPanelOpen as false by default", () => {
      expect(useUiStore.getState().sqlPanelOpen).toBe(false);
    });

    it("has null activeSqlContent by default", () => {
      expect(useUiStore.getState().activeSqlContent).toBeNull();
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

  describe("SQL panel (FE-S-04)", () => {
    it("openSqlPanel sets sqlPanelOpen to true and stores content", () => {
      useUiStore.getState().openSqlPanel("SELECT * FROM users");

      expect(useUiStore.getState().sqlPanelOpen).toBe(true);
      expect(useUiStore.getState().activeSqlContent).toBe("SELECT * FROM users");
    });

    it("openSqlPanel replaces previous content", () => {
      useUiStore.getState().openSqlPanel("SELECT 1");
      useUiStore.getState().openSqlPanel("SELECT 2");

      expect(useUiStore.getState().sqlPanelOpen).toBe(true);
      expect(useUiStore.getState().activeSqlContent).toBe("SELECT 2");
    });

    it("closeSqlPanel sets sqlPanelOpen to false and clears content", () => {
      useUiStore.getState().openSqlPanel("SELECT * FROM data");
      useUiStore.getState().closeSqlPanel();

      expect(useUiStore.getState().sqlPanelOpen).toBe(false);
      expect(useUiStore.getState().activeSqlContent).toBeNull();
    });

    it("closeSqlPanel is idempotent when already closed", () => {
      useUiStore.getState().closeSqlPanel();

      expect(useUiStore.getState().sqlPanelOpen).toBe(false);
      expect(useUiStore.getState().activeSqlContent).toBeNull();
    });

    it("open/close cycle works correctly", () => {
      // Open
      useUiStore.getState().openSqlPanel("SELECT count(*) FROM orders");
      expect(useUiStore.getState().sqlPanelOpen).toBe(true);
      expect(useUiStore.getState().activeSqlContent).toBe("SELECT count(*) FROM orders");

      // Close
      useUiStore.getState().closeSqlPanel();
      expect(useUiStore.getState().sqlPanelOpen).toBe(false);
      expect(useUiStore.getState().activeSqlContent).toBeNull();

      // Re-open with different content
      useUiStore.getState().openSqlPanel("SELECT avg(price) FROM products");
      expect(useUiStore.getState().sqlPanelOpen).toBe(true);
      expect(useUiStore.getState().activeSqlContent).toBe("SELECT avg(price) FROM products");
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
    it("toggling left panel does not affect SQL panel", () => {
      useUiStore.getState().openSqlPanel("SELECT 1");
      useUiStore.getState().toggleLeftPanel();

      expect(useUiStore.getState().sqlPanelOpen).toBe(true);
      expect(useUiStore.getState().activeSqlContent).toBe("SELECT 1");
    });

    it("opening schema modal does not affect SQL panel", () => {
      useUiStore.getState().openSqlPanel("SELECT 1");
      useUiStore.getState().openSchemaModal("ds-1");

      expect(useUiStore.getState().sqlPanelOpen).toBe(true);
      expect(useUiStore.getState().activeSqlContent).toBe("SELECT 1");
      expect(useUiStore.getState().schemaModalDatasetId).toBe("ds-1");
    });
  });
});
