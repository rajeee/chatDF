// Tests: csvExport (downloadCsv, exportCsv)
//
// Verifies:
// - downloadCsv generates correct CSV content from headers and rows
// - CSV escaping handles commas, quotes, and newlines in cell data
// - downloadCsv handles empty data (no rows, no columns)
// - downloadCsv handles numeric, boolean, null, and undefined values
// - downloadCsv triggers file download via DOM anchor element
// - exportCsv sends correct payload to backend endpoint
// - exportCsv triggers download from backend response blob
// - exportCsv throws on non-ok response
// - exportCsv strips .csv extension from filename before sending

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../helpers/mocks/server";
import { downloadCsv, exportCsv } from "@/utils/csvExport";

// -- Shared DOM mocks --

let mockAnchor: {
  href: string;
  download: string;
  click: ReturnType<typeof vi.fn>;
};

let revokedUrls: string[];
let mockCreateObjectURL: ReturnType<typeof vi.fn>;
let mockRevokeObjectURL: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // Reset tracking state
  revokedUrls = [];

  // Mock anchor element for download triggering
  mockAnchor = { href: "", download: "", click: vi.fn() };
  vi.spyOn(document, "createElement").mockReturnValue(mockAnchor as unknown as HTMLElement);
  vi.spyOn(document.body, "appendChild").mockImplementation((node) => node);
  vi.spyOn(document.body, "removeChild").mockImplementation((node) => node);

  // URL.createObjectURL / revokeObjectURL don't exist in jsdom,
  // so we assign mock functions directly instead of using vi.spyOn.
  mockCreateObjectURL = vi.fn().mockReturnValue("blob:fake-csv-url");
  mockRevokeObjectURL = vi.fn((url: string) => {
    revokedUrls.push(url);
  });
  URL.createObjectURL = mockCreateObjectURL;
  URL.revokeObjectURL = mockRevokeObjectURL;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Track Blob constructor calls to capture CSV content.
// downloadCsv passes [csvString] as the first arg to new Blob().
const OriginalBlob = globalThis.Blob;
let lastBlobParts: BlobPart[] | null = null;

beforeEach(() => {
  lastBlobParts = null;
  globalThis.Blob = class extends OriginalBlob {
    constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
      super(parts, options);
      lastBlobParts = parts ?? null;
    }
  } as typeof Blob;
});

afterEach(() => {
  globalThis.Blob = OriginalBlob;
});

// Helper: call downloadCsv and return the CSV string that was written into the Blob
function captureDownloadCsv(
  columns: string[],
  rows: unknown[],
  filename: string,
): string {
  lastBlobParts = null;
  downloadCsv(columns, rows, filename);
  expect(lastBlobParts).not.toBeNull();
  // downloadCsv creates Blob([csvString], ...) so the first part is the CSV text
  return lastBlobParts![0] as string;
}

// ===== downloadCsv (client-side) =====

