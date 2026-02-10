import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { downloadTableJson } from "@/utils/exportJson";

describe("downloadTableJson", () => {
  let createObjectURLMock: ReturnType<typeof vi.fn>;
  let revokeObjectURLMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createObjectURLMock = vi.fn(() => "blob:http://localhost/fake");
    revokeObjectURLMock = vi.fn();
    global.URL.createObjectURL = createObjectURLMock;
    global.URL.revokeObjectURL = revokeObjectURLMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("converts array rows to JSON objects with column keys", () => {
    const columns = ["name", "age"];
    const rows = [["Alice", 30], ["Bob", 25]];

    // Mock document.createElement and related DOM methods
    const mockLink = {
      href: "",
      download: "",
      click: vi.fn(),
    };
    const appendChildSpy = vi.spyOn(document.body, "appendChild").mockImplementation(() => mockLink as any);
    const removeChildSpy = vi.spyOn(document.body, "removeChild").mockImplementation(() => mockLink as any);
    vi.spyOn(document, "createElement").mockReturnValue(mockLink as any);

    downloadTableJson(columns, rows, "test.json");

    // Verify Blob was created with correct JSON content
    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    const blobArg = createObjectURLMock.mock.calls[0][0];
    expect(blobArg).toBeInstanceOf(Blob);

    // Verify link was clicked and cleaned up
    expect(mockLink.download).toBe("test.json");
    expect(mockLink.click).toHaveBeenCalled();
    expect(revokeObjectURLMock).toHaveBeenCalled();

    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
  });

  it("handles object rows", () => {
    const columns = ["x", "y"];
    const rows = [{ x: 1, y: 2 }];

    const mockLink = { href: "", download: "", click: vi.fn() };
    const appendChildSpy = vi.spyOn(document.body, "appendChild").mockImplementation(() => mockLink as any);
    const removeChildSpy = vi.spyOn(document.body, "removeChild").mockImplementation(() => mockLink as any);
    vi.spyOn(document, "createElement").mockReturnValue(mockLink as any);

    downloadTableJson(columns, rows, "test.json");

    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    expect(mockLink.download).toBe("test.json");

    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
  });

  it("handles null values", () => {
    const columns = ["a"];
    const rows = [[null]];

    const mockLink = { href: "", download: "", click: vi.fn() };
    const appendChildSpy = vi.spyOn(document.body, "appendChild").mockImplementation(() => mockLink as any);
    const removeChildSpy = vi.spyOn(document.body, "removeChild").mockImplementation(() => mockLink as any);
    vi.spyOn(document, "createElement").mockReturnValue(mockLink as any);

    downloadTableJson(columns, rows, "test.json");

    expect(createObjectURLMock).toHaveBeenCalledTimes(1);

    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
  });

  it("handles empty rows", () => {
    const columns = ["a", "b"];
    const rows: unknown[] = [];

    const mockLink = { href: "", download: "", click: vi.fn() };
    const appendChildSpy = vi.spyOn(document.body, "appendChild").mockImplementation(() => mockLink as any);
    const removeChildSpy = vi.spyOn(document.body, "removeChild").mockImplementation(() => mockLink as any);
    vi.spyOn(document, "createElement").mockReturnValue(mockLink as any);

    downloadTableJson(columns, rows, "empty.json");

    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    expect(mockLink.download).toBe("empty.json");

    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
  });
});
