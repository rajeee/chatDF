import { cellValueRaw } from "./tableUtils";

/**
 * Downloads table data as CSV file (client-side generation).
 * Handles CSV escaping for commas, quotes, and newlines.
 */
export function downloadCsv(columns: string[], rows: unknown[], filename: string) {
  function escape(val: unknown): string {
    if (val == null) return "";
    const s = String(val);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  const header = columns.map(escape).join(",");
  const body = rows.map((row) =>
    columns.map((_, i) => escape(cellValueRaw(row, i, columns))).join(","),
  ).join("\n");
  const csv = header + "\n" + body;

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Downloads table data as CSV file via the backend export endpoint.
 */
export async function exportCsv(columns: string[], rows: unknown[], filename: string) {
  // Convert rows to list-of-lists format
  const rowArrays = rows.map((row) =>
    columns.map((_, i) => cellValueRaw(row, i, columns))
  );

  const BASE_URL = import.meta.env.VITE_API_URL || "";

  const response = await fetch(`${BASE_URL}/export/csv`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      columns,
      rows: rowArrays,
      filename: filename.replace(/\.csv$/, ""),
    }),
  });

  if (!response.ok) {
    throw new Error("CSV export failed");
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename.replace(/\.csv$/, "")}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
