/**
 * Auto-detect the best chart type from SQL result data shape.
 *
 * Heuristics:
 * - 1 numeric column only → histogram
 * - 1 categorical + 1 numeric → bar chart
 * - 1 date/time + 1+ numeric → line chart
 * - 2 numeric columns → scatter plot
 * - 1 categorical + multiple numeric → grouped bar
 * - 1 categorical with small cardinality (≤8) + 1 numeric → pie chart candidate
 */

import { cellValueRaw } from "./tableUtils";

export type ChartType = "bar" | "line" | "scatter" | "histogram" | "pie" | "box" | "heatmap" | "choropleth";

export interface ChartRecommendation {
  type: ChartType;
  label: string;
  xCol: number | null;    // column index for x-axis
  yCols: number[];         // column indices for y-axis (can be multiple series)
  zCol?: number | null;    // column index for z values (heatmap)
  locationCol?: number | null;  // column index for geographic locations (choropleth)
}

/** Check if a value looks numeric */
function isNumericValue(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "number") return true;
  if (typeof v === "string") {
    const trimmed = v.trim();
    return trimmed !== "" && !isNaN(Number(trimmed));
  }
  return false;
}

/** Check if a value looks like a date/time */
function isDateValue(v: unknown): boolean {
  if (v == null) return false;
  const s = String(v).trim();
  // ISO dates, YYYY-MM-DD, YYYY/MM/DD, common date patterns
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(s)) return true;
  // Year-only (4 digits, reasonable range)
  if (/^\d{4}$/.test(s)) {
    const n = Number(s);
    return n >= 1900 && n <= 2100;
  }
  return false;
}

const US_STATE_NAMES = new Set([
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado",
  "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho",
  "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana",
  "maine", "maryland", "massachusetts", "michigan", "minnesota",
  "mississippi", "missouri", "montana", "nebraska", "nevada",
  "new hampshire", "new jersey", "new mexico", "new york",
  "north carolina", "north dakota", "ohio", "oklahoma", "oregon",
  "pennsylvania", "rhode island", "south carolina", "south dakota",
  "tennessee", "texas", "utah", "vermont", "virginia", "washington",
  "west virginia", "wisconsin", "wyoming", "district of columbia",
]);

const US_STATE_ABBRS = new Set([
  "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga",
  "hi", "id", "il", "in", "ia", "ks", "ky", "la", "me", "md",
  "ma", "mi", "mn", "ms", "mo", "mt", "ne", "nv", "nh", "nj",
  "nm", "ny", "nc", "nd", "oh", "ok", "or", "pa", "ri", "sc",
  "sd", "tn", "tx", "ut", "vt", "va", "wa", "wv", "wi", "wy", "dc",
]);

/** Check if a column likely contains US state names or abbreviations */
function isGeographicColumn(name: string, values: Set<string>): boolean {
  const lowerName = name.toLowerCase();
  const nameHint = /state|location|region|geography|geo/.test(lowerName);

  // Check how many unique values match known state names/abbreviations
  let matchCount = 0;
  for (const v of values) {
    const lower = v.toLowerCase().trim();
    if (US_STATE_NAMES.has(lower) || US_STATE_ABBRS.has(lower)) {
      matchCount++;
    }
  }

  const hasMatches = matchCount > 0;
  const majorityMatch = values.size > 0 && matchCount / values.size > 0.5;

  return (nameHint || majorityMatch) && hasMatches;
}

interface ColumnAnalysis {
  index: number;
  name: string;
  isNumeric: boolean;
  isDate: boolean;
  uniqueCount: number;
}

/** Analyze columns in the result set to classify them */
export function analyzeColumns(
  columns: string[],
  rows: unknown[][],
): ColumnAnalysis[] {
  const sampleSize = Math.min(rows.length, 50);
  return columns.map((name, idx) => {
    let numericCount = 0;
    let dateCount = 0;
    let nonNullCount = 0;
    const uniqueValues = new Set<string>();

    for (let r = 0; r < sampleSize; r++) {
      const v = cellValueRaw(rows[r], idx, columns);
      if (v == null) continue;
      nonNullCount++;
      uniqueValues.add(String(v));
      if (isNumericValue(v)) numericCount++;
      if (isDateValue(v)) dateCount++;
    }

    const threshold = nonNullCount * 0.7;
    return {
      index: idx,
      name,
      isNumeric: numericCount >= threshold && nonNullCount > 0,
      isDate: dateCount >= threshold && nonNullCount > 0,
      uniqueCount: uniqueValues.size,
    };
  });
}

