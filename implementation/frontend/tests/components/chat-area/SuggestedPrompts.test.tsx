// Comprehensive tests for SuggestedPrompts component and buildSmartSuggestions utility.
//
// Unit tests for buildSmartSuggestions:
//   BSS-1: Returns empty array for empty datasets
//   BSS-2: Returns generic fallback when schema_json is invalid JSON
//   BSS-3: Returns generic fallback when schema has no columns
//   BSS-4: Returns group-by suggestion for numeric + categorical columns
//   BSS-5: Returns summary stats suggestion for numeric-only columns
//   BSS-6: Returns trend suggestion when date + numeric columns exist
//   BSS-7: Returns distribution suggestion for categorical columns
//   BSS-8: Caps suggestions at 4
//   BSS-9: Fills remaining slots with filler suggestions
//   BSS-10: Handles schema as {columns: [...]} format
//   BSS-11: Handles schema as plain array format
//   BSS-12: Handles underscore formatting in column names
//
// Component rendering tests:
//   SP-RENDER-1: Renders suggested-prompts container
//   SP-RENDER-2: Renders correct number of suggestion chips
//   SP-RENDER-3: Chips have role="option"
//   SP-RENDER-4: Container has role="listbox"
//   SP-RENDER-5: Uses template prompts when available
//   SP-RENDER-6: Clicking a chip calls onSendPrompt
//   SP-RENDER-7: Clicking clears template prompts if they exist
//
// Keyboard navigation tests:
//   SP-KB-1: ArrowRight moves focus to next chip
//   SP-KB-2: ArrowLeft moves focus to previous chip
//   SP-KB-3: ArrowDown wraps to first chip at end
//   SP-KB-4: ArrowUp wraps to last chip from first
//   SP-KB-5: Enter sends the focused suggestion
//   SP-KB-6: First chip is tabbable by default (tabIndex=0)

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, userEvent, act } from "../../helpers/render";
import { resetAllStores } from "../../helpers/stores";
import { useChatStore } from "@/stores/chatStore";
import {
  buildSmartSuggestions,
  SuggestedPrompts,
} from "@/components/chat-area/SuggestedPrompts";
import type { Dataset } from "@/stores/datasetStore";

/* ---------- Dataset factory ---------- */

function makeDataset(overrides?: Partial<Dataset>): Dataset {
  return {
    id: "ds1",
    conversation_id: "conv-1",
    url: "http://example.com/data.parquet",
    name: "test_data",
    row_count: 100,
    column_count: 3,
    schema_json: JSON.stringify([
      { name: "revenue", type: "Float64" },
      { name: "category", type: "String" },
      { name: "created_at", type: "Date" },
    ]),
    status: "ready",
    error_message: null,
    ...overrides,
  } as Dataset;
}

beforeEach(() => {
  resetAllStores();
});

/* ========================================================
   Unit tests for buildSmartSuggestions
   ======================================================== */
