// DatasetDiscoveryPanel -- full-text search over 386K data.gov datasets.
//
// Searches the local data.gov CKAN catalog via FTS5. Shows results with
// title, description, publisher, theme tags, and loadable resource formats.

import { useCallback, useEffect, useRef, useState } from "react";
import { useChatStore } from "@/stores/chatStore";
import { useDatasetStore } from "@/stores/datasetStore";
import { useToastStore } from "@/stores/toastStore";
import {
  searchCatalog,
  getCatalogCount,
  apiPost,
  type CatalogSearchResult,
  type CatalogSearchResponse,
} from "@/api/client";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** Pick the best loadable resource URL (prefer CSV > Parquet > JSON > GeoJSON > XLS). */
function pickBestResource(result: CatalogSearchResult): string | null {
  const priority = ["csv", "parquet", "json", "geojson", "xls", "xlsx"];
  for (const fmt of priority) {
    const r = result.resources.find(
      (res) => res.format.toLowerCase() === fmt
    );
    if (r) return r.url;
  }
  return result.resources[0]?.url ?? null;
}

const FORMAT_COLORS: Record<string, string> = {
  csv: "#22c55e",
  parquet: "#ef4444",
  json: "#3b82f6",
  geojson: "#8b5cf6",
  xls: "#f59e0b",
  xlsx: "#f59e0b",
};

const ALL_FORMATS = ["csv", "parquet", "json", "geojson", "xls", "xlsx"] as const;
const DEFAULT_FORMATS = new Set<string>(["csv", "parquet"]);

const PAGE_SIZE = 20;

