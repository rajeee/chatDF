/**
 * ChartVisualization — renders interactive Plotly charts for SQL result data.
 *
 * Features:
 * - Auto-detects best chart type from data shape
 * - Chart type switcher (bar, line, scatter, histogram, pie, box)
 * - Theme-aware (dark/light mode)
 * - Lazy-loaded plotly.js for bundle efficiency
 */

import { useState, useMemo, lazy, Suspense } from "react";
import { cellValueRaw } from "@/utils/tableUtils";
import {
  detectChartTypes,
  type ChartType,
  type ChartRecommendation,
} from "@/utils/chartDetection";

// Lazy-load Plotly to keep initial bundle small (~1MB)
const Plot = lazy(() => import("react-plotly.js"));

const CHART_ICONS: Record<ChartType, string> = {
  bar: "|||",
  line: "~",
  scatter: ":::",
  histogram: "|||",
  pie: "O",
  box: "[ ]",
};

/** Extract column data as an array of raw values */
function extractColumn(
  rows: unknown[][],
  colIdx: number,
  columns: string[],
): unknown[] {
  return rows.map((row) => cellValueRaw(row, colIdx, columns));
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

    default:
      return { data: [], layout: baseLayout };
  }
}

export function ChartVisualization({
  columns,
  rows,
}: {
  columns: string[];
  rows: unknown[][];
}) {
  const recommendations = useMemo(
    () => detectChartTypes(columns, rows),
    [columns, rows],
  );

  const [selectedType, setSelectedType] = useState<ChartType | null>(null);

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
    if (!activeRec) return null;
    return buildPlotlyConfig(activeRec, columns, rows, isDark);
  }, [activeRec, columns, rows, isDark]);

  if (!recommendations.length || !plotConfig) {
    return (
      <div className="flex items-center justify-center py-8 text-xs opacity-50">
        No visualizable data detected
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Chart type switcher */}
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
              onClick={() => setSelectedType(rec.type)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors"
              style={{
                backgroundColor: isActive ? "var(--color-accent)" : "transparent",
                color: isActive ? "#fff" : "var(--color-text-secondary)",
              }}
            >
              <span className="font-mono text-[10px] opacity-70">
                {CHART_ICONS[rec.type]}
              </span>
              {rec.label}
            </button>
          );
        })}
      </div>

      {/* Chart area */}
      <div className="flex-1 min-h-0 px-2 py-2">
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-full text-xs opacity-50">
              Loading chart...
            </div>
          }
        >
          <Plot
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