describe("buildSmartSuggestions", () => {
  it("BSS-1: returns empty array for empty datasets", () => {
    expect(buildSmartSuggestions([])).toEqual([]);
  });

  it("BSS-2: returns generic fallback when schema_json is invalid JSON", () => {
    const ds = makeDataset({ schema_json: "NOT VALID JSON {{{" });
    const result = buildSmartSuggestions([ds]);

    expect(result).toHaveLength(4);
    expect(result[0]).toContain("first 5 rows");
    expect(result[1]).toContain("How many rows");
    expect(result[2]).toContain("Describe the columns");
    expect(result[3]).toContain("summary statistics");
  });

  it("BSS-3: returns generic fallback when schema has no columns (empty array)", () => {
    const ds = makeDataset({ schema_json: "[]" });
    const result = buildSmartSuggestions([ds]);

    expect(result).toHaveLength(4);
    expect(result[0]).toBe("Show me the first 5 rows of test_data");
    expect(result[1]).toBe("How many rows are in test_data?");
    expect(result[2]).toBe("Describe the columns in test_data");
    expect(result[3]).toBe("What are the summary statistics for test_data?");
  });

  it("BSS-4: returns group-by suggestion for numeric + categorical columns", () => {
    const ds = makeDataset({
      schema_json: JSON.stringify([
        { name: "sales_amount", type: "Float64" },
        { name: "region", type: "String" },
      ]),
    });
    const result = buildSmartSuggestions([ds]);

    // First is always the "first 5 rows" preview
    expect(result[0]).toContain("first 5 rows");
    // Second should be the group-by aggregation
    expect(result[1]).toBe(
      "What is the average sales amount by region?"
    );
  });

  it("BSS-5: returns summary stats suggestion for numeric-only columns", () => {
    const ds = makeDataset({
      schema_json: JSON.stringify([
        { name: "price", type: "Float64" },
        { name: "quantity", type: "Int32" },
      ]),
    });
    const result = buildSmartSuggestions([ds]);

    expect(result[0]).toContain("first 5 rows");
    // No categorical cols, so falls to numeric-only branch
    expect(result[1]).toBe(
      "What are the min, max, and average price?"
    );
  });

  it("BSS-6: returns trend suggestion when date + numeric columns exist", () => {
    const ds = makeDataset({
      schema_json: JSON.stringify([
        { name: "revenue", type: "Float64" },
        { name: "order_date", type: "Date" },
      ]),
    });
    const result = buildSmartSuggestions([ds]);

    const trendSuggestion = result.find((s) =>
      s.includes("trend of revenue over order date")
    );
    expect(trendSuggestion).toBeDefined();
  });

  it("BSS-7: returns distribution suggestion for categorical columns", () => {
    const ds = makeDataset({
      schema_json: JSON.stringify([
        { name: "revenue", type: "Float64" },
        { name: "status", type: "String" },
      ]),
    });
    const result = buildSmartSuggestions([ds]);

    const distSuggestion = result.find((s) =>
      s.includes("distribution of status")
    );
    expect(distSuggestion).toBeDefined();
  });

  it("BSS-8: caps suggestions at 4", () => {
    // Provide a rich schema that would produce many suggestions
    const ds = makeDataset({
      schema_json: JSON.stringify([
        { name: "amount", type: "Float64" },
        { name: "category", type: "String" },
        { name: "created_at", type: "Date" },
        { name: "region", type: "Categorical" },
        { name: "price", type: "Decimal" },
      ]),
    });
    const result = buildSmartSuggestions([ds]);

    expect(result.length).toBeLessThanOrEqual(4);
  });

  it("BSS-9: fills remaining slots with filler suggestions when few schema suggestions exist", () => {
    // Only numeric columns => preview + summary stats = 2 suggestions, needs fillers
    const ds = makeDataset({
      schema_json: JSON.stringify([{ name: "value", type: "Int64" }]),
    });
    const result = buildSmartSuggestions([ds]);

    expect(result).toHaveLength(4);
    // The filler suggestions include "summary statistics" and "How many rows"
    const hasFillers = result.some((s) => s.includes("summary statistics")) ||
      result.some((s) => s.includes("How many rows"));
    expect(hasFillers).toBe(true);
  });

  it("BSS-10: handles schema as {columns: [...]} format", () => {
    const ds = makeDataset({
      schema_json: JSON.stringify({
        columns: [
          { name: "total_cost", type: "Float64" },
          { name: "department", type: "String" },
        ],
      }),
    });
    const result = buildSmartSuggestions([ds]);

    // Should not produce fallback (which has "Describe the columns")
    expect(result.some((s) => s.includes("Describe the columns"))).toBe(false);
    // Should produce a group-by suggestion based on parsed columns
    expect(result.some((s) => s.includes("average total cost by department"))).toBe(true);
  });

  it("BSS-11: handles schema as plain array format", () => {
    const ds = makeDataset({
      schema_json: JSON.stringify([
        { name: "weight", type: "Float32" },
        { name: "color", type: "Utf8" },
      ]),
    });
    const result = buildSmartSuggestions([ds]);

    expect(result.some((s) => s.includes("average weight by color"))).toBe(true);
  });

  it("BSS-12: handles underscore formatting in column names", () => {
    const ds = makeDataset({
      schema_json: JSON.stringify([
        { name: "total_sales_amount", type: "Float64" },
        { name: "product_category", type: "String" },
      ]),
    });
    const result = buildSmartSuggestions([ds]);

    // Underscores should be replaced with spaces
    expect(result.some((s) => s.includes("total sales amount"))).toBe(true);
    expect(result.some((s) => s.includes("product category"))).toBe(true);
    // Should NOT contain underscores in the formatted portions
    expect(result.some((s) => s.includes("total_sales_amount"))).toBe(false);
  });
});

