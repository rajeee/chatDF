// DatasetDiscoveryPanel -- unified HF search + popular dataset catalog.
//
// Single search input that calls the HF dataset-search API, with a popular
// datasets catalog (always visible below) that can be filtered by category chips.

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useChatStore } from "@/stores/chatStore";
import { useDatasetStore } from "@/stores/datasetStore";
import { useToastStore } from "@/stores/toastStore";
import {
  searchDatasets,
  apiPost,
  type DatasetSearchResult,
} from "@/api/client";
import { CATALOG_DATASETS, type CatalogDataset } from "./DatasetCatalog";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function DatasetDiscoveryPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DatasetSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState("All");

  const conversationId = useChatStore((s) => s.activeConversationId);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const addDataset = useDatasetStore((s) => s.addDataset);
  const { success: toastSuccess, error: toastError } = useToastStore();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const categories = useMemo(() => {
    const cats = new Set(CATALOG_DATASETS.map((d) => d.category));
    return ["All", ...Array.from(cats).sort()];
  }, []);

  const filteredCatalog = useMemo(() => {
    if (activeCategory === "All") return CATALOG_DATASETS;
    return CATALOG_DATASETS.filter((d) => d.category === activeCategory);
  }, [activeCategory]);

  // Debounced HF search on query change
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!query.trim()) {
      setResults([]);
      setError(null);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await searchDatasets(query.trim(), 10);
        setResults(data);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Search failed";
        setError(message);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query]);

  const loadDatasetByUrl = useCallback(
    async (url: string, label: string) => {
      setLoadingId(label);
      try {
        let convId = conversationId;
        if (!convId) {
          const newConv = await apiPost<{ id: string }>("/conversations");
          convId = newConv.id;
          setActiveConversation(convId);
        }

        const response = await apiPost<{ dataset_id: string; status: string }>(
          `/conversations/${convId}/datasets`,
          { url }
        );

        const alreadyExists = useDatasetStore
          .getState()
          .datasets.some((d) => d.id === response.dataset_id);
        if (!alreadyExists) {
          addDataset({
            id: response.dataset_id,
            conversation_id: convId!,
            url,
            name: "",
            row_count: 0,
            column_count: 0,
            schema_json: "{}",
            status: "loading",
            error_message: null,
          });
        }
        toastSuccess("Dataset added");
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load dataset";
        toastError(message);
      } finally {
        setLoadingId(null);
      }
    },
    [conversationId, addDataset, setActiveConversation, toastSuccess, toastError]
  );

  const handleLoadSearch = useCallback(
    (result: DatasetSearchResult) => {
      loadDatasetByUrl(result.parquet_url, result.id);
    },
    [loadDatasetByUrl]
  );

  const handleLoadCatalog = useCallback(
    (dataset: CatalogDataset) => {
      loadDatasetByUrl(dataset.parquet_url, `catalog-${dataset.id}`);
    },
    [loadDatasetByUrl]
  );

  const hasQuery = query.trim().length > 0;

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
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Hugging Face datasets..."
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

      {/* Search results */}
      {results.length > 0 && (
        <div data-testid="discovery-results" className="flex flex-col gap-1.5">
          <p
            className="text-[10px] font-medium uppercase tracking-wider"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Search Results
          </p>
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
                      className="mt-0.5 line-clamp-2"
                      style={{ color: "var(--color-text-secondary)" }}
                      title={result.description}
                    >
                      {result.description}
                    </p>
                  )}
                  <div
                    className="flex items-center gap-3 mt-1.5"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    <span className="flex items-center gap-0.5" title="Downloads">
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      {formatNumber(result.downloads)}
                    </span>
                    <span className="flex items-center gap-0.5" title="Likes">
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                      </svg>
                      {formatNumber(result.likes)}
                    </span>
                  </div>
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
                  onClick={() => handleLoadSearch(result)}
                  disabled={loadingId === result.id}
                  className="shrink-0 rounded px-2.5 py-1 text-xs font-medium disabled:opacity-50 bg-accent text-white hover:brightness-110 active:scale-95 transition-all duration-150"
                >
                  {loadingId === result.id ? (
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

      {/* Empty search state */}
      {hasQuery && !loading && results.length === 0 && !error && (
        <p
          data-testid="discovery-empty"
          className="text-xs text-center py-4"
          style={{ color: "var(--color-text-secondary)" }}
        >
          No datasets found. Try different keywords.
        </p>
      )}

      {/* Divider between search results and catalog */}
      {results.length > 0 && (
        <div
          className="border-t my-1"
          style={{ borderColor: "var(--color-border)" }}
        />
      )}

      {/* Popular Datasets Catalog -- always visible */}
      <div data-testid="dataset-catalog">
        <p
          className="text-[10px] font-medium uppercase tracking-wider mb-2"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Popular Datasets
        </p>

        {/* Category chips */}
        <div
          data-testid="dataset-catalog-categories"
          className="flex flex-wrap gap-1.5 mb-2"
        >
          {categories.map((cat) => (
            <button
              key={cat}
              data-testid={`dataset-catalog-category-${cat}`}
              onClick={() => setActiveCategory(cat)}
              className="text-xs rounded-full px-2 py-0.5 border transition-colors"
              style={
                activeCategory === cat
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

        {/* Catalog cards */}
        <div
          data-testid="dataset-catalog-results"
          className="flex flex-col gap-1.5 max-h-64 overflow-y-auto"
        >
          {filteredCatalog.map((dataset) => (
            <div
              key={dataset.id}
              data-testid="dataset-catalog-item"
              className="rounded border p-2 text-xs transition-colors hover:brightness-105"
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
                    title={dataset.name}
                  >
                    {dataset.name}
                  </p>
                  <p
                    className="mt-0.5 line-clamp-2"
                    style={{ color: "var(--color-text-secondary)" }}
                    title={dataset.description}
                  >
                    {dataset.description}
                  </p>
                  <div
                    className="flex items-center gap-2 mt-1"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    <span
                      className="inline-block text-xs rounded-full px-1.5 py-px border"
                      style={{ borderColor: "var(--color-border)" }}
                    >
                      {dataset.category}
                    </span>
                  </div>
                </div>
                <button
                  data-testid="dataset-catalog-load"
                  onClick={() => handleLoadCatalog(dataset)}
                  disabled={loadingId === `catalog-${dataset.id}`}
                  className="shrink-0 rounded px-2 py-1 text-xs font-medium disabled:opacity-50 bg-accent text-white hover:brightness-110 active:scale-95 transition-all duration-150"
                >
                  {loadingId === `catalog-${dataset.id}` ? (
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    "Load"
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
