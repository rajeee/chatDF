// Implements: spec/frontend/chat_area/data_grid/plan.md
//
// TanStack Table integration with sorting, resizing, pagination,
// null cell display, numeric alignment, copy as TSV.

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { downloadCsv } from "@/utils/csvExport";
import { downloadExcel } from "@/utils/excelExport";

/* ---------- Sort indicator SVG icons ---------- */
function SortAscIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className="inline-block shrink-0"
      data-testid="sort-asc-icon"
    >
      <path d="M6 2.5L9.5 7.5H2.5L6 2.5Z" fill="var(--color-accent)" />
    </svg>
  );
}

function SortDescIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className="inline-block shrink-0"
      data-testid="sort-desc-icon"
    >
      <path d="M6 9.5L2.5 4.5H9.5L6 9.5Z" fill="var(--color-accent)" />
    </svg>
  );
}

function SortUnsortedIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className="inline-block shrink-0 opacity-0 group-hover:opacity-40 transition-opacity duration-150"
      data-testid="sort-unsorted-icon"
    >
      <path d="M6 1.5L9 5H3L6 1.5Z" fill="currentColor" />
      <path d="M6 10.5L3 7H9L6 10.5Z" fill="currentColor" />
    </svg>
  );
}

/* ---------- Cell value formatting ---------- */

// ISO 8601 date/datetime pattern (e.g. "2025-02-14", "2025-02-14T12:34:56Z")
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;

function isIsoDateString(value: unknown): value is string {
  return typeof value === "string" && value.length >= 10 && ISO_DATE_RE.test(value);
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatCellValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined) {
    return (
      <span className="inline-block px-1.5 py-0.5 rounded text-xs italic text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800/50">
        null
      </span>
    );
  }

  // Boolean values → styled text
  if (typeof value === "boolean") {
    return (
      <span
        className={`inline-block text-xs font-medium ${value ? "text-green-600 dark:text-green-400" : "text-gray-400 dark:text-gray-500"}`}
        aria-label={value ? "true" : "false"}
      >
        {value ? "true" : "false"}
      </span>
    );
  }

  // Numeric values → locale-formatted with thousands separators
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return String(value);
    // Integers: no decimal places; floats: up to 4 significant decimal digits
    if (Number.isInteger(value)) {
      return value.toLocaleString();
    }
    return value.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 4,
    });
  }

  // Date strings → readable format
  if (isIsoDateString(value)) {
    try {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        // Date-only (10 chars like "2025-02-14") vs datetime
        const hasTime = value.length > 10;
        return hasTime ? dateTimeFormatter.format(date) : dateFormatter.format(date);
      }
    } catch {
      // Fall through to string rendering
    }
  }

  return String(value);
}

interface DataGridProps {
  columns: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
}

