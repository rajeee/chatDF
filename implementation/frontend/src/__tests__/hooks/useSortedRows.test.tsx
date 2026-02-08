import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSortedRows } from "@/hooks/useSortedRows";

describe("useSortedRows", () => {
  const columns = ["name", "age", "city"];
  const rows = [
    { name: "Alice", age: 30, city: "NYC" },
    { name: "Bob", age: 25, city: "LA" },
    { name: "Charlie", age: 35, city: "Chicago" },
  ];

  it("should return unsorted rows initially", () => {
    const { result } = renderHook(() => useSortedRows(rows, columns));
    expect(result.current.sortedRows).toEqual(rows);
    expect(result.current.sortKeys).toEqual([]);
  });

  it("should sort rows ascending by column", () => {
    const { result } = renderHook(() => useSortedRows(rows, columns));

    act(() => {
      result.current.toggleSort(1); // Sort by age (index 1)
    });

    expect(result.current.sortedRows).toEqual([
      { name: "Bob", age: 25, city: "LA" },
      { name: "Alice", age: 30, city: "NYC" },
      { name: "Charlie", age: 35, city: "Chicago" },
    ]);
    expect(result.current.sortKeys).toEqual([{ colIdx: 1, dir: "asc" }]);
  });

  it("should toggle sort direction on second click", () => {
    const { result } = renderHook(() => useSortedRows(rows, columns));

    act(() => {
      result.current.toggleSort(1); // Sort ascending
    });

    act(() => {
      result.current.toggleSort(1); // Toggle to descending
    });

    expect(result.current.sortedRows).toEqual([
      { name: "Charlie", age: 35, city: "Chicago" },
      { name: "Alice", age: 30, city: "NYC" },
      { name: "Bob", age: 25, city: "LA" },
    ]);
    expect(result.current.sortKeys).toEqual([{ colIdx: 1, dir: "desc" }]);
  });

  it("should handle null values correctly", () => {
    const rowsWithNull = [
      { name: "Alice", age: 30, city: "NYC" },
      { name: "Bob", age: null, city: "LA" },
      { name: "Charlie", age: 25, city: "Chicago" },
    ];

    const { result } = renderHook(() => useSortedRows(rowsWithNull, columns));

    act(() => {
      result.current.toggleSort(1); // Sort by age
    });

    // Null values should sort to the end
    expect(result.current.sortedRows[2]).toEqual({ name: "Bob", age: null, city: "LA" });
  });

  it("should clear sort", () => {
    const { result } = renderHook(() => useSortedRows(rows, columns));

    act(() => {
      result.current.toggleSort(1);
    });

    act(() => {
      result.current.clearSort();
    });

    expect(result.current.sortKeys).toEqual([]);
    expect(result.current.sortedRows).toEqual(rows);
  });

  it("should handle multi-key sorting", () => {
    const rowsMulti = [
      { name: "Alice", age: 30, city: "NYC" },
      { name: "Bob", age: 30, city: "LA" },
      { name: "Charlie", age: 25, city: "Chicago" },
    ];

    const { result } = renderHook(() => useSortedRows(rowsMulti, columns));

    act(() => {
      result.current.toggleSort(1); // Primary: age
    });

    act(() => {
      result.current.toggleSort(0); // Secondary: name
    });

    // Name becomes primary key, age becomes secondary
    expect(result.current.sortKeys).toEqual([
      { colIdx: 0, dir: "asc" },
      { colIdx: 1, dir: "asc" },
    ]);
  });
});
