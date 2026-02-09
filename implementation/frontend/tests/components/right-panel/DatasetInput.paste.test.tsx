// Tests: paste-and-auto-submit behavior for DatasetInput
//
// DI-PASTE-1: Auto-submits when a valid URL is pasted
// DI-PASTE-2: Does not auto-submit when invalid text is pasted
// DI-PASTE-3: Does not auto-submit when a duplicate URL is pasted

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  renderWithProviders,
  screen,
  waitFor,
  act,
} from "../../helpers/render";
import {
  resetAllStores,
  setDatasetsLoaded,
  setChatIdle,
  type Dataset,
} from "../../helpers/stores";
import { DatasetInput } from "@/components/right-panel/DatasetInput";
import { fireEvent } from "@testing-library/react";
import * as client from "@/api/client";

function makeDataset(overrides: Partial<Dataset> = {}): Dataset {
  return {
    id: "ds-1",
    conversation_id: "conv-1",
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

/** Helper to fire a paste event with specific clipboard text. */
function pasteText(input: HTMLElement, text: string) {
  const clipboardData = {
    getData: (_type: string) => text,
  };
  fireEvent.paste(input, { clipboardData });
}

beforeEach(() => {
  resetAllStores();
  setChatIdle("conv-1");
});

describe("DI-PASTE-1: Auto-submits when a valid URL is pasted", () => {
  it("calls API to add dataset when a valid URL is pasted", async () => {
    const apiPostSpy = vi
      .spyOn(client, "apiPost")
      .mockResolvedValue({ dataset_id: "ds-new", status: "loading" });

    renderWithProviders(
      <DatasetInput conversationId="conv-1" datasetCount={0} />
    );

    const input = screen.getByPlaceholderText("Paste Parquet/CSV URL...");

    await act(async () => {
      pasteText(input, "https://example.com/new-data.parquet");
      // Flush microtasks to let submitUrl complete
      await new Promise((r) => setTimeout(r, 0));
    });

    await waitFor(() => {
      expect(apiPostSpy).toHaveBeenCalledWith(
        "/conversations/conv-1/datasets",
        { url: "https://example.com/new-data.parquet" }
      );
    });

    // Input should be cleared after successful submit
    await waitFor(() => {
      expect(input).toHaveValue("");
    });

    apiPostSpy.mockRestore();
  });

  it("sets the input value to the pasted URL and clears after submit", async () => {
    const apiPostSpy = vi
      .spyOn(client, "apiPost")
      .mockResolvedValue({ dataset_id: "ds-new", status: "loading" });

    renderWithProviders(
      <DatasetInput conversationId="conv-1" datasetCount={0} />
    );

    const input = screen.getByPlaceholderText("Paste Parquet/CSV URL...");

    await act(async () => {
      pasteText(input, "https://example.com/new-data.parquet");
      await new Promise((r) => setTimeout(r, 0));
    });

    // After successful submit, input is cleared
    await waitFor(() => {
      expect(input).toHaveValue("");
    });

    apiPostSpy.mockRestore();
  });
});

describe("DI-PASTE-2: Does not auto-submit when invalid text is pasted", () => {
  it("does not call API when plain text is pasted", async () => {
    const apiPostSpy = vi
      .spyOn(client, "apiPost")
      .mockResolvedValue({ dataset_id: "ds-new", status: "loading" });

    renderWithProviders(
      <DatasetInput conversationId="conv-1" datasetCount={0} />
    );

    const input = screen.getByPlaceholderText("Paste Parquet/CSV URL...");

    await act(async () => {
      pasteText(input, "not-a-url");
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(apiPostSpy).not.toHaveBeenCalled();

    apiPostSpy.mockRestore();
  });

  it("does not call API when pasting a URL without valid hostname", async () => {
    const apiPostSpy = vi
      .spyOn(client, "apiPost")
      .mockResolvedValue({ dataset_id: "ds-new", status: "loading" });

    renderWithProviders(
      <DatasetInput conversationId="conv-1" datasetCount={0} />
    );

    const input = screen.getByPlaceholderText("Paste Parquet/CSV URL...");

    await act(async () => {
      pasteText(input, "http://localhost");
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(apiPostSpy).not.toHaveBeenCalled();

    apiPostSpy.mockRestore();
  });
});

describe("DI-PASTE-3: Does not auto-submit when a duplicate URL is pasted", () => {
  it("does not call API when a URL already in datasets is pasted", async () => {
    setDatasetsLoaded([makeDataset()]);

    const apiPostSpy = vi
      .spyOn(client, "apiPost")
      .mockResolvedValue({ dataset_id: "ds-new", status: "loading" });

    renderWithProviders(
      <DatasetInput conversationId="conv-1" datasetCount={1} />
    );

    const input = screen.getByPlaceholderText("Paste Parquet/CSV URL...");

    await act(async () => {
      pasteText(input, "https://example.com/data.parquet");
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(apiPostSpy).not.toHaveBeenCalled();

    apiPostSpy.mockRestore();
  });
});