export function DataGrid({ columns, rows, totalRows }: DataGridProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnsDropdownOpen, setColumnsDropdownOpen] = useState(false);
  const columnsDropdownRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [pageTransitioning, setPageTransitioning] = useState(false);

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
        cell: ({ getValue }) => formatCellValue(getValue()),
      })),
    [columns]
  );

  const table = useReactTable({
    data: rows,
    columns: columnDefs,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
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

  const [pageInput, setPageInput] = useState(String(currentPage));

  // Sync input value when current page changes (e.g. via Previous/Next buttons)
  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  // Brief fade transition on page change
  const prevPageRef = useRef(currentPage);
  useEffect(() => {
    if (prevPageRef.current !== currentPage) {
      prevPageRef.current = currentPage;
      setPageTransitioning(true);
      const timer = setTimeout(() => setPageTransitioning(false), 150);
      return () => clearTimeout(timer);
    }
  }, [currentPage]);

  // Close columns dropdown when clicking outside
  useEffect(() => {
    if (!columnsDropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (columnsDropdownRef.current && !columnsDropdownRef.current.contains(e.target as Node)) {
        setColumnsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [columnsDropdownOpen]);

  // Compute visible columns for copy/export
  const visibleColumns = useMemo(
    () => columns.filter((col) => columnVisibility[col] !== false),
    [columns, columnVisibility]
  );

  const goToPage = useCallback(() => {
    const num = Number(pageInput);
    if (Number.isNaN(num) || pageCount === 0) {
      setPageInput(String(currentPage));
      return;
    }
    const clamped = Math.max(1, Math.min(pageCount, Math.round(num)));
    table.setPageIndex(clamped - 1);
    setPageInput(String(clamped));
  }, [pageInput, pageCount, currentPage, table]);

  const handleCopy = useCallback(async () => {
    const headerRow = visibleColumns.join("\t");
    const tableRows = table.getRowModel().rows;
    const dataRows = tableRows.map((row) =>
      visibleColumns.map((col) => {
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
  }, [visibleColumns, table]);

  const handleDownloadCsv = useCallback(() => {
    downloadCsv(visibleColumns, rows, "query-results.csv");
  }, [visibleColumns, rows]);

  const handleDownloadExcel = useCallback(() => {
    downloadExcel(visibleColumns, rows, "query-results");
  }, [visibleColumns, rows]);

  return (
    <div data-testid="data-grid" className="border rounded">
      {/* Toolbar */}
      <div className="flex items-center justify-end gap-1 px-3 py-1 border-b"
        style={{ borderColor: "var(--color-border)" }}
      >
        {/* Column visibility dropdown */}
        <div className="relative" ref={columnsDropdownRef}>
          <button
            type="button"
            aria-label="Toggle column visibility"
            onClick={() => setColumnsDropdownOpen((prev) => !prev)}
            className="text-xs px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-150 flex items-center gap-1"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden="true"
              className="inline-block shrink-0"
            >
              <rect x="1" y="1" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
              <rect x="7" y="1" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
              <rect x="1" y="7" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
              <rect x="7" y="7" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
            Columns
          </button>
          {columnsDropdownOpen && (
            <div
              data-testid="columns-dropdown"
              className="absolute right-0 top-full mt-1 z-20 min-w-[160px] rounded border shadow-lg py-1"
              style={{
                backgroundColor: "var(--color-surface)",
                borderColor: "var(--color-border)",
              }}
            >
              {/* Show All / Hide All */}
              <div className="flex items-center gap-2 px-3 py-1 border-b" style={{ borderColor: "var(--color-border)" }}>
                <button
                  type="button"
                  className="text-xs hover:underline"
                  style={{ color: "var(--color-accent)" }}
                  onClick={() => {
                    const all: VisibilityState = {};
                    for (const col of columns) all[col] = true;
                    setColumnVisibility(all);
                  }}
                >
                  Show All
                </button>
                <button
                  type="button"
                  className="text-xs hover:underline"
                  style={{ color: "var(--color-text-secondary, var(--color-text))" }}
                  onClick={() => {
                    const none: VisibilityState = {};
                    for (const col of columns) none[col] = false;
                    setColumnVisibility(none);
                  }}
                >
                  Hide All
                </button>
              </div>
              {columns.map((col) => (
                <label
                  key={col}
                  className="flex items-center gap-2 px-3 py-1 text-xs cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <input
                    type="checkbox"
                    checked={columnVisibility[col] !== false}
                    onChange={() => {
                      setColumnVisibility((prev) => ({
                        ...prev,
                        [col]: prev[col] === false ? true : false,
                      }));
                    }}
                    className="accent-[var(--color-accent)]"
                  />
                  <span className="truncate">{col}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          aria-label="Download CSV"
          onClick={handleDownloadCsv}
          className="text-xs px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-150 flex items-center gap-1"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
            className="inline-block shrink-0"
          >
            <path d="M6 1v7M6 8L3 5M6 8l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2 10h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Download CSV
        </button>
        <button
          type="button"
          aria-label="Download Excel"
          onClick={handleDownloadExcel}
          className="text-xs px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-150 flex items-center gap-1"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
            className="inline-block shrink-0"
          >
            <rect x="1" y="1" width="10" height="10" rx="1" stroke="currentColor" strokeWidth="1.2" />
            <line x1="1" y1="4" x2="11" y2="4" stroke="currentColor" strokeWidth="1" />
            <line x1="1" y1="7" x2="11" y2="7" stroke="currentColor" strokeWidth="1" />
            <line x1="5" y1="1" x2="5" y2="11" stroke="currentColor" strokeWidth="1" />
          </svg>
          Download Excel
        </button>
        <button
          type="button"
          aria-label="Copy table"
          onClick={handleCopy}
          className={`text-xs px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-150${copied ? " scale-105 font-medium" : ""}`}
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
                  const isSorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      role="columnheader"
                      className={`group px-3 py-2 text-left font-medium border-b cursor-pointer select-none transition-colors duration-200${
                        isNumeric ? " text-right" : ""
                      }${isSorted ? " bg-accent/5" : ""}`}
                      style={{
                        width: header.getSize(),
                        position: "relative",
                        borderColor: isSorted ? "var(--color-accent)" : "var(--color-border)",
                        borderBottomWidth: isSorted ? "2px" : undefined,
                      }}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className="flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <span className="inline-flex transition-transform duration-200" data-testid="sort-icon-wrapper">
                          {header.column.getIsSorted() === "asc" ? (
                            <SortAscIcon />
                          ) : header.column.getIsSorted() === "desc" ? (
                            <SortDescIcon />
                          ) : (
                            <SortUnsortedIcon />
                          )}
                        </span>
                      </div>
                      {/* Resize handle */}
                      <div
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        onDoubleClick={() => header.column.resetSize()}
                        className={`absolute right-0 top-0 h-full cursor-col-resize select-none touch-none transition-all duration-150 ${
                          header.column.getIsResizing()
                            ? "w-1 opacity-100"
                            : "w-1 opacity-0 hover:opacity-100"
                        }`}
                        style={{
                          userSelect: "none",
                          backgroundColor: "var(--color-accent)",
                          boxShadow: header.column.getIsResizing()
                            ? "0 0 6px color-mix(in srgb, var(--color-accent) 50%, transparent)"
                            : undefined,
                        }}
                      />
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody data-testid="data-grid-body" className={`transition-opacity duration-150${pageTransitioning ? " opacity-30" : ""}`}>
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
              table.getRowModel().rows.map((row, rowIndex) => (
                <tr key={row.id} role="row" className={`border-b transition-colors duration-150 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] datagrid-row-enter${rowIndex % 2 === 1 ? " bg-black/[0.02] dark:bg-white/[0.02]" : ""}`} style={{ borderColor: "var(--color-border)", ...(rowIndex < 10 && { animationDelay: `calc(${rowIndex} * 20ms)` }) }}>
                  {row.getVisibleCells().map((cell) => {
                    const isNumeric = numericColumns.has(cell.column.id);
                    return (
                      <td
                        key={cell.id}
                        role="cell"
                        className={`px-3 py-1.5 truncate ${isNumeric ? "text-right" : ""}`}
                        title={cell.getValue() != null ? String(cell.getValue()) : ""}
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
            <span className="flex items-center gap-1">
              Page{" "}
              <input
                type="number"
                aria-label="Go to page"
                min={1}
                max={pageCount}
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                onBlur={goToPage}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.currentTarget.blur();
                  }
                }}
                className="w-12 text-center bg-transparent border border-[var(--color-border)] rounded px-1 py-0.5 text-xs hide-spin-buttons"
              />{" "}
              of {pageCount}
            </span>
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
