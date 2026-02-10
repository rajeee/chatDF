// Tests for DatasetDiscoveryPanel component
//
// DDP-1: Renders initial state with search input and category chips
// DDP-2: Shows initial empty state text
// DDP-3: Typing in search input calls setQuery
// DDP-4: Category chips render for all categories
// DDP-5: Clicking a category chip calls searchByCategory
// DDP-6: Clicking active category calls clearCategory
// DDP-7: Shows spinner when loading is true
// DDP-8: Shows error message when error exists
// DDP-9: Shows results with Load buttons
// DDP-10: Click Load button calls loadDataset
// DDP-11: Shows empty state when results are empty after search
// DDP-12: Results show truncated tags (max 5 + overflow count)

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Store mocks
const mockSearch = vi.fn();
const mockSearchByCategory = vi.fn();
const mockClearCategory = vi.fn();
const mockSetQuery = vi.fn();
const mockLoadDataset = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

let mockStoreState = {
  query: "",
  results: [] as Array<{
    id: string;
    description: string;
    downloads: number;
    likes: number;
    tags: string[];
    last_modified: string;
    parquet_url: string;
  }>,
  loading: false,
  error: null as string | null,
  selectedCategory: null as string | null,
  loadingDatasetId: null as string | null,
  search: mockSearch,
  searchByCategory: mockSearchByCategory,
  clearCategory: mockClearCategory,
  setQuery: mockSetQuery,
  loadDataset: mockLoadDataset,
};

vi.mock("@/stores/datasetDiscoveryStore", () => ({
  useDatasetDiscoveryStore: (selector: (s: typeof mockStoreState) => unknown) =>
    selector(mockStoreState),
  DISCOVERY_CATEGORIES: [
    "Climate",
    "Finance",
    "Health",
    "Census",
    "Education",
    "Transportation",
    "Energy",
    "Agriculture",
  ],
}));

vi.mock("@/stores/chatStore", () => ({
  useChatStore: (selector: (s: { activeConversationId: string | null }) => unknown) =>
    selector({ activeConversationId: "conv-123" }),
}));

vi.mock("@/stores/toastStore", () => ({
  useToastStore: () => ({
    success: mockToastSuccess,
    error: mockToastError,
  }),
}));

import { DatasetDiscoveryPanel } from "@/components/right-panel/DatasetDiscoveryPanel";

const SAMPLE_RESULTS = [
  {
    id: "climate-data-v2",
    description: "Global climate temperature records from 1900 to 2023",
    downloads: 1500000,
    likes: 3200,
    tags: ["climate", "temperature", "global"],
    last_modified: "2024-06-01T00:00:00Z",
    parquet_url: "https://hf.co/datasets/climate-data-v2/train.parquet",
  },
  {
    id: "finance-stock-prices",
    description: "Daily stock prices for S&P 500 companies",
    downloads: 850,
    likes: 420,
    tags: ["finance", "stocks", "sp500", "daily", "prices", "historical", "us-market"],
    last_modified: "2024-05-15T00:00:00Z",
    parquet_url: "https://hf.co/datasets/finance-stock-prices/train.parquet",
  },
];

function resetMockState(overrides: Partial<typeof mockStoreState> = {}) {
  mockStoreState = {
    query: "",
    results: [],
    loading: false,
    error: null,
    selectedCategory: null,
    loadingDatasetId: null,
    search: mockSearch,
    searchByCategory: mockSearchByCategory,
    clearCategory: mockClearCategory,
    setQuery: mockSetQuery,
    loadDataset: mockLoadDataset,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetMockState();
});

describe("DDP-1: Renders initial state with search input and category chips", () => {
  it("renders the panel container", () => {
    render(<DatasetDiscoveryPanel />);

    expect(screen.getByTestId("dataset-discovery-panel")).toBeInTheDocument();
  });

  it("renders the search input", () => {
    render(<DatasetDiscoveryPanel />);

    const input = screen.getByTestId("discovery-search-input");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveAttribute(
      "placeholder",
      "Describe what kind of data you're looking for..."
    );
  });

  it("renders category chips container", () => {
    render(<DatasetDiscoveryPanel />);

    expect(screen.getByTestId("discovery-categories")).toBeInTheDocument();
  });
});