/* ========================================================
   Component rendering tests
   ======================================================== */
describe("SuggestedPrompts rendering", () => {
  it("SP-RENDER-1: renders suggested-prompts container", () => {
    const ds = makeDataset();
    const onSendPrompt = vi.fn();

    renderWithProviders(
      <SuggestedPrompts datasets={[ds]} onSendPrompt={onSendPrompt} />
    );

    expect(screen.getByTestId("suggested-prompts")).toBeInTheDocument();
  });

  it("SP-RENDER-2: renders correct number of suggestion chips", () => {
    const ds = makeDataset();
    const onSendPrompt = vi.fn();

    renderWithProviders(
      <SuggestedPrompts datasets={[ds]} onSendPrompt={onSendPrompt} />
    );

    const options = screen.getAllByRole("option");
    const expectedSuggestions = buildSmartSuggestions([ds]);
    expect(options).toHaveLength(expectedSuggestions.length);
  });

  it("SP-RENDER-3: chips have role='option'", () => {
    const ds = makeDataset();
    const onSendPrompt = vi.fn();

    renderWithProviders(
      <SuggestedPrompts datasets={[ds]} onSendPrompt={onSendPrompt} />
    );

    const options = screen.getAllByRole("option");
    expect(options.length).toBeGreaterThan(0);
    for (const option of options) {
      expect(option).toHaveAttribute("role", "option");
    }
  });

  it("SP-RENDER-4: container has role='listbox'", () => {
    const ds = makeDataset();
    const onSendPrompt = vi.fn();

    renderWithProviders(
      <SuggestedPrompts datasets={[ds]} onSendPrompt={onSendPrompt} />
    );

    const listbox = screen.getByRole("listbox", { name: /suggested prompts/i });
    expect(listbox).toBeInTheDocument();
  });

  it("SP-RENDER-5: uses template prompts when available over schema suggestions", () => {
    const ds = makeDataset();
    const onSendPrompt = vi.fn();
    const templates = ["Template question 1", "Template question 2", "Template question 3"];
    useChatStore.setState({ templatePrompts: templates });

    renderWithProviders(
      <SuggestedPrompts datasets={[ds]} onSendPrompt={onSendPrompt} />
    );

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(screen.getByText("Template question 1")).toBeInTheDocument();
    expect(screen.getByText("Template question 2")).toBeInTheDocument();
    expect(screen.getByText("Template question 3")).toBeInTheDocument();

    // Schema-based suggestions should NOT be present
    const schemaSuggestions = buildSmartSuggestions([ds]);
    for (const suggestion of schemaSuggestions) {
      // Template prompts are totally different text, so none should match
      if (!templates.includes(suggestion)) {
        expect(screen.queryByText(suggestion)).not.toBeInTheDocument();
      }
    }
  });

  it("SP-RENDER-6: clicking a chip calls onSendPrompt with the chip text", () => {
    const ds = makeDataset();
    const onSendPrompt = vi.fn();

    renderWithProviders(
      <SuggestedPrompts datasets={[ds]} onSendPrompt={onSendPrompt} />
    );

    const options = screen.getAllByRole("option");

    act(() => {
      options[0].click();
    });

    expect(onSendPrompt).toHaveBeenCalledTimes(1);
    expect(onSendPrompt).toHaveBeenCalledWith(options[0].textContent);
  });

  it("SP-RENDER-7: clicking clears template prompts if they exist", () => {
    const ds = makeDataset();
    const onSendPrompt = vi.fn();
    const templates = ["Ask about X", "Ask about Y"];
    useChatStore.setState({ templatePrompts: templates });

    renderWithProviders(
      <SuggestedPrompts datasets={[ds]} onSendPrompt={onSendPrompt} />
    );

    const options = screen.getAllByRole("option");

    act(() => {
      options[0].click();
    });

    // Template prompts should be cleared after click
    expect(useChatStore.getState().templatePrompts).toEqual([]);
    // onSendPrompt should still be called
    expect(onSendPrompt).toHaveBeenCalledWith("Ask about X");
  });
});

