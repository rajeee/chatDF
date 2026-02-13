// Tests for DatasetDiscoveryPanel component (unified HF search + catalog)
//
// DDP-1: Renders search input and popular catalog on mount
// DDP-2: Catalog category chips filter popular datasets
// DDP-3: Search triggers HF API call with debounce
// DDP-4: Shows search results with Load buttons
// DDP-5: Shows spinner during search
// DDP-6: Shows error message on search failure
// DDP-7: Shows empty state when search returns no results
// DDP-8: Load from catalog calls POST datasets endpoint
// DDP-9: Load from search results calls POST datasets endpoint
// DDP-10: Results show truncated tags (max 5 + overflow count)

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock API
const mockSearchDatasets = vi.fn();
const mockApiPost = vi.fn();

vi.mock("@/api/client", () => ({
  searchDatasets: (...args: unknown[]) => mockSearchDatasets(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
}));

// Mock stores
const mockConversationId = { value: "conv-123" as string | null };
const mockSetActiveConversation = vi.fn();

vi.mock("@/stores/chatStore", () => ({
  useChatStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      activeConversationId: mockConversationId.value,
      setActiveConversation: mockSetActiveConversation,
    }),
}));

const mockDatasets: Array<{ id: string }> = [];
const mockAddDataset = vi.fn();

