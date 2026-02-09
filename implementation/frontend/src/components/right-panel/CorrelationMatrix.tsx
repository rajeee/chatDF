// Correlation heatmap component for numeric columns in a dataset.
// Displays a pairwise Pearson correlation matrix as a color-coded grid.

import { useState, useCallback, useMemo } from "react";
import { getCorrelations, type CorrelationResponse } from "@/api/client";

interface CorrelationMatrixProps {
  conversationId: string;
  datasetId: string;
  /** Number of numeric columns in the dataset schema */
  numericColumnCount: number;
}

/**
 * Map a correlation value (-1 to +1) to a CSS background color.
 * Blue (-1) -> White (0) -> Red (+1). Null values get a gray.
 */
function correlationColor(value: number | null): string {
  if (value === null || value === undefined) {
    return "var(--color-border)";
  }
  // Clamp to [-1, 1]
  const v = Math.max(-1, Math.min(1, value));
  if (v >= 0) {
    // White to red: increase red channel intensity
    const intensity = Math.round(v * 200);
    return `rgba(220, ${80 - Math.round(v * 50)}, ${80 - Math.round(v * 50)}, ${0.15 + v * 0.7})`;
  } else {
    // White to blue: increase blue channel intensity
    const absV = Math.abs(v);
    return `rgba(${80 - Math.round(absV * 50)}, ${80 - Math.round(absV * 50)}, 220, ${0.15 + absV * 0.7})`;
  }
}

/**
 * Determine text color for contrast against the cell background.
 */
function textColor(value: number | null): string {
  if (value === null || value === undefined) {
    return "var(--color-text-muted)";
  }
  const absV = Math.abs(value);
  return absV > 0.6 ? "#fff" : "var(--color-text)";
}

export function CorrelationMatrix({
  conversationId,
  datasetId,
  numericColumnCount,
}: CorrelationMatrixProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CorrelationResponse | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const handleToggle = useCallback(async () => {
    if (isOpen) {
      setIsOpen(false);
      return;
    }

    // If we already have data, just re-show
    if (data) {
      setIsOpen(true);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await getCorrelations(conversationId, datasetId);
      setData(result);
      setIsOpen(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to compute correlations";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [isOpen, data, conversationId, datasetId]);

  // Truncate long column names for header display
  const truncateName = useCallback((name: string, maxLen = 8) => {
    return name.length > maxLen ? name.slice(0, maxLen - 1) + "\u2026" : name;
  }, []);

  // Don't render the button if fewer than 2 numeric columns
  if (numericColumnCount < 2) {
    return null;
  }

  return (
    <div className="mt-2" data-testid="correlation-matrix-container">
      <button
        onClick={handleToggle}
        disabled={loading}
        data-testid="correlation-matrix-toggle"
        className="w-full flex items-center justify-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium hover:brightness-110 active:scale-[0.98] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          borderColor: "var(--color-border)",
          color: "var(--color-text)",
        }}
      >
        {loading ? (
          <>
            <svg
              className="w-3.5 h-3.5 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12a9 9 0 11-6.219-8.56" strokeOpacity="0.5" />
            </svg>
            Computing...
          </>
        ) : (
          <>
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
            </svg>
            {isOpen ? "Hide Correlations" : "Show Correlations"}
          </>
        )}
      </button>

      {error && (
        <div
          className="mt-1 text-xs text-red-500"
          data-testid="correlation-error"
        >
          {error}
        </div>
      )}

      {isOpen && data && (
        <div
          className="mt-2 overflow-auto rounded border"
          style={{
            borderColor: "var(--color-border)",
            maxHeight: "400px",
          }}
          data-testid="correlation-heatmap"
        >
          <table
            className="border-collapse text-[10px] leading-tight"
            style={{ minWidth: "fit-content" }}
          >
            <thead>
              <tr>
                {/* Empty top-left corner cell */}
                <th
                  className="sticky left-0 z-10 px-1 py-1"
                  style={{ backgroundColor: "var(--color-surface)" }}
                />
                {data.columns.map((col) => (
                  <th
                    key={col}
                    className="px-1 py-1 font-medium text-center whitespace-nowrap"
                    style={{ color: "var(--color-text)" }}
                    title={col}
                  >
                    <span
                      className="inline-block"
                      style={{
                        writingMode: "vertical-lr",
                        transform: "rotate(180deg)",
                        maxHeight: "60px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {truncateName(col, 10)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.matrix.map((row, rowIdx) => (
                <tr key={data.columns[rowIdx]}>
                  <td
                    className="sticky left-0 z-10 px-1.5 py-1 font-medium whitespace-nowrap text-right"
                    style={{
                      backgroundColor: "var(--color-surface)",
                      color: "var(--color-text)",
                    }}
                    title={data.columns[rowIdx]}
                  >
                    {truncateName(data.columns[rowIdx], 10)}
                  </td>
                  {row.map((value, colIdx) => (
                    <td
                      key={`${rowIdx}-${colIdx}`}
                      className="px-1 py-1 text-center font-mono tabular-nums"
                      style={{
                        backgroundColor: correlationColor(value),
                        color: textColor(value),
                        minWidth: "36px",
                      }}
                      title={`${data.columns[rowIdx]} vs ${data.columns[colIdx]}: ${value !== null ? value.toFixed(4) : "N/A"}`}
                      data-testid="correlation-cell"
                    >
                      {value !== null ? value.toFixed(2) : "-"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Legend */}
          <div
            className="flex items-center justify-center gap-2 px-2 py-1.5 text-[10px] border-t"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-text-muted)",
            }}
            data-testid="correlation-legend"
          >
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{ backgroundColor: "rgba(80, 80, 220, 0.7)" }}
            />
            <span>-1</span>
            <span
              className="inline-block w-3 h-3 rounded-sm border"
              style={{
                backgroundColor: "rgba(200, 200, 200, 0.15)",
                borderColor: "var(--color-border)",
              }}
            />
            <span>0</span>
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{ backgroundColor: "rgba(220, 80, 80, 0.7)" }}
            />
            <span>+1</span>
          </div>
        </div>
      )}
    </div>
  );
}
