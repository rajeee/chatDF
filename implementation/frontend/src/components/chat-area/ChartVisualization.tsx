/**
 * ChartVisualization — renders interactive Plotly charts for SQL result data.
 *
 * Features:
 * - Auto-detects best chart type from data shape
 * - Chart type switcher (bar, line, scatter, histogram, pie, box)
 * - Theme-aware (dark/light mode)
 * - Lazy-loaded plotly.js for bundle efficiency
 */

import { useState, useMemo, useCallback, lazy, Suspense, useRef } from "react";
import { cellValueRaw } from "@/utils/tableUtils";
import { analyzeColumns } from "@/utils/chartDetection";
import type { ChartSpec } from "@/stores/chatStore";
import {
  detectChartTypes,
  type ChartType,
  type ChartRecommendation,
} from "@/utils/chartDetection";

// Lazy-load Plotly to keep initial bundle small (~1MB)
const Plot = lazy(() => import("react-plotly.js"));

const CHART_ICONS: Record<ChartType, React.ReactNode> = {
  bar: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" className="shrink-0">
      <rect x="1" y="6" width="3" height="7" rx="0.5" strokeWidth="1.2" />
      <rect x="5.5" y="2" width="3" height="11" rx="0.5" strokeWidth="1.2" />
      <rect x="10" y="4" width="3" height="9" rx="0.5" strokeWidth="1.2" />
    </svg>
  ),
  line: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" className="shrink-0">
      <polyline points="1,11 5,7 9,4 13,2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  scatter: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" className="shrink-0">
      <circle cx="3" cy="4" r="1.3" />
      <circle cx="7" cy="9" r="1.3" />
      <circle cx="10" cy="3" r="1.3" />
      <circle cx="5" cy="11" r="1.3" />
      <circle cx="11" cy="7" r="1.3" />
    </svg>
  ),
  histogram: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" className="shrink-0">
      <rect x="0.5" y="7" width="3" height="6" strokeWidth="1.2" />
      <rect x="3.5" y="3" width="3" height="10" strokeWidth="1.2" />
      <rect x="6.5" y="5" width="3" height="8" strokeWidth="1.2" />
      <rect x="9.5" y="8" width="3" height="5" strokeWidth="1.2" />
    </svg>
  ),
  pie: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" className="shrink-0">
      <circle cx="7" cy="7" r="5.5" strokeWidth="1.2" />
      <line x1="7" y1="7" x2="7" y2="1.5" strokeWidth="1.2" />
      <line x1="7" y1="7" x2="12" y2="9.5" strokeWidth="1.2" />
    </svg>
  ),
  box: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" className="shrink-0">
      <line x1="7" y1="1" x2="7" y2="3.5" strokeWidth="1.2" />
      <rect x="3" y="3.5" width="8" height="7" rx="0.5" strokeWidth="1.2" />
      <line x1="3" y1="7" x2="11" y2="7" strokeWidth="1.2" />
      <line x1="7" y1="10.5" x2="7" y2="13" strokeWidth="1.2" />
    </svg>
  ),
  heatmap: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" className="shrink-0" opacity="0.85">
      <rect x="0.5" y="0.5" width="4" height="4" rx="0.5" opacity="0.3" />
      <rect x="5" y="0.5" width="4" height="4" rx="0.5" opacity="0.7" />
      <rect x="9.5" y="0.5" width="4" height="4" rx="0.5" opacity="1" />
      <rect x="0.5" y="5" width="4" height="4" rx="0.5" opacity="0.6" />
      <rect x="5" y="5" width="4" height="4" rx="0.5" opacity="0.4" />
      <rect x="9.5" y="5" width="4" height="4" rx="0.5" opacity="0.8" />
      <rect x="0.5" y="9.5" width="4" height="4" rx="0.5" opacity="0.9" />
      <rect x="5" y="9.5" width="4" height="4" rx="0.5" opacity="0.5" />
      <rect x="9.5" y="9.5" width="4" height="4" rx="0.5" opacity="0.2" />
    </svg>
  ),
  choropleth: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" className="shrink-0">
      <path d="M7 1.5C4 1.5 1.5 4 1.5 7s2.5 5.5 5.5 5.5 5.5-2.5 5.5-5.5S10 1.5 7 1.5z" strokeWidth="1.1" />
      <path d="M7 1.5c-1.5 0-3 2.5-3 5.5s1.5 5.5 3 5.5" strokeWidth="1.1" />
      <path d="M7 1.5c1.5 0 3 2.5 3 5.5s-1.5 5.5-3 5.5" strokeWidth="1.1" />
      <line x1="1.5" y1="7" x2="12.5" y2="7" strokeWidth="1.1" />
      <line x1="2.5" y1="4" x2="11.5" y2="4" strokeWidth="0.8" />
      <line x1="2.5" y1="10" x2="11.5" y2="10" strokeWidth="0.8" />
    </svg>
  ),
};

