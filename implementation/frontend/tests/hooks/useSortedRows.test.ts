// Tests for useSortedRows hook
// Covers: default (no sort), ascending/descending sort, toggle direction,
// multi-key sorting, promote secondary key, clearSort, null handling,
// object rows, array rows, empty rows, numeric string comparison.

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSortedRows } from "@/hooks/useSortedRows";
import type { SortKey } from "@/hooks/useSortedRows";

// --- Test fixtures ---

/** Array-based rows: each row is [name, age, city] */
const COLUMNS = ["name", "age", "city"];

const ARRAY_ROWS = [
  ["Charlie", 30, "Boston"],
  ["Alice", 25, "Denver"],
  ["Bob", 35, "Atlanta"],
];

/** Object-based rows keyed by column name */
const OBJECT_ROWS = [
  { name: "Charlie", age: 30, city: "Boston" },
  { name: "Alice", age: 25, city: "Denver" },
  { name: "Bob", age: 35, city: "Atlanta" },
];

/** Rows with null values for null-handling tests */
const ROWS_WITH_NULLS = [
  ["Charlie", 30, "Boston"],
  ["Alice", null, "Denver"],
  [null, 25, null],
  ["Bob", null, "Atlanta"],
];

/** Rows with numeric strings for localeCompare numeric test */
const NUMERIC_STRING_ROWS = [
  ["file2", 1],
  ["file10", 2],
  ["file1", 3],
  ["file20", 4],
  ["file3", 5],
];

const NUMERIC_STRING_COLUMNS = ["filename", "id"];

// --- Tests ---

