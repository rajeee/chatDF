// Tests: Dataset quick stats tooltip on ready dataset cards
//
// DS-STATS-1: Stats tooltip element exists on ready dataset card
// DS-STATS-2: Stats tooltip is not rendered on loading dataset card
// DS-STATS-3: Stats tooltip is not rendered on error dataset card
// DS-STATS-4: Stats tooltip shows correct format from URL extension
// DS-STATS-5: Stats tooltip shows column type summary from schema_json
// DS-STATS-6: getFormat helper returns "Parquet" for .parquet URLs
// DS-STATS-7: getFormat helper returns "Unknown" for URLs without extension

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  renderWithProviders,
  screen,
} from "../../helpers/render";
import { resetAllStores, type Dataset } from "../../helpers/stores";
import { DatasetCard } from "@/components/right-panel/DatasetCard";
import {
  getFormat,
  getColumnTypeSummary,
} from "@/components/right-panel/DatasetCard";

function makeDataset(overrides: Partial<Dataset> = {}): Dataset {
  return {
    id: "ds-1",
    conversation_id: "conv-1",
    url: "https://data.example.com/sales.parquet",
    name: "sales",
    row_count: 133433,
    column_count: 23,
    schema_json: "{}",
    status: "ready",
    error_message: null,
    ...overrides,
  };
}

beforeEach(() => {
  resetAllStores();
});

describe("DS-STATS-1: Stats tooltip element exists on ready dataset card", () => {
  it("renders the stats tooltip on a ready dataset card", () => {
    const dataset = makeDataset();

    renderWithProviders(<DatasetCard dataset={dataset} />);

    const tooltip = screen.getByTestId("dataset-stats-tooltip");
    expect(tooltip).toBeInTheDocument();
  });
});

describe("DS-STATS-2: Stats tooltip is not rendered on loading dataset card", () => {
  it("does not render the stats tooltip on a loading dataset card", () => {
    const dataset = makeDataset({
      status: "loading",
      name: "",
      row_count: 0,
      column_count: 0,
    });

    renderWithProviders(<DatasetCard dataset={dataset} />);

    expect(screen.queryByTestId("dataset-stats-tooltip")).not.toBeInTheDocument();
  });
});

describe("DS-STATS-3: Stats tooltip is not rendered on error dataset card", () => {
  it("does not render the stats tooltip on an error dataset card", () => {
    const dataset = makeDataset({
      status: "error",
      error_message: "Could not access URL",
    });

    renderWithProviders(<DatasetCard dataset={dataset} />);

    expect(screen.queryByTestId("dataset-stats-tooltip")).not.toBeInTheDocument();
  });
});

describe("DS-STATS-4: Stats tooltip shows correct format from URL extension", () => {
  it("shows 'Format: Parquet' for a .parquet URL", () => {
    const dataset = makeDataset({
      url: "https://data.example.com/sales.parquet",
    });

    renderWithProviders(<DatasetCard dataset={dataset} />);

    const tooltip = screen.getByTestId("dataset-stats-tooltip");
    expect(tooltip.textContent).toContain("Format: Parquet");
  });

  it("shows 'Format: Csv' for a .csv URL", () => {
    const dataset = makeDataset({
      url: "https://data.example.com/sales.csv",
    });

    renderWithProviders(<DatasetCard dataset={dataset} />);

    const tooltip = screen.getByTestId("dataset-stats-tooltip");
    expect(tooltip.textContent).toContain("Format: Csv");
  });

  it("shows 'Format: Unknown' for a URL without extension", () => {
    const dataset = makeDataset({
      url: "https://data.example.com/sales",
    });

    renderWithProviders(<DatasetCard dataset={dataset} />);

    const tooltip = screen.getByTestId("dataset-stats-tooltip");
    expect(tooltip.textContent).toContain("Format: Unknown");
  });
});

describe("DS-STATS-5: Stats tooltip shows column type summary from schema_json", () => {
  it("shows grouped column type counts from schema_json", () => {
    const schema = {
      id: "Int64",
      name: "Utf8",
      email: "Utf8",
      age: "Int32",
      salary: "Float64",
    };
    const dataset = makeDataset({
      schema_json: JSON.stringify(schema),
      column_count: 5,
    });

    renderWithProviders(<DatasetCard dataset={dataset} />);

    const tooltip = screen.getByTestId("dataset-stats-tooltip");
    // Utf8 appears twice so it comes first
    expect(tooltip.textContent).toContain("Columns: 2 Utf8, 1 Float64, 1 Int32, 1 Int64");
  });

  it("does not show Columns line when schema_json is empty object", () => {
    const dataset = makeDataset({
      schema_json: "{}",
    });

    renderWithProviders(<DatasetCard dataset={dataset} />);

    const tooltip = screen.getByTestId("dataset-stats-tooltip");
    expect(tooltip.textContent).not.toContain("Columns:");
  });
});

describe("DS-STATS-6: getFormat helper returns 'Parquet' for .parquet URLs", () => {
  it("returns 'Parquet' for a .parquet URL", () => {
    expect(getFormat("https://data.example.com/sales.parquet")).toBe("Parquet");
  });

  it("returns 'Csv' for a .csv URL", () => {
    expect(getFormat("https://data.example.com/data.csv")).toBe("Csv");
  });

  it("returns 'Iceberg' for a .iceberg URL", () => {
    expect(getFormat("https://data.example.com/lake.iceberg")).toBe("Iceberg");
  });

  it("handles URLs with query parameters", () => {
    expect(getFormat("https://data.example.com/file.parquet?token=abc")).toBe("Parquet");
  });

  it("handles URLs with multiple dots in filename", () => {
    expect(getFormat("https://data.example.com/my.data.file.json")).toBe("Json");
  });
});

describe("DS-STATS-7: getFormat helper returns 'Unknown' for URLs without extension", () => {
  it("returns 'Unknown' for a URL with no file extension", () => {
    expect(getFormat("https://data.example.com/sales")).toBe("Unknown");
  });

  it("returns 'Unknown' for a URL ending with a slash", () => {
    expect(getFormat("https://data.example.com/data/")).toBe("Unknown");
  });

  it("returns 'Unknown' for an invalid URL", () => {
    expect(getFormat("not-a-url")).toBe("Unknown");
  });
});

describe("getColumnTypeSummary helper", () => {
  it("returns empty string for empty object", () => {
    expect(getColumnTypeSummary("{}")).toBe("");
  });

  it("returns empty string for invalid JSON", () => {
    expect(getColumnTypeSummary("not json")).toBe("");
  });

  it("groups and counts types sorted by count descending", () => {
    const schema = { a: "Utf8", b: "Utf8", c: "Utf8", d: "Int64" };
    expect(getColumnTypeSummary(JSON.stringify(schema))).toBe("3 Utf8, 1 Int64");
  });

  it("sorts types with equal counts alphabetically", () => {
    const schema = { a: "Int64", b: "Utf8", c: "Float64" };
    const result = getColumnTypeSummary(JSON.stringify(schema));
    expect(result).toBe("1 Float64, 1 Int64, 1 Utf8");
  });
});