/** Extract column data as an array of raw values */
function extractColumn(
  rows: unknown[][],
  colIdx: number,
  columns: string[],
): (string | number | Date | null)[] {
  return rows.map((row) => cellValueRaw(row, colIdx, columns) as string | number | Date | null);
}

/** Map of US state full names to abbreviations for choropleth locationmode */
const STATE_NAME_TO_ABBR: Record<string, string> = {
  "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
  "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
  "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID",
  "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS",
  "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
  "massachusetts": "MA", "michigan": "MI", "minnesota": "MN",
  "mississippi": "MS", "missouri": "MO", "montana": "MT", "nebraska": "NE",
  "nevada": "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC",
  "north dakota": "ND", "ohio": "OH", "oklahoma": "OK", "oregon": "OR",
  "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT",
  "vermont": "VT", "virginia": "VA", "washington": "WA",
  "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY",
  "district of columbia": "DC",
};

/** Normalize location values to state abbreviations for Plotly choropleth */
function normalizeLocations(values: (string | number | Date | null)[]): string[] {
  return values.map((v) => {
    if (v == null) return "";
    const s = String(v).trim();
    // Already an abbreviation (2 chars)?
    if (s.length === 2) return s.toUpperCase();
    // Full name → abbreviation
    return STATE_NAME_TO_ABBR[s.toLowerCase()] ?? s;
  });
}

/** Pivot flat rows into a 2D matrix for heatmap visualization */
function pivotToMatrix(
  rows: unknown[][],
  xColIdx: number,
  yColIdx: number,
  zColIdx: number,
  columns: string[],
): { xLabels: string[]; yLabels: string[]; zMatrix: (number | null)[][] } {
  const xSet = new Map<string, number>();
  const ySet = new Map<string, number>();

  // Collect unique x and y labels maintaining order
  for (const row of rows) {
    const xVal = String(cellValueRaw(row, xColIdx, columns) ?? "");
    const yVal = String(cellValueRaw(row, yColIdx, columns) ?? "");
    if (!xSet.has(xVal)) xSet.set(xVal, xSet.size);
    if (!ySet.has(yVal)) ySet.set(yVal, ySet.size);
  }

  const xLabels = [...xSet.keys()];
  const yLabels = [...ySet.keys()];

  // Initialize matrix with nulls
  const zMatrix: (number | null)[][] = Array.from({ length: yLabels.length }, () =>
    Array(xLabels.length).fill(null),
  );

  // Fill in values
  for (const row of rows) {
    const xVal = String(cellValueRaw(row, xColIdx, columns) ?? "");
    const yVal = String(cellValueRaw(row, yColIdx, columns) ?? "");
    const zRaw = cellValueRaw(row, zColIdx, columns);
    const zVal = zRaw != null ? Number(zRaw) : null;
    const xi = xSet.get(xVal);
    const yi = ySet.get(yVal);
    if (xi != null && yi != null) {
      zMatrix[yi][xi] = zVal;
    }
  }

  return { xLabels, yLabels, zMatrix };
}

/** Resolve a color scale spec string to a Plotly colorscale */
function resolveColorScale(spec?: string): Plotly.ColorScale | undefined {
  switch (spec) {
    case "diverging": return "RdBu";
    case "sequential": return "Viridis";
    default: return undefined;
  }
}

