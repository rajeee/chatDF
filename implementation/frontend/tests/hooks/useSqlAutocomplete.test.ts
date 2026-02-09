// Tests for useSqlAutocomplete hook
// Covers: keyword suggestions, table name suggestions, column name suggestions,
// table.column prefix, FROM/JOIN context, case-insensitive matching, result cap,
// empty/short prefix, accept function.

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSqlAutocomplete, parseSchema, SQL_KEYWORDS } from "@/hooks/useSqlAutocomplete";
import { useChatStore } from "@/stores/chatStore";
import { useDatasetStore } from "@/stores/datasetStore";
import type { Dataset } from "@/stores/datasetStore";

// --- Test fixtures ---

const CONV_ID = "conv-1";

function makeDataset(overrides: Partial<Dataset> = {}): Dataset {
  return {
    id: "ds-1",
    conversation_id: CONV_ID,
    url: "https://example.com/data.csv",
    name: "users",
    row_count: 1000,
    column_count: 3,
    schema_json: JSON.stringify([
      { name: "id", type: "Int64" },
      { name: "name", type: "Utf8" },
      { name: "email", type: "Utf8" },
    ]),
    status: "ready",
    error_message: null,
    ...overrides,
  };
}

function makeOrdersDataset(): Dataset {
  return makeDataset({
    id: "ds-2",
    name: "orders",
    row_count: 5000,
    column_count: 4,
    schema_json: JSON.stringify([
      { name: "order_id", type: "Int64" },
      { name: "user_id", type: "Int64" },
      { name: "amount", type: "Float64" },
      { name: "status", type: "Utf8" },
    ]),
  });
}

// Dummy textarea element for handleInput
function makeDummyTextarea(): HTMLTextAreaElement {
  const el = document.createElement("textarea");
  document.body.appendChild(el);
  return el;
}

// --- Setup ---

beforeEach(() => {
  useChatStore.getState().reset();
  useDatasetStore.getState().reset();
});

// --- parseSchema ---

describe("parseSchema", () => {
  it("parses a JSON array of columns", () => {
    const schema = JSON.stringify([
      { name: "id", type: "Int64" },
      { name: "name", type: "Utf8" },
    ]);
    expect(parseSchema(schema)).toEqual([
      { name: "id", type: "Int64" },
      { name: "name", type: "Utf8" },
    ]);
  });

  it("parses an object with columns array", () => {
    const schema = JSON.stringify({ columns: [{ name: "col1", type: "Bool" }] });
    expect(parseSchema(schema)).toEqual([{ name: "col1", type: "Bool" }]);
  });

  it("returns empty array for invalid JSON", () => {
    expect(parseSchema("not json")).toEqual([]);
  });

  it("returns empty array for unexpected structure", () => {
    expect(parseSchema(JSON.stringify({ foo: "bar" }))).toEqual([]);
  });
});

// --- useSqlAutocomplete hook ---

