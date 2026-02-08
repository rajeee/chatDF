import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderWithProviders, screen, act } from "../../helpers/render";
import { resetAllStores } from "../../helpers/stores";
import { DatasetInput } from "@/components/right-panel/DatasetInput";
import { fireEvent } from "@testing-library/react";

vi.mock("@/api/client", () => ({
  apiPost: vi.fn(),
  apiGet: vi.fn(),
}));

describe("DatasetInput clear button", () => {
  beforeEach(() => {
    resetAllStores();
  });

  it("does not show clear button when input is empty", () => {
    renderWithProviders(
      <DatasetInput conversationId="conv-1" datasetCount={0} />
    );
    expect(screen.queryByTestId("clear-url-btn")).not.toBeInTheDocument();
  });

  it("shows clear button when input has text", () => {
    renderWithProviders(
      <DatasetInput conversationId="conv-1" datasetCount={0} />
    );
    const input = screen.getByPlaceholderText("Paste parquet URL...");
    fireEvent.change(input, { target: { value: "https://example.com/data.parquet" } });
    expect(screen.getByTestId("clear-url-btn")).toBeInTheDocument();
  });

  it("clicking clear button clears the input", () => {
    renderWithProviders(
      <DatasetInput conversationId="conv-1" datasetCount={0} />
    );
    const input = screen.getByPlaceholderText("Paste parquet URL...");
    fireEvent.change(input, { target: { value: "https://example.com/data.parquet" } });
    expect(input).toHaveValue("https://example.com/data.parquet");

    const clearBtn = screen.getByTestId("clear-url-btn");
    fireEvent.click(clearBtn);

    expect(input).toHaveValue("");
    expect(screen.queryByTestId("clear-url-btn")).not.toBeInTheDocument();
  });
});