describe("DDP-2: Shows initial empty state text", () => {
  it("shows the initial state with Discover Datasets heading", () => {
    render(<DatasetDiscoveryPanel />);

    const initial = screen.getByTestId("discovery-initial");
    expect(initial).toBeInTheDocument();
    expect(screen.getByText("Discover Datasets")).toBeInTheDocument();
  });

  it("shows helper text in initial state", () => {
    render(<DatasetDiscoveryPanel />);

    expect(
      screen.getByText("Describe what kind of data you're looking for...")
    ).toBeInTheDocument();
  });

  it("does not show initial state when query is present", () => {
    resetMockState({ query: "climate data" });

    render(<DatasetDiscoveryPanel />);

    expect(screen.queryByTestId("discovery-initial")).not.toBeInTheDocument();
  });

  it("does not show initial state when results exist", () => {
    resetMockState({ results: SAMPLE_RESULTS });

    render(<DatasetDiscoveryPanel />);

    expect(screen.queryByTestId("discovery-initial")).not.toBeInTheDocument();
  });
});

describe("DDP-3: Typing in search input calls setQuery", () => {
  it("calls setQuery when input value changes", () => {
    render(<DatasetDiscoveryPanel />);

    const input = screen.getByTestId("discovery-search-input");
    fireEvent.change(input, { target: { value: "weather data" } });

    expect(mockSetQuery).toHaveBeenCalledWith("weather data");
  });

  it("calls setQuery with empty string when input is cleared", () => {
    resetMockState({ query: "some query" });

    render(<DatasetDiscoveryPanel />);

    const input = screen.getByTestId("discovery-search-input");
    fireEvent.change(input, { target: { value: "" } });

    expect(mockSetQuery).toHaveBeenCalledWith("");
  });

  it("input displays current query value from store", () => {
    resetMockState({ query: "existing query" });

    render(<DatasetDiscoveryPanel />);

    const input = screen.getByTestId("discovery-search-input") as HTMLInputElement;
    expect(input.value).toBe("existing query");
  });
});

describe("DDP-4: Category chips render for all categories", () => {
  it("renders all 8 category chips", () => {
    render(<DatasetDiscoveryPanel />);

    const categories = [
      "Climate",
      "Finance",
      "Health",
      "Census",
      "Education",
      "Transportation",
      "Energy",
      "Agriculture",
    ];

    for (const cat of categories) {
      expect(screen.getByTestId(`discovery-category-${cat}`)).toBeInTheDocument();
      expect(screen.getByTestId(`discovery-category-${cat}`)).toHaveTextContent(cat);
    }
  });

  it("active category has accent styling", () => {
    resetMockState({ selectedCategory: "Finance" });

    render(<DatasetDiscoveryPanel />);

    const financeChip = screen.getByTestId("discovery-category-Finance");
    expect(financeChip.style.backgroundColor).toBe("var(--color-accent)");
    expect(financeChip.style.color).toBe("white");
  });

  it("non-active categories have transparent background", () => {
    resetMockState({ selectedCategory: "Finance" });

    render(<DatasetDiscoveryPanel />);

    const climateChip = screen.getByTestId("discovery-category-Climate");
    expect(climateChip.style.backgroundColor).toBe("transparent");
  });
});

describe("DDP-5: Clicking a category chip calls searchByCategory", () => {
  it("calls searchByCategory with category name when clicked", () => {
    render(<DatasetDiscoveryPanel />);

    const healthChip = screen.getByTestId("discovery-category-Health");
    fireEvent.click(healthChip);

    expect(mockSearchByCategory).toHaveBeenCalledWith("Health");
  });

  it("calls searchByCategory for any non-active category", () => {
    resetMockState({ selectedCategory: "Finance" });

    render(<DatasetDiscoveryPanel />);

    const climateChip = screen.getByTestId("discovery-category-Climate");
    fireEvent.click(climateChip);

    expect(mockSearchByCategory).toHaveBeenCalledWith("Climate");
    expect(mockClearCategory).not.toHaveBeenCalled();
  });
});

describe("DDP-6: Clicking active category calls clearCategory", () => {
  it("calls clearCategory when clicking already selected category", () => {
    resetMockState({ selectedCategory: "Health" });

    render(<DatasetDiscoveryPanel />);

    const healthChip = screen.getByTestId("discovery-category-Health");
    fireEvent.click(healthChip);

    expect(mockClearCategory).toHaveBeenCalledTimes(1);
    expect(mockSearchByCategory).not.toHaveBeenCalled();
  });
});