/** Build Plotly trace(s) and layout from an LLM-provided chart spec */
function buildPlotlyConfigFromSpec(
  spec: ChartSpec,
  columns: string[],
  rows: unknown[][],
  isDark: boolean,
): { data: Plotly.Data[]; layout: Partial<Plotly.Layout> } {
  const textColor = isDark ? "#f9fafb" : "#111827";
  const gridColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const accentColors = [
    "#60a5fa", "#f472b6", "#34d399", "#fbbf24", "#a78bfa",
    "#fb923c", "#22d3ee", "#e879f9",
  ];

  // Helper: find column index by name (case-insensitive)
  const colIndex = (name?: string): number => {
    if (!name) return -1;
    const lower = name.toLowerCase();
    const idx = columns.findIndex((c) => c.toLowerCase() === lower);
    return idx;
  };

  // Helper: extract column data by name
  const extractByName = (name?: string): (string | number | Date | null)[] => {
    const idx = colIndex(name);
    if (idx < 0) return [];
    return rows.map((row) => cellValueRaw(row, idx, columns) as string | number | Date | null);
  };

  const baseLayout: Partial<Plotly.Layout> = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { color: textColor, size: 12 },
    margin: { t: 40, r: 24, b: 48, l: 56 },
    autosize: true,
    title: { text: spec.title, font: { size: 14, color: textColor } },
    xaxis: {
      gridcolor: gridColor,
      zerolinecolor: gridColor,
      title: spec.x_label ? { text: spec.x_label } : undefined,
    },
    yaxis: {
      gridcolor: gridColor,
      zerolinecolor: gridColor,
      title: spec.y_label ? { text: spec.y_label } : undefined,
    },
    showlegend: (spec.y_columns?.length ?? 0) > 1,
    legend: {
      bgcolor: "rgba(0,0,0,0)",
      font: { color: textColor },
      orientation: "h",
      yanchor: "bottom",
      y: 1.02,
      xanchor: "center",
      x: 0.5,
    },
  };

  const xValues = extractByName(spec.x_column);
  const isHorizontal = spec.orientation === "horizontal" || spec.chart_type === "horizontal_bar";
  const yColumnNames = spec.y_columns ?? [];

  // If no y_columns specified, try to auto-detect: first numeric column that isn't x_column
  const effectiveYColumns = yColumnNames.length > 0
    ? yColumnNames
    : columns.filter((c) => c !== spec.x_column).slice(0, 1);

  switch (spec.chart_type) {
    case "bar":
    case "horizontal_bar": {
      const data: Plotly.Data[] = effectiveYColumns.map((yName, i) => {
        const yValues = extractByName(yName);
        return {
          type: "bar" as const,
          x: isHorizontal ? yValues : xValues,
          y: isHorizontal ? xValues : yValues,
          orientation: isHorizontal ? ("h" as const) : ("v" as const),
          name: yName,
          marker: { color: accentColors[i % accentColors.length] },
          text: spec.show_values ? yValues.map(String) : undefined,
          textposition: spec.show_values ? ("auto" as const) : undefined,
        };
      });
      return {
        data,
        layout: {
          ...baseLayout,
          barmode: (spec.bar_mode as "group" | "stack" | "relative") ?? (effectiveYColumns.length > 1 ? "group" : undefined),
        },
      };
    }

    case "line": {
      const data: Plotly.Data[] = effectiveYColumns.map((yName, i) => ({
        type: "scatter" as const,
        mode: "lines+markers" as const,
        x: xValues,
        y: extractByName(yName),
        name: yName,
        line: { color: accentColors[i % accentColors.length], width: 2 },
        marker: { size: 4 },
      }));
      return { data, layout: baseLayout };
    }

    case "scatter": {
      const yName = effectiveYColumns[0] ?? columns[1];
      const data: Plotly.Data[] = [{
        type: "scatter" as const,
        mode: "markers" as const,
        x: xValues,
        y: extractByName(yName),
        name: `${spec.x_column} vs ${yName}`,
        marker: { color: accentColors[0], size: 6, opacity: 0.7 },
      }];
      return { data, layout: baseLayout };
    }

    case "histogram": {
      const histCol = spec.x_column ?? columns[0];
      const data: Plotly.Data[] = [{
        type: "histogram" as const,
        x: extractByName(histCol),
        name: histCol,
        marker: { color: accentColors[0] },
      }];
      return {
        data,
        layout: {
          ...baseLayout,
          yaxis: { ...baseLayout.yaxis, title: { text: "Count" } },
        },
      };
    }

    case "pie": {
      const yName = effectiveYColumns[0] ?? columns[1];
      const data: Plotly.Data[] = [{
        type: "pie" as const,
        labels: xValues as string[],
        values: extractByName(yName) as number[],
        marker: { colors: accentColors },
        textfont: { color: textColor },
      }];
      return {
        data,
        layout: { ...baseLayout, xaxis: undefined, yaxis: undefined },
      };
    }

    case "box": {
      const data: Plotly.Data[] = effectiveYColumns.map((yName, i) => ({
        type: "box" as const,
        y: extractByName(yName),
        name: yName,
        marker: { color: accentColors[i % accentColors.length] },
        boxmean: true,
      }));
      return { data, layout: baseLayout };
    }

    case "heatmap": {
      // x_column = column dimension, y_columns[0] = row dimension, z_column = value
      const xColName = spec.x_column ?? columns[0];
      const yColName = effectiveYColumns[0] ?? columns[1];
      const zColName = spec.z_column ?? columns.find((c) => c !== xColName && c !== yColName) ?? columns[2];
      const xIdx = colIndex(xColName);
      const yIdx = colIndex(yColName);
      const zIdx = colIndex(zColName);
      if (xIdx < 0 || yIdx < 0 || zIdx < 0) return { data: [], layout: baseLayout };

      const { xLabels, yLabels, zMatrix } = pivotToMatrix(rows, xIdx, yIdx, zIdx, columns);
      const colorscale = resolveColorScale(spec.color_scale) ?? "Viridis";
      // Center diverging scales at zero
      const zmid = spec.color_scale === "diverging" ? 0 : undefined;

      const data: Plotly.Data[] = [{
        type: "heatmap" as const,
        x: xLabels,
        y: yLabels,
        z: zMatrix,
        colorscale,
        zmid,
        hovertemplate: "%{y} × %{x}: %{z}<extra></extra>",
        colorbar: { tickfont: { color: textColor }, titlefont: { color: textColor } },
      }];
      return {
        data,
        layout: {
          ...baseLayout,
          xaxis: { ...baseLayout.xaxis, title: spec.x_label ? { text: spec.x_label } : { text: xColName } },
          yaxis: { ...baseLayout.yaxis, title: spec.y_label ? { text: spec.y_label } : { text: yColName }, autorange: "reversed" as const },
        },
      };
    }

    case "choropleth": {
      const locationColName = spec.location_column ?? spec.x_column ?? columns[0];
      const valueColName = effectiveYColumns[0] ?? columns[1];
      const locationValues = normalizeLocations(extractByName(locationColName));
      const numericValues = extractByName(valueColName) as number[];
      const colorscale = resolveColorScale(spec.color_scale) ?? "Blues";
      const zmid = spec.color_scale === "diverging" ? 0 : undefined;

      const data: Plotly.Data[] = [{
        type: "choropleth" as const,
        locationmode: "USA-states" as const,
        locations: locationValues,
        z: numericValues,
        colorscale,
        zmid,
        colorbar: {
          title: { text: spec.y_label ?? valueColName, font: { color: textColor } },
          tickfont: { color: textColor },
        },
        marker: { line: { color: isDark ? "#374151" : "#d1d5db", width: 0.5 } },
        hovertemplate: "%{location}: %{z}<extra></extra>",
      }];
      return {
        data,
        layout: {
          ...baseLayout,
          xaxis: undefined,
          yaxis: undefined,
          geo: {
            scope: "usa" as const,
            projection: { type: "albers usa" as const },
            bgcolor: "rgba(0,0,0,0)",
            lakecolor: isDark ? "#1e3a5f" : "#c6dbef",
            landcolor: isDark ? "#1f2937" : "#f3f4f6",
            showlakes: true,
            showland: true,
          },
        },
      };
    }

    default:
      return { data: [], layout: baseLayout };
  }
}

