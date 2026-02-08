// Tests: URL warning validation for DatasetInput
//
// DI-WARN-1: Non-parquet URL shows a warning message
// DI-WARN-2: .parquet URL does NOT show a warning
// DI-WARN-3: HuggingFace URL does NOT show a warning
// DI-WARN-4: Warnings don't block submission
// DI-WARN-5: Errors still block submission

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  renderWithProviders,
  screen,
  waitFor,
  act,
} from "../../helpers/render";
import { resetAllStores, setChatIdle } from "../../helpers/stores";
import { DatasetInput } from "@/components/right-panel/DatasetInput";
import { fireEvent } from "@testing-library/react";
import * as client from "@/api/client";

const WARNING_TEXT =
  "This URL doesn't look like a Parquet dataset. ChatDF works best with Parquet files.";

beforeEach(() => {
  resetAllStores();
  setChatIdle("conv-1");
});

describe("DI-WARN-1: Non-parquet URL shows a warning message", () => {
  it("shows warning for a generic URL that doesn't match data patterns", async () => {
    renderWithProviders(
      <DatasetInput conversationId="conv-1" datasetCount={0} />
    );

    const input = screen.getByPlaceholderText("Paste parquet URL...");

    await act(async () => {
      fireEvent.change(input, {
        target: { value: "https://example.com/somefile.csv" },
      });
    });

    // Wait for debounced validation (300ms)
    await waitFor(() => {
      expect(screen.getByTestId("dataset-input-warning")).toBeInTheDocument();
    });

    expect(screen.getByTestId("dataset-input-warning")).toHaveTextContent(
      WARNING_TEXT
    );

    // Should NOT show an error
    expect(
      screen.queryByTestId("dataset-input-error")
    ).not.toBeInTheDocument();

    // Input border should be amber (browser normalizes hex to rgb)
    expect(input.style.borderColor).toBe("rgb(245, 158, 11)");
  });
});

describe("DI-WARN-2: .parquet URL does NOT show a warning", () => {
  it("does not warn for a URL ending in .parquet", async () => {
    renderWithProviders(
      <DatasetInput conversationId="conv-1" datasetCount={0} />
    );

    const input = screen.getByPlaceholderText("Paste parquet URL...");

    await act(async () => {
      fireEvent.change(input, {
        target: { value: "https://example.com/file.parquet" },
      });
    });

    // Wait for debounced validation
    await waitFor(
      () => {
        // No error or warning should appear
        expect(
          screen.queryByTestId("dataset-input-warning")
        ).not.toBeInTheDocument();
        expect(
          screen.queryByTestId("dataset-input-error")
        ).not.toBeInTheDocument();
      },
      { timeout: 500 }
    );
  });

  it("does not warn for a URL ending in .parquet.gz", async () => {
    renderWithProviders(
      <DatasetInput conversationId="conv-1" datasetCount={0} />
    );

    const input = screen.getByPlaceholderText("Paste parquet URL...");

    await act(async () => {
      fireEvent.change(input, {
        target: { value: "https://example.com/file.parquet.gz" },
      });
    });

    await waitFor(
      () => {
        expect(
          screen.queryByTestId("dataset-input-warning")
        ).not.toBeInTheDocument();
      },
      { timeout: 500 }
    );
  });
});