/** Generate chart recommendations for the given data */
export function detectChartTypes(
  columns: string[],
  rows: unknown[][],
): ChartRecommendation[] {
  if (!columns.length || !rows.length) return [];

  const analysis = analyzeColumns(columns, rows);
  const numericCols = analysis.filter((c) => c.isNumeric);
  const dateCols = analysis.filter((c) => c.isDate && !c.isNumeric);
  const categoricalCols = analysis.filter((c) => !c.isNumeric && !c.isDate);

  const recommendations: ChartRecommendation[] = [];

  // 1) Date + numeric(s) → line chart (best for time series)
  if (dateCols.length >= 1 && numericCols.length >= 1) {
    recommendations.push({
      type: "line",
      label: "Line Chart",
      xCol: dateCols[0].index,
      yCols: numericCols.map((c) => c.index),
    });
  }

  // 2) Categorical + numeric → bar chart
  if (categoricalCols.length >= 1 && numericCols.length >= 1) {
    const catCol = categoricalCols[0];
    recommendations.push({
      type: "bar",
      label: "Bar Chart",
      xCol: catCol.index,
      yCols: numericCols.map((c) => c.index),
    });

    // Small cardinality → also suggest pie (only with single numeric)
    if (catCol.uniqueCount <= 8 && catCol.uniqueCount >= 2) {
      recommendations.push({
        type: "pie",
        label: "Pie Chart",
        xCol: catCol.index,
        yCols: [numericCols[0].index],
      });
    }
  }

  // 3) Two numeric columns → scatter
  if (numericCols.length >= 2) {
    recommendations.push({
      type: "scatter",
      label: "Scatter Plot",
      xCol: numericCols[0].index,
      yCols: [numericCols[1].index],
    });
  }

  // 4) Single numeric column → histogram
  if (numericCols.length >= 1) {
    recommendations.push({
      type: "histogram",
      label: "Histogram",
      xCol: numericCols[0].index,
      yCols: [],
    });
  }

  // 5) Numeric columns → box plot (good for distribution comparison)
  if (numericCols.length >= 1) {
    recommendations.push({
      type: "box",
      label: "Box Plot",
      xCol: null,
      yCols: numericCols.map((c) => c.index),
    });
  }

  // 6) Two categoricals + numeric → heatmap
  if (categoricalCols.length >= 2 && numericCols.length >= 1) {
    recommendations.push({
      type: "heatmap",
      label: "Heatmap",
      xCol: categoricalCols[0].index,     // column dimension
      yCols: [categoricalCols[1].index],  // row dimension
      zCol: numericCols[0].index,         // value
    });
  }

  // 7) Geographic column + numeric → choropleth
  for (const catCol of categoricalCols) {
    const uniqueVals = new Set<string>();
    const sampleSize = Math.min(rows.length, 50);
    for (let r = 0; r < sampleSize; r++) {
      const v = cellValueRaw(rows[r], catCol.index, columns);
      if (v != null) uniqueVals.add(String(v).toLowerCase());
    }
    if (isGeographicColumn(catCol.name, uniqueVals) && numericCols.length >= 1) {
      recommendations.push({
        type: "choropleth",
        label: "Map",
        xCol: null,
        yCols: [numericCols[0].index],
        locationCol: catCol.index,
      });
      break;  // only one choropleth suggestion
    }
  }

  return recommendations;
}

/** Get the default (best) recommendation */
export function getDefaultChart(
  columns: string[],
  rows: unknown[][],
): ChartRecommendation | null {
  const recs = detectChartTypes(columns, rows);
  return recs.length > 0 ? recs[0] : null;
}
