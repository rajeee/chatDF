// Tests: drag-and-drop URL loading behavior for DatasetInput
//
// DI-DROP-1: Shows visual indicator when dragging over
// DI-DROP-2: Extracts URL from text/uri-list data
// DI-DROP-3: Falls back to text/plain data
// DI-DROP-4: Ignores non-URL text drops
// DI-DROP-5: Hides indicator when drag leaves
// DI-DROP-6: Auto-submits valid URL on drop

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  renderWithProviders,
  screen,
  waitFor,
  act,
} from "../../helpers/render";
import {
  resetAllStores,
  setChatIdle,
} from "../../helpers/stores";
import { DatasetInput } from "@/components/right-panel/DatasetInput";
import { fireEvent } from "@testing-library/react";
import * as client from "@/api/client";

/** Helper to create a mock DataTransfer-like object for drag events. */
function makeDragEvent(
  type: string,
  dataMap: Record<string, string> = {}
): Parameters<typeof fireEvent>[1] {
  return {
    dataTransfer: {
      getData: (key: string) => dataMap[key] ?? "",
    },
  };
}

beforeEach(() => {
  resetAllStores();
  setChatIdle("conv-1");
});

describe("DI-DROP-1: Shows visual indicator when dragging over", () => {
  it("shows drop overlay on dragEnter", () => {
    renderWithProviders(
      <DatasetInput conversationId="conv-1" datasetCount={0} />
    );

    const dropZone = screen.getByTestId("dataset-input");
    expect(screen.queryByTestId("drop-overlay")).toBeNull();

    fireEvent.dragEnter(dropZone, makeDragEvent("dragenter"));

    expect(screen.getByTestId("drop-overlay")).toBeTruthy();
    expect(screen.getByText("Drop URL here")).toBeTruthy();
  });

  it("shows drop overlay on dragOver", () => {
    renderWithProviders(
      <DatasetInput conversationId="conv-1" datasetCount={0} />
    );

    const dropZone = screen.getByTestId("dataset-input");

    fireEvent.dragOver(dropZone, makeDragEvent("dragover"));

    expect(screen.getByTestId("drop-overlay")).toBeTruthy();
  });
});

describe("DI-DROP-2: Extracts URL from text/uri-list data", () => {
  it("uses text/uri-list when available and submits", async () => {
    const apiPostSpy = vi
      .spyOn(client, "apiPost")
      .mockResolvedValue({ dataset_id: "ds-drop-1", status: "loading" });

    renderWithProviders(
      <DatasetInput conversationId="conv-1" datasetCount={0} />
    );

    const dropZone = screen.getByTestId("dataset-input");

    await act(async () => {
      fireEvent.drop(dropZone, makeDragEvent("drop", {
        "text/uri-list": "https://example.com/dataset.parquet",
        "text/plain": "https://example.com/fallback.parquet",
      }));
      await new Promise((r) => setTimeout(r, 0));
    });

    await waitFor(() => {
      expect(apiPostSpy).toHaveBeenCalledWith(
        "/conversations/conv-1/datasets",
        { url: "https://example.com/dataset.parquet" }
      );
    });

    apiPostSpy.mockRestore();
  });
});

describe("DI-DROP-3: Falls back to text/plain data", () => {
  it("uses text/plain when text/uri-list is empty", async () => {
    const apiPostSpy = vi
      .spyOn(client, "apiPost")
      .mockResolvedValue({ dataset_id: "ds-drop-2", status: "loading" });

    renderWithProviders(
      <DatasetInput conversationId="conv-1" datasetCount={0} />
    );

    const dropZone = screen.getByTestId("dataset-input");

    await act(async () => {
      fireEvent.drop(dropZone, makeDragEvent("drop", {
        "text/plain": "https://example.com/fallback.parquet",
      }));
      await new Promise((r) => setTimeout(r, 0));
    });

    await waitFor(() => {
      expect(apiPostSpy).toHaveBeenCalledWith(
        "/conversations/conv-1/datasets",
        { url: "https://example.com/fallback.parquet" }
      );
    });

    apiPostSpy.mockRestore();
  });
});

describe("DI-DROP-4: Ignores non-URL text drops", () => {
  it("does not submit when dropped text is not a URL", async () => {
    const apiPostSpy = vi
      .spyOn(client, "apiPost")
      .mockResolvedValue({ dataset_id: "ds-drop-3", status: "loading" });

    renderWithProviders(
      <DatasetInput conversationId="conv-1" datasetCount={0} />
    );

    const dropZone = screen.getByTestId("dataset-input");

    await act(async () => {
      fireEvent.drop(dropZone, makeDragEvent("drop", {
        "text/plain": "just some random text",
      }));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(apiPostSpy).not.toHaveBeenCalled();

    apiPostSpy.mockRestore();
  });

  it("does not submit when dropped text is a URL without valid hostname", async () => {
    const apiPostSpy = vi
      .spyOn(client, "apiPost")
      .mockResolvedValue({ dataset_id: "ds-drop-4", status: "loading" });

    renderWithProviders(
      <DatasetInput conversationId="conv-1" datasetCount={0} />
    );

    const dropZone = screen.getByTestId("dataset-input");

    await act(async () => {
      fireEvent.drop(dropZone, makeDragEvent("drop", {
        "text/plain": "http://localhost",
      }));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(apiPostSpy).not.toHaveBeenCalled();

    apiPostSpy.mockRestore();
  });
});

describe("DI-DROP-5: Hides indicator when drag leaves", () => {
  it("removes drop overlay on dragLeave", () => {
    renderWithProviders(
      <DatasetInput conversationId="conv-1" datasetCount={0} />
    );

    const dropZone = screen.getByTestId("dataset-input");

    // First, trigger dragEnter to show the overlay
    fireEvent.dragEnter(dropZone, makeDragEvent("dragenter"));
    expect(screen.getByTestId("drop-overlay")).toBeTruthy();

    // Then, trigger dragLeave to hide it
    fireEvent.dragLeave(dropZone, makeDragEvent("dragleave"));
    expect(screen.queryByTestId("drop-overlay")).toBeNull();
  });

  it("removes drop overlay after a drop", async () => {
    renderWithProviders(
      <DatasetInput conversationId="conv-1" datasetCount={0} />
    );

    const dropZone = screen.getByTestId("dataset-input");

    // Show overlay first
    fireEvent.dragEnter(dropZone, makeDragEvent("dragenter"));
    expect(screen.getByTestId("drop-overlay")).toBeTruthy();

    // Drop non-URL text (no submit, but overlay should still hide)
    await act(async () => {
      fireEvent.drop(dropZone, makeDragEvent("drop", {
        "text/plain": "not a url",
      }));
    });

    expect(screen.queryByTestId("drop-overlay")).toBeNull();
  });
});

describe("DI-DROP-6: Auto-submits valid URL on drop", () => {
  it("sets input value and calls API on valid URL drop", async () => {
    const apiPostSpy = vi
      .spyOn(client, "apiPost")
      .mockResolvedValue({ dataset_id: "ds-drop-5", status: "loading" });

    renderWithProviders(
      <DatasetInput conversationId="conv-1" datasetCount={0} />
    );

    const dropZone = screen.getByTestId("dataset-input");
    const input = screen.getByPlaceholderText("Paste Parquet/CSV URL...");

    await act(async () => {
      fireEvent.drop(dropZone, makeDragEvent("drop", {
        "text/uri-list": "https://example.com/new-data.parquet",
      }));
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
});
