// Tests: excelExport (downloadExcel)
//
// Verifies:
// - downloadExcel is a callable async function
// - downloadExcel sends correct payload to /export/xlsx endpoint
// - downloadExcel triggers file download via DOM anchor element
// - downloadExcel handles empty data (no rows, no columns)
// - downloadExcel handles special characters in data
// - downloadExcel strips .xlsx extension from filename before sending
// - downloadExcel sets .xlsx extension on download filename
// - downloadExcel throws on non-ok backend response
// - downloadExcel converts object rows to arrays via cellValueRaw
// - downloadExcel revokes object URL after download

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../helpers/mocks/server";
import { downloadExcel } from "@/utils/excelExport";

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
  revokedUrls = [];

  // Mock anchor element for download triggering
  mockAnchor = { href: "", download: "", click: vi.fn() };
  vi.spyOn(document, "createElement").mockReturnValue(mockAnchor as unknown as HTMLElement);
  vi.spyOn(document.body, "appendChild").mockImplementation((node) => node);
  vi.spyOn(document.body, "removeChild").mockImplementation((node) => node);

  // URL.createObjectURL / revokeObjectURL don't exist in jsdom,
  // so we assign mock functions directly instead of using vi.spyOn.
  mockCreateObjectURL = vi.fn().mockReturnValue("blob:fake-excel-url");
  mockRevokeObjectURL = vi.fn((url: string) => {
    revokedUrls.push(url);
  });
  URL.createObjectURL = mockCreateObjectURL;
  URL.revokeObjectURL = mockRevokeObjectURL;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Helper to set up a successful /export/xlsx handler
function mockXlsxEndpoint(
  onRequest?: (body: unknown) => void,
): void {
  server.use(
    http.post("/export/xlsx", async ({ request }) => {
      const body = await request.json();
      onRequest?.(body);
      // Return a fake xlsx blob
      return new HttpResponse(
        new Blob(["fake-xlsx-bytes"], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        { status: 200 },
      );
    }),
  );
}

describe("downloadExcel", () => {
  it("is a callable async function", () => {
    expect(typeof downloadExcel).toBe("function");
    // Calling it returns a Promise
    mockXlsxEndpoint();
    const result = downloadExcel(["a"], [["1"]], "test.xlsx");
    expect(result).toBeInstanceOf(Promise);
  });

  it("sends correct payload to /export/xlsx endpoint", async () => {
    let capturedBody: unknown = null;
    mockXlsxEndpoint((body) => {
      capturedBody = body;
    });

    await downloadExcel(
      ["id", "name", "score"],
      [[1, "Alice", 95], [2, "Bob", 87]],
      "grades.xlsx",
    );

    expect(capturedBody).toEqual({
      columns: ["id", "name", "score"],
      rows: [[1, "Alice", 95], [2, "Bob", 87]],
      filename: "grades",
    });
  });

  it("strips .xlsx extension from filename before sending", async () => {
    let capturedBody: unknown = null;
    mockXlsxEndpoint((body) => {
      capturedBody = body;
    });

    await downloadExcel(["a"], [["b"]], "report.xlsx");
    expect((capturedBody as Record<string, unknown>).filename).toBe("report");
  });

  it("does not strip extension when filename has no .xlsx suffix", async () => {
    let capturedBody: unknown = null;
    mockXlsxEndpoint((body) => {
      capturedBody = body;
    });

    await downloadExcel(["a"], [["b"]], "report");
    expect((capturedBody as Record<string, unknown>).filename).toBe("report");
  });

  it("sets .xlsx extension on the download filename", async () => {
    mockXlsxEndpoint();

    await downloadExcel(["a"], [["b"]], "output");
    expect(mockAnchor.download).toBe("output.xlsx");
  });

  it("avoids doubling .xlsx extension when filename already has it", async () => {
    mockXlsxEndpoint();

    await downloadExcel(["a"], [["b"]], "output.xlsx");
    // filename.replace(/\.xlsx$/, "") removes it, then ".xlsx" is appended
    expect(mockAnchor.download).toBe("output.xlsx");
  });

  it("triggers anchor click to initiate download", async () => {
    mockXlsxEndpoint();

    await downloadExcel(["col"], [["val"]], "test.xlsx");
    expect(document.createElement).toHaveBeenCalledWith("a");
    expect(mockAnchor.click).toHaveBeenCalledOnce();
  });

  it("appends and removes anchor from document.body", async () => {
    mockXlsxEndpoint();

    await downloadExcel(["col"], [["val"]], "test.xlsx");
    expect(document.body.appendChild).toHaveBeenCalled();
    expect(document.body.removeChild).toHaveBeenCalled();
  });

  it("revokes the object URL after download", async () => {
    mockXlsxEndpoint();

    await downloadExcel(["a"], [["1"]], "test.xlsx");
    expect(mockRevokeObjectURL).toHaveBeenCalledOnce();
    expect(revokedUrls).toContain("blob:fake-excel-url");
  });

  it("throws an error when backend returns non-ok response", async () => {
    server.use(
      http.post("/export/xlsx", () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );

    await expect(
      downloadExcel(["a"], [["b"]], "fail.xlsx"),
    ).rejects.toThrow("Export failed");
  });

  it("handles empty rows array", async () => {
    let capturedBody: unknown = null;
    mockXlsxEndpoint((body) => {
      capturedBody = body;
    });

    await downloadExcel(["x", "y"], [], "empty.xlsx");
    expect(capturedBody).toEqual({
      columns: ["x", "y"],
      rows: [],
      filename: "empty",
    });
    expect(mockAnchor.click).toHaveBeenCalledOnce();
  });

  it("handles empty columns array", async () => {
    let capturedBody: unknown = null;
    mockXlsxEndpoint((body) => {
      capturedBody = body;
    });

    await downloadExcel([], [], "no-cols.xlsx");
    expect(capturedBody).toEqual({
      columns: [],
      rows: [],
      filename: "no-cols",
    });
  });

  it("handles special characters in cell data", async () => {
    let capturedBody: unknown = null;
    mockXlsxEndpoint((body) => {
      capturedBody = body;
    });

    await downloadExcel(
      ["text"],
      [['He said "hello"'], ["comma, here"], ["line1\nline2"]],
      "special.xlsx",
    );

    expect((capturedBody as Record<string, unknown>).rows).toEqual([
      ['He said "hello"'],
      ["comma, here"],
      ["line1\nline2"],
    ]);
  });

  it("converts object rows to arrays via cellValueRaw", async () => {
    let capturedBody: unknown = null;
    mockXlsxEndpoint((body) => {
      capturedBody = body;
    });

    await downloadExcel(
      ["id", "name"],
      [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }],
      "objects.xlsx",
    );

    // cellValueRaw extracts values by column name from object rows
    expect((capturedBody as Record<string, unknown>).rows).toEqual([
      [1, "Alice"],
      [2, "Bob"],
    ]);
  });

  it("sends request with correct headers and credentials", async () => {
    let capturedHeaders: Headers | null = null;
    let capturedCredentials = "";
    server.use(
      http.post("/export/xlsx", async ({ request }) => {
        capturedHeaders = new Headers(request.headers);
        // MSW doesn't expose credentials directly, but we verify Content-Type
        return new HttpResponse(new Blob(["ok"]), { status: 200 });
      }),
    );

    await downloadExcel(["a"], [["1"]], "test.xlsx");
    expect(capturedHeaders!.get("content-type")).toBe("application/json");
  });
});
