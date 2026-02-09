import { cellValueRaw } from "./tableUtils";

/**
 * Downloads table data as JSON file.
 * Each row becomes an object with column names as keys.
 */
export function downloadJson(columns: string[], rows: unknown[], filename: string) {
  const data = rows.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      obj[col] = cellValueRaw(row, i, columns);
    });
    return obj;
  });

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
