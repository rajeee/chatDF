import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderWithProviders,
  screen,
  waitFor,
  userEvent,
} from "../../helpers/render";
import { resetAllStores, setChatIdle } from "../../helpers/stores";
import { DatasetInput } from "@/components/right-panel/DatasetInput";
import * as client from "@/api/client";

describe("DatasetInput success flash", () => {
  beforeEach(() => {
    resetAllStores();
    setChatIdle("conv-1");
  });

  it("shows green border and checkmark on successful submit", async () => {
    const apiPostSpy = vi
      .spyOn(client, "apiPost")
      .mockResolvedValue({ dataset_id: "ds-1", status: "loading" });

    const user = userEvent.setup();

    renderWithProviders(
      <DatasetInput conversationId="conv-1" datasetCount={0} />
    );

    const input = screen.getByPlaceholderText("Paste Parquet/CSV URL...");
    await user.type(input, "https://example.com/data.parquet");

    const addBtn = screen.getByRole("button", { name: "Add" });
    await user.click(addBtn);

    // Wait for the success icon to appear
    await waitFor(() => {
      expect(screen.getByTestId("url-success-icon")).toBeInTheDocument();
    });

    // Check the input has success theme border
    const inputEl = screen.getByPlaceholderText("Paste Parquet/CSV URL...");
    expect(inputEl.style.borderColor).toBe("var(--color-success)");

    apiPostSpy.mockRestore();
  });
});
