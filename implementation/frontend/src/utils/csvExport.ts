import { cellValueRaw } from "./tableUtils";

/**
 * Downloads table data as CSV file.
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
