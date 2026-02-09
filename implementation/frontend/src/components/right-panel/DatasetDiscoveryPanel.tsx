// DatasetDiscoveryPanel -- natural language dataset discovery.
//
// Provides a search input with debounce, category chips for quick filtering,
// and a results list with metadata and "Load" buttons for discovered datasets.

import { useEffect, useRef, useCallback } from "react";
import { useChatStore } from "@/stores/chatStore";
import { useToastStore } from "@/stores/toastStore";
import {
  useDatasetDiscoveryStore,
  DISCOVERY_CATEGORIES,
} from "@/stores/datasetDiscoveryStore";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function DatasetDiscoveryPanel() {
  const query = useDatasetDiscoveryStore((s) => s.query);
  const results = useDatasetDiscoveryStore((s) => s.results);
  const loading = useDatasetDiscoveryStore((s) => s.loading);
  const error = useDatasetDiscoveryStore((s) => s.error);
  const selectedCategory = useDatasetDiscoveryStore((s) => s.selectedCategory);
  const loadingDatasetId = useDatasetDiscoveryStore((s) => s.loadingDatasetId);
  const search = useDatasetDiscoveryStore((s) => s.search);
  const searchByCategory = useDatasetDiscoveryStore((s) => s.searchByCategory);
  const clearCategory = useDatasetDiscoveryStore((s) => s.clearCategory);
  const setQuery = useDatasetDiscoveryStore((s) => s.setQuery);
  const loadDataset = useDatasetDiscoveryStore((s) => s.loadDataset);

  const conversationId = useChatStore((s) => s.activeConversationId);
  const { success: toastSuccess, error: toastError } = useToastStore();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search on query change
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!query.trim()) {
      return;
    }

    debounceRef.current = setTimeout(() => {
      search(query);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, search]);

  const handleQueryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(e.target.value);
    },
    [setQuery]
  );

  const handleCategoryClick = useCallback(
    (category: string) => {
      if (selectedCategory === category) {
        clearCategory();
      } else {
        searchByCategory(category);
      }
    },
    [selectedCategory, searchByCategory, clearCategory]
  );

  const handleLoad = useCallback(
    async (result: (typeof results)[0]) => {
      try {
        await loadDataset(result, conversationId);
        toastSuccess(`Dataset "${result.id}" added`);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load dataset";
        toastError(message);
      }
    },
    [loadDataset, conversationId, toastSuccess, toastError]
  );

  const hasSearched = results.length > 0 || error !== null;
  const showEmptyState =
    !loading && results.length === 0 && !error && (query.trim().length > 0 || selectedCategory);

  return (
    <div data-testid="dataset-discovery-panel" className="flex flex-col gap-3">
      {/* Search input */}
      <div className="relative">
        <svg
          className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
          style={{ color: "var(--color-text-secondary)" }}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          data-testid="discovery-search-input"
          type="text"
          value={query}
          onChange={handleQueryChange}
          placeholder="Describe what kind of data you're looking for..."
          className="w-full rounded border pl-8 pr-3 py-2 text-xs"
          style={{
            backgroundColor: "var(--color-bg-primary)",
            borderColor: "var(--color-border)",
            color: "var(--color-text-primary)",
          }}
        />
        {loading && (
          <div
            data-testid="discovery-spinner"
            className="absolute right-2.5 top-1/2 -translate-y-1/2"
          >
            <span
              className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
              style={{ color: "var(--color-accent)" }}
            />
          </div>
        )}
      </div>

      {/* Category chips */}
      <div
        data-testid="discovery-categories"
        className="flex flex-wrap gap-1.5"
      >
        {DISCOVERY_CATEGORIES.map((cat) => (
          <button
            key={cat}
            data-testid={`discovery-category-${cat}`}
            onClick={() => handleCategoryClick(cat)}
            className="text-xs rounded-full px-2.5 py-0.5 border transition-colors"
            style={
              selectedCategory === cat
                ? {
                    backgroundColor: "var(--color-accent)",
                    color: "white",
                    borderColor: "var(--color-accent)",
                  }
                : {
                    backgroundColor: "transparent",
                    color: "var(--color-text-secondary)",
                    borderColor: "var(--color-border)",
                  }
            }
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Error state */}
      {error && (
        <p
          data-testid="discovery-error"
          className="text-xs text-center py-2"
          style={{ color: "var(--color-error, #ef4444)" }}
        >
          {error}
        </p>
      )}

      {/* Results list */}
      {results.length > 0 && (
        <div
          data-testid="discovery-results"
          className="flex flex-col gap-1.5 max-h-[calc(100vh-20rem)] overflow-y-auto"
        >
          {results.map((result) => (
            <div
              key={result.id}
              data-testid="discovery-result"
              className="rounded border p-2.5 text-xs transition-colors hover:brightness-105"
              style={{
                backgroundColor: "var(--color-bg-secondary)",
                borderColor: "var(--color-border)",
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p
                    className="font-medium truncate"
                    style={{ color: "var(--color-text-primary)" }}
                    title={result.id}
                  >
                    {result.id}
                  </p>
                  {result.description && (
                    <p
                      className="mt-0.5 line-clamp-3"
                      style={{ color: "var(--color-text-secondary)" }}
                      title={result.description}
                    >
                      {result.description}
                    </p>
                  )}
                  {/* Metadata badges */}
                  <div
                    className="flex items-center gap-3 mt-1.5"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    <span
                      className="flex items-center gap-0.5"
                      title="Downloads"
                    >
                      <svg
                        className="w-3 h-3"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      {formatNumber(result.downloads)}
                    </span>
                    <span className="flex items-center gap-0.5" title="Likes">
                      <svg
                        className="w-3 h-3"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                      </svg>
                      {formatNumber(result.likes)}
                    </span>
                  </div>
                  {/* Tag chips */}
                  {result.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {result.tags.slice(0, 5).map((tag) => (
                        <span
                          key={tag}
                          className="inline-block text-[10px] rounded-full px-1.5 py-px border"
                          style={{
                            borderColor: "var(--color-border)",
                            color: "var(--color-text-secondary)",
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                      {result.tags.length > 5 && (
                        <span
                          className="text-[10px] py-px"
                          style={{ color: "var(--color-text-secondary)" }}
                        >
                          +{result.tags.length - 5}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <button
                  data-testid="discovery-load"
                  onClick={() => handleLoad(result)}
                  disabled={loadingDatasetId === result.id}
                  className="shrink-0 rounded px-2.5 py-1 text-xs font-medium disabled:opacity-50 bg-accent text-white hover:brightness-110 active:scale-95 transition-all duration-150"
                >
                  {loadingDatasetId === result.id ? (
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    "Load"
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state after search */}
      {showEmptyState && (
        <p
          data-testid="discovery-empty"
          className="text-xs text-center py-6"
          style={{ color: "var(--color-text-secondary)" }}
        >
          No datasets found. Try different keywords or a broader description.
        </p>
      )}

      {/* Initial empty state */}
      {!hasSearched && !loading && !query.trim() && !selectedCategory && (
        <div
          data-testid="discovery-initial"
          className="flex flex-col items-center justify-center py-8 px-4 text-center"
        >
          <svg
            className="w-12 h-12 mb-3 opacity-20"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="12" cy="12" r="10" strokeWidth="1.5" />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
              d="M16.24 7.76a6 6 0 010 8.49m-8.48-.01a6 6 0 010-8.49M12 9v3m0 3h.01"
            />
          </svg>
          <p
            className="text-xs font-medium mb-1"
            style={{ color: "var(--color-text)" }}
          >
            Discover Datasets
          </p>
          <p
            className="text-xs"
            style={{ color: "var(--color-text-muted)" }}
          >
            Describe what kind of data you're looking for...
          </p>
        </div>
      )}
    </div>
  );
}