vi.mock("@/stores/datasetStore", () => ({
  useDatasetStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({
        datasets: mockDatasets,
        addDataset: mockAddDataset,
      }),
    {
      getState: () => ({ datasets: mockDatasets, addDataset: mockAddDataset }),
    }
  ),
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock("@/stores/toastStore", () => ({
  useToastStore: () => ({
    success: mockToastSuccess,
    error: mockToastError,
  }),
}));

import { DatasetDiscoveryPanel } from "@/components/right-panel/DatasetDiscoveryPanel";

const SAMPLE_SEARCH_RESULTS = [
  {
    id: "climate-data-v2",
    description: "Global climate temperature records",
    downloads: 1500000,
    likes: 3200,
    tags: ["climate", "temperature", "global"],
    last_modified: "2024-06-01",
    parquet_url: "https://hf.co/datasets/climate-data-v2/train.parquet",
  },
  {
    id: "finance-stock-prices",
    description: "Daily stock prices for S&P 500",
    downloads: 850,
    likes: 420,
    tags: ["finance", "stocks", "sp500", "daily", "prices", "historical", "us-market"],
    last_modified: "2024-05-15",
    parquet_url: "https://hf.co/datasets/finance-stock-prices/train.parquet",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockConversationId.value = "conv-123";
  mockDatasets.length = 0;
  mockSearchDatasets.mockResolvedValue([]);
});

describe("DDP-1: Renders search input and popular catalog on mount", () => {
  it("renders the panel container", () => {
    render(<DatasetDiscoveryPanel />);
    expect(screen.getByTestId("dataset-discovery-panel")).toBeInTheDocument();
  });

  it("renders the search input with HF placeholder", () => {
    render(<DatasetDiscoveryPanel />);
    const input = screen.getByTestId("discovery-search-input");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("placeholder", "Search Hugging Face datasets...");
  });

  it("renders the popular datasets catalog", () => {
    render(<DatasetDiscoveryPanel />);
    expect(screen.getByTestId("dataset-catalog")).toBeInTheDocument();
    expect(screen.getByText("Popular Datasets")).toBeInTheDocument();
  });

  it("renders catalog items on mount", () => {
    render(<DatasetDiscoveryPanel />);
    const items = screen.getAllByTestId("dataset-catalog-item");
    expect(items.length).toBeGreaterThan(0);
  });

  it("renders category chips including All", () => {
    render(<DatasetDiscoveryPanel />);
    expect(screen.getByTestId("dataset-catalog-categories")).toBeInTheDocument();
    expect(screen.getByTestId("dataset-catalog-category-All")).toBeInTheDocument();
  });
});

describe("DDP-2: Catalog category chips filter popular datasets", () => {
  it("All category is active by default", () => {
    render(<DatasetDiscoveryPanel />);
    const allChip = screen.getByTestId("dataset-catalog-category-All");
    expect(allChip.style.backgroundColor).toBe("var(--color-accent)");
  });

  it("clicking a category filters catalog items", () => {
    render(<DatasetDiscoveryPanel />);

    const allItemsBefore = screen.getAllByTestId("dataset-catalog-item");
    const totalCount = allItemsBefore.length;

    const scienceChip = screen.getByTestId("dataset-catalog-category-Science");
    fireEvent.click(scienceChip);

    const filteredItems = screen.getAllByTestId("dataset-catalog-item");
    expect(filteredItems.length).toBeLessThan(totalCount);
    expect(filteredItems.length).toBeGreaterThan(0);
  });

  it("clicking All shows all catalog items again", () => {
    render(<DatasetDiscoveryPanel />);

    const allItemsBefore = screen.getAllByTestId("dataset-catalog-item");
    const totalCount = allItemsBefore.length;

    fireEvent.click(screen.getByTestId("dataset-catalog-category-Science"));
    fireEvent.click(screen.getByTestId("dataset-catalog-category-All"));

    const items = screen.getAllByTestId("dataset-catalog-item");
    expect(items.length).toBe(totalCount);
  });
});

describe("DDP-3: Search triggers HF API call with debounce", () => {
  it("calls searchDatasets after debounce delay", async () => {
    mockSearchDatasets.mockResolvedValue(SAMPLE_SEARCH_RESULTS);
    render(<DatasetDiscoveryPanel />);

    fireEvent.change(screen.getByTestId("discovery-search-input"), {
      target: { value: "climate" },
    });

    // Wait for debounce (300ms) + API resolution
    await waitFor(() => {
      expect(mockSearchDatasets).toHaveBeenCalledWith("climate", 10);
    }, { timeout: 2000 });
  });

  it("does not call searchDatasets for empty query", async () => {
    render(<DatasetDiscoveryPanel />);
    fireEvent.change(screen.getByTestId("discovery-search-input"), {
      target: { value: "" },
    });

    // Wait a bit past debounce to verify it's NOT called
    await new Promise((r) => setTimeout(r, 400));
    expect(mockSearchDatasets).not.toHaveBeenCalled();
  });
});

describe("DDP-4: Shows search results with Load buttons", () => {
  it("renders results after search completes", async () => {
    mockSearchDatasets.mockResolvedValue(SAMPLE_SEARCH_RESULTS);
    render(<DatasetDiscoveryPanel />);

    fireEvent.change(screen.getByTestId("discovery-search-input"), {
      target: { value: "climate" },
    });

    await waitFor(() => {
      expect(screen.getByTestId("discovery-results")).toBeInTheDocument();
    }, { timeout: 2000 });

    const results = screen.getAllByTestId("discovery-result");
    expect(results).toHaveLength(2);
  });

  it("shows result id and description", async () => {
    mockSearchDatasets.mockResolvedValue(SAMPLE_SEARCH_RESULTS);
    render(<DatasetDiscoveryPanel />);

    fireEvent.change(screen.getByTestId("discovery-search-input"), {
      target: { value: "climate" },
    });

    await waitFor(() => {
      expect(screen.getByText("climate-data-v2")).toBeInTheDocument();
    }, { timeout: 2000 });
    expect(screen.getByText("Global climate temperature records")).toBeInTheDocument();
  });

  it("formats large download numbers with suffix", async () => {
    mockSearchDatasets.mockResolvedValue(SAMPLE_SEARCH_RESULTS);
    render(<DatasetDiscoveryPanel />);

    fireEvent.change(screen.getByTestId("discovery-search-input"), {
      target: { value: "climate" },
    });

    await waitFor(() => {
      expect(screen.getByText("1.5M")).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it("shows Load buttons for each search result", async () => {
    mockSearchDatasets.mockResolvedValue(SAMPLE_SEARCH_RESULTS);
    render(<DatasetDiscoveryPanel />);

    fireEvent.change(screen.getByTestId("discovery-search-input"), {
      target: { value: "climate" },
    });

    await waitFor(() => {
      const loadButtons = screen.getAllByTestId("discovery-load");
      expect(loadButtons).toHaveLength(2);
    }, { timeout: 2000 });
  });
});

describe("DDP-5: Shows spinner during search", () => {
  it("shows spinner while search is in progress", async () => {
    let resolveSearch!: (v: unknown[]) => void;
    mockSearchDatasets.mockReturnValue(
      new Promise((resolve) => {
        resolveSearch = resolve;
      })
    );

    render(<DatasetDiscoveryPanel />);
    fireEvent.change(screen.getByTestId("discovery-search-input"), {
      target: { value: "climate" },
    });

    await waitFor(() => {
      expect(screen.getByTestId("discovery-spinner")).toBeInTheDocument();
    }, { timeout: 2000 });

    resolveSearch([]);
    await waitFor(() => {
      expect(screen.queryByTestId("discovery-spinner")).not.toBeInTheDocument();
    });
  });
});

describe("DDP-6: Shows error message on search failure", () => {
  it("shows error message when search fails", async () => {
    mockSearchDatasets.mockRejectedValue(new Error("Network error"));
    render(<DatasetDiscoveryPanel />);

    fireEvent.change(screen.getByTestId("discovery-search-input"), {
      target: { value: "climate" },
    });

    await waitFor(() => {
      const errorEl = screen.getByTestId("discovery-error");
      expect(errorEl).toHaveTextContent("Network error");
    }, { timeout: 2000 });
  });

  it("shows generic error for non-Error rejections", async () => {
    mockSearchDatasets.mockRejectedValue("unknown");
    render(<DatasetDiscoveryPanel />);

    fireEvent.change(screen.getByTestId("discovery-search-input"), {
      target: { value: "climate" },
    });

    await waitFor(() => {
      expect(screen.getByTestId("discovery-error")).toHaveTextContent("Search failed");
    }, { timeout: 2000 });
  });
});

describe("DDP-7: Shows empty state when search returns no results", () => {
  it("shows empty state for query with no results", async () => {
    mockSearchDatasets.mockResolvedValue([]);
    render(<DatasetDiscoveryPanel />);

    fireEvent.change(screen.getByTestId("discovery-search-input"), {
      target: { value: "xyznonexistent" },
    });

    await waitFor(() => {
      expect(screen.getByTestId("discovery-empty")).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it("does not show empty state when no query entered", () => {
    render(<DatasetDiscoveryPanel />);
    expect(screen.queryByTestId("discovery-empty")).not.toBeInTheDocument();
  });
});

describe("DDP-8: Load from catalog calls POST datasets endpoint", () => {
  it("calls apiPost with dataset url when catalog Load is clicked", async () => {
    mockApiPost.mockResolvedValue({ dataset_id: "ds-new", status: "loading" });

    render(<DatasetDiscoveryPanel />);

    const loadButtons = screen.getAllByTestId("dataset-catalog-load");
    fireEvent.click(loadButtons[0]);

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(
        "/conversations/conv-123/datasets",
        expect.objectContaining({ url: expect.any(String) })
      );
    });
  });

  it("creates conversation first if none exists", async () => {
    mockConversationId.value = null;
    mockApiPost
      .mockResolvedValueOnce({ id: "new-conv" })
      .mockResolvedValueOnce({ dataset_id: "ds-new", status: "loading" });

    render(<DatasetDiscoveryPanel />);

    const loadButtons = screen.getAllByTestId("dataset-catalog-load");
    fireEvent.click(loadButtons[0]);

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith("/conversations");
      expect(mockSetActiveConversation).toHaveBeenCalledWith("new-conv");
    });
  });

  it("shows toast success after loading from catalog", async () => {
    mockApiPost.mockResolvedValue({ dataset_id: "ds-new", status: "loading" });

    render(<DatasetDiscoveryPanel />);

    const loadButtons = screen.getAllByTestId("dataset-catalog-load");
    fireEvent.click(loadButtons[0]);

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith("Dataset added");
    });
  });

  it("shows toast error when loading fails", async () => {
    mockApiPost.mockRejectedValue(new Error("Server error"));

    render(<DatasetDiscoveryPanel />);

    const loadButtons = screen.getAllByTestId("dataset-catalog-load");
    fireEvent.click(loadButtons[0]);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Server error");
    });
  });
});

describe("DDP-9: Load from search results calls POST datasets endpoint", () => {
  it("calls apiPost when clicking Load on a search result", async () => {
    mockSearchDatasets.mockResolvedValue(SAMPLE_SEARCH_RESULTS);
    mockApiPost.mockResolvedValue({ dataset_id: "ds-new", status: "loading" });

    render(<DatasetDiscoveryPanel />);
    fireEvent.change(screen.getByTestId("discovery-search-input"), {
      target: { value: "climate" },
    });

    await waitFor(() => {
      expect(screen.getAllByTestId("discovery-load")).toHaveLength(2);
    }, { timeout: 2000 });

    fireEvent.click(screen.getAllByTestId("discovery-load")[0]);

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(
        "/conversations/conv-123/datasets",
        { url: "https://hf.co/datasets/climate-data-v2/train.parquet" }
      );
    });
  });
});