describe("DDP-7: Shows spinner when loading is true", () => {
  it("shows spinner element when loading", () => {
    resetMockState({ loading: true });

    render(<DatasetDiscoveryPanel />);

    expect(screen.getByTestId("discovery-spinner")).toBeInTheDocument();
  });

  it("does not show spinner when not loading", () => {
    resetMockState({ loading: false });

    render(<DatasetDiscoveryPanel />);

    expect(screen.queryByTestId("discovery-spinner")).not.toBeInTheDocument();
  });
});

describe("DDP-8: Shows error message when error exists", () => {
  it("shows error message from store", () => {
    resetMockState({ error: "Network request failed" });

    render(<DatasetDiscoveryPanel />);

    const errorEl = screen.getByTestId("discovery-error");
    expect(errorEl).toBeInTheDocument();
    expect(errorEl).toHaveTextContent("Network request failed");
  });

  it("does not show error element when error is null", () => {
    resetMockState({ error: null });

    render(<DatasetDiscoveryPanel />);

    expect(screen.queryByTestId("discovery-error")).not.toBeInTheDocument();
  });
});

describe("DDP-9: Shows results with Load buttons", () => {
  it("renders results list when results exist", () => {
    resetMockState({ results: SAMPLE_RESULTS });

    render(<DatasetDiscoveryPanel />);

    expect(screen.getByTestId("discovery-results")).toBeInTheDocument();
    const resultItems = screen.getAllByTestId("discovery-result");
    expect(resultItems).toHaveLength(2);
  });

  it("shows result id and description", () => {
    resetMockState({ results: SAMPLE_RESULTS });

    render(<DatasetDiscoveryPanel />);

    expect(screen.getByText("climate-data-v2")).toBeInTheDocument();
    expect(
      screen.getByText("Global climate temperature records from 1900 to 2023")
    ).toBeInTheDocument();
    expect(screen.getByText("finance-stock-prices")).toBeInTheDocument();
  });

  it("shows Load buttons for each result", () => {
    resetMockState({ results: SAMPLE_RESULTS });

    render(<DatasetDiscoveryPanel />);

    const loadButtons = screen.getAllByTestId("discovery-load");
    expect(loadButtons).toHaveLength(2);
    expect(loadButtons[0]).toHaveTextContent("Load");
    expect(loadButtons[1]).toHaveTextContent("Load");
  });

  it("formats large download numbers with suffix", () => {
    resetMockState({ results: SAMPLE_RESULTS });

    render(<DatasetDiscoveryPanel />);

    // 1500000 should be formatted as "1.5M"
    expect(screen.getByText("1.5M")).toBeInTheDocument();
  });

  it("does not render results list when results array is empty", () => {
    resetMockState({ results: [] });

    render(<DatasetDiscoveryPanel />);

    expect(screen.queryByTestId("discovery-results")).not.toBeInTheDocument();
  });

  it("disables Load button when that dataset is currently loading", () => {
    resetMockState({
      results: SAMPLE_RESULTS,
      loadingDatasetId: "climate-data-v2",
    });

    render(<DatasetDiscoveryPanel />);

    const loadButtons = screen.getAllByTestId("discovery-load");
    expect(loadButtons[0]).toBeDisabled();
    expect(loadButtons[1]).not.toBeDisabled();
  });
});

describe("DDP-10: Click Load button calls loadDataset", () => {
  it("calls loadDataset with result and conversationId when Load is clicked", () => {
    mockLoadDataset.mockResolvedValue(undefined);
    resetMockState({ results: SAMPLE_RESULTS });

    render(<DatasetDiscoveryPanel />);

    const loadButtons = screen.getAllByTestId("discovery-load");
    fireEvent.click(loadButtons[0]);

    expect(mockLoadDataset).toHaveBeenCalledWith(SAMPLE_RESULTS[0], "conv-123");
  });

  it("shows toast success after successful load", async () => {
    mockLoadDataset.mockResolvedValue(undefined);
    resetMockState({ results: SAMPLE_RESULTS });

    render(<DatasetDiscoveryPanel />);

    const loadButtons = screen.getAllByTestId("discovery-load");
    fireEvent.click(loadButtons[0]);

    // Wait for the async handleLoad to complete
    await vi.waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith('Dataset "climate-data-v2" added');
    });
  });

  it("shows toast error when load fails", async () => {
    mockLoadDataset.mockRejectedValue(new Error("Server error"));
    resetMockState({ results: SAMPLE_RESULTS });

    render(<DatasetDiscoveryPanel />);

    const loadButtons = screen.getAllByTestId("discovery-load");
    fireEvent.click(loadButtons[0]);

    await vi.waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Server error");
    });
  });

  it("shows generic error message for non-Error rejection", async () => {
    mockLoadDataset.mockRejectedValue("unknown failure");
    resetMockState({ results: SAMPLE_RESULTS });

    render(<DatasetDiscoveryPanel />);

    const loadButtons = screen.getAllByTestId("discovery-load");
    fireEvent.click(loadButtons[0]);

    await vi.waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Failed to load dataset");
    });
  });
});

