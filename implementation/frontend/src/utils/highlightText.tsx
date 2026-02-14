// Utility to highlight search matches within text content.
// Wraps matching substrings in <mark> tags with a yellow/accent background.
// Used by MessageBubble to highlight search results in message content.

import type { ReactNode } from "react";

/**
 * Splits text by the search query (case-insensitive) and wraps matches in <mark> tags.
 * Returns the original text unchanged if query is empty.
 */
export function highlightText(text: string, query: string): ReactNode {
  if (!query || query.length === 0) return text;

  // Escape regex special characters in the query
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);

  if (parts.length === 1) return text;

  return parts.map((part, i) => {
    if (part.toLowerCase() === query.toLowerCase()) {
      return (
        <mark
          key={i}
          className="search-highlight"
          style={{
            backgroundColor: "var(--color-search-highlight, rgba(250, 204, 21, 0.4))",
            color: "inherit",
            borderRadius: "2px",
            padding: "0 1px",
          }}
        >
          {part}
        </mark>
      );
    }
    return part;
  });
}