describe("DDP-10: Results show truncated tags (max 5 + overflow count)", () => {
  it("shows all tags when there are 5 or fewer", async () => {
    mockSearchDatasets.mockResolvedValue([SAMPLE_SEARCH_RESULTS[0]]);
    render(<DatasetDiscoveryPanel />);

    fireEvent.change(screen.getByTestId("discovery-search-input"), {
      target: { value: "climate" },
    });

    await waitFor(() => {
      expect(screen.getByText("climate")).toBeInTheDocument();
      expect(screen.getByText("temperature")).toBeInTheDocument();
      expect(screen.getByText("global")).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it("truncates tags to 5 and shows overflow count", async () => {
    mockSearchDatasets.mockResolvedValue([SAMPLE_SEARCH_RESULTS[1]]);
    render(<DatasetDiscoveryPanel />);

    fireEvent.change(screen.getByTestId("discovery-search-input"), {
      target: { value: "finance" },
    });

    await waitFor(() => {
      expect(screen.getByText("finance")).toBeInTheDocument();
      expect(screen.getByText("stocks")).toBeInTheDocument();
      expect(screen.getByText("+2")).toBeInTheDocument();
    }, { timeout: 2000 });

    expect(screen.queryByText("historical")).not.toBeInTheDocument();
    expect(screen.queryByText("us-market")).not.toBeInTheDocument();
  });
});
