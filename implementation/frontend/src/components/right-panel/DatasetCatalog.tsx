// Popular Datasets catalog -- curated public Parquet datasets organized by category.
//
// Provides a collapsible section with category filter chips and "Load" buttons
// that feed Parquet URLs into the existing dataset loading flow.

import { useState, useMemo } from "react";

interface CatalogDataset {
  id: string;
  name: string;
  description: string;
  category: string;
  source: string;
  parquet_url: string;
}

const CATALOG_DATASETS: CatalogDataset[] = [
  // Finance
  {
    id: "nasdaq-stocks",
    name: "NASDAQ Stock Prices",
    description: "Historical stock prices for NASDAQ-listed companies",
    category: "Finance",
    source: "Hugging Face",
    parquet_url:
      "https://huggingface.co/datasets/rjunior/stock-market/resolve/main/data/train-00000-of-00001.parquet",
  },
  {
    id: "real-estate",
    name: "Real Estate Prices",
    description: "House price data with property features and location",
    category: "Finance",
    source: "Hugging Face",
    parquet_url:
      "https://huggingface.co/datasets/leostelon/real-estate-dataset/resolve/main/data/train-00000-of-00001.parquet",
  },
  // Geography
  {
    id: "world-cities",
    name: "World Cities",
    description: "Database of world cities with coordinates and population",
    category: "Geography",
    source: "Hugging Face",
    parquet_url:
      "https://huggingface.co/datasets/jamescalam/world-cities-geo/resolve/main/train.parquet",
  },
  // Science
  {
    id: "iris",
    name: "Iris Dataset",
    description: "Classic iris flower measurements for classification",
    category: "Science",
    source: "Hugging Face",
    parquet_url:
      "https://huggingface.co/datasets/scikit-learn/iris/resolve/main/iris.parquet",
  },
  {
    id: "wine-quality",
    name: "Wine Quality",
    description: "Physicochemical properties and quality ratings of wines",
    category: "Science",
    source: "Hugging Face",
    parquet_url:
      "https://huggingface.co/datasets/codesignal/wine-quality/resolve/main/data/train-00000-of-00001.parquet",
  },
  {
    id: "titanic",
    name: "Titanic Passengers",
    description: "Passenger data from the Titanic including survival outcomes",
    category: "Science",
    source: "Hugging Face",
    parquet_url:
      "https://huggingface.co/datasets/phihung/titanic/resolve/main/train.parquet",
  },
  // Government
  {
    id: "us-accidents",
    name: "US Traffic Accidents",
    description:
      "Countrywide traffic accident records with severity and conditions",
    category: "Government",
    source: "Hugging Face",
    parquet_url:
      "https://huggingface.co/datasets/mfrankl/US_Accidents/resolve/main/data/train-00000-of-00002.parquet",
  },
  // Sports
  {
    id: "fifa-players",
    name: "FIFA Player Stats",
    description: "Player attributes and ratings from FIFA video games",
    category: "Sports",
    source: "Hugging Face",
    parquet_url:
      "https://huggingface.co/datasets/yainage90/fifa-dataset/resolve/main/data/train-00000-of-00001.parquet",
  },
  // Entertainment
  {
    id: "movies",
    name: "IMDB Movies",
    description: "Movie metadata including ratings, genres, and revenue",
    category: "Entertainment",
    source: "Hugging Face",
    parquet_url:
      "https://huggingface.co/datasets/nmac23/imdb-top-250/resolve/main/data/train-00000-of-00001.parquet",
  },
  {
    id: "spotify-tracks",
    name: "Spotify Tracks",
    description: "Audio features and metadata for Spotify tracks",
    category: "Entertainment",
    source: "Hugging Face",
    parquet_url:
      "https://huggingface.co/datasets/maharshipandya/spotify-tracks-dataset/resolve/main/dataset.parquet",
  },
];

export { CATALOG_DATASETS };
export type { CatalogDataset };

interface DatasetCatalogProps {
  /** Called when the user clicks "Load" on a catalog dataset. */
  onLoad: (url: string) => void;
  /** Whether loading is currently in progress (disables Load buttons). */
  loading?: boolean;
}

export function DatasetCatalog({
  onLoad,
  loading = false,
}: DatasetCatalogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState("All");

  const categories = useMemo(() => {
    const cats = new Set(CATALOG_DATASETS.map((d) => d.category));
    return ["All", ...Array.from(cats).sort()];
  }, []);

  const filtered = useMemo(() => {
    if (activeCategory === "All") return CATALOG_DATASETS;
    return CATALOG_DATASETS.filter((d) => d.category === activeCategory);
  }, [activeCategory]);

  return (
    <div data-testid="dataset-catalog" className="mt-4">
      {/* Collapsible header */}
      <button
        data-testid="dataset-catalog-toggle"
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
          <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
          <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
        </svg>
        Popular Datasets
      </button>

      {isOpen && (
        <div className="mt-2">
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

          {/* Dataset cards */}
          <div
            data-testid="dataset-catalog-results"
            className="flex flex-col gap-1.5 max-h-64 overflow-y-auto"
          >
            {filtered.map((dataset) => (
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
                      <span className="text-xs opacity-60">
                        {dataset.source}
                      </span>
                    </div>
                  </div>
                  <button
                    data-testid="dataset-catalog-load"
                    onClick={() => onLoad(dataset.parquet_url)}
                    disabled={loading}
                    className="shrink-0 rounded px-2 py-1 text-xs font-medium disabled:opacity-50 bg-accent text-white hover:brightness-110 active:scale-95 transition-all duration-150"
                  >
                    Load
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
