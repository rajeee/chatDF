import { cellValueRaw } from "./tableUtils";

/**
 * Downloads table data as Excel (.xlsx) file via the backend export endpoint.
 */
export async function downloadExcel(columns: string[], rows: unknown[], filename: string) {
  // Convert rows to list-of-lists format
  const rowArrays = rows.map((row) =>
    columns.map((_, i) => cellValueRaw(row, i, columns))
  );

  const BASE_URL = import.meta.env.VITE_API_URL || "";

  const response = await fetch(`${BASE_URL}/export/xlsx`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      columns,
      rows: rowArrays,
      filename: filename.replace(/\.xlsx$/, ""),
    }),
  });

  if (!response.ok) {
    throw new Error("Export failed");
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename.replace(/\.xlsx$/, "")}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