export function DatasetDiscoveryPanel() {
  const [query, setQuery] = useState("");
  const [searchResponse, setSearchResponse] =
    useState<CatalogSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [selectedFormats, setSelectedFormats] = useState<string[]>(
    () => [...DEFAULT_FORMATS]
  );
  const [datasetCount, setDatasetCount] = useState<number | null>(null);

  const conversationId = useChatStore((s) => s.activeConversationId);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const addDataset = useDatasetStore((s) => s.addDataset);
  const { success: toastSuccess, error: toastError } = useToastStore();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allSelected = selectedFormats.length === ALL_FORMATS.length;
  const selectedSet = new Set(selectedFormats);

  const toggleFormat = useCallback((fmt: string) => {
    setSelectedFormats((prev) =>
      prev.includes(fmt) ? prev.filter((f) => f !== fmt) : [...prev, fmt]
    );
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedFormats((prev) =>
      prev.length === ALL_FORMATS.length ? [...DEFAULT_FORMATS] : [...ALL_FORMATS]
    );
  }, []);

  // Compute the formats param for API calls: undefined means "no filter" (all or none)
  const apiFormats =
    selectedFormats.length > 0 && selectedFormats.length < ALL_FORMATS.length
      ? selectedFormats
      : undefined;

  // Stable key for effects — avoids re-firing when array order changes
  const formatKey = [...selectedFormats].sort().join(",");

  // Fetch dataset count when format selection changes
  useEffect(() => {
    let cancelled = false;
    getCatalogCount(apiFormats)
      .then((data) => {
        if (!cancelled) setDatasetCount(data.total);
      })
      .catch(() => {
        // ignore — placeholder will fall back to static text
      });
    return () => {
      cancelled = true;
    };
  }, [formatKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced catalog search on query or format change
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!query.trim()) {
      setSearchResponse(null);
      setError(null);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await searchCatalog(query.trim(), PAGE_SIZE, 0, apiFormats);
        setSearchResponse(data);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Search failed";
        setError(message);
        setSearchResponse(null);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, formatKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLoadMore = useCallback(async () => {
    if (!searchResponse || !query.trim()) return;
    const nextOffset = searchResponse.results.length;
    if (nextOffset >= searchResponse.total) return;

    setLoadingMore(true);
    try {
      const data = await searchCatalog(
        query.trim(),
        PAGE_SIZE,
        nextOffset,
        apiFormats
      );
      setSearchResponse((prev) =>
        prev
          ? {
              ...data,
              results: [...prev.results, ...data.results],
            }
          : data
      );
    } catch {
      // Silently fail on load more -- user can retry
    } finally {
      setLoadingMore(false);
    }
  }, [searchResponse, query, apiFormats]);

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

  const handleLoadResult = useCallback(
    (result: CatalogSearchResult) => {
      const url = pickBestResource(result);
      if (!url) {
        toastError("No loadable resource found for this dataset");
        return;
      }
      loadDatasetByUrl(url, result.id);
    },
    [loadDatasetByUrl, toastError]
  );

  const results = searchResponse?.results ?? [];
  const total = searchResponse?.total ?? 0;
  const hasQuery = query.trim().length > 0;
  const hasMore = results.length < total;

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
          placeholder={`Search ${datasetCount != null ? formatNumber(datasetCount) : "386K"} government datasets...`}
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

      {/* Format filter chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span
          className="text-[10px] font-medium uppercase tracking-wider mr-0.5"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Formats
        </span>
        <button
          onClick={toggleAll}
          className="text-[10px] rounded-full px-2 py-0.5 border transition-colors"
          style={
            allSelected
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
          All
        </button>
        {ALL_FORMATS.map((fmt) => (
          <button
            key={fmt}
            onClick={() => toggleFormat(fmt)}
            className="text-[10px] font-semibold rounded-full px-2 py-0.5 border transition-colors"
            style={
              selectedSet.has(fmt)
                ? {
                    backgroundColor: FORMAT_COLORS[fmt],
                    color: "white",
                    borderColor: FORMAT_COLORS[fmt],
                  }
                : {
                    backgroundColor: "transparent",
                    color: "var(--color-text-secondary)",
                    borderColor: "var(--color-border)",
                  }
            }
          >
            {fmt.toUpperCase()}
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

      {/* Result count */}
      {hasQuery && !loading && total > 0 && (
        <p
          className="text-[10px] font-medium uppercase tracking-wider"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Found {formatNumber(total)} datasets
        </p>
      )}

      {/* Search results */}
      {results.length > 0 && (
        <div
          data-testid="discovery-results"
          className="flex flex-col gap-1.5 max-h-[70vh] overflow-y-auto"
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
                  <div className="flex items-center gap-1.5">
                    <p
                      className="font-medium truncate"
                      style={{ color: "var(--color-text-primary)" }}
                      title={result.title}
                    >
                      {result.title}
                    </p>
                    {result.landing_page && (
                      <a
                        href={result.landing_page}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 opacity-50 hover:opacity-100 transition-opacity"
                        title="View on data.gov"
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
                          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </a>
                    )}
                  </div>
                  {result.description && (
                    <p
                      className="mt-0.5 line-clamp-2"
                      style={{ color: "var(--color-text-secondary)" }}
                      title={result.description}
                    >
                      {result.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {result.publisher && (
                      <span
                        className="text-[10px] truncate max-w-[200px]"
                        style={{ color: "var(--color-text-secondary)" }}
                        title={result.publisher}
                      >
                        {result.publisher}
                      </span>
                    )}
                    {/* Resource format badges */}
                    {result.resources.length > 0 && (
                      <div className="flex gap-1">
                        {[
                          ...new Set(
                            result.resources.map((r) =>
                              r.format.toUpperCase()
                            )
                          ),
                        ].map((fmt) => (
                          <span
                            key={fmt}
                            className="inline-block text-[9px] font-bold rounded px-1 py-px"
                            style={{
                              backgroundColor:
                                FORMAT_COLORS[fmt.toLowerCase()] ?? "#6b7280",
                              color: "white",
                            }}
                          >
                            {fmt}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {result.theme.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {result.theme.slice(0, 3).map((tag) => (
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
                      {result.theme.length > 3 && (
                        <span
                          className="text-[10px] py-px"
                          style={{ color: "var(--color-text-secondary)" }}
                        >
                          +{result.theme.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {result.resources.length > 0 && (
                  <button
                    data-testid="discovery-load"
                    onClick={() => handleLoadResult(result)}
                    disabled={loadingId === result.id}
                    className="shrink-0 rounded px-2.5 py-1 text-xs font-medium disabled:opacity-50 bg-accent text-white hover:brightness-110 active:scale-95 transition-all duration-150"
                  >
                    {loadingId === result.id ? (
                      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : (
                      "Load"
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Load more button */}
          {hasMore && (
            <button
              data-testid="discovery-load-more"
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="w-full py-2 text-xs font-medium rounded border transition-colors hover:brightness-105 disabled:opacity-50"
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-text-secondary)",
                backgroundColor: "var(--color-bg-secondary)",
              }}
            >
              {loadingMore ? (
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                `Load more (${formatNumber(total - results.length)} remaining)`
              )}
            </button>
          )}
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

      {/* Initial state -- no query */}
      {!hasQuery && (
        <p
          className="text-xs text-center py-6"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Search {datasetCount != null ? formatNumber(datasetCount) : "386K"} government datasets.
        </p>
      )}
    </div>
  );
}
