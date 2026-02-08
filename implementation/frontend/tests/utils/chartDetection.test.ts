import { describe, it, expect } from "vitest";
import {
  analyzeColumns,
  detectChartTypes,
  getDefaultChart,
} from "@/utils/chartDetection";

describe("analyzeColumns", () => {
  it("identifies numeric columns", () => {
    const columns = ["name", "score", "rank"];
    const rows = [
      ["Alice", 90, 1],
      ["Bob", 85, 2],
      ["Carol", 78, 3],
    ];
    const analysis = analyzeColumns(columns, rows);
    expect(analysis[0].isNumeric).toBe(false);
    expect(analysis[1].isNumeric).toBe(true);
    expect(analysis[2].isNumeric).toBe(true);
  });

  it("identifies date columns", () => {
    const columns = ["date", "value"];
    const rows = [
      ["2024-01-15", 100],
      ["2024-02-20", 200],
      ["2024-03-10", 300],
    ];
    const analysis = analyzeColumns(columns, rows);
    expect(analysis[0].isDate).toBe(true);
    expect(analysis[0].isNumeric).toBe(false);
    expect(analysis[1].isNumeric).toBe(true);
  });

  it("identifies year-only values as dates", () => {
    const columns = ["year", "count"];
    const rows = [
      ["2020", 10],
      ["2021", 20],
      ["2022", 30],
    ];
    const analysis = analyzeColumns(columns, rows);
    expect(analysis[0].isDate).toBe(true);
  });

  it("counts unique values for cardinality", () => {
    const columns = ["category"];
    const rows = [["A"], ["B"], ["A"], ["C"], ["B"]];
    const analysis = analyzeColumns(columns, rows);
    expect(analysis[0].uniqueCount).toBe(3);
  });

  it("handles null values gracefully", () => {
    const columns = ["val"];
    const rows = [[null], [42], [null], [10]];
    const analysis = analyzeColumns(columns, rows);
    expect(analysis[0].isNumeric).toBe(true);
  });

  it("handles empty rows", () => {
    const columns = ["a", "b"];
    const analysis = analyzeColumns(columns, []);
    expect(analysis).toHaveLength(2);
    expect(analysis[0].isNumeric).toBe(false);
    expect(analysis[0].isDate).toBe(false);
  });

  it("handles string numbers as numeric", () => {
    const columns = ["amount"];
    const rows = [["100.5"], ["200"], ["300.25"]];
    const analysis = analyzeColumns(columns, rows);
    expect(analysis[0].isNumeric).toBe(true);
  });
});

describe("detectChartTypes", () => {
  it("returns empty for empty data", () => {
    expect(detectChartTypes([], [])).toEqual([]);
    expect(detectChartTypes(["col1"], [])).toEqual([]);
  });

  it("recommends bar chart for categorical + numeric", () => {
    const columns = ["city", "population"];
    const rows = [
      ["NYC", 8000000],
      ["LA", 4000000],
      ["Chicago", 2700000],
    ];
    const recs = detectChartTypes(columns, rows);
    const bar = recs.find((r) => r.type === "bar");
    expect(bar).toBeDefined();
    expect(bar!.xCol).toBe(0);
    expect(bar!.yCols).toContain(1);
  });

  it("recommends line chart for date + numeric", () => {
    const columns = ["date", "revenue"];
    const rows = [
      ["2024-01-01", 1000],
      ["2024-02-01", 1500],
      ["2024-03-01", 2000],
    ];
    const recs = detectChartTypes(columns, rows);
    const line = recs.find((r) => r.type === "line");
    expect(line).toBeDefined();
    expect(line!.xCol).toBe(0);
    expect(line!.yCols).toContain(1);
  });

  it("recommends scatter for two numeric columns", () => {
    const columns = ["height", "weight"];
    const rows = [
      [170, 65],
      [180, 80],
      [160, 55],
    ];
    const recs = detectChartTypes(columns, rows);
    const scatter = recs.find((r) => r.type === "scatter");
    expect(scatter).toBeDefined();
    expect(scatter!.xCol).toBe(0);
    expect(scatter!.yCols).toEqual([1]);
  });

  it("recommends histogram for single numeric column", () => {
    const columns = ["score"];
    const rows = [[10], [20], [30], [40], [50]];
    const recs = detectChartTypes(columns, rows);
    const hist = recs.find((r) => r.type === "histogram");
    expect(hist).toBeDefined();
  });

  it("recommends pie chart for low-cardinality categorical", () => {
    const columns = ["status", "count"];
    const rows = [
      ["active", 50],
      ["inactive", 30],
      ["pending", 20],
    ];
    const recs = detectChartTypes(columns, rows);
    const pie = recs.find((r) => r.type === "pie");
    expect(pie).toBeDefined();
    expect(pie!.xCol).toBe(0);
    expect(pie!.yCols).toEqual([1]);
  });

  it("does NOT recommend pie for high-cardinality categorical", () => {
    const columns = ["name", "value"];
    const rows = Array.from({ length: 20 }, (_, i) => [`item_${i}`, i * 10]);
    const recs = detectChartTypes(columns, rows);
    const pie = recs.find((r) => r.type === "pie");
    expect(pie).toBeUndefined();
  });

  it("recommends box plot for numeric columns", () => {
    const columns = ["score"];
    const rows = [[10], [20], [30], [40], [50]];
    const recs = detectChartTypes(columns, rows);
    const box = recs.find((r) => r.type === "box");
    expect(box).toBeDefined();
  });

  it("handles multiple numeric columns with grouped bar", () => {
    const columns = ["region", "q1_sales", "q2_sales"];
    const rows = [
      ["East", 100, 150],
      ["West", 200, 250],
      ["North", 80, 120],
    ];
    const recs = detectChartTypes(columns, rows);
    const bar = recs.find((r) => r.type === "bar");
    expect(bar).toBeDefined();
    expect(bar!.yCols).toHaveLength(2);
    expect(bar!.yCols).toContain(1);
    expect(bar!.yCols).toContain(2);
  });

  it("prefers line chart over bar for time series data", () => {
    const columns = ["date", "value"];
    const rows = [
      ["2024-01-01", 10],
      ["2024-02-01", 20],
      ["2024-03-01", 30],
    ];
    const recs = detectChartTypes(columns, rows);
    // Line should be first recommendation for time series
    expect(recs[0].type).toBe("line");
  });
});

describe("getDefaultChart", () => {
  it("returns the first recommendation", () => {
    const columns = ["city", "pop"];
    const rows = [
      ["NYC", 8000000],
      ["LA", 4000000],
    ];
    const def = getDefaultChart(columns, rows);
    expect(def).toBeDefined();
    expect(def!.type).toBe("bar");
  });

  it("returns null for non-visualizable data", () => {
    const columns = ["name", "description"];
    const rows = [
      ["Alice", "Some text here"],
      ["Bob", "More text here"],
    ];
    const def = getDefaultChart(columns, rows);
    expect(def).toBeNull();
  });

  it("returns null for empty data", () => {
    expect(getDefaultChart([], [])).toBeNull();
  });
});