/** Build Plotly trace(s) and layout for a given chart recommendation */
function buildPlotlyConfig(
  rec: ChartRecommendation,
  columns: string[],
  rows: unknown[][],
  isDark: boolean,
): { data: Plotly.Data[]; layout: Partial<Plotly.Layout> } {
  const textColor = isDark ? "#f9fafb" : "#111827";
  const gridColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const bgColor = "rgba(0,0,0,0)"; // transparent — inherits modal bg
  const accentColors = [
    "#60a5fa", "#f472b6", "#34d399", "#fbbf24", "#a78bfa",
    "#fb923c", "#22d3ee", "#e879f9",
  ];

  const baseLayout: Partial<Plotly.Layout> = {
    paper_bgcolor: bgColor,
    plot_bgcolor: bgColor,
    font: { color: textColor, size: 12 },
    margin: { t: 32, r: 24, b: 48, l: 56 },
    xaxis: {
      gridcolor: gridColor,
      zerolinecolor: gridColor,
    },
    yaxis: {
      gridcolor: gridColor,
      zerolinecolor: gridColor,
    },
    showlegend: rec.yCols.length > 1,
    legend: {
      bgcolor: "rgba(0,0,0,0)",
      font: { color: textColor },
      orientation: "h",
      yanchor: "bottom",
      y: 1.02,
      xanchor: "center",
      x: 0.5,
    },
    autosize: true,
  };

  const xValues = rec.xCol != null ? extractColumn(rows, rec.xCol, columns) : [];
  const xLabel = rec.xCol != null ? columns[rec.xCol] : "";

  switch (rec.type) {
    case "bar": {
      const data: Plotly.Data[] = rec.yCols.map((yIdx, i) => ({
        type: "bar" as const,
        x: xValues,
        y: extractColumn(rows, yIdx, columns),
        name: columns[yIdx],
        marker: { color: accentColors[i % accentColors.length] },
      }));
      return {
        data,
        layout: {
          ...baseLayout,
          xaxis: { ...baseLayout.xaxis, title: { text: xLabel } },
          barmode: rec.yCols.length > 1 ? "group" : undefined,
        },
      };
    }

    case "line": {
      const data: Plotly.Data[] = rec.yCols.map((yIdx, i) => ({
        type: "scatter" as const,
        mode: "lines+markers" as const,
        x: xValues,
        y: extractColumn(rows, yIdx, columns),
        name: columns[yIdx],
        line: { color: accentColors[i % accentColors.length], width: 2 },
        marker: { size: 4 },
      }));
      return {
        data,
        layout: {
          ...baseLayout,
          xaxis: { ...baseLayout.xaxis, title: { text: xLabel } },
        },
      };
    }

    case "scatter": {
      const yIdx = rec.yCols[0];
      const data: Plotly.Data[] = [
        {
          type: "scatter" as const,
          mode: "markers" as const,
          x: xValues,
          y: extractColumn(rows, yIdx, columns),
          name: `${xLabel} vs ${columns[yIdx]}`,
          marker: { color: accentColors[0], size: 6, opacity: 0.7 },
        },
      ];
      return {
        data,
        layout: {
          ...baseLayout,
          xaxis: { ...baseLayout.xaxis, title: { text: xLabel } },
          yaxis: { ...baseLayout.yaxis, title: { text: columns[yIdx] } },
        },
      };
    }

    case "histogram": {
      const data: Plotly.Data[] = [
        {
          type: "histogram" as const,
          x: extractColumn(rows, rec.xCol!, columns),
          name: xLabel,
          marker: { color: accentColors[0] },
        },
      ];
      return {
        data,
        layout: {
          ...baseLayout,
          xaxis: { ...baseLayout.xaxis, title: { text: xLabel } },
          yaxis: { ...baseLayout.yaxis, title: { text: "Count" } },
        },
      };
    }

    case "pie": {
      const yIdx = rec.yCols[0];
      const data: Plotly.Data[] = [
        {
          type: "pie" as const,
          labels: xValues as string[],
          values: extractColumn(rows, yIdx, columns) as number[],
          marker: { colors: accentColors },
          textfont: { color: textColor },
        },
      ];
      return {
        data,
        layout: {
          ...baseLayout,
          // Pie charts need no axis
          xaxis: undefined,
          yaxis: undefined,
        },
      };
    }

    case "box": {
      const data: Plotly.Data[] = rec.yCols.map((yIdx, i) => ({
        type: "box" as const,
        y: extractColumn(rows, yIdx, columns),
        name: columns[yIdx],
        marker: { color: accentColors[i % accentColors.length] },
      }));
      return {
        data,
        layout: baseLayout,
      };
    }

    case "heatmap": {
      const yIdx = rec.yCols[0]; // row dimension
      const zIdx = rec.zCol ?? -1;
      if (rec.xCol == null || yIdx == null || zIdx < 0) return { data: [], layout: baseLayout };

      const { xLabels, yLabels, zMatrix } = pivotToMatrix(rows, rec.xCol, yIdx, zIdx, columns);
      const data: Plotly.Data[] = [{
        type: "heatmap" as const,
        x: xLabels,
        y: yLabels,
        z: zMatrix,
        colorscale: "Viridis" as Plotly.ColorScale,
        hovertemplate: "%{y} × %{x}: %{z}<extra></extra>",
        colorbar: { tickfont: { color: textColor }, titlefont: { color: textColor } },
      }];
      return {
        data,
        layout: {
          ...baseLayout,
          xaxis: { ...baseLayout.xaxis, title: { text: xLabel } },
          yaxis: { ...baseLayout.yaxis, title: { text: columns[yIdx] }, autorange: "reversed" as const },
        },
      };
    }

    case "choropleth": {
      const locIdx = rec.locationCol ?? -1;
      const valIdx = rec.yCols[0];
      if (locIdx < 0 || valIdx == null) return { data: [], layout: baseLayout };

      const locationValues = normalizeLocations(extractColumn(rows, locIdx, columns));
      const numericValues = extractColumn(rows, valIdx, columns) as number[];
      const data: Plotly.Data[] = [{
        type: "choropleth" as const,
        locationmode: "USA-states" as const,
        locations: locationValues,
        z: numericValues,
        colorscale: "Blues" as Plotly.ColorScale,
        colorbar: {
          title: { text: columns[valIdx], font: { color: textColor } },
          tickfont: { color: textColor },
        },
        marker: { line: { color: isDark ? "#374151" : "#d1d5db", width: 0.5 } },
        hovertemplate: "%{location}: %{z}<extra></extra>",
      }];
      return {
        data,
        layout: {
          ...baseLayout,
          xaxis: undefined,
          yaxis: undefined,
          geo: {
            scope: "usa" as const,
            projection: { type: "albers usa" as const },
            bgcolor: "rgba(0,0,0,0)",
            lakecolor: isDark ? "#1e3a5f" : "#c6dbef",
            landcolor: isDark ? "#1f2937" : "#f3f4f6",
            showlakes: true,
            showland: true,
          },
        },
      };
    }

    default:
      return { data: [], layout: baseLayout };
  }
}