describe("useSortedRows hook", () => {
  // 1. Returns original rows when no sort keys
  describe("no sort keys (default state)", () => {
    it("returns the original rows reference when no sort is applied", () => {
      const { result } = renderHook(() => useSortedRows(ARRAY_ROWS, COLUMNS));

      expect(result.current.sortKeys).toEqual([]);
      // Should be the exact same reference, not a copy
      expect(result.current.sortedRows).toBe(ARRAY_ROWS);
    });

    it("returns the original empty array reference when rows are empty", () => {
      const emptyRows: unknown[] = [];
      const { result } = renderHook(() => useSortedRows(emptyRows, COLUMNS));

      expect(result.current.sortedRows).toBe(emptyRows);
      expect(result.current.sortedRows).toHaveLength(0);
    });
  });

  // 2. Sort ascending by a numeric column
  describe("sort ascending by numeric column", () => {
    it("sorts array rows by age ascending", () => {
      const { result } = renderHook(() => useSortedRows(ARRAY_ROWS, COLUMNS));

      act(() => {
        result.current.toggleSort(1); // age column, asc
      });

      expect(result.current.sortKeys).toEqual([{ colIdx: 1, dir: "asc" }]);
      expect(result.current.sortedRows).toEqual([
        ["Alice", 25, "Denver"],
        ["Charlie", 30, "Boston"],
        ["Bob", 35, "Atlanta"],
      ]);
    });

    it("does not mutate the original rows array", () => {
      const rows = [...ARRAY_ROWS];
      const { result } = renderHook(() => useSortedRows(rows, COLUMNS));

      act(() => {
        result.current.toggleSort(1);
      });

      // Original should be unchanged
      expect(rows[0]).toEqual(["Charlie", 30, "Boston"]);
      expect(rows[1]).toEqual(["Alice", 25, "Denver"]);
      expect(rows[2]).toEqual(["Bob", 35, "Atlanta"]);
    });
  });

  // 3. Sort descending by a string column
  describe("sort descending by string column", () => {
    it("sorts by name descending after two toggles on same column", () => {
      const { result } = renderHook(() => useSortedRows(ARRAY_ROWS, COLUMNS));

      act(() => {
        result.current.toggleSort(0); // name asc
      });
      act(() => {
        result.current.toggleSort(0); // name desc
      });

      expect(result.current.sortKeys).toEqual([{ colIdx: 0, dir: "desc" }]);
      expect(result.current.sortedRows).toEqual([
        ["Charlie", 30, "Boston"],
        ["Bob", 35, "Atlanta"],
        ["Alice", 25, "Denver"],
      ]);
    });
  });

  // 4. Toggle sort direction (click same column twice)
  describe("toggle sort direction", () => {
    it("toggles from asc to desc on the primary sort key", () => {
      const { result } = renderHook(() => useSortedRows(ARRAY_ROWS, COLUMNS));

      act(() => {
        result.current.toggleSort(2); // city asc
      });
      expect(result.current.sortKeys[0]).toEqual({ colIdx: 2, dir: "asc" });

      act(() => {
        result.current.toggleSort(2); // city desc
      });
      expect(result.current.sortKeys[0]).toEqual({ colIdx: 2, dir: "desc" });
    });

    it("toggles from desc back to asc on the primary sort key", () => {
      const { result } = renderHook(() => useSortedRows(ARRAY_ROWS, COLUMNS));

      act(() => {
        result.current.toggleSort(0); // asc
      });
      act(() => {
        result.current.toggleSort(0); // desc
      });
      act(() => {
        result.current.toggleSort(0); // asc again
      });
      expect(result.current.sortKeys[0]).toEqual({ colIdx: 0, dir: "asc" });
    });

    it("produces correctly sorted rows after toggle", () => {
      const { result } = renderHook(() => useSortedRows(ARRAY_ROWS, COLUMNS));

      // Sort city ascending: Atlanta, Boston, Denver
      act(() => {
        result.current.toggleSort(2);
      });
      expect(result.current.sortedRows.map((r) => (r as string[])[2])).toEqual([
        "Atlanta",
        "Boston",
        "Denver",
      ]);

      // Toggle to descending: Denver, Boston, Atlanta
      act(() => {
        result.current.toggleSort(2);
      });
      expect(result.current.sortedRows.map((r) => (r as string[])[2])).toEqual([
        "Denver",
        "Boston",
        "Atlanta",
      ]);
    });
  });

  // 5. Multi-key sorting (primary + secondary)
  describe("multi-key sorting", () => {
    it("applies secondary sort when primary values are equal", () => {
      const rows = [
        ["Alice", 30, "Boston"],
        ["Bob", 25, "Denver"],
        ["Charlie", 30, "Atlanta"],
        ["Dave", 25, "Boston"],
      ];

      const { result } = renderHook(() => useSortedRows(rows, COLUMNS));

      // First sort by age (becomes secondary after next toggle)
      act(() => {
        result.current.toggleSort(1); // age asc
      });
      // Then sort by name (becomes primary)
      act(() => {
        result.current.toggleSort(0); // name asc (primary), age asc (secondary)
      });

      expect(result.current.sortKeys).toEqual([
        { colIdx: 0, dir: "asc" },
        { colIdx: 1, dir: "asc" },
      ]);

      // Primary sort is name ascending: Alice, Bob, Charlie, Dave
      expect(result.current.sortedRows.map((r) => (r as string[])[0])).toEqual([
        "Alice",
        "Bob",
        "Charlie",
        "Dave",
      ]);
    });

    it("breaks ties using secondary key", () => {
      const rows = [
        ["Alice", 30, "Denver"],
        ["Alice", 25, "Boston"],
        ["Bob", 30, "Atlanta"],
        ["Bob", 25, "Chicago"],
      ];

      const { result } = renderHook(() => useSortedRows(rows, COLUMNS));

      // Sort by age first (will become secondary)
      act(() => {
        result.current.toggleSort(1); // age asc
      });
      // Then by name (becomes primary)
      act(() => {
        result.current.toggleSort(0); // name asc (primary), age asc (secondary)
      });

      // Alice(25), Alice(30), Bob(25), Bob(30)
      const sorted = result.current.sortedRows as unknown[][];
      expect(sorted[0]).toEqual(["Alice", 25, "Boston"]);
      expect(sorted[1]).toEqual(["Alice", 30, "Denver"]);
      expect(sorted[2]).toEqual(["Bob", 25, "Chicago"]);
      expect(sorted[3]).toEqual(["Bob", 30, "Atlanta"]);
    });
  });

  // 6. Moving a secondary key to primary
  describe("promote secondary key to primary", () => {
    it("moves a secondary sort key to primary position", () => {
      const { result } = renderHook(() => useSortedRows(ARRAY_ROWS, COLUMNS));

      // Add name as primary, then age as primary (name becomes secondary)
      act(() => {
        result.current.toggleSort(0); // name asc
      });
      act(() => {
        result.current.toggleSort(1); // age asc (primary), name asc (secondary)
      });

      expect(result.current.sortKeys).toEqual([
        { colIdx: 1, dir: "asc" },
        { colIdx: 0, dir: "asc" },
      ]);

      // Now toggle name (currently secondary at index 1) to make it primary
      act(() => {
        result.current.toggleSort(0); // name moves to front
      });

      expect(result.current.sortKeys).toEqual([
        { colIdx: 0, dir: "asc" },
        { colIdx: 1, dir: "asc" },
      ]);
    });

    it("preserves the direction of the promoted key", () => {
      const rows = [
        ["Alice", 30, "Boston"],
        ["Bob", 25, "Denver"],
        ["Charlie", 35, "Atlanta"],
      ];

      const { result } = renderHook(() => useSortedRows(rows, COLUMNS));

      // Add city asc
      act(() => {
        result.current.toggleSort(2); // city asc
      });
      // Add name asc (becomes primary, city is secondary)
      act(() => {
        result.current.toggleSort(0); // name asc (primary), city asc (secondary)
      });

      // Promote city (secondary) to primary - keeps its "asc" direction
      act(() => {
        result.current.toggleSort(2);
      });

      expect(result.current.sortKeys[0]).toEqual({ colIdx: 2, dir: "asc" });
      // Name should still be in the list
      expect(result.current.sortKeys[1]).toEqual({ colIdx: 0, dir: "asc" });
    });
  });

  // 7. clearSort resets to original order
  describe("clearSort", () => {
    it("resets sort keys and returns original rows reference", () => {
      const { result } = renderHook(() => useSortedRows(ARRAY_ROWS, COLUMNS));

      act(() => {
        result.current.toggleSort(0);
      });
      expect(result.current.sortKeys.length).toBeGreaterThan(0);
      expect(result.current.sortedRows).not.toBe(ARRAY_ROWS);

      act(() => {
        result.current.clearSort();
      });

      expect(result.current.sortKeys).toEqual([]);
      expect(result.current.sortedRows).toBe(ARRAY_ROWS);
    });

    it("clearSort after multiple sort operations", () => {
      const { result } = renderHook(() => useSortedRows(ARRAY_ROWS, COLUMNS));

      act(() => {
        result.current.toggleSort(0);
      });
      act(() => {
        result.current.toggleSort(1);
      });
      act(() => {
        result.current.toggleSort(0); // toggle direction
      });

      expect(result.current.sortKeys.length).toBe(2);

      act(() => {
        result.current.clearSort();
      });

      expect(result.current.sortKeys).toEqual([]);
      expect(result.current.sortedRows).toBe(ARRAY_ROWS);
    });
  });

  // 8. Null values sort to the end
  describe("null values sort last", () => {
    it("pushes null values to the end when sorting ascending", () => {
      const { result } = renderHook(() => useSortedRows(ROWS_WITH_NULLS, COLUMNS));

      // Sort by name ascending (colIdx 0)
      act(() => {
        result.current.toggleSort(0);
      });

      const names = result.current.sortedRows.map((r) => (r as unknown[])[0]);
      // Non-null values sorted, null at end
      expect(names).toEqual(["Alice", "Bob", "Charlie", null]);
    });

    it("puts null values first when sorting descending (compareValues negation)", () => {
      const { result } = renderHook(() => useSortedRows(ROWS_WITH_NULLS, COLUMNS));

      // Sort by name descending
      act(() => {
        result.current.toggleSort(0); // asc
      });
      act(() => {
        result.current.toggleSort(0); // desc
      });

      const names = result.current.sortedRows.map((r) => (r as unknown[])[0]);
      // In descending mode, the comparator negates cmp.
      // compareValues(null, x) returns 1 -> negated to -1 -> null sorts first.
      expect(names).toEqual([null, "Charlie", "Bob", "Alice"]);
    });

    it("pushes null values to the end for numeric column", () => {
      const { result } = renderHook(() => useSortedRows(ROWS_WITH_NULLS, COLUMNS));

      // Sort by age ascending (colIdx 1)
      act(() => {
        result.current.toggleSort(1);
      });

      const ages = result.current.sortedRows.map((r) => (r as unknown[])[1]);
      // Non-null ages sorted, nulls at end
      expect(ages).toEqual([25, 30, null, null]);
    });
  });

  // 9. Mixed null/non-null values
  describe("mixed null and non-null values", () => {
    it("correctly handles rows where all values in the sort column are null", () => {
      const rows = [
        [null, 1],
        [null, 2],
        [null, 3],
      ];
      const cols = ["name", "id"];

      const { result } = renderHook(() => useSortedRows(rows, cols));

      act(() => {
        result.current.toggleSort(0); // sort by name
      });

      // All nulls are equal, so order is stable (implementation uses Array.sort)
      expect(result.current.sortedRows).toHaveLength(3);
      // All name values should still be null
      result.current.sortedRows.forEach((r) => {
        expect((r as unknown[])[0]).toBeNull();
      });
    });

    it("sorts non-null values correctly while grouping nulls at end", () => {
      const rows = [
        [null, 1],
        ["Banana", 2],
        [null, 3],
        ["Apple", 4],
        ["Cherry", 5],
      ];
      const cols = ["fruit", "id"];

      const { result } = renderHook(() => useSortedRows(rows, cols));

      act(() => {
        result.current.toggleSort(0); // sort by fruit asc
      });

      const fruits = result.current.sortedRows.map((r) => (r as unknown[])[0]);
      expect(fruits).toEqual(["Apple", "Banana", "Cherry", null, null]);
    });

    it("handles null in both ascending and descending for mixed data", () => {
      const rows = [
        ["Zebra", null],
        [null, 10],
        ["Apple", 5],
      ];
      const cols = ["name", "score"];

      const { result } = renderHook(() => useSortedRows(rows, cols));

      // Sort by score ascending
      act(() => {
        result.current.toggleSort(1);
      });
      const scoresAsc = result.current.sortedRows.map((r) => (r as unknown[])[1]);
      expect(scoresAsc).toEqual([5, 10, null]);

      // Toggle to descending
      act(() => {
        result.current.toggleSort(1);
      });
      const scoresDesc = result.current.sortedRows.map((r) => (r as unknown[])[1]);
      // In descending, null comparisons are negated so null sorts first
      expect(scoresDesc).toEqual([null, 10, 5]);
    });
  });

  // 10. Object rows (keyed by column name)
  describe("object rows", () => {
    it("sorts object rows by string column ascending", () => {
      const { result } = renderHook(() => useSortedRows(OBJECT_ROWS, COLUMNS));

      act(() => {
        result.current.toggleSort(0); // name asc
      });

      const names = result.current.sortedRows.map(
        (r) => (r as Record<string, unknown>).name
      );
      expect(names).toEqual(["Alice", "Bob", "Charlie"]);
    });

    it("sorts object rows by numeric column descending", () => {
      const { result } = renderHook(() => useSortedRows(OBJECT_ROWS, COLUMNS));

      act(() => {
        result.current.toggleSort(1); // age asc
      });
      act(() => {
        result.current.toggleSort(1); // age desc
      });

      const ages = result.current.sortedRows.map(
        (r) => (r as Record<string, unknown>).age
      );
      expect(ages).toEqual([35, 30, 25]);
    });

    it("supports multi-key sorting on object rows", () => {
      const rows = [
        { name: "Alice", age: 30, city: "Boston" },
        { name: "Alice", age: 25, city: "Denver" },
        { name: "Bob", age: 30, city: "Atlanta" },
      ];

      const { result } = renderHook(() => useSortedRows(rows, COLUMNS));

      // Secondary: age asc
      act(() => {
        result.current.toggleSort(1);
      });
      // Primary: name asc
      act(() => {
        result.current.toggleSort(0);
      });

      const sorted = result.current.sortedRows as Record<string, unknown>[];
      expect(sorted[0]).toEqual({ name: "Alice", age: 25, city: "Denver" });
      expect(sorted[1]).toEqual({ name: "Alice", age: 30, city: "Boston" });
      expect(sorted[2]).toEqual({ name: "Bob", age: 30, city: "Atlanta" });
    });
  });

  // 11. Array rows (indexed by position)
  describe("array rows", () => {
    it("sorts array rows by the correct column index", () => {
      const { result } = renderHook(() => useSortedRows(ARRAY_ROWS, COLUMNS));

      // Sort by city (colIdx 2) ascending
      act(() => {
        result.current.toggleSort(2);
      });

      const cities = result.current.sortedRows.map((r) => (r as unknown[])[2]);
      expect(cities).toEqual(["Atlanta", "Boston", "Denver"]);
    });

    it("correctly extracts values from array rows at different indices", () => {
      const rows = [
        [3, "c", true],
        [1, "a", false],
        [2, "b", true],
      ];
      const cols = ["num", "letter", "flag"];

      const { result } = renderHook(() => useSortedRows(rows, cols));

      // Sort by num (index 0)
      act(() => {
        result.current.toggleSort(0);
      });

      expect(result.current.sortedRows).toEqual([
        [1, "a", false],
        [2, "b", true],
        [3, "c", true],
      ]);
    });
  });

  // 12. Empty rows array
  describe("empty rows array", () => {
    it("returns empty array when rows are empty and no sort", () => {
      const { result } = renderHook(() => useSortedRows([], COLUMNS));

      expect(result.current.sortedRows).toEqual([]);
      expect(result.current.sortKeys).toEqual([]);
    });

    it("returns empty array when rows are empty and sort is applied", () => {
      const { result } = renderHook(() => useSortedRows([], COLUMNS));

      act(() => {
        result.current.toggleSort(0);
      });

      expect(result.current.sortedRows).toEqual([]);
      expect(result.current.sortKeys).toEqual([{ colIdx: 0, dir: "asc" }]);
    });
  });

  // 13. Numeric string comparison with localeCompare numeric
  describe("numeric string comparison (localeCompare with numeric option)", () => {
    it("sorts numeric strings in natural order (file1, file2, file3, file10, file20)", () => {
      const { result } = renderHook(() =>
        useSortedRows(NUMERIC_STRING_ROWS, NUMERIC_STRING_COLUMNS)
      );

      act(() => {
        result.current.toggleSort(0); // filename asc
      });

      const filenames = result.current.sortedRows.map((r) => (r as unknown[])[0]);
      expect(filenames).toEqual(["file1", "file2", "file3", "file10", "file20"]);
    });

    it("sorts numeric strings in reverse natural order when descending", () => {
      const { result } = renderHook(() =>
        useSortedRows(NUMERIC_STRING_ROWS, NUMERIC_STRING_COLUMNS)
      );

      act(() => {
        result.current.toggleSort(0); // asc
      });
      act(() => {
        result.current.toggleSort(0); // desc
      });

      const filenames = result.current.sortedRows.map((r) => (r as unknown[])[0]);
      expect(filenames).toEqual(["file20", "file10", "file3", "file2", "file1"]);
    });

    it("handles pure numeric strings compared as strings using localeCompare", () => {
      const rows = [
        ["100", "x"],
        ["20", "y"],
        ["3", "z"],
        ["50", "w"],
      ];
      const cols = ["value", "label"];

      const { result } = renderHook(() => useSortedRows(rows, cols));

      act(() => {
        result.current.toggleSort(0); // value asc
      });

      const values = result.current.sortedRows.map((r) => (r as unknown[])[0]);
      // localeCompare with numeric:true sorts "3" < "20" < "50" < "100"
      expect(values).toEqual(["3", "20", "50", "100"]);
    });
  });

  // Additional edge cases
  describe("edge cases", () => {
    it("handles single-row array", () => {
      const rows = [["Only", 1, "Row"]];
      const { result } = renderHook(() => useSortedRows(rows, COLUMNS));

      act(() => {
        result.current.toggleSort(0);
      });

      expect(result.current.sortedRows).toEqual([["Only", 1, "Row"]]);
    });

    it("handles non-object, non-array row values gracefully", () => {
      // cellValueRaw returns null for primitive rows
      const rows = ["string_row", 42, true];
      const cols = ["col1"];

      const { result } = renderHook(() => useSortedRows(rows, cols));

      act(() => {
        result.current.toggleSort(0);
      });

      // All return null from cellValueRaw, so all compare equal
      expect(result.current.sortedRows).toHaveLength(3);
    });

    it("memoizes sortedRows when inputs do not change", () => {
      const { result, rerender } = renderHook(() =>
        useSortedRows(ARRAY_ROWS, COLUMNS)
      );

      act(() => {
        result.current.toggleSort(0);
      });

      const firstSorted = result.current.sortedRows;
      rerender();
      const secondSorted = result.current.sortedRows;

      // Same reference due to useMemo
      expect(firstSorted).toBe(secondSorted);
    });

    it("recalculates sortedRows when rows reference changes", () => {
      let rows = [["A", 1], ["B", 2]];
      const cols = ["name", "id"];

      const { result, rerender } = renderHook(
        ({ r, c }) => useSortedRows(r, c),
        { initialProps: { r: rows as unknown[], c: cols } }
      );

      act(() => {
        result.current.toggleSort(0);
      });

      const firstSorted = result.current.sortedRows;

      // Provide new rows reference
      const newRows = [["C", 3], ["A", 1]];
      rerender({ r: newRows as unknown[], c: cols });

      const secondSorted = result.current.sortedRows;
      expect(firstSorted).not.toBe(secondSorted);
      expect(secondSorted.map((r) => (r as unknown[])[0])).toEqual(["A", "C"]);
    });

    it("handles undefined column values in object rows", () => {
      const rows = [
        { name: "Alice" },
        { name: "Bob", age: 25 },
        { name: "Charlie", age: 30 },
      ];
      const cols = ["name", "age"];

      const { result } = renderHook(() => useSortedRows(rows, cols));

      act(() => {
        result.current.toggleSort(1); // age asc
      });

      const ages = result.current.sortedRows.map(
        (r) => (r as Record<string, unknown>).age
      );
      // undefined treated as null -> sorts last
      expect(ages).toEqual([25, 30, undefined]);
    });
  });
});