describe("downloadCsv", () => {
  it("generates CSV with headers and simple string rows", () => {
    const csv = captureDownloadCsv(
      ["name", "city"],
      [["Alice", "Paris"], ["Bob", "London"]],
      "test.csv",
    );
    expect(csv).toBe("name,city\nAlice,Paris\nBob,London");
  });

  it("escapes cell values containing commas", () => {
    const csv = captureDownloadCsv(
      ["desc"],
      [["one, two"]],
      "test.csv",
    );
    // A cell with a comma must be wrapped in quotes
    expect(csv).toBe('desc\n"one, two"');
  });

  it("escapes cell values containing double quotes", () => {
    const csv = captureDownloadCsv(
      ["quote"],
      [['He said "hi"']],
      "test.csv",
    );
    // Internal quotes are doubled and the whole field is quoted
    expect(csv).toBe('quote\n"He said ""hi"""');
  });

  it("escapes cell values containing newlines", () => {
    const csv = captureDownloadCsv(
      ["multi"],
      [["line1\nline2"]],
      "test.csv",
    );
    expect(csv).toBe('multi\n"line1\nline2"');
  });

  it("handles combined special characters in a single cell", () => {
    const csv = captureDownloadCsv(
      ["data"],
      [['a,b\n"c"']],
      "test.csv",
    );
    // Comma, newline, and quotes all present
    expect(csv).toBe('data\n"a,b\n""c"""');
  });

  it("converts null and undefined values to empty strings", () => {
    const csv = captureDownloadCsv(
      ["a", "b", "c"],
      [[null, undefined, "ok"]],
      "test.csv",
    );
    // null/undefined become empty via escape(val): if (val == null) return ""
    expect(csv).toBe("a,b,c\n,,ok");
  });

  it("converts numeric and boolean values to strings", () => {
    const csv = captureDownloadCsv(
      ["num", "bool", "zero", "neg"],
      [[42, true, 0, -3.14]],
      "test.csv",
    );
    expect(csv).toBe("num,bool,zero,neg\n42,true,0,-3.14");
  });

  it("handles empty rows array (header only)", () => {
    const csv = captureDownloadCsv(["x", "y"], [], "test.csv");
    // Header row followed by newline, then empty body
    expect(csv).toBe("x,y\n");
  });

  it("handles empty columns array", () => {
    const csv = captureDownloadCsv([], [[1, 2]], "test.csv");
    // No columns means no header values and no cell values extracted
    expect(csv).toBe("\n");
  });

  it("handles rows as objects (keyed by column name)", () => {
    const csv = captureDownloadCsv(
      ["id", "name"],
      [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }],
      "test.csv",
    );
    expect(csv).toBe("id,name\n1,Alice\n2,Bob");
  });

  it("handles a large number of columns", () => {
    const cols = Array.from({ length: 50 }, (_, i) => `col${i}`);
    const row = Array.from({ length: 50 }, (_, i) => `val${i}`);
    const csv = captureDownloadCsv(cols, [row], "test.csv");
    const lines = csv.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0].split(",")).toHaveLength(50);
    expect(lines[1].split(",")).toHaveLength(50);
    expect(lines[0]).toBe(cols.join(","));
    expect(lines[1]).toBe(row.join(","));
  });

  it("triggers download via anchor element click", () => {
    downloadCsv(["a"], [["1"]], "output.csv");
    expect(document.createElement).toHaveBeenCalledWith("a");
    expect(mockAnchor.download).toBe("output.csv");
    expect(mockAnchor.click).toHaveBeenCalledOnce();
  });

  it("appends and removes anchor from document.body", () => {
    downloadCsv(["a"], [["1"]], "output.csv");
    expect(document.body.appendChild).toHaveBeenCalled();
    expect(document.body.removeChild).toHaveBeenCalled();
  });

  it("revokes the object URL after download", () => {
    downloadCsv(["a"], [["1"]], "output.csv");
    expect(mockRevokeObjectURL).toHaveBeenCalledOnce();
    // The URL passed to revokeObjectURL should match the one from createObjectURL
    const createdUrl = mockCreateObjectURL.mock.results[0].value;
    expect(mockRevokeObjectURL).toHaveBeenCalledWith(createdUrl);
  });

  it("creates Blob with correct MIME type", () => {
    let capturedBlob: Blob | null = null;
    mockCreateObjectURL.mockImplementation((blob: Blob) => {
      capturedBlob = blob;
      return "blob:mime-test";
    });
    downloadCsv(["a"], [["1"]], "test.csv");
    expect(capturedBlob).not.toBeNull();
    expect(capturedBlob!.type).toBe("text/csv;charset=utf-8;");
  });
});

// ===== exportCsv (backend-based) =====

describe("exportCsv", () => {
  it("sends correct payload to /export/csv endpoint", async () => {
    let capturedBody: unknown = null;
    server.use(
      http.post("/export/csv", async ({ request }) => {
        capturedBody = await request.json();
        return new HttpResponse(new Blob(["col\nval"], { type: "text/csv" }), {
          status: 200,
        });
      }),
    );

    await exportCsv(["col"], [["val"]], "report.csv");

    expect(capturedBody).toEqual({
      columns: ["col"],
      rows: [["val"]],
      filename: "report",
    });
  });

  it("strips .csv extension from filename before sending", async () => {
    let capturedBody: unknown = null;
    server.use(
      http.post("/export/csv", async ({ request }) => {
        capturedBody = await request.json();
        return new HttpResponse(new Blob(["ok"]), { status: 200 });
      }),
    );

    await exportCsv(["a"], [["b"]], "data.csv");
    expect((capturedBody as Record<string, unknown>).filename).toBe("data");
  });

  it("sets download filename with .csv extension", async () => {
    server.use(
      http.post("/export/csv", () => {
        return new HttpResponse(new Blob(["ok"]), { status: 200 });
      }),
    );

    await exportCsv(["a"], [["b"]], "report");
    expect(mockAnchor.download).toBe("report.csv");
  });

  it("throws an error when backend returns non-ok response", async () => {
    server.use(
      http.post("/export/csv", () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );

    await expect(exportCsv(["a"], [["b"]], "fail.csv")).rejects.toThrow(
      "CSV export failed",
    );
  });

  it("triggers anchor click to download the response blob", async () => {
    server.use(
      http.post("/export/csv", () => {
        return new HttpResponse(new Blob(["csv-data"]), { status: 200 });
      }),
    );

    await exportCsv(["a"], [["b"]], "dl.csv");
    expect(mockAnchor.click).toHaveBeenCalledOnce();
    expect(mockRevokeObjectURL).toHaveBeenCalledOnce();
  });

  it("sends object rows converted to arrays via cellValueRaw", async () => {
    let capturedBody: unknown = null;
    server.use(
      http.post("/export/csv", async ({ request }) => {
        capturedBody = await request.json();
        return new HttpResponse(new Blob(["ok"]), { status: 200 });
      }),
    );

    await exportCsv(
      ["id", "name"],
      [{ id: 10, name: "Alice" }, { id: 20, name: "Bob" }],
      "obj.csv",
    );

    // cellValueRaw converts object rows to arrays based on column names
    expect((capturedBody as Record<string, unknown>).rows).toEqual([
      [10, "Alice"],
      [20, "Bob"],
    ]);
  });
});
