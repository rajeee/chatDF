import { useEffect, useCallback, useState } from "react";
import { useSavedQueryStore } from "@/stores/savedQueryStore";

interface SavedQueriesProps {
  onRunQuery?: (query: string) => void;
}

export function SavedQueries({ onRunQuery }: SavedQueriesProps) {
  const { queries, isLoading, fetchQueries, deleteQuery } = useSavedQueryStore();
  const [expanded, setExpanded] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetchQueries();
  }, [fetchQueries]);

  const handleCopy = useCallback(async (query: string, id: string) => {
    await navigator.clipboard.writeText(query);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }, []);

  if (queries.length === 0 && !isLoading) return null;

  return (
    <div
      data-testid="saved-queries"
      className="border-t"
      style={{ borderColor: "var(--color-border)" }}
    >
      <button
        data-testid="saved-queries-toggle"
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium hover:opacity-80 transition-opacity"
        style={{ color: "var(--color-text)" }}
        onClick={() => setExpanded(!expanded)}
      >
        <svg
          className={`w-3 h-3 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        Saved Queries ({queries.length})
      </button>
      {expanded && (
        <div className="px-3 pb-2 space-y-1">
          {queries.map((q) => (
            <div
              key={q.id}
              data-testid={`saved-query-${q.id}`}
              className="flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors group"
              style={{ color: "var(--color-text)" }}
              onClick={() => handleCopy(q.query, q.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{q.name}</div>
                <div className="font-mono opacity-50 truncate text-[10px]">{q.query}</div>
              </div>
              <span className="text-[10px] opacity-40 shrink-0">
                {copiedId === q.id ? "Copied!" : ""}
              </span>
              {onRunQuery && (
                <button
                  data-testid={`run-saved-query-${q.id}`}
                  className="opacity-0 group-hover:opacity-60 hover:!opacity-100 p-0.5 rounded transition-opacity"
                  style={{ color: "var(--color-accent)" }}
                  onClick={(e) => { e.stopPropagation(); onRunQuery(q.query); }}
                  aria-label={`Run saved query ${q.name}`}
                >
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                </button>
              )}
              <button
                data-testid={`delete-saved-query-${q.id}`}
                className="opacity-0 group-hover:opacity-60 hover:!opacity-100 p-0.5 rounded transition-opacity"
                style={{ color: "var(--color-error)" }}
                onClick={(e) => { e.stopPropagation(); deleteQuery(q.id); }}
                aria-label={`Delete saved query ${q.name}`}
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14H6L5 6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