describe("useSqlAutocomplete", () => {
  function setup(datasets: Dataset[] = [makeDataset()]) {
    useChatStore.setState({ activeConversationId: CONV_ID });
    useDatasetStore.setState({ datasets });
    const textarea = makeDummyTextarea();
    const hookResult = renderHook(() => useSqlAutocomplete());
    return { hookResult, textarea };
  }

  describe("keyword suggestions", () => {
    it("returns SQL keywords matching prefix", () => {
      const { hookResult, textarea } = setup([]);
      act(() => {
        hookResult.result.current.handleInput("SEL", 3, textarea);
      });
      const suggestions = hookResult.result.current.suggestions;
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some(s => s.text === "SELECT" && s.kind === "keyword")).toBe(true);
    });

    it("is case-insensitive for keywords", () => {
      const { hookResult, textarea } = setup([]);
      act(() => {
        hookResult.result.current.handleInput("sel", 3, textarea);
      });
      const suggestions = hookResult.result.current.suggestions;
      expect(suggestions.some(s => s.text === "SELECT")).toBe(true);
    });

    it("returns WHERE, WITH, WHEN for prefix W", () => {
      const { hookResult, textarea } = setup([]);
      act(() => {
        hookResult.result.current.handleInput("W", 1, textarea);
      });
      const kwSuggestions = hookResult.result.current.suggestions.filter(s => s.kind === "keyword");
      const kwTexts = kwSuggestions.map(s => s.text);
      expect(kwTexts).toContain("WHERE");
      expect(kwTexts).toContain("WITH");
      expect(kwTexts).toContain("WHEN");
    });
  });

  describe("table name suggestions", () => {
    it("returns table names from loaded datasets", () => {
      const { hookResult, textarea } = setup([makeDataset(), makeOrdersDataset()]);
      act(() => {
        hookResult.result.current.handleInput("SELECT * FROM u", 15, textarea);
      });
      const suggestions = hookResult.result.current.suggestions;
      expect(suggestions.some(s => s.text === "users" && s.kind === "table")).toBe(true);
    });

    it("includes row count in detail", () => {
      const { hookResult, textarea } = setup([makeDataset()]);
      act(() => {
        hookResult.result.current.handleInput("u", 1, textarea);
      });
      const tableSugg = hookResult.result.current.suggestions.find(s => s.kind === "table");
      expect(tableSugg).toBeDefined();
      expect(tableSugg!.detail).toContain("1,000");
    });

    it("after FROM, only suggests tables (no keywords)", () => {
      const { hookResult, textarea } = setup([makeDataset(), makeOrdersDataset()]);
      act(() => {
        hookResult.result.current.handleInput("SELECT * FROM o", 15, textarea);
      });
      const suggestions = hookResult.result.current.suggestions;
      expect(suggestions.some(s => s.text === "orders" && s.kind === "table")).toBe(true);
      // No keywords should be present
      expect(suggestions.filter(s => s.kind === "keyword")).toHaveLength(0);
    });

    it("after JOIN, only suggests tables", () => {
      const { hookResult, textarea } = setup([makeDataset(), makeOrdersDataset()]);
      act(() => {
        hookResult.result.current.handleInput("SELECT * FROM users JOIN o", 26, textarea);
      });
      const suggestions = hookResult.result.current.suggestions;
      expect(suggestions.some(s => s.text === "orders" && s.kind === "table")).toBe(true);
      expect(suggestions.filter(s => s.kind === "keyword")).toHaveLength(0);
    });

    it("does not suggest datasets from other conversations", () => {
      const otherDs = makeDataset({ id: "ds-other", conversation_id: "conv-other", name: "other_table" });
      const { hookResult, textarea } = setup([makeDataset(), otherDs]);
      act(() => {
        hookResult.result.current.handleInput("ot", 2, textarea);
      });
      const suggestions = hookResult.result.current.suggestions;
      expect(suggestions.some(s => s.text === "other_table")).toBe(false);
    });

    it("does not suggest datasets that are not ready", () => {
      const loadingDs = makeDataset({ id: "ds-loading", name: "loading_data", status: "loading" });
      const { hookResult, textarea } = setup([makeDataset(), loadingDs]);
      act(() => {
        hookResult.result.current.handleInput("lo", 2, textarea);
      });
      const suggestions = hookResult.result.current.suggestions;
      expect(suggestions.some(s => s.text === "loading_data")).toBe(false);
    });
  });

  describe("column name suggestions", () => {
    it("returns column names from dataset schemas", () => {
      const { hookResult, textarea } = setup([makeDataset()]);
      act(() => {
        hookResult.result.current.handleInput("SELECT na", 9, textarea);
      });
      const suggestions = hookResult.result.current.suggestions;
      expect(suggestions.some(s => s.text === "name" && s.kind === "column")).toBe(true);
    });

    it("includes column type and table name in detail", () => {
      const { hookResult, textarea } = setup([makeDataset()]);
      act(() => {
        hookResult.result.current.handleInput("SELECT na", 9, textarea);
      });
      const colSugg = hookResult.result.current.suggestions.find(
        s => s.text === "name" && s.kind === "column"
      );
      expect(colSugg).toBeDefined();
      expect(colSugg!.detail).toContain("Utf8");
      expect(colSugg!.detail).toContain("users");
    });

    it("avoids duplicate column names from multiple datasets", () => {
      // Both datasets have no overlapping column names in this case,
      // but if we add a dataset with same column name...
      const ds2 = makeDataset({
        id: "ds-dup",
        name: "profiles",
        schema_json: JSON.stringify([{ name: "name", type: "Utf8" }]),
      });
      const { hookResult, textarea } = setup([makeDataset(), ds2]);
      act(() => {
        hookResult.result.current.handleInput("na", 2, textarea);
      });
      const nameColumns = hookResult.result.current.suggestions.filter(
        s => s.text === "name" && s.kind === "column"
      );
      // Should only appear once (deduplication)
      expect(nameColumns).toHaveLength(1);
    });
  });

  describe("table.column prefix", () => {
    it("returns columns for a specific table when using dot notation", () => {
      const { hookResult, textarea } = setup([makeDataset(), makeOrdersDataset()]);
      act(() => {
        hookResult.result.current.handleInput("SELECT users.", 13, textarea);
      });
      const suggestions = hookResult.result.current.suggestions;
      expect(suggestions.length).toBe(3); // id, name, email
      expect(suggestions.every(s => s.kind === "column")).toBe(true);
      expect(suggestions.some(s => s.text === "id")).toBe(true);
      expect(suggestions.some(s => s.text === "name")).toBe(true);
      expect(suggestions.some(s => s.text === "email")).toBe(true);
    });

    it("filters columns by partial name after dot", () => {
      const { hookResult, textarea } = setup([makeDataset()]);
      act(() => {
        hookResult.result.current.handleInput("SELECT users.na", 15, textarea);
      });
      const suggestions = hookResult.result.current.suggestions;
      expect(suggestions.length).toBe(1);
      expect(suggestions[0].text).toBe("name");
      expect(suggestions[0].label).toBe("users.name");
    });

    it("shows column type in detail for dot notation", () => {
      const { hookResult, textarea } = setup([makeDataset()]);
      act(() => {
        hookResult.result.current.handleInput("SELECT users.id", 15, textarea);
      });
      const suggestions = hookResult.result.current.suggestions;
      expect(suggestions[0].detail).toBe("Int64");
    });

    it("returns no suggestions for unknown table with dot notation", () => {
      const { hookResult, textarea } = setup([makeDataset()]);
      act(() => {
        hookResult.result.current.handleInput("SELECT unknown.", 15, textarea);
      });
      expect(hookResult.result.current.suggestions).toHaveLength(0);
      expect(hookResult.result.current.isOpen).toBe(false);
    });
  });

  describe("result limiting and sorting", () => {
    it("limits results to 10", () => {
      // Create a dataset with many columns to potentially exceed 10
      const manyColumns = Array.from({ length: 15 }, (_, i) => ({
        name: `col_${String(i).padStart(2, "0")}`,
        type: "Utf8",
      }));
      const ds = makeDataset({
        schema_json: JSON.stringify(manyColumns),
      });
      const { hookResult, textarea } = setup([ds]);
      act(() => {
        hookResult.result.current.handleInput("col", 3, textarea);
      });
      expect(hookResult.result.current.suggestions.length).toBeLessThanOrEqual(10);
    });

    it("sorts tables before columns before keywords", () => {
      // "or" matches "orders" (table), "order_id" (column from orders), and "ORDER", "OR" (keywords)
      const { hookResult, textarea } = setup([makeDataset(), makeOrdersDataset()]);
      act(() => {
        hookResult.result.current.handleInput("SELECT or", 9, textarea);
      });
      const suggestions = hookResult.result.current.suggestions;
      expect(suggestions.length).toBeGreaterThan(0);

      // Find first occurrence of each kind
      const firstTable = suggestions.findIndex(s => s.kind === "table");
      const firstColumn = suggestions.findIndex(s => s.kind === "column");
      const firstKeyword = suggestions.findIndex(s => s.kind === "keyword");

      if (firstTable >= 0 && firstColumn >= 0) {
        expect(firstTable).toBeLessThan(firstColumn);
      }
      if (firstColumn >= 0 && firstKeyword >= 0) {
        expect(firstColumn).toBeLessThan(firstKeyword);
      }
    });
  });

  describe("empty/short prefix", () => {
    it("returns no results for empty prefix", () => {
      const { hookResult, textarea } = setup([makeDataset()]);
      act(() => {
        hookResult.result.current.handleInput("SELECT ", 7, textarea);
      });
      expect(hookResult.result.current.suggestions).toHaveLength(0);
      expect(hookResult.result.current.isOpen).toBe(false);
    });

    it("returns no results for just a space", () => {
      const { hookResult, textarea } = setup([makeDataset()]);
      act(() => {
        hookResult.result.current.handleInput(" ", 1, textarea);
      });
      expect(hookResult.result.current.suggestions).toHaveLength(0);
    });
  });

  describe("isOpen and selectedIndex state", () => {
    it("sets isOpen to true when there are suggestions", () => {
      const { hookResult, textarea } = setup();
      act(() => {
        hookResult.result.current.handleInput("SEL", 3, textarea);
      });
      expect(hookResult.result.current.isOpen).toBe(true);
    });

    it("sets isOpen to false when there are no suggestions", () => {
      const { hookResult, textarea } = setup();
      act(() => {
        hookResult.result.current.handleInput("zzz", 3, textarea);
      });
      expect(hookResult.result.current.isOpen).toBe(false);
    });

    it("resets selectedIndex to 0 on new input", () => {
      const { hookResult, textarea } = setup();
      // First input — produces multiple suggestions
      act(() => {
        hookResult.result.current.handleInput("S", 1, textarea);
      });
      expect(hookResult.result.current.suggestions.length).toBeGreaterThan(1);
      // Move selection down
      act(() => {
        hookResult.result.current.moveSelection(1);
      });
      expect(hookResult.result.current.selectedIndex).toBe(1);
      // New input resets selectedIndex
      act(() => {
        hookResult.result.current.handleInput("SE", 2, textarea);
      });
      expect(hookResult.result.current.selectedIndex).toBe(0);
    });
  });

  describe("moveSelection", () => {
    it("wraps around from last to first", () => {
      const { hookResult, textarea } = setup([]);
      act(() => {
        hookResult.result.current.handleInput("S", 1, textarea);
      });
      const count = hookResult.result.current.suggestions.length;
      expect(count).toBeGreaterThan(0);
      // Move to last
      for (let i = 0; i < count - 1; i++) {
        act(() => { hookResult.result.current.moveSelection(1); });
      }
      expect(hookResult.result.current.selectedIndex).toBe(count - 1);
      // One more wraps to 0
      act(() => { hookResult.result.current.moveSelection(1); });
      expect(hookResult.result.current.selectedIndex).toBe(0);
    });

    it("wraps around from first to last", () => {
      const { hookResult, textarea } = setup([]);
      act(() => {
        hookResult.result.current.handleInput("S", 1, textarea);
      });
      const count = hookResult.result.current.suggestions.length;
      // Move up from 0 should wrap to last
      act(() => { hookResult.result.current.moveSelection(-1); });
      expect(hookResult.result.current.selectedIndex).toBe(count - 1);
    });
  });

  describe("close", () => {
    it("closes the dropdown and clears suggestions", () => {
      const { hookResult, textarea } = setup();
      act(() => {
        hookResult.result.current.handleInput("SEL", 3, textarea);
      });
      expect(hookResult.result.current.isOpen).toBe(true);
      act(() => {
        hookResult.result.current.close();
      });
      expect(hookResult.result.current.isOpen).toBe(false);
      expect(hookResult.result.current.suggestions).toHaveLength(0);
      expect(hookResult.result.current.selectedIndex).toBe(0);
    });
  });

  describe("accept function", () => {
    it("replaces the current word with the suggestion text", () => {
      const { hookResult, textarea } = setup();
      act(() => {
        hookResult.result.current.handleInput("SEL", 3, textarea);
      });
      const result = hookResult.result.current.accept("SEL", 3, {
        text: "SELECT",
        label: "SELECT",
        kind: "keyword",
      });
      expect(result.newValue).toBe("SELECT");
      expect(result.newCursorPos).toBe(6);
    });

    it("preserves text before and after cursor when replacing", () => {
      const { hookResult, textarea } = setup();
      act(() => {
        hookResult.result.current.handleInput("SELECT na FROM users", 9, textarea);
      });
      const result = hookResult.result.current.accept("SELECT na FROM users", 9, {
        text: "name",
        label: "name",
        kind: "column",
      });
      expect(result.newValue).toBe("SELECT name FROM users");
      expect(result.newCursorPos).toBe(11);
    });

    it("replaces only the column part in table.column notation", () => {
      const { hookResult, textarea } = setup([makeDataset()]);
      act(() => {
        hookResult.result.current.handleInput("SELECT users.na", 15, textarea);
      });
      const result = hookResult.result.current.accept("SELECT users.na", 15, {
        text: "name",
        label: "users.name",
        kind: "column",
      });
      expect(result.newValue).toBe("SELECT users.name");
      expect(result.newCursorPos).toBe(17);
    });

    it("handles table completion for dot notation (replaces full word)", () => {
      const { hookResult, textarea } = setup([makeDataset()]);
      // If somehow a table suggestion appears (shouldn't in dot context, but test the logic)
      const result = hookResult.result.current.accept("SELECT us", 9, {
        text: "users",
        label: "users",
        kind: "table",
      });
      expect(result.newValue).toBe("SELECT users");
      expect(result.newCursorPos).toBe(12);
    });

    it("handles empty after cursor", () => {
      const { hookResult, textarea } = setup();
      act(() => {
        hookResult.result.current.handleInput("FROM u", 6, textarea);
      });
      const result = hookResult.result.current.accept("FROM u", 6, {
        text: "users",
        label: "users",
        kind: "table",
      });
      expect(result.newValue).toBe("FROM users");
      expect(result.newCursorPos).toBe(10);
    });
  });

  describe("case insensitive matching", () => {
    it("matches table names case-insensitively", () => {
      const { hookResult, textarea } = setup([makeDataset()]);
      act(() => {
        hookResult.result.current.handleInput("Us", 2, textarea);
      });
      expect(hookResult.result.current.suggestions.some(s => s.text === "users")).toBe(true);
    });

    it("matches column names case-insensitively", () => {
      const { hookResult, textarea } = setup([makeDataset()]);
      act(() => {
        hookResult.result.current.handleInput("Na", 2, textarea);
      });
      expect(hookResult.result.current.suggestions.some(
        s => s.text === "name" && s.kind === "column"
      )).toBe(true);
    });

    it("matches table name in dot notation case-insensitively", () => {
      const { hookResult, textarea } = setup([makeDataset()]);
      act(() => {
        hookResult.result.current.handleInput("Users.", 6, textarea);
      });
      // Should find the "users" dataset and return its columns
      expect(hookResult.result.current.suggestions.length).toBe(3);
      expect(hookResult.result.current.suggestions.every(s => s.kind === "column")).toBe(true);
    });
  });
});
