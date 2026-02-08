// Implements: spec/frontend/chat_area/data_grid/plan.md
//
// TanStack Table integration with sorting, resizing, pagination,
// null cell display, numeric alignment, copy as TSV.

import { useState, useMemo, useCallback } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";

interface DataGridProps {
  columns: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
}

export function DataGrid({ columns, rows, totalRows }: DataGridProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [copied, setCopied] = useState(false);

  // Detect which columns are numeric by checking the first non-null value
  const numericColumns = useMemo(() => {
    const result = new Set<string>();
    for (const col of columns) {
      for (const row of rows) {
        const val = row[col];
        if (val !== null && val !== undefined) {
          if (typeof val === "number") {
            result.add(col);
          }
          break;
        }
      }
    }
    return result;
  }, [columns, rows]);

  // Build column definitions from column names
  const columnDefs = useMemo<ColumnDef<Record<string, unknown>>[]>(
    () =>
      columns.map((col) => ({
        id: col,
        accessorFn: (row: Record<string, unknown>) => row[col],
        header: col,
        minSize: 50,
        cell: ({ getValue }) => {
          const value = getValue();
          if (value === null || value === undefined) {
            return <span className="italic text-gray-400">null</span>;
          }
          return String(value);
        },
      })),
    [columns]
  );

  const table = useReactTable({
    data: rows,
    columns: columnDefs,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableMultiSort: false,
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    initialState: {
      pagination: { pageSize: 50 },
    },
  });

  const pageCount = table.getPageCount();
  const currentPage = table.getState().pagination.pageIndex + 1;
  const pageSize = table.getState().pagination.pageSize;
  const startRow = (currentPage - 1) * pageSize + 1;
  const endRow = Math.min(currentPage * pageSize, totalRows);
  const showPagination = totalRows > pageSize;

  const handleCopy = useCallback(async () => {
    const headerRow = columns.join("\t");
    const visibleRows = table.getRowModel().rows;
    const dataRows = visibleRows.map((row) =>
      columns.map((col) => {
        const val = row.original[col];
        if (val === null || val === undefined) return "";
        return String(val);
      }).join("\t")
    );
    const tsv = [headerRow, ...dataRows].join("\n");
    await navigator.clipboard.writeText(tsv);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 1500);
  }, [columns, table]);

  return (
    <div data-testid="data-grid" className="border rounded">
      {/* Copy button */}
      <div className="flex items-center justify-end px-3 py-1 border-b"
        style={{ borderColor: "var(--color-border)" }}
      >
        <button
          type="button"
          aria-label="Copy table"
          onClick={handleCopy}
          className="text-xs px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          {copied ? "Copied!" : "Copy table"}
        </button>
      </div>

      {/* Table container with sticky header */}
      <div className="max-h-[400px] overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10" style={{ backgroundColor: "var(--color-surface)" }}>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const isNumeric = numericColumns.has(header.id);
                  return (
                    <th
                      key={header.id}
                      role="columnheader"
                      className={`px-3 py-2 text-left font-medium border-b cursor-pointer select-none ${
                        isNumeric ? "text-right" : ""
                      }`}
                      style={{
                        width: header.getSize(),
                        position: "relative",
                        borderColor: "var(--color-border)",
                      }}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className="flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{
                          asc: " \u2191",
                          desc: " \u2193",
                        }[header.column.getIsSorted() as string] ?? ""}
                      </div>
                      {/* Resize handle */}
                      <div
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        onDoubleClick={() => header.column.resetSize()}
                        className="absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none hover:bg-blue-400"
                        style={{ userSelect: "none" }}
                      />
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody data-testid="data-grid-body">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="text-center py-8 text-gray-500"
                  role="cell"
                >
                  No results
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} role="row" className="border-b" style={{ borderColor: "var(--color-border)" }}>
                  {row.getVisibleCells().map((cell) => {
                    const isNumeric = numericColumns.has(cell.column.id);
                    return (
                      <td
                        key={cell.id}
                        role="cell"
                        className={`px-3 py-1.5 truncate ${isNumeric ? "text-right" : ""}`}
                        title={String(cell.getValue() ?? "")}
                        style={{ width: cell.column.getSize() }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      {showPagination && (
        <div className="flex items-center justify-between px-3 py-2 border-t text-xs"
          style={{ borderColor: "var(--color-border)" }}
        >
          <span>
            Showing {startRow}–{endRow} of {totalRows} rows
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Previous page"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="px-2 py-1 rounded border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Previous
            </button>
            <span>Page {currentPage} of {pageCount}</span>
            <button
              type="button"
              aria-label="Next page"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="px-2 py-1 rounded border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