/* ========================================================
   Keyboard navigation tests
   ======================================================== */
describe("SuggestedPrompts keyboard navigation", () => {
  it("SP-KB-1: ArrowRight moves focus to next chip", async () => {
    const user = userEvent.setup();
    const ds = makeDataset();
    const onSendPrompt = vi.fn();

    renderWithProviders(
      <SuggestedPrompts datasets={[ds]} onSendPrompt={onSendPrompt} />
    );

    const options = screen.getAllByRole("option");
    expect(options.length).toBeGreaterThanOrEqual(2);

    // Focus first chip
    options[0].focus();
    expect(options[0]).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(options[1]).toHaveFocus();
  });

  it("SP-KB-2: ArrowLeft moves focus to previous chip", async () => {
    const user = userEvent.setup();
    const ds = makeDataset();
    const onSendPrompt = vi.fn();

    renderWithProviders(
      <SuggestedPrompts datasets={[ds]} onSendPrompt={onSendPrompt} />
    );

    const options = screen.getAllByRole("option");
    expect(options.length).toBeGreaterThanOrEqual(2);

    // Focus second chip
    options[1].focus();
    expect(options[1]).toHaveFocus();

    await user.keyboard("{ArrowLeft}");
    expect(options[0]).toHaveFocus();
  });

  it("SP-KB-3: ArrowDown wraps to first chip at end", async () => {
    const user = userEvent.setup();
    const ds = makeDataset();
    const onSendPrompt = vi.fn();

    renderWithProviders(
      <SuggestedPrompts datasets={[ds]} onSendPrompt={onSendPrompt} />
    );

    const options = screen.getAllByRole("option");
    const lastIndex = options.length - 1;

    // Focus last chip
    options[lastIndex].focus();
    expect(options[lastIndex]).toHaveFocus();

    // ArrowDown from last should wrap to first
    await user.keyboard("{ArrowDown}");
    expect(options[0]).toHaveFocus();
  });

  it("SP-KB-4: ArrowUp wraps to last chip from first", async () => {
    const user = userEvent.setup();
    const ds = makeDataset();
    const onSendPrompt = vi.fn();

    renderWithProviders(
      <SuggestedPrompts datasets={[ds]} onSendPrompt={onSendPrompt} />
    );

    const options = screen.getAllByRole("option");
    const lastIndex = options.length - 1;

    // Focus first chip
    options[0].focus();
    expect(options[0]).toHaveFocus();

    // ArrowUp from first should wrap to last
    await user.keyboard("{ArrowUp}");
    expect(options[lastIndex]).toHaveFocus();
  });

  it("SP-KB-5: Enter sends the focused suggestion", async () => {
    const user = userEvent.setup();
    const ds = makeDataset();
    const onSendPrompt = vi.fn();

    renderWithProviders(
      <SuggestedPrompts datasets={[ds]} onSendPrompt={onSendPrompt} />
    );

    const options = screen.getAllByRole("option");

    // Focus first chip, then move to second, then press Enter
    options[0].focus();
    await user.keyboard("{ArrowRight}");
    await user.keyboard("{Enter}");

    expect(onSendPrompt).toHaveBeenCalledTimes(1);
    expect(onSendPrompt).toHaveBeenCalledWith(options[1].textContent);
  });

  it("SP-KB-6: first chip is tabbable by default (tabIndex=0)", () => {
    const ds = makeDataset();
    const onSendPrompt = vi.fn();

    renderWithProviders(
      <SuggestedPrompts datasets={[ds]} onSendPrompt={onSendPrompt} />
    );

    const options = screen.getAllByRole("option");

    // First chip should have tabIndex 0 (the roving tabindex entry point)
    expect(options[0]).toHaveAttribute("tabindex", "0");

    // All others should have tabIndex -1
    for (let i = 1; i < options.length; i++) {
      expect(options[i]).toHaveAttribute("tabindex", "-1");
    }
  });
});