describe("DI-WARN-3: HuggingFace URL does NOT show a warning", () => {
  it("does not warn for a HuggingFace URL", async () => {
    renderWithProviders(
      <DatasetInput conversationId="conv-1" datasetCount={0} />
    );

    const input = screen.getByPlaceholderText("Paste parquet URL...");

    await act(async () => {
      fireEvent.change(input, {
        target: {
          value: "https://huggingface.co/datasets/some-org/some-dataset",
        },
      });
    });

    await waitFor(
      () => {
        expect(
          screen.queryByTestId("dataset-input-warning")
        ).not.toBeInTheDocument();
        expect(
          screen.queryByTestId("dataset-input-error")
        ).not.toBeInTheDocument();
      },
      { timeout: 500 }
    );
  });

  it("does not warn for an S3 URL", async () => {
    renderWithProviders(
      <DatasetInput conversationId="conv-1" datasetCount={0} />
    );

    const input = screen.getByPlaceholderText("Paste parquet URL...");

    await act(async () => {
      fireEvent.change(input, {
        target: {
          value: "https://s3.amazonaws.com/my-bucket/file.bin",
        },
      });
    });

    await waitFor(
      () => {
        expect(
          screen.queryByTestId("dataset-input-warning")
        ).not.toBeInTheDocument();
      },
      { timeout: 500 }
    );
  });

  it("does not warn for a GCS URL", async () => {
    renderWithProviders(
      <DatasetInput conversationId="conv-1" datasetCount={0} />
    );

    const input = screen.getByPlaceholderText("Paste parquet URL...");

    await act(async () => {
      fireEvent.change(input, {
        target: {
          value:
            "https://storage.googleapis.com/my-bucket/file.bin",
        },
      });
    });

    await waitFor(
      () => {
        expect(
          screen.queryByTestId("dataset-input-warning")
        ).not.toBeInTheDocument();
      },
      { timeout: 500 }
    );
  });
});

describe("DI-WARN-4: Warnings don't block submission", () => {
  it("allows submitting a URL that triggers a warning", async () => {
    const apiPostSpy = vi
      .spyOn(client, "apiPost")
      .mockResolvedValue({ dataset_id: "ds-new", status: "loading" });

    renderWithProviders(
      <DatasetInput conversationId="conv-1" datasetCount={0} />
    );

    const input = screen.getByPlaceholderText("Paste parquet URL...");

    // Type a non-parquet URL (triggers warning, not error)
    await act(async () => {
      fireEvent.change(input, {
        target: { value: "https://example.com/somefile.csv" },
      });
    });

    // Wait for debounced validation to set the warning
    await waitFor(() => {
      expect(screen.getByTestId("dataset-input-warning")).toBeInTheDocument();
    });

    // The Add button should NOT be disabled (warnings don't block)
    const addBtn = screen.getByRole("button", { name: "Add" });
    expect(addBtn).not.toBeDisabled();

    // Click submit
    await act(async () => {
      fireEvent.click(addBtn);
      await new Promise((r) => setTimeout(r, 0));
    });

    // API should have been called
    await waitFor(() => {
      expect(apiPostSpy).toHaveBeenCalledWith(
        "/conversations/conv-1/datasets",
        { url: "https://example.com/somefile.csv" }
      );
    });

    apiPostSpy.mockRestore();
  });
});

describe("DI-WARN-5: Errors still block submission", () => {
  it("does not submit when there is a validation error", async () => {
    const apiPostSpy = vi
      .spyOn(client, "apiPost")
      .mockResolvedValue({ dataset_id: "ds-new", status: "loading" });

    renderWithProviders(
      <DatasetInput conversationId="conv-1" datasetCount={0} />
    );

    const input = screen.getByPlaceholderText("Paste parquet URL...");

    // Type an invalid URL (triggers error)
    await act(async () => {
      fireEvent.change(input, {
        target: { value: "not-a-valid-url" },
      });
    });

    // Wait for debounced validation to set the error
    await waitFor(() => {
      expect(screen.getByTestId("dataset-input-error")).toBeInTheDocument();
    });

    expect(screen.getByTestId("dataset-input-error")).toHaveTextContent(
      "Invalid URL format"
    );

    // The Add button should be disabled
    const addBtn = screen.getByRole("button", { name: "Add" });
    expect(addBtn).toBeDisabled();

    // Even if we try to click, API should NOT be called
    await act(async () => {
      fireEvent.click(addBtn);
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(apiPostSpy).not.toHaveBeenCalled();

    // Warning should NOT be shown (error takes precedence)
    expect(
      screen.queryByTestId("dataset-input-warning")
    ).not.toBeInTheDocument();

    // Input border should be red (browser normalizes hex to rgb)
    expect(input.style.borderColor).toBe("rgb(239, 68, 68)");

    apiPostSpy.mockRestore();
  });
});
