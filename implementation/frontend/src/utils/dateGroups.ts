/**
 * Categorize an ISO date string into a human-readable date group.
 * Used to group conversations in the sidebar by recency.
 *
 * Groups: "Today", "Yesterday", "This Week", "This Month", "Older"
 */
export function getDateGroup(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();

  // Normalize to start of calendar day (local time)
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const diffMs = startOfToday.getTime() - startOfDate.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return "This Week";
  if (diffDays < 30) return "This Month";
  return "Older";
}
