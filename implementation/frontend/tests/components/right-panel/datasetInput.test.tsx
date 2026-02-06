// Tests: spec/frontend/right_panel/dataset_input/spec.md
// Verifies: spec/frontend/right_panel/dataset_input/plan.md
//
// DI-VALID-1: Invalid URL shows error
// DI-VALID-2: Empty input shows no error
// DI-DUP-1:   Duplicate URL shows error
// DI-LIMIT-1: At 5 datasets, input disabled
// DI-SUBMIT-1: Success clears input
// DI-SUBMIT-2: API error shows message

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  renderWithProviders,
  screen,
  waitFor,
  userEvent,
} from "../../helpers/render";
import {
  resetAllStores,
  setDatasetsLoaded,
  setChatIdle,
  type Dataset,
} from "../../helpers/stores";
import { server } from "../../helpers/mocks/server";
import { http, HttpResponse } from "msw";
import { DatasetInput } from "@/components/right-panel/DatasetInput";

function makeDataset(overrides: Partial<Dataset> = {}): Dataset {
  return {
    id: "ds-1",
    url: "https://example.com/data.parquet",
    name: "test_data",
    row_count: 100,
    column_count: 3,
    schema_json: "{}",
    status: "ready",
    error_message: null,
    ...overrides,
  };
}

beforeEach(() => {
  resetAllStores();
  setChatIdle("conv-1");
});

describe("DI-VALID-1: Invalid URL shows error", () => {
  it("shows error for invalid URL format after debounce", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DatasetInput conversationId="conv-1" datasetCount={0} />
    );

    const input = screen.getByPlaceholderText("Paste parquet URL...");
    await user.type(input, "not-a-url");

    await waitFor(() => {
      expect(screen.getByText("Invalid URL format")).toBeInTheDocument();
    });
  });

  it("shows error for URL without dot in hostname", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DatasetInput conversationId="conv-1" datasetCount={0} />
    );

    const input = screen.getByPlaceholderText("Paste parquet URL...");
    await user.type(input, "http://localhost");

    await waitFor(() => {
      expect(screen.getByText("Invalid URL format")).toBeInTheDocument();
    });
  });
});

describe("DI-VALID-2: Empty input shows no error", () => {
  it("does not show an error when input is empty", () => {
    renderWithProviders(
      <DatasetInput conversationId="conv-1" datasetCount={0} />
    );

    expect(screen.queryByText("Invalid URL format")).not.toBeInTheDocument();
    expect(
      screen.queryByText("This dataset is already loaded")
    ).not.toBeInTheDocument();
  });

  it("clears error when user clears input", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DatasetInput conversationId="conv-1" datasetCount={0} />
    );

    const input = screen.getByPlaceholderText("Paste parquet URL...");
    await user.type(input, "not-a-url");

    await waitFor(() => {
      expect(screen.getByText("Invalid URL format")).toBeInTheDocument();
    });

    await user.clear(input);

    await waitFor(() => {
      expect(
        screen.queryByText("Invalid URL format")
      ).not.toBeInTheDocument();
    });
  });
});

describe("DI-DUP-1: Duplicate URL shows error", () => {
  it("shows duplicate error when URL is already loaded", async () => {
    setDatasetsLoaded([makeDataset()]);

    const user = userEvent.setup();
    renderWithProviders(
      <DatasetInput conversationId="conv-1" datasetCount={1} />
    );

    const input = screen.getByPlaceholderText("Paste parquet URL...");
    await user.type(input, "https://example.com/data.parquet");

    await waitFor(() => {
      expect(
        screen.getByText("This dataset is already loaded")
      ).toBeInTheDocument();
    });
  });
});

describe("DI-LIMIT-1: At 5 datasets, input disabled", () => {
  it("disables input and button when at 5 datasets", () => {
    renderWithProviders(
      <DatasetInput conversationId="conv-1" datasetCount={5} />
    );

    const input = screen.getByPlaceholderText("Maximum 5 datasets");
    expect(input).toBeDisabled();

    const button = screen.getByRole("button", { name: /add/i });
    expect(button).toBeDisabled();
  });
});

describe("DI-SUBMIT-1: Success clears input", () => {
  it("clears input and shows no error after successful submit", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DatasetInput conversationId="conv-1" datasetCount={0} />
    );

    const input = screen.getByPlaceholderText("Paste parquet URL...");
    await user.type(input, "https://example.com/data.parquet");

    const button = screen.getByRole("button", { name: /add/i });
    await user.click(button);

    await waitFor(() => {
      expect(input).toHaveValue("");
    });

    expect(
      screen.queryByText("Invalid URL format")
    ).not.toBeInTheDocument();
  });

  it("clears input when submitting via Enter key", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DatasetInput conversationId="conv-1" datasetCount={0} />
    );

    const input = screen.getByPlaceholderText("Paste parquet URL...");
    await user.type(input, "https://example.com/data.parquet{Enter}");

    await waitFor(() => {
      expect(input).toHaveValue("");
    });
  });
});

describe("DI-SUBMIT-2: API error shows message", () => {
  it("shows API error message when submission fails", async () => {
    server.use(
      http.post("/conversations/:id/datasets", () => {
        return HttpResponse.json(
          { error: "Not a valid parquet file" },
          { status: 400 }
        );
      })
    );

    const user = userEvent.setup();
    renderWithProviders(
      <DatasetInput conversationId="conv-1" datasetCount={0} />
    );

    const input = screen.getByPlaceholderText("Paste parquet URL...");
    await user.type(input, "https://example.com/bad.parquet");

    const button = screen.getByRole("button", { name: /add/i });
    await user.click(button);

    await waitFor(() => {
      expect(
        screen.getByText("Not a valid parquet file")
      ).toBeInTheDocument();
    });
  });
});
