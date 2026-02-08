/**
 * Generate a conversation title from the first user message.
 *
 * Rules:
 * - Strip leading/trailing whitespace
 * - Replace line breaks with spaces
 * - Truncate to maxLength characters (default 50)
 * - Append "..." if truncated
 */
export function generateTitle(message: string, maxLength = 50): string {
  // Collapse newlines/carriage returns to spaces, then trim
  const cleaned = message.replace(/[\r\n]+/g, " ").trim();

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  return cleaned.slice(0, maxLength) + "...";
}
