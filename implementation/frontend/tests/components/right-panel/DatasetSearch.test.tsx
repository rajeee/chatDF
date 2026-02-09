// Tests for the DatasetSearch component.
//
// DS-SEARCH-1: Renders collapsed by default with toggle button
// DS-SEARCH-2: Expands to show search input when toggled open
// DS-SEARCH-3: Shows search results after searching
// DS-SEARCH-4: Shows empty state when no results found
// DS-SEARCH-5: Shows error state on search failure
// DS-SEARCH-6: Calls onLoad when Load button is clicked
// DS-SEARCH-7: Shows loading spinner while searching

import { describe, it, expect, beforeEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, waitFor, userEvent } from "../../helpers/render";
import { server } from "../../helpers/mocks/server";
import { DatasetSearch } from "@/components/right-panel/DatasetSearch";

const MOCK_SEARCH_RESULTS = {
  results: [
    {
      id: "squad",
      description: "Stanford Question Answering Dataset",
      downloads: 500000,
      likes: 1200,
      tags: ["question-answering", "english"],
      last_modified: "2024-01-15T10:00:00.000Z",
      parquet_url:
        "https://huggingface.co/datasets/squad/resolve/main/data/train-00000-of-00001.parquet",
    },
    {
      id: "imdb",
      description: "Large Movie Review Dataset",
      downloads: 300000,
      likes: 800,
      tags: ["text-classification"],
      last_modified: "2024-02-20T08:00:00.000Z",
      parquet_url:
        "https://huggingface.co/datasets/imdb/resolve/main/data/train-00000-of-00001.parquet",
    },
  ],
  total: 2,
};

const EMPTY_SEARCH_RESULTS = {
  results: [],
  total: 0,
};

function setupSearchHandler(response = MOCK_SEARCH_RESULTS, status = 200) {
  server.use(
    http.get("/api/dataset-search", () => {
      return HttpResponse.json(response, { status });
    })
  );
}

beforeEach(() => {
  // Default handler for dataset search
  setupSearchHandler();
});

describe("DS-SEARCH-1: Renders collapsed by default", () => {
  it("renders toggle button", () => {
    const onLoad = vi.fn();
    renderWithProviders(<DatasetSearch onLoad={onLoad} />);

    const toggle = screen.getByTestId("dataset-search-toggle");
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveTextContent("Search HF Datasets");
  });

  it("does not show search input when collapsed", () => {
    const onLoad = vi.fn();
    renderWithProviders(<DatasetSearch onLoad={onLoad} />);

    expect(screen.queryByTestId("dataset-search-input")).not.toBeInTheDocument();
  });
});

describe("DS-SEARCH-2: Expands to show search input when toggled", () => {
  it("shows search input after clicking toggle", async () => {
    const onLoad = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<DatasetSearch onLoad={onLoad} />);

    await user.click(screen.getByTestId("dataset-search-toggle"));

    expect(screen.getByTestId("dataset-search-input")).toBeInTheDocument();
  });

  it("hides search input after clicking toggle again", async () => {
    const onLoad = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<DatasetSearch onLoad={onLoad} />);

    await user.click(screen.getByTestId("dataset-search-toggle"));
    expect(screen.getByTestId("dataset-search-input")).toBeInTheDocument();

    await user.click(screen.getByTestId("dataset-search-toggle"));
    expect(screen.queryByTestId("dataset-search-input")).not.toBeInTheDocument();
  });
});

