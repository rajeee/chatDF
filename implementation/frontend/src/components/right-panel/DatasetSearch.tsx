// Dataset search component -- search and load public Hugging Face datasets.
//
// Provides a debounced search input, result list with metadata, and "Load"
// button that feeds the Parquet URL into the existing dataset loading flow.

import { useState, useEffect, useRef, useCallback } from "react";
import { searchDatasets, type DatasetSearchResult } from "@/api/client";

interface DatasetSearchProps {
  /** Called when the user clicks "Load" on a search result. */
  onLoad: (url: string) => void;
  /** Whether loading is currently in progress (disables Load buttons). */
  loading?: boolean;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function DatasetSearch({ onLoad, loading = false }: DatasetSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DatasetSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (searchQuery: string) => {
    if (searchQuery.trim().length === 0) {
      setResults([]);
      setHasSearched(false);
      setError(null);
      return;
    }

    setIsSearching(true);
    setError(null);
    try {
      const data = await searchDatasets(searchQuery.trim(), 10);
      setResults(data);
      setHasSearched(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Search failed";
      setError(message);
      setResults([]);
      setHasSearched(true);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounced search on query change
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (query.trim().length === 0) {
      setResults([]);
      setHasSearched(false);
      setError(null);
      return;
    }

    debounceRef.current = setTimeout(() => {
      doSearch(query);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, doSearch]);

  return (
    <div data-testid="dataset-search" className="mt-4">
      {/* Collapsible header */}
      <button
        data-testid="dataset-search-toggle"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-1.5 text-xs font-medium py-1.5 transition-colors hover:opacity-80"
        style={{ color: "var(--color-text-secondary)" }}
      >
        <svg
          className={`w-3 h-3 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <svg
          className="w-3.5 h-3.5"
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
        Search HF Datasets
      </button>

      {isOpen && (
        <div className="mt-2">
          {/* Search input */}
          <div className="relative">
            <svg
              className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
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
              data-testid="dataset-search-input"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search datasets..."
              className="w-full rounded border pl-7 pr-2 py-1.5 text-xs"
              style={{
                backgroundColor: "var(--color-bg-primary)",
                borderColor: "var(--color-border)",
                color: "var(--color-text-primary)",
              }}
            />
            {isSearching && (
              <div
                data-testid="dataset-search-spinner"
                className="absolute right-2 top-1/2 -translate-y-1/2"
              >
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
                  style={{ color: "var(--color-accent)" }}
                />
              </div>
            )}
          </div>

          {/* Error state */}
          {error && (
            <p
              data-testid="dataset-search-error"
              className="mt-2 text-xs"
              style={{ color: "var(--color-error, #ef4444)" }}
            >
              {error}
            </p>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div
              data-testid="dataset-search-results"
              className="mt-2 flex flex-col gap-1.5 max-h-64 overflow-y-auto"
            >
              {results.map((result) => (
                <div
                  key={result.id}
                  data-testid="dataset-search-result"
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
                        className="flex items-center gap-3 mt-1"
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
                    </div>
                    <button
                      data-testid="dataset-search-load"
                      onClick={() => onLoad(result.parquet_url)}
                      disabled={loading}
                      className="shrink-0 rounded px-2 py-1 text-xs font-medium disabled:opacity-50 bg-accent text-white hover:brightness-110 active:scale-95 transition-all duration-150"
                    >
                      Load
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {hasSearched && !isSearching && results.length === 0 && !error && (
            <p
              data-testid="dataset-search-empty"
              className="mt-3 text-xs text-center py-4"
              style={{ color: "var(--color-text-secondary)" }}
            >
              No datasets found for "{query}"
            </p>
          )}
        </div>
      )}
    </div>
  );
}