/** Compact select dropdown for chart controls */
function ChartSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--color-text-secondary)" }}>
      <span className="font-medium uppercase tracking-wide">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded px-1.5 py-0.5 text-[11px] border outline-none transition-colors"
        style={{
          backgroundColor: "var(--color-surface)",
          borderColor: "var(--color-border)",
          color: "var(--color-text-primary)",
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

/** Toggle pill button for chart controls */
function ChartToggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide border transition-all duration-150"
      style={{
        backgroundColor: active ? "var(--color-accent)" : "transparent",
        color: active ? "#fff" : "var(--color-text-secondary)",
        borderColor: active ? "var(--color-accent)" : "var(--color-border)",
      }}
    >
      {label}
    </button>
  );
}

/** User overrides for chart configuration */
interface ChartOverrides {
  xCol?: number;
  yCol?: number;
  orientation?: "v" | "h";
  barMode?: "group" | "stack";
  colorScale?: string;
}

/** Apply user overrides to a recommendation to produce a modified spec for rendering */
function applyOverrides(
  rec: ChartRecommendation,
  overrides: ChartOverrides,
  columns: string[],
  rows: unknown[][],
  isDark: boolean,
): { data: Plotly.Data[]; layout: Partial<Plotly.Layout> } {
  // Build a modified recommendation
  const modRec: ChartRecommendation = { ...rec };
  if (overrides.xCol != null) modRec.xCol = overrides.xCol;
  if (overrides.yCol != null) modRec.yCols = [overrides.yCol];

  // Build base config
  const config = buildPlotlyConfig(modRec, columns, rows, isDark);

  // Apply orientation override for bar charts
  if (overrides.orientation === "h" && (rec.type === "bar")) {
    config.data = config.data.map((d) => ({
      ...d,
      x: (d as any).y,
      y: (d as any).x,
      orientation: "h" as const,
    }));
  }

  // Apply bar mode override
  if (overrides.barMode && (rec.type === "bar")) {
    config.layout.barmode = overrides.barMode;
  }

  // Apply color scale override for heatmap/choropleth
  if (overrides.colorScale) {
    config.data = config.data.map((d) => ({
      ...d,
      colorscale: resolveColorScale(overrides.colorScale) ?? (d as any).colorscale,
    }));
  }

  return config;
}