describe("DS-SEARCH-3: Shows search results after searching", () => {
  it("displays results after typing a query", async () => {
    const onLoad = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<DatasetSearch onLoad={onLoad} />);

    await user.click(screen.getByTestId("dataset-search-toggle"));
    await user.type(screen.getByTestId("dataset-search-input"), "squad");

    await waitFor(() => {
      expect(screen.getByTestId("dataset-search-results")).toBeInTheDocument();
    });

    const results = screen.getAllByTestId("dataset-search-result");
    expect(results).toHaveLength(2);
    expect(screen.getByText("squad")).toBeInTheDocument();
    expect(screen.getByText("imdb")).toBeInTheDocument();
  });

  it("shows dataset description", async () => {
    const onLoad = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<DatasetSearch onLoad={onLoad} />);

    await user.click(screen.getByTestId("dataset-search-toggle"));
    await user.type(screen.getByTestId("dataset-search-input"), "squad");

    await waitFor(() => {
      expect(
        screen.getByText("Stanford Question Answering Dataset")
      ).toBeInTheDocument();
    });
  });

  it("shows download and like counts", async () => {
    const onLoad = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<DatasetSearch onLoad={onLoad} />);

    await user.click(screen.getByTestId("dataset-search-toggle"));
    await user.type(screen.getByTestId("dataset-search-input"), "squad");

    await waitFor(() => {
      expect(screen.getByText("500.0K")).toBeInTheDocument();
      expect(screen.getByText("1.2K")).toBeInTheDocument();
    });
  });
});

describe("DS-SEARCH-4: Shows empty state when no results found", () => {
  it("shows empty state message", async () => {
    setupSearchHandler(EMPTY_SEARCH_RESULTS);

    const onLoad = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<DatasetSearch onLoad={onLoad} />);

    await user.click(screen.getByTestId("dataset-search-toggle"));
    await user.type(screen.getByTestId("dataset-search-input"), "nonexistent");

    await waitFor(() => {
      expect(screen.getByTestId("dataset-search-empty")).toBeInTheDocument();
    });
  });
});

describe("DS-SEARCH-5: Shows error state on search failure", () => {
  it("shows error message when API returns an error", async () => {
    server.use(
      http.get("/api/dataset-search", () => {
        return HttpResponse.json(
          { error: "Hugging Face API error: 500" },
          { status: 502 }
        );
      })
    );

    const onLoad = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<DatasetSearch onLoad={onLoad} />);

    await user.click(screen.getByTestId("dataset-search-toggle"));
    await user.type(screen.getByTestId("dataset-search-input"), "error");

    await waitFor(() => {
      expect(screen.getByTestId("dataset-search-error")).toBeInTheDocument();
    });
  });
});

describe("DS-SEARCH-6: Calls onLoad when Load button is clicked", () => {
  it("calls onLoad with parquet URL", async () => {
    const onLoad = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<DatasetSearch onLoad={onLoad} />);

    await user.click(screen.getByTestId("dataset-search-toggle"));
    await user.type(screen.getByTestId("dataset-search-input"), "squad");

    await waitFor(() => {
      expect(screen.getAllByTestId("dataset-search-load")).toHaveLength(2);
    });

    await user.click(screen.getAllByTestId("dataset-search-load")[0]);

    expect(onLoad).toHaveBeenCalledWith(
      "https://huggingface.co/datasets/squad/resolve/main/data/train-00000-of-00001.parquet"
    );
  });

  it("disables Load buttons when loading prop is true", async () => {
    const onLoad = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<DatasetSearch onLoad={onLoad} loading={true} />);

    await user.click(screen.getByTestId("dataset-search-toggle"));
    await user.type(screen.getByTestId("dataset-search-input"), "squad");

    await waitFor(() => {
      const buttons = screen.getAllByTestId("dataset-search-load");
      buttons.forEach((btn) => {
        expect(btn).toBeDisabled();
      });
    });
  });
});

describe("DS-SEARCH-7: Shows loading spinner while searching", () => {
  it("shows spinner while request is pending", async () => {
    // Use a delayed response to catch the loading state
    server.use(
      http.get("/api/dataset-search", async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return HttpResponse.json(MOCK_SEARCH_RESULTS);
      })
    );

    const onLoad = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<DatasetSearch onLoad={onLoad} />);

    await user.click(screen.getByTestId("dataset-search-toggle"));
    await user.type(screen.getByTestId("dataset-search-input"), "squad");

    // After debounce fires (300ms) but before response arrives,
    // spinner should be visible
    await waitFor(() => {
      expect(screen.getByTestId("dataset-search-spinner")).toBeInTheDocument();
    });

    // Eventually results appear and spinner goes away
    await waitFor(() => {
      expect(screen.queryByTestId("dataset-search-spinner")).not.toBeInTheDocument();
      expect(screen.getByTestId("dataset-search-results")).toBeInTheDocument();
    });
  });
});