describe("DDP-11: Shows empty state when results are empty after search", () => {
  it("shows empty state when query exists but results are empty", () => {
    resetMockState({ query: "something obscure", results: [], error: null });

    render(<DatasetDiscoveryPanel />);

    const emptyState = screen.getByTestId("discovery-empty");
    expect(emptyState).toBeInTheDocument();
    expect(emptyState).toHaveTextContent(
      "No datasets found. Try different keywords or a broader description."
    );
  });

  it("shows empty state when category is selected but results are empty", () => {
    resetMockState({
      query: "",
      results: [],
      error: null,
      selectedCategory: "Agriculture",
    });

    render(<DatasetDiscoveryPanel />);

    expect(screen.getByTestId("discovery-empty")).toBeInTheDocument();
  });

  it("does not show empty state when loading", () => {
    resetMockState({ query: "climate", results: [], loading: true });

    render(<DatasetDiscoveryPanel />);

    expect(screen.queryByTestId("discovery-empty")).not.toBeInTheDocument();
  });

  it("does not show empty state when there is an error", () => {
    resetMockState({ query: "climate", results: [], error: "Failed" });

    render(<DatasetDiscoveryPanel />);

    expect(screen.queryByTestId("discovery-empty")).not.toBeInTheDocument();
  });

  it("does not show empty state when query is blank and no category", () => {
    resetMockState({ query: "", results: [], error: null, selectedCategory: null });

    render(<DatasetDiscoveryPanel />);

    expect(screen.queryByTestId("discovery-empty")).not.toBeInTheDocument();
  });
});

describe("DDP-12: Results show truncated tags (max 5 + overflow count)", () => {
  it("shows all tags when there are 5 or fewer", () => {
    const resultWith3Tags = [
      {
        ...SAMPLE_RESULTS[0],
        tags: ["climate", "temperature", "global"],
      },
    ];
    resetMockState({ results: resultWith3Tags });

    render(<DatasetDiscoveryPanel />);

    expect(screen.getByText("climate")).toBeInTheDocument();
    expect(screen.getByText("temperature")).toBeInTheDocument();
    expect(screen.getByText("global")).toBeInTheDocument();
  });

  it("truncates tags to 5 and shows overflow count", () => {
    const resultWith7Tags = [
      {
        ...SAMPLE_RESULTS[1],
        tags: ["finance", "stocks", "sp500", "daily", "prices", "historical", "us-market"],
      },
    ];
    resetMockState({ results: resultWith7Tags });

    render(<DatasetDiscoveryPanel />);

    // First 5 tags should be visible
    expect(screen.getByText("finance")).toBeInTheDocument();
    expect(screen.getByText("stocks")).toBeInTheDocument();
    expect(screen.getByText("sp500")).toBeInTheDocument();
    expect(screen.getByText("daily")).toBeInTheDocument();
    expect(screen.getByText("prices")).toBeInTheDocument();

    // 6th and 7th tags should NOT be visible
    expect(screen.queryByText("historical")).not.toBeInTheDocument();
    expect(screen.queryByText("us-market")).not.toBeInTheDocument();

    // Overflow indicator: +2
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("does not show overflow indicator when exactly 5 tags", () => {
    const resultWith5Tags = [
      {
        ...SAMPLE_RESULTS[0],
        tags: ["a", "b", "c", "d", "e"],
      },
    ];
    resetMockState({ results: resultWith5Tags });

    render(<DatasetDiscoveryPanel />);

    expect(screen.getByText("a")).toBeInTheDocument();
    expect(screen.getByText("e")).toBeInTheDocument();
    expect(screen.queryByText("+")).not.toBeInTheDocument();
  });

  it("does not show tags section when tags array is empty", () => {
    const resultNoTags = [
      {
        ...SAMPLE_RESULTS[0],
        tags: [],
      },
    ];
    resetMockState({ results: resultNoTags });

    const { container } = render(<DatasetDiscoveryPanel />);

    // The tag chip container should not be present
    const tagChips = container.querySelectorAll(".rounded-full.px-1\\.5");
    expect(tagChips).toHaveLength(0);
  });
});
