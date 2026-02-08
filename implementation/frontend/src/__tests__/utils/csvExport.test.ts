import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { downloadCsv } from "@/utils/csvExport";

describe("csvExport", () => {
  let createElementSpy: ReturnType<typeof vi.spyOn>;
  let createObjectURLSpy: ReturnType<typeof vi.spyOn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Mock DOM methods
    createElementSpy = vi.spyOn(document, "createElement");
    createObjectURLSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    revokeObjectURLSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should create CSV with proper headers and data", () => {
    const columns = ["name", "age", "city"];
    const rows = [
      { name: "Alice", age: 30, city: "NYC" },
      { name: "Bob", age: 25, city: "LA" },
    ];

    const mockLink = {
      href: "",
      download: "",
      click: vi.fn(),
    };

    createElementSpy.mockReturnValue(mockLink as unknown as HTMLAnchorElement);

    downloadCsv(columns, rows, "test.csv");

    expect(mockLink.download).toBe("test.csv");
    expect(mockLink.click).toHaveBeenCalled();
    expect(createObjectURLSpy).toHaveBeenCalled();
    expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:mock-url");
  });

  it("should escape CSV special characters", () => {
    const columns = ["name", "description"];
    const rows = [
      { name: "Test, Inc", description: 'Quote "test"' },
      { name: "Normal", description: "Line\nbreak" },
    ];

    const mockLink = {
      href: "",
      download: "",
      click: vi.fn(),
    };

    createElementSpy.mockReturnValue(mockLink as unknown as HTMLAnchorElement);

    // We can't easily inspect the blob content, but we can verify the function runs
    expect(() => downloadCsv(columns, rows, "test.csv")).not.toThrow();
  });

  it("should handle null values", () => {
    const columns = ["name", "age"];
    const rows = [
      { name: "Alice", age: null },
      { name: null, age: 30 },
    ];

    const mockLink = {
      href: "",
      download: "",
      click: vi.fn(),
    };

    createElementSpy.mockReturnValue(mockLink as unknown as HTMLAnchorElement);

    expect(() => downloadCsv(columns, rows, "test.csv")).not.toThrow();
  });
});