export function ChartVisualization({
  columns,
  rows,
  llmSpec,
  onExpand,
}: {
  columns: string[];
  rows: unknown[][];
  llmSpec?: ChartSpec;
  onExpand?: () => void;
}) {
  const recommendations = useMemo(
    () => detectChartTypes(columns, rows),
    [columns, rows],
  );

  const colAnalysis = useMemo(() => analyzeColumns(columns, rows), [columns, rows]);

  const [selectedType, setSelectedType] = useState<ChartType | null>(null);
  const [overrides, setOverrides] = useState<ChartOverrides>({});
  const [showControls, setShowControls] = useState(false);
  const plotDivId = useRef(`chart-plot-${Math.random().toString(36).slice(2)}`).current;

  // Reset overrides when chart type changes
  const handleTypeChange = useCallback((type: ChartType) => {
    setSelectedType(type);
    setOverrides({});
  }, []);

  // Use selected type or default to first recommendation
  const activeRec = useMemo<ChartRecommendation | null>(() => {
    if (!recommendations.length) return null;
    if (selectedType) {
      return recommendations.find((r) => r.type === selectedType) ?? recommendations[0];
    }
    return recommendations[0];
  }, [recommendations, selectedType]);

  const isDark = document.documentElement.classList.contains("dark");

  const plotConfig = useMemo(() => {
    if (llmSpec) {
      return buildPlotlyConfigFromSpec(llmSpec, columns, rows, isDark);
    }
    if (!activeRec) return null;
    // Apply user overrides if any exist
    if (Object.keys(overrides).length > 0) {
      return applyOverrides(activeRec, overrides, columns, rows, isDark);
    }
    return buildPlotlyConfig(activeRec, columns, rows, isDark);
  }, [activeRec, columns, rows, isDark, llmSpec, overrides]);

  // Column options for dropdowns
  const numericColOptions = useMemo(
    () => colAnalysis.filter((c) => c.isNumeric).map((c) => ({ value: String(c.index), label: c.name })),
    [colAnalysis],
  );
  const allColOptions = useMemo(
    () => columns.map((name, i) => ({ value: String(i), label: name })),
    [columns],
  );

  // Which controls to show based on active chart type
  const activeType = activeRec?.type ?? null;
  const showBarControls = activeType === "bar";
  const showColorScaleControls = activeType === "heatmap" || activeType === "choropleth";
  const showAxisControls = activeType != null && activeType !== "pie" && activeType !== "choropleth";

  // Download chart as PNG using the Plotly instance from the rendered chart element
  const handleDownload = useCallback(() => {
    try {
      const el = document.getElementById(plotDivId) as (HTMLElement & { _fullLayout?: unknown }) | null;
      // Access the Plotly instance attached to the gd element by react-plotly.js
      if (el && typeof (window as Record<string, unknown>).Plotly === "object") {
        const Plotly = (window as Record<string, unknown>).Plotly as {
          downloadImage: (gd: HTMLElement, opts: Record<string, unknown>) => Promise<void>;
        };
        Plotly.downloadImage(el, {
          format: "png",
          width: 1200,
          height: 800,
          filename: "chatdf-chart",
        });
      }
    } catch (error) {
      console.error("Failed to download chart:", error);
    }
  }, [plotDivId]);

  if (!llmSpec && !recommendations.length) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2 opacity-50">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="12" width="4" height="9" rx="1" />
          <rect x="10" y="6" width="4" height="15" rx="1" />
          <rect x="17" y="9" width="4" height="12" rx="1" />
          <line x1="2" y1="3" x2="22" y2="21" strokeWidth="2" />
        </svg>
        <span className="text-xs">No visualizable data detected</span>
      </div>
    );
  }

  if (!plotConfig) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2 opacity-50">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="12" width="4" height="9" rx="1" />
          <rect x="10" y="6" width="4" height="15" rx="1" />
          <rect x="17" y="9" width="4" height="12" rx="1" />
          <line x1="2" y1="3" x2="22" y2="21" strokeWidth="2" />
        </svg>
        <span className="text-xs">No visualizable data detected</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Chart type switcher + controls toggle + expand */}
      <div
        className="flex items-center gap-1 px-4 py-2 border-b overflow-x-auto"
        style={{ borderColor: "var(--color-border)" }}
      >
        {recommendations.map((rec) => {
          const isActive = activeRec?.type === rec.type;
          return (
            <button
              key={rec.type}
              type="button"
              onClick={() => handleTypeChange(rec.type)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                isActive ? "" : "hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
              }`}
              style={{
                backgroundColor: isActive ? "var(--color-accent)" : undefined,
                color: isActive ? "#fff" : "var(--color-text-secondary)",
              }}
            >
              {CHART_ICONS[rec.type]}
              {rec.label}
            </button>
          );
        })}

        <div className="flex-1" />

        {/* Controls toggle */}
        {!llmSpec && (
          <button
            type="button"
            onClick={() => setShowControls((s) => !s)}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
            style={{ color: showControls ? "var(--color-accent)" : "var(--color-text-secondary)" }}
            aria-label="Toggle chart controls"
            title="Chart settings"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" className="shrink-0">
              <line x1="1" y1="3" x2="11" y2="3" />
              <circle cx="4" cy="3" r="1.2" fill="currentColor" />
              <line x1="1" y1="6" x2="11" y2="6" />
              <circle cx="8" cy="6" r="1.2" fill="currentColor" />
              <line x1="1" y1="9" x2="11" y2="9" />
              <circle cx="5" cy="9" r="1.2" fill="currentColor" />
            </svg>
          </button>
        )}

        {/* Download PNG button */}
        <button
          type="button"
          onClick={handleDownload}
          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
          style={{ color: "var(--color-text-secondary)" }}
          aria-label="Download chart as PNG"
          title="Download chart as PNG"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" className="shrink-0">
            <path d="M6 1.5 L6 7.5" strokeLinecap="round" />
            <polyline points="3.5,5.5 6,8 8.5,5.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M1.5 8.5 L1.5 10 C1.5 10.5 2 11 2.5 11 L9.5 11 C10 11 10.5 10.5 10.5 10 L10.5 8.5" strokeLinecap="round" />
          </svg>
        </button>

        {/* Expand button */}
        {onExpand && (
          <button
            type="button"
            onClick={onExpand}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
            style={{ color: "var(--color-text-secondary)" }}
            aria-label="Expand chart"
            title="Open in full view"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" className="shrink-0">
              <polyline points="7,1 11,1 11,5" />
              <polyline points="5,11 1,11 1,7" />
              <line x1="11" y1="1" x2="7" y2="5" />
              <line x1="1" y1="11" x2="5" y2="7" />
            </svg>
          </button>
        )}
      </div>

      {/* User controls toolbar (collapsible) */}
      {showControls && !llmSpec && (
        <div
          className="flex items-center gap-3 px-4 py-1.5 border-b overflow-x-auto animate-[slideDown_150ms_ease-out]"
          style={{ borderColor: "var(--color-border)" }}
        >
          {/* X-axis column selector */}
          {showAxisControls && (
            <ChartSelect
              label="X"
              value={String(overrides.xCol ?? activeRec?.xCol ?? 0)}
              options={allColOptions}
              onChange={(v) => setOverrides((o) => ({ ...o, xCol: parseInt(v) }))}
            />
          )}

          {/* Y-axis column selector */}
          {showAxisControls && numericColOptions.length > 0 && (
            <ChartSelect
              label="Y"
              value={String(overrides.yCol ?? activeRec?.yCols[0] ?? numericColOptions[0]?.value ?? 0)}
              options={numericColOptions}
              onChange={(v) => setOverrides((o) => ({ ...o, yCol: parseInt(v) }))}
            />
          )}

          {/* Bar chart controls */}
          {showBarControls && (
            <>
              <div className="flex items-center gap-1">
                <ChartToggle
                  label="Vertical"
                  active={(overrides.orientation ?? "v") === "v"}
                  onClick={() => setOverrides((o) => ({ ...o, orientation: "v" }))}
                />
                <ChartToggle
                  label="Horizontal"
                  active={overrides.orientation === "h"}
                  onClick={() => setOverrides((o) => ({ ...o, orientation: "h" }))}
                />
              </div>
              {(activeRec?.yCols.length ?? 0) > 1 && (
                <div className="flex items-center gap-1">
                  <ChartToggle
                    label="Group"
                    active={(overrides.barMode ?? "group") === "group"}
                    onClick={() => setOverrides((o) => ({ ...o, barMode: "group" }))}
                  />
                  <ChartToggle
                    label="Stack"
                    active={overrides.barMode === "stack"}
                    onClick={() => setOverrides((o) => ({ ...o, barMode: "stack" }))}
                  />
                </div>
              )}
            </>
          )}

          {/* Color scale selector for heatmap/choropleth */}
          {showColorScaleControls && (
            <ChartSelect
              label="Colors"
              value={overrides.colorScale ?? "default"}
              options={[
                { value: "default", label: "Default" },
                { value: "sequential", label: "Sequential" },
                { value: "diverging", label: "Diverging" },
              ]}
              onChange={(v) => setOverrides((o) => ({ ...o, colorScale: v }))}
            />
          )}
        </div>
      )}

      {/* Chart area */}
      <div className="flex-1 min-h-0 px-2 py-2">
        <Suspense
          fallback={
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <div
                className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent opacity-40"
                aria-hidden="true"
              />
              <span className="text-xs opacity-50">Loading chart...</span>
            </div>
          }
        >
          <Plot
            divId={plotDivId}
            data={plotConfig.data}
            layout={plotConfig.layout}
            config={{
              responsive: true,
              displayModeBar: true,
              displaylogo: false,
              modeBarButtonsToRemove: [
                "sendDataToCloud",
                "lasso2d",
                "select2d",
              ],
            }}
            useResizeHandler={true}
            style={{ width: "100%", height: "100%" }}
          />
        </Suspense>
      </div>
    </div>
  );
}
